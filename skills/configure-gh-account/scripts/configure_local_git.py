#!/usr/bin/env python3
"""为仓库写入本地 Git 身份、GitHub HTTPS 凭据与按仓库的账号声明。

只修改目标仓库的 .git/config 与工作区内的 .ghswitch/.gitignore；
不读取或打印任何 token，不修改 remote 地址和用户级 Git 配置。
"""

import argparse
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit, urlunsplit


LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
DECLARATION = ".ghswitch"


def git(project, *args):
    return subprocess.run(
        ["git", "-C", str(project)] + list(args),
        check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout.strip()


def resolve_target(project, account, account_dir):
    project = Path(project).expanduser().resolve()
    account_dir = Path(account_dir).expanduser().resolve()
    if not project.is_dir():
        raise ValueError("目标仓库目录不存在：{}".format(project))
    try:
        root = Path(git(project, "rev-parse", "--show-toplevel")).resolve()
    except subprocess.CalledProcessError:
        raise ValueError("目标目录不是 Git 仓库：{}".format(project))
    if root != project:
        raise ValueError("请使用仓库根目录作为 --project：{}".format(root))
    if not LOGIN.match(account):
        raise ValueError("GitHub 登录名形状不合法：{}".format(account))
    if not account_dir.is_dir():
        raise ValueError("账号目录不存在，请先按 references/profile.md 验证或导入：{}".format(account_dir))
    if account_dir.name.lower() != account.lower():
        raise ValueError("账号目录名与登录名不一致：{} / {}".format(account_dir.name, account))
    return project, account_dir


def check_declaration(project, path, account, replace):
    if git(project, "ls-files", "--", DECLARATION):
        raise ValueError(
            "{} 已被 Git 跟踪；请先经用户授权执行 git rm --cached -- {} 后重试。".format(DECLARATION, DECLARATION)
        )
    if path.exists():
        current = path.read_text(encoding="utf-8").strip()
        if current and current != account:
            if not replace:
                raise ValueError(
                    "已有 {} 内容 {} 与目标账号 {} 不一致；请与用户确认后用 --replace-declaration 覆盖。".format(
                        DECLARATION, current, account
                    )
                )


def scan_remotes(project, account):
    urls = set()
    ssh_remotes = set()
    for remote in git(project, "remote").splitlines():
        for flags in (("--all",), ("--push", "--all")):
            for value in git(project, "remote", "get-url", *flags, remote).splitlines():
                parts = urlsplit(value)
                scheme = parts.scheme.lower()
                if scheme in ("ssh", "git") or value.startswith("git@") or value.startswith("ssh://"):
                    ssh_remotes.add(remote)
                    continue
                if scheme != "https" or (parts.hostname or "").lower() != "github.com":
                    continue
                if parts.password is not None:
                    raise ValueError(
                        "GitHub remote {} 的 URL 内嵌凭据；请先移除 URL 中的用户名和密码信息。".format(remote)
                    )
                if parts.username and unquote(parts.username).lower() != account.lower():
                    raise ValueError(
                        "GitHub remote {} 的 URL 用户名与选定账号不一致。".format(remote)
                    )
                host = parts.netloc.rsplit("@", 1)[-1].lower()
                urls.add(urlunsplit(("https", host, parts.path, "", "")))
    return urls, ssh_remotes


def credential_helper(account_dir):
    executable = shutil.which("gh")
    if not executable:
        raise ValueError("找不到 gh 可执行文件，无法写入 GitHub HTTPS 凭据。")
    gh = Path(executable).resolve()
    return "!env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG GH_CONFIG_DIR={} {} auth git-credential".format(
        shlex.quote(str(account_dir)), shlex.quote(str(gh)),
    )


def ensure_ignored(project, declaration, patterns):
    path = project / ".gitignore"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    present = set(line.strip() for line in lines)
    added = []
    for pattern in patterns:
        if pattern not in present:
            lines.append(pattern)
            present.add(pattern)
            added.append(pattern)
    if added:
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        subprocess.run(
            ["git", "-C", str(project), "check-ignore", "-q", "--", declaration.name],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError:
        raise ValueError(
            ".gitignore 未能忽略 {}；请检查是否有取反规则或忽略文件位置异常。".format(declaration.name)
        )
    return added


def configure(args):
    project, account_dir = resolve_target(args.project, args.account, args.profile)
    if not all(value.strip() for value in (args.account, args.name, args.email)):
        raise ValueError("账号、提交姓名和邮箱都不能为空。")
    declaration = project / DECLARATION
    check_declaration(project, declaration, args.account, args.replace_declaration)
    urls, ssh_remotes = scan_remotes(project, args.account)
    helper = credential_helper(account_dir)

    git(project, "config", "--local", "user.name", args.name)
    git(project, "config", "--local", "user.email", args.email)
    for url in ["https://github.com"] + sorted(urls):
        key = "credential." + url
        git(project, "config", "--local", key + ".username", args.account)
        git(project, "config", "--local", "--replace-all", key + ".helper", "")
        git(project, "config", "--local", "--add", key + ".helper", helper)

    declaration.write_text(args.account + "\n", encoding="utf-8")

    appended = []
    if args.write_gitignore:
        appended = ensure_ignored(project, declaration, ["/" + DECLARATION] + args.ignore)
    return project, account_dir, declaration, sorted(urls), sorted(ssh_remotes), appended


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="目标仓库根目录")
    parser.add_argument("--account", required=True, help="GitHub 登录名")
    parser.add_argument("--profile", required=True, help="账号目录（gh 配置目录），其 basename 必须与登录名一致")
    parser.add_argument("--name", required=True, help="仓库本地提交姓名")
    parser.add_argument("--email", required=True, help="仓库本地提交邮箱")
    parser.add_argument("--write-gitignore", action="store_true", help="确保 /.ghswitch 被忽略")
    parser.add_argument("--ignore", action="append", default=[], metavar="PATTERN",
                        help="额外写入 .gitignore 的精确规则，可重复；需配合 --write-gitignore")
    parser.add_argument("--replace-declaration", action="store_true",
                        help="用户确认后覆盖内容不一致的已有 .ghswitch")
    args = parser.parse_args()

    if args.ignore and not args.write_gitignore:
        parser.error("--ignore 需要与 --write-gitignore 一起使用")
    for pattern in args.ignore:
        if not pattern.strip() or "\n" in pattern:
            parser.error("--ignore 模式不能为空或包含换行")

    try:
        project, account_dir, declaration, urls, ssh_remotes, appended = configure(args)
    except ValueError as error:
        print("错误：{}".format(error), file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        print("错误：Git 命令执行失败：{}".format(" ".join(error.cmd)), file=sys.stderr)
        if error.stderr and error.stderr.strip():
            print(error.stderr.strip(), file=sys.stderr)
        return 1
    except OSError as error:
        print("错误：写入失败：{}".format(error), file=sys.stderr)
        return 1

    print("目标仓库：{}".format(project))
    print("仓库本地提交身份：{} <{}>".format(args.name, args.email))
    print("账号目录：{}".format(account_dir))
    print("已绑定 GitHub HTTPS 凭据：https://github.com{}".format(
        "" if not urls else "、" + "、".join(urls)
    ))
    print("账号声明：{}（{}）".format(declaration, args.account))
    if appended:
        print("新增忽略规则：{}".format("、".join(appended)))
    if ssh_remotes:
        print("SSH 远程（{}）的认证仍需单独验证，未自动迁移。".format(", ".join(ssh_remotes)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
