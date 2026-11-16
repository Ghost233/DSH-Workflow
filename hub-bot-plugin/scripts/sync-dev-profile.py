#!/usr/bin/env python3
"""hub-bot 开发实例配置同步：把主 profile 的模型配置复制进 dev profile，凭据 refs 同步进 dev 凭据文件。

用法: python3 hub-bot-plugin/scripts/sync-dev-profile.py [--main-profile ~/.dsh/profiles/desktop/cordis.patch.yml]
                                                          [--dev-profile /tmp/dsh-hub-bot-dev/profiles/hub-bot-dev/cordis.patch.yml]
                                                          [--main-credentials ~/.dsh/.credentials.yaml]
                                                          [--dev-credentials /tmp/dsh-hub-bot-dev/.credentials.yaml]

同步的 patch 块: llm-pi-ai (全部 provider/模型路由), agent-default-model (部署默认模型)。
dev 的其余块 (permission/webserver/hub-bot 等实例专属配置) 原样保留。
凭据只同步 refs 段 (环境变量名→值); records 段 (grant 等记录) 不动。
幂等: 重跑结果一致; 主 profile 改了模型后重跑本脚本 + 重启 dev 实例即生效。
"""
import argparse
import re
import sys


def split_top_level_blocks(text):
    """Split a YAML patch file into (header, [(id, block_text)]) by top-level '- id:' entries.

    Entries that are not '- id:' (e.g. '- insert:' or flow-style '- {...}') are kept verbatim
    under a None id so round-tripping loses nothing we do not understand.
    """
    lines = text.split('\n')
    header = []
    blocks = []
    current = None
    for line in lines:
        if re.match(r'^- ', line):
            if current is not None:
                blocks.append(current)
            current = [line]
        elif current is None:
            header.append(line)
        else:
            current.append(line)
    if current is not None:
        blocks.append(current)
    parsed = []
    for block in blocks:
        m = re.match(r'^- id: (\S+)', block[0])
        parsed.append((m.group(1) if m else None, '\n'.join(block).rstrip('\n')))
    return '\n'.join(header).rstrip('\n'), parsed


SYNCED_IDS = ['llm-pi-ai', 'agent-default-model']


def sync_patch(main_path, dev_path):
    main_header, main_blocks = split_top_level_blocks(open(main_path).read())
    main_by_id = {}
    for bid, text in main_blocks:
        if bid in SYNCED_IDS:
            main_by_id[bid] = text
    missing = [i for i in SYNCED_IDS if i not in main_by_id]
    if missing:
        sys.exit('main profile is missing expected block(s): ' + ', '.join(missing))

    dev_text = open(dev_path).read()
    dev_header, dev_blocks = split_top_level_blocks(dev_text)
    out = []
    written = set()
    for bid, text in dev_blocks:
        if bid in SYNCED_IDS:
            out.append(main_by_id[bid])
            written.add(bid)
        else:
            out.append(text)
    for bid in SYNCED_IDS:  # dev 里原本没有的块, 追加到最前 (llm 段惯例在前)
        if bid not in written:
            out.insert(0, main_by_id[bid])
    body = '\n'.join(out) + '\n'
    open(dev_path, 'w').write((dev_header + '\n' + body) if dev_header else body)
    print('patch: synced', ', '.join(SYNCED_IDS), '->', dev_path)


def sync_credentials(main_path, dev_path):
    def read_refs(path):
        text = open(path).read()
        m = re.search(r'^refs:\n((?:  \S[^\n]*\n?)*)', text, re.M)
        if not m:
            return {}, text
        refs = {}
        for line in m.group(1).splitlines():
            if ':' in line:
                k, v = line.strip().split(':', 1)
                refs[k.strip()] = v.strip()
        return refs, text

    main_refs, _ = read_refs(main_path)
    dev_refs, dev_text = read_refs(dev_path)
    merged = {**main_refs, **dev_refs}  # dev 专有 ref 优先
    if merged == dev_refs and 'refs:' in dev_text:
        print('credentials: refs already in sync ->', dev_path)
        return
    # 重写 refs 段: 替换现有 refs 块, 或插在 version: 行后
    refs_yaml = 'refs:\n' + ''.join('  ' + k + ': ' + v + '\n' for k, v in merged.items())
    if re.search(r'^refs:\n(?:  \S[^\n]*\n?)*', dev_text, re.M):
        new_text = re.sub(r'^refs:\n(?:  \S[^\n]*\n?)*', refs_yaml, dev_text, count=1, flags=re.M)
    else:
        new_text = re.sub(r'^(version: \d+\n)', r'\1' + refs_yaml, dev_text, count=1, flags=re.M)
    open(dev_path, 'w').write(new_text)
    print('credentials: synced', len(main_refs), 'refs ->', dev_path, '(keys: ' + ', '.join(sorted(main_refs)) + ')')


def main():
    ap = argparse.ArgumentParser(description='sync main-profile model config into the hub-bot dev profile')
    ap.add_argument('--main-profile', default='/Users/ghost233/.dsh/profiles/desktop/cordis.patch.yml')
    ap.add_argument('--dev-profile', default='/tmp/dsh-hub-bot-dev/profiles/hub-bot-dev/cordis.patch.yml')
    ap.add_argument('--main-credentials', default='/Users/ghost233/.dsh/.credentials.yaml')
    ap.add_argument('--dev-credentials', default='/tmp/dsh-hub-bot-dev/.credentials.yaml')
    args = ap.parse_args()
    sync_patch(args.main_profile, args.dev_profile)
    sync_credentials(args.main_credentials, args.dev_credentials)


if __name__ == '__main__':
    main()
