"""Guard and push a DSH Workflow release tag; adapted from GhostModelDeck."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit


REPOSITORY = "Ghost233/DSH-Workflow"
ROOT = Path(__file__).resolve().parent.parent


class ReleaseError(Exception):
    pass


class Release:
    def __init__(self):
        self.env = os.environ.copy()
        self.token = None
        self.git_command = ["git"]

    def run(self, command, *, env=None, input_text=None):
        result = subprocess.run(command, cwd=ROOT, env=env or self.env,
                                input=input_text, capture_output=True, text=True)
        if result.returncode:
            message = result.stderr.strip() or "命令失败：" + command[0]
            if self.token:
                message = message.replace(self.token, "<REDACTED>")
            raise ReleaseError(message)
        return result.stdout.strip()

    def git(self, *args):
        return self.run(self.git_command + list(args))

    def check_account(self, env):
        login = self.run(["gh", "api", "--hostname", "github.com", "user",
                          "--jq", ".login"], env=env)
        if login != "Ghost233":
            raise ReleaseError("有效 GitHub 身份必须是 Ghost233")

    def authenticate_git(self):
        self.check_account(self.env)
        self.git_command = ["git", "-c", "credential.https://github.com.helper=",
                            "-c", "credential.https://github.com.helper=!gh auth git-credential"]
        self.env["GIT_TERMINAL_PROMPT"] = "0"
        wire = self.run(self.git_command + ["credential", "fill"], input_text=
                        f"protocol=https\nhost=github.com\npath={REPOSITORY}.git\n\n")
        credential = dict(line.split("=", 1) for line in wire.splitlines() if "=" in line)
        self.token = credential.get("password")
        if not self.token:
            raise ReleaseError("无法核验实际 Git 凭据")
        self.env.pop("GITHUB_TOKEN", None)
        self.env["GH_TOKEN"] = self.token
        self.check_account(self.env)

    def prepare(self, retry):
        app = json.loads((ROOT / "macos-launcher/package.json").read_text())
        if app.get("name") != "dsh-workflow-macos-runtime":
            raise ReleaseError("当前工作区不是 DSH Workflow")
        version = app.get("version", "")
        if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version):
            raise ReleaseError("macos-launcher/package.json 必须使用纯 X.Y.Z 版本")
        lock = json.loads((ROOT / "macos-launcher/package-lock.json").read_text())
        locked_app = lock.get("packages", {}).get("", {})
        if lock.get("version") != version or locked_app.get("version") != version:
            raise ReleaseError("启动器 package-lock.json 版本与 package.json 不一致")
        pubspec = (ROOT / "macos-launcher/flutter/pubspec.yaml").read_text()
        versions = re.findall(r"^version:\s*([^\s#]+)\s*$", pubspec, re.M)
        if len(versions) != 1 or not re.fullmatch(re.escape(version) + r"(?:\+\d+)?", versions[0]):
            raise ReleaseError("Flutter pubspec.yaml 的应用版本与启动器不一致")
        runtime = json.loads((ROOT / "dsh-runtime.json").read_text())
        pinned = runtime.get("version")
        if runtime.get("package") != "@deepseek-ai/dsh" or not re.fullmatch(r"[0-9a-f]{40}", runtime.get("commit", "")):
            raise ReleaseError("DSH 固定来源无效")
        if (app.get("dependencies", {}).get("@deepseek-ai/dsh") != pinned
                or locked_app.get("dependencies", {}).get("@deepseek-ai/dsh") != pinned
                or lock.get("packages", {}).get("node_modules/@deepseek-ai/dsh", {}).get("version") != pinned):
            raise ReleaseError("启动器声明和锁定的 DSH 版本必须等于 dsh-runtime.json")
        if self.git("-C", "deepseek-harness", "rev-parse", "HEAD") != runtime["commit"]:
            raise ReleaseError("DSH 子模块提交与 dsh-runtime.json 不一致")
        cli = json.loads((ROOT / "deepseek-harness/apps/cli/package.json").read_text())
        if cli.get("name") != runtime["package"] or cli.get("version") != pinned:
            raise ReleaseError("DSH 子模块包版本与固定信息不一致")
        plugin_bytes = (ROOT / "project-plugins.json").read_bytes()
        plugins = json.loads(plugin_bytes)
        plugin_lock = json.loads((ROOT / "project-plugins.lock.json").read_text())
        if (plugin_lock.get("schema") != 1 or plugin_lock.get("harnessVersion") != pinned
                or plugin_lock.get("registry") != plugins.get("registry")
                or plugin_lock.get("manifestSha256") != hashlib.sha256(plugin_bytes).hexdigest()):
            raise ReleaseError("项目插件锁文件与当前宿主或清单不一致")
        if [(p.get("package"), p.get("version")) for p in plugin_lock.get("plugins", [])] != [
                (p.get("package"), p.get("version")) for p in plugins.get("plugins", [])]:
            raise ReleaseError("项目插件锁定版本与清单不一致")
        if self.git("rev-parse", "--show-toplevel") != str(ROOT):
            raise ReleaseError("发布脚本必须位于 DSH Workflow 仓库根下")
        if self.git("symbolic-ref", "--short", "HEAD") != "main":
            raise ReleaseError("必须在 main 分支执行")
        if self.git("status", "--porcelain"):
            raise ReleaseError("工作树不干净；先审查并提交改动，不自动 stash 或覆盖文件")
        origin = urlsplit(self.git("remote", "get-url", "origin"))
        if (origin.scheme != "https" or origin.hostname != "github.com"
                or origin.path.rstrip("/").removesuffix(".git") != "/" + REPOSITORY
                or origin.password is not None):
            raise ReleaseError(f"origin 必须是 {REPOSITORY} 的 HTTPS 地址")
        self.authenticate_git()
        head = self.git("rev-parse", "HEAD")
        remote_heads = self.git("ls-remote", "origin", "refs/heads/main").splitlines()
        if len(remote_heads) != 1 or remote_heads[0].split()[0] != head:
            raise ReleaseError("本地 main 与实际远端不同，先 fast-forward 同步再发版")
        if self.git("rev-parse", "origin/main") != head:
            raise ReleaseError("origin/main 缓存过期，先 git fetch origin main")
        tag = "macos-v" + version
        remote_tags = self.git("ls-remote", "--tags", "origin")
        tags = {line.split()[1]: line.split()[0] for line in remote_tags.splitlines()}
        if "refs/tags/" + tag in tags:
            raise ReleaseError(f"{tag} 已推送；跟踪既有 macos-app.yml，不重用版本或重推 tag")
        published_versions = [tuple(map(int, name.removeprefix("refs/tags/macos-v").split("."))) for name in tags
                              if re.fullmatch(r"refs/tags/macos-v\d+\.\d+\.\d+", name)]
        if published_versions and tuple(map(int, version.split("."))) <= max(published_versions):
            raise ReleaseError("版本必须高于远端已有发布 tag；按 .agents/skills/deploy-release/SKILL.md 确定目标版本")
        local_tags = self.git("tag", "--list", tag).splitlines()
        if local_tags:
            if not retry:
                raise ReleaseError(f"本地 {tag} 已存在；若是上次 push 失败，用 --retry-tag")
            if self.git("rev-parse", "--verify", tag + "^{commit}") != head:
                raise ReleaseError("本地 tag 未指向当前 main，不移动或重建 tag")
            if self.git("cat-file", "-t", tag) != "tag":
                raise ReleaseError("重试只接受附注 tag，不替换既有 tag")
        elif retry:
            raise ReleaseError("--retry-tag 仅用于重试已存在的本地 tag")
        print(f"release: 仓库：{REPOSITORY}\nrelease: 版本：{version}\nrelease: 发布 tag：{tag}")
        print(f"release: 提交：{head}")
        print(f"release: DSH：{pinned} {runtime['commit']}")
        return tag, head, bool(local_tags)

    def publish(self, tag, head, local_tag):
        if self.git("rev-parse", "HEAD") != head or self.git("status", "--porcelain"):
            raise ReleaseError("发布准备后工作区已变化，重新检查后再发布")
        if not local_tag:
            self.git("tag", "-a", tag, head, "-m", "DSH Workflow " + tag)
        try:
            self.git("push", "origin", "refs/tags/" + tag)
        except ReleaseError as error:
            raise ReleaseError(f"{error}\n本地 tag 已保留。先核对远端；若未推送，使用 scripts/release.sh --retry-tag") from error
        actual = self.git("ls-remote", "origin", "refs/tags/" + tag + "^{}")
        if not actual or actual.split()[0] != head:
            raise ReleaseError("远端 tag 提交核验失败；停止并核对，不移动 tag")
        main = self.git("ls-remote", "origin", "refs/heads/main")
        if not main or main.split()[0] != head:
            raise ReleaseError("tag 已推送，但远端 main 已变化；先 fast-forward 同步本地，再跟踪既有管线")
        print(f"release: 完成：{tag} 已推送")
        print(f"release: 跟踪：gh run list -R {REPOSITORY} --workflow macos-app.yml --commit {head}")


def main():
    parser = argparse.ArgumentParser(description="发布 DSH Workflow 当前版本；不 bump、不提交、不推 main")
    parser.add_argument("--dry-run", action="store_true", help="只检查和显示计划，不创建或推送 tag")
    parser.add_argument("--retry-tag", action="store_true", help="重试尚未推送且指向当前 main 的本地 tag")
    args = parser.parse_args()
    release = Release()
    try:
        tag, head, local_tag = release.prepare(args.retry_tag)
        if args.dry_run:
            print("release: [dry-run] " + ("复用本地 tag" if local_tag else "创建附注 tag") + f" {tag}")
            print(f"release: [dry-run] 推送 {tag}，触发 macos-app.yml 构建 DMG、manifest.json 和 SHA256SUMS")
        else:
            release.publish(tag, head, local_tag)
    except (ReleaseError, OSError, ValueError) as error:
        print("release: 错误：" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
