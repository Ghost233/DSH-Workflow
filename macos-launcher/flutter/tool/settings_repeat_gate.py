#!/usr/bin/env python3
"""Fail closed before another clean-CI Desktop launch; never terminate anything."""
import datetime
import errno
import json
import os
import re
import socket
import subprocess
import sys
from pathlib import Path


def validate_root(name, runner):
    original = Path(name)
    root, runner = original.resolve(strict=True), Path(runner).resolve(strict=True)
    if original.is_symlink() or root.parent != runner or not root.name.startswith('dsh-t05-') or root.stat().st_uid != os.getuid():
        raise ValueError('Unowned or non-direct probe root')
    return root


def valid_pid(pid):
    return type(pid) is int and pid > 1


def ownership(log, runner, *, require_finally=True):
    names = re.findall(r'^ISOLATED_ROOT=(.+)$', Path(log).read_text(), re.M)
    if len(names) != 1:
        raise ValueError('Missing or ambiguous isolated root')
    root = validate_root(names[0], runner)
    def read(name):
        file = root / name
        if not file.resolve(strict=True).is_relative_to(root) or file.is_symlink():
            raise ValueError('Unowned evidence path')
        return file.read_text()
    probe = json.loads(read('probe-process.json'))
    launcher = probe['pid']
    expected = (root / 'candidate.app/Contents/MacOS/DSH Workflow').resolve(strict=True)
    if not valid_pid(launcher) or Path(probe['executable']).resolve(strict=True) != expected or not expected.is_relative_to(root):
        raise ValueError('Invalid application ownership')
    started = datetime.datetime.fromisoformat(probe['startedAt'].replace('Z', '+00:00')).timestamp()
    timeline = [json.loads(line) for line in read('probe-timeline.jsonl').splitlines()]
    starts = [row for row in timeline if row.get('event') == 'application-started']
    if len(starts) != 1 or any(starts[0].get(key) != probe.get(key) for key in ('pid', 'executable', 'startedAt')):
        raise ValueError('Missing or mismatched application start facts')
    if any(row.get('event') == 'receipt-snapshot' and row.get('errorType') for row in timeline):
        raise ValueError('Incomplete Host lookup facts')
    if require_finally and (not any(row.get('event') == 'application-exit' for row in timeline) or not any(row.get('event') == 'diagnostics-close' for row in timeline)):
        raise ValueError('Incomplete application finally')
    if any(row.get('event') in ('application-started', 'ui-response') and row.get('pid') != launcher for row in timeline):
        raise ValueError('Application identity differs')
    desktop_log = read('owned-desktop-cleanup.log').splitlines()
    exits = [line for line in desktop_log if line.startswith('HELPER_EXIT=')]
    captures = [json.loads(line) for line in desktop_log if line.startswith('{')]
    captures = [row for row in captures if row.get('event') == 'captured']
    if not exits or any(line != 'HELPER_EXIT=0' for line in exits) or not captures:
        raise ValueError('Missing or failed Desktop ownership')
    bundle = (root / 'missing-runtime/desktop/DeepSeek Harness.app').resolve(strict=True)
    executable = bundle / 'Contents/MacOS/DeepSeek Harness'
    for row in captures:
        if (not valid_pid(row.get('pid')) or Path(row['bundlePath']).resolve(strict=True) != bundle
            or Path(row['executablePath']).resolve(strict=True) != executable
            or not bundle.is_relative_to(Path(runner).resolve(strict=True))
            or row['probeStartedAt'] != probe['startedAt'] or row['launchDateUnix'] < started - 5):
            raise ValueError('Desktop identity differs')
    ledger = json.loads(read('owned-desktop-process.json'))
    if any(ledger.get(key) != captures[-1].get(key) for key in ('pid', 'bundlePath', 'executablePath', 'launchDateUnix', 'probeStartedAt')):
        raise ValueError('Desktop ledger differs from observed captures')
    desktops = {row['pid'] for row in captures}
    observed = {row['openedDesktopPid'] for row in timeline if row.get('event') == 'ui-response' and row.get('openedDesktopPid') is not None}
    if not observed or observed != desktops:
        raise ValueError('Unknown or unregistered Desktop PID')
    receipts = [row for row in timeline if row.get('event') == 'receipt-snapshot' and row.get('present')]
    if not receipts or any(not valid_pid(row.get('pid')) or not row.get('lease') for row in receipts):
        raise ValueError('Missing Host receipt ownership')
    hosts = {row['pid'] for row in receipts}
    facts = root / 'settings-evidence.json'
    if facts.is_file():
        value = json.loads(read('settings-evidence.json'))
        if any(value.get(key) is not None and value[key] not in hosts for key in ('hostPid', 'oldHostPid')):
            raise ValueError('Unregistered Host PID')
    return root, {'launcher': [launcher], 'desktop': sorted(desktops), 'host': sorted(hosts)}


