#!/usr/bin/env python3
"""Inspect an isolated DSH Web Host and its owning process."""
import json
import signal
import os
import re
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / 'macos-launcher/flutter/tool'
sys.path.insert(0, str(TOOLS))

from collect_probe_diagnostics import scrub


def sanitize_text(text):
    text = scrub(text)
    text = re.sub(r'((?:https?|wss?)://(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)[^/\s]+/?', r'\1<REDACTED>/', text)
    text = re.sub(r"(?im)([\"']?(?:authorization|proxy-authorization|auth|cookie|set-cookie)[\"']?\s*[:=]\s*)[^\r\n]+", r'\1<REDACTED>', text)
    text = re.sub(r"(?i)([\"']?(?:password|(?:(?:access|auth)[_-]?)?token|api[_-]?key)[\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)", r'\1<REDACTED>', text)
    text = re.sub(r'(?i)(\b(?:Bearer|Basic)\s+)[A-Za-z0-9+/=_.-]+', r'\1<REDACTED>', text)
    text = re.sub(r'((?:https?|wss?)://)[^/\s@]+@', r'\1<REDACTED>@', text)
    return text


def sanitize_json(value):
    value = scrub(value)
    if isinstance(value, dict):
        return {key: sanitize_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_json(item) for item in value]
    return sanitize_text(value) if isinstance(value, str) else value


def parse_json(text):
    def reject_constant(_):
        raise ValueError('Invalid JSON scalar')
    return json.loads(text, parse_constant=reject_constant)


def run_inspection(command):
    child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                             start_new_session=True, env={**os.environ, 'LC_ALL': 'C', 'TZ': 'UTC'})
    timed_out = False
    try:
        stdout, stderr = child.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGKILL)  # Only this owned readonly query group.
        stdout, stderr = child.communicate()
    return {'exit': 124 if timed_out else child.returncode, 'childPid': child.pid, 'childExit': child.returncode,
            'waited': True, 'timedOut': timed_out, 'stdout': sanitize_text(stdout), 'stderr': sanitize_text(stderr)}


HOST_INSPECTION_SCRIPT = r'''
import ctypes, datetime, json, os, subprocess, sys
pid = int(sys.argv[1])
facts = {'pid': pid, 'lookupOk': False}
try:
    proc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    proc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    proc.proc_pidpath.restype = ctypes.c_int
    path = ctypes.create_string_buffer(4096)
    length = proc.proc_pidpath(pid, path, len(path))
    facts['executableLookup'] = {'bytes': length, 'errno': ctypes.get_errno() if length <= 0 else 0}
    facts['executable'] = os.path.realpath(path.value.decode()) if length > 0 else None
    commands = {}
    for name, column in [('parent', 'ppid='), ('start', 'lstart='), ('uid', 'uid=')]:
        command = ['/bin/ps', '-p', str(pid), '-o', column]
        result = subprocess.run(command, capture_output=True, text=True, timeout=10)
        commands[name] = {'command': command, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    facts['queries'] = commands
    if length > 0 and all(c['exit'] == 0 and not c['stderr'] for c in commands.values()):
        facts['parentPid'] = int(commands['parent']['stdout'].strip())
        facts['uid'] = int(commands['uid']['stdout'].strip())
        facts['probeUid'] = os.getuid()
        parent_uid = subprocess.run(['/bin/ps', '-p', str(facts['parentPid']), '-o', 'uid='], capture_output=True, text=True, timeout=10)
        facts['parentUid'] = int(parent_uid.stdout.strip()) if parent_uid.returncode == 0 and not parent_uid.stderr else None
        start = datetime.datetime.strptime(commands['start']['stdout'].strip(), '%a %b %d %H:%M:%S %Y')
        facts['startUnixSeconds'] = start.replace(tzinfo=datetime.timezone.utc).timestamp()
        facts['startPrecisionSeconds'] = 1
        facts['lookupOk'] = True
except Exception as error:
    facts['lookupError'] = str(error)
print(json.dumps(facts))
'''


def inspect_host(pid):
    query = run_inspection([sys.executable, '-c', HOST_INSPECTION_SCRIPT, str(pid)])
    facts = parse_json(query['stdout']) if query['exit'] == 0 else {'pid': pid, 'lookupOk': False}
    return dict(facts, query=query)