def can_repeat(facts):
    if facts.get('finallyComplete') is False:
        return False
    roles = facts.get('ownership', {})
    if set(roles) != {'launcher', 'desktop', 'host'}:
        return False
    if any(not roles.get(role) or any(not valid_pid(pid) for pid in roles[role]) for role in ('launcher', 'desktop', 'host')):
        return False
    expected = {pid for role in roles.values() for pid in role}
    rows = facts.get('processes', [])
    return (set(row.get('pid') for row in rows) == expected
            and all(row.get('state') == 'gone' and row.get('errno') == errno.ESRCH and row.get('rawExit') not in (None, 0) and row.get('rawErrno') == errno.ESRCH for row in rows)
            and facts.get('receipt', {}).get('errno') == errno.ENOENT
            and facts.get('listener') == {'exit': 1, 'stdout': '', 'stderr': ''}
            and facts.get('bindListen', {}).get('available') is True)


def inspect(log, runner):
    root, roles = ownership(log, runner)
    rows = []
    for pid in sorted({pid for role in roles.values() for pid in role}):
        raw = subprocess.run(['/bin/kill', '-0', str(pid)], capture_output=True, text=True)
        row = {'pid': pid, 'rawExit': raw.returncode, 'rawStdout': raw.stdout, 'rawStderr': raw.stderr,
               'rawErrno': errno.ESRCH if raw.returncode != 0 and os.strerror(errno.ESRCH) in raw.stderr else None}
        try:
            os.kill(pid, 0)
            row.update(state='alive', errno=None)
        except OSError as error:
            row.update(state='gone' if error.errno == errno.ESRCH else 'unknown', errno=error.errno, stderr=str(error))
        rows.append(row)
    receipt = {}
    receipt_file = root / 'data/global/.dsh-workflow/desktop/desktop-host.json'
    if not receipt_file.parent.resolve().is_relative_to(root):
        raise ValueError('Unowned receipt lookup path')
    try:
        receipt_file.lstat()
        receipt['exists'] = True
    except OSError as error:
        receipt.update(errno=error.errno, stderr=str(error))
    listener = subprocess.run(['/usr/sbin/lsof', '-nP', '-iTCP:33080', '-sTCP:LISTEN', '-Fpn'], capture_output=True, text=True)
    bind = {}
    with socket.socket() as port:
        port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            port.bind(('0.0.0.0', 33080)); port.listen(1)
            bind['available'] = True
        except OSError as error:
            bind.update(available=False, errno=error.errno, stderr=str(error))
    return {'root': str(root), 'ownership': roles, 'processes': rows, 'receipt': receipt,
            'listener': {'exit': listener.returncode, 'stdout': listener.stdout, 'stderr': listener.stderr}, 'bindListen': bind}


if __name__ == '__main__':
    facts = {}
    try:
        if os.environ.get('GITHUB_ACTIONS') != 'true' or not os.environ.get('RUNNER_TEMP') or len(sys.argv) != 2:
            raise ValueError('Gate requires the clean CI log and runner root')
        facts = inspect(sys.argv[1], os.environ['RUNNER_TEMP'])
        facts['safe_to_repeat'] = can_repeat(facts)
    except Exception as error:
        facts.update(safe_to_repeat=False, errorType=type(error).__name__, reason=str(error))
    print(json.dumps(facts, indent=2))
    sys.exit(0 if facts['safe_to_repeat'] else 1)