def observation_runner(*, headless=False):
    local = os.environ.get('DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT')
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        if local:
            raise ValueError('Mixed CI and local acceptance contexts')
        return Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    if headless and not local:
        return Path('/private/tmp').resolve(strict=True)
    expected = Path('/private/tmp') / ('dsh-launcher-local-' + str(os.getuid()))
    if local != str(expected) or expected.is_symlink():
        raise ValueError('Explicit local acceptance root differs from current UID namespace')
    attributes = expected.lstat()
    if (expected.resolve(strict=True) != expected or not expected.is_dir()
        or attributes.st_uid != os.getuid() or attributes.st_mode & 0o777 != 0o700):
        raise ValueError('Local acceptance root must be canonical, owned and private')
    return expected


def validate_observation_root(root, runner):
    # Host identity and liveness are shared by general application and settings probes.
    original = Path(root)
    root, runner = original.resolve(strict=True), Path(runner).resolve(strict=True)
    parents = {runner, Path('/private/tmp').resolve(strict=True)}
    prefixes = ('dsh-t01-', 'dsh-t05-', 'dsh-t06-')
    if (original.is_symlink() or root.parent not in parents or not root.name.startswith(prefixes)
        or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077):
        raise ValueError('Unowned or non-direct probe root')
    return root


def capture_owned_headless_host(root, runner, pid, owner_pid, driver_pid):
    root = validate_observation_root(root, runner)
    receipt = parse_json((root / 'data/global/.dsh-workflow/desktop/desktop-host.json').read_text())
    if receipt.get('pid') != pid:
        raise ValueError('Host receipt changed before identity inspection')
    probe = parse_json((root / 'probe-process.json').read_text())
    owner, driver = inspect_host(owner_pid), inspect_host(driver_pid)
    executable = Path(probe['driverExecutable']).resolve(strict=True)
    drivers = {str(executable)}
    if executable.name == 'dart' and executable.with_name('dartvm').is_file():
        drivers.add(str(executable.with_name('dartvm').resolve(strict=True)))
    node = str((root / 'missing-runtime/node').resolve(strict=True))
    known_owner = (probe.get('driverPid') == driver_pid and owner.get('pid') == owner_pid
                   and owner.get('lookupOk') is True and owner.get('query', {}).get('exit') == 0
                   and owner.get('parentPid') == driver_pid and owner.get('executable') == node
                   and owner.get('uid') == owner.get('parentUid') == os.getuid()
                   and isinstance(owner.get('startUnixSeconds'), (int, float))
                   and driver.get('pid') == driver_pid and driver.get('lookupOk') is True
                   and driver.get('query', {}).get('exit') == 0 and driver.get('uid') == os.getuid()
                   and driver.get('executable') in drivers
                   and isinstance(driver.get('startUnixSeconds'), (int, float)))
    inspection = inspect_host(pid)
    known_host = (inspection.get('lookupOk') is True and inspection.get('pid') == pid
                  and type(pid) is int and pid > 1 and isinstance(receipt.get('lease'), str) and bool(receipt['lease'])
                  and inspection.get('parentPid') == owner_pid
                  and type(inspection.get('uid')) is int
                  and inspection.get('uid') == inspection.get('probeUid') == inspection.get('parentUid') == os.getuid()
                  and inspection.get('executable') == node and isinstance(inspection.get('startUnixSeconds'), (int, float))
                  and inspection.get('query', {}).get('exit') == 0)
    bound = {'root': str(root), 'pid': pid, 'lease': receipt['lease'], 'probeStartedAt': probe['startedAt'],
             'ownerType': 'headless', 'ownerPid': owner_pid, 'ownerInspection': owner, 'driverInspection': driver,
             'inspection': inspection, 'ownershipKnown': known_owner and known_host}
    with (root / 'host-ownership.jsonl').open('a') as output:
        output.write(json.dumps(sanitize_json(bound)) + '\n')
    return bound


if __name__ == '__main__':
    if len(sys.argv) != 6 or sys.argv[1] != '--capture-headless-host':
        sys.exit('Usage: settings_startup_cycle.py --capture-headless-host ROOT HOST_PID OWNER_PID DRIVER_PID')
    _, _, root, pid, owner, driver = sys.argv
    print(json.dumps(capture_owned_headless_host(Path(root), observation_runner(headless=True),
                                                int(pid), int(owner), int(driver))))
