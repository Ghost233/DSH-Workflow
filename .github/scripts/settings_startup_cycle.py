#!/usr/bin/env python3
"""Run one existing startup prefix, gate cleanup, then preserve its evidence."""
import json
import datetime
import errno
import signal
import selectors
import time
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / 'macos-launcher/flutter/tool'
sys.path.insert(0, str(TOOLS))

from collect_probe_diagnostics import scrub
from settings_repeat_gate import validate_root, launcher_ownership, ownership, can_repeat


SAFE_EVIDENCE = {
    'probe-process.json': 'json',
    'app.log': 'text',
    'host-ownership.jsonl': 'jsonl',
    'host-inspection-results.jsonl': 'jsonl',
    'owned-desktop-process.json': 'json',
    'settings-evidence.json': 'json',
    'settings-current.json': 'json',
    'settings-current.png': 'png',
    'initial-web-ui.json': 'json',
    'settings-startup-ready.json': 'json',
    'web-final.json': 'json',
    'probe-timeline.jsonl': 'jsonl',
    'owned-desktop-cleanup.log': 'text',
    'settings-startup-ready.png': 'png',
    'web-final.png': 'png',
}


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


def run_streamed_command(command, evidence):
    state_file = evidence / 'command-state.json'
    state = {'exitKnown': False, 'streamComplete': False, 'phase': 'command-start'}
    state_file.write_text(json.dumps(state) + '\n')
    result, complete, saw_output = None, True, False
    pending, prefix = '', ''
    credential_continuation = False
    with (evidence / 'application.log').open('w') as output:
        def publish(text):
            output.write(text)
            output.flush()
            print(text, end='', flush=True)
        publish('T05_APPLICATION_PHASE=command-start EXIT=UNKNOWN\n')
        try:
            actual_root = Path(evidence).resolve(strict=True)
            target = actual_root / 'command-process.json'
            if (actual_root.stat().st_uid != os.getuid() or target.is_symlink()
                or (os.environ.get('GITHUB_ACTIONS') == 'true' and
                    not actual_root.is_relative_to(Path(os.environ['RUNNER_TEMP']).resolve(strict=True)))):
                raise ValueError('Unowned command process evidence')
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            executable = str(Path(shutil.which(command[0]) or command[0]).resolve())
            known = (len(command) == 11 and command[1:5] == ['run', 'tool/application_probe.dart',
                     'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow', '--settings-runtime']
                     and command[6:] == ['--web-backend', 'desktop', '--web-port', '33080', '--legacy-keychain-ci'])
            argv = [Path(executable).name, *command[1:5], '<FROZEN_RUNTIME_RESOURCES>', *command[6:]] if known else ['<UNRECORDED_ARGUMENTS>']
            target.write_text(json.dumps(sanitize_json({'schema': 1, 'pid': process.pid, 'executable': executable, 'executableKind': 'configured-entry',
                              'root': str(actual_root), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                              'normalizedArgv': argv})) + '\n')
            pipe_complete = True
            def raw_lines():
                nonlocal result, complete, pipe_complete
                buffered = b''
                drain_deadline = None
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    while True:
                        if result is None:
                            result = process.poll()
                            if result is not None:
                                (evidence / 'application.exit').write_text(str(result) + '\n')
                                state.update(exitKnown=True, commandExit=result, phase='command-exit')
                                state_file.write_text(json.dumps(state) + '\n')
                                publish('T05_APPLICATION_PHASE=command-exit COMMAND_EXIT=' + str(result) + '\n')
                                drain_deadline = time.monotonic() + 1
                        if drain_deadline is not None and time.monotonic() >= drain_deadline:
                            complete, pipe_complete = False, False
                            publish('T05_STREAM_PHASE=UNKNOWN INHERITED_STDOUT\n')
                            return
                        if not selector.select(timeout=.05):
                            continue
                        chunk = os.read(process.stdout.fileno(), 65536)
                        if not chunk:
                            if buffered:
                                yield buffered
                            return
                        buffered += chunk
                        while b'\n' in buffered:
                            raw, buffered = buffered.split(b'\n', 1)
                            yield raw + b'\n'
            for raw in raw_lines():
                saw_output = True
                if credential_continuation:
                    continue
                if not raw.endswith(b'\n'):
                    complete = False
                    publish('T05_STREAM_PHASE=UNKNOWN INCOMPLETE_LINE\n')
                try:
                    line = raw.decode('utf-8')
                except UnicodeDecodeError:
                    complete = False
                    publish('T05_STREAM_PHASE=UNKNOWN INVALID_UTF8\n')
                    continue
                if not pending:
                    match = re.search(r'[{]|\[(?=\s*(?:["{\[0-9\]\-]|true|false|null|$))', line)
                    if not match:
                        if re.search(r"""(?i)(?:["']?(?:authorization|proxy-authorization|auth|cookie|set-cookie|password|(?:(?:access|auth)[_-]?)?token|api[_-]?key)["']?[ \t]*[:=][ \t]*(?:(?:Bearer|Basic)[ \t]*)?["']?[ \t]*|\b(?:Bearer|Basic)[ \t]*)\r?\n?$""", line):
                            complete = False
                            credential_continuation = True
                            publish('T05_STREAM_PHASE=UNKNOWN CREDENTIAL_CONTINUATION <REDACTED>\n')
                        else:
                            publish(sanitize_text(line))
                        continue
                    prefix, pending = line[:match.start()], line[match.start():]
                else:
                    pending += line
                try:
                    value = parse_json(pending)
                except ValueError:
                    continue
                publish(sanitize_text(prefix) + json.dumps(sanitize_json(value)) + '\n')
                pending, prefix = '', ''
            if pending or not saw_output:
                complete = False
                publish('T05_STREAM_PHASE=UNKNOWN INCOMPLETE_OUTPUT\n')
            if pipe_complete:
                publish('T05_STREAM_PHASE=stdout-eof EXIT=UNKNOWN\n')
            result = process.wait()
            process.stdout.close()
        except (OSError, ValueError) as error:
            complete = False
            publish('T05_STREAM_PHASE=UNKNOWN ERROR_TYPE=' + type(error).__name__ + '\n')
        if result is not None:
            (evidence / 'application.exit').write_text(str(result) + '\n')
        state.update(exitKnown=result is not None, streamComplete=complete,
                     phase='command-end' if result is not None else 'unknown', commandExit=result)
        state_file.write_text(json.dumps(state) + '\n')
        (evidence / 'streaming.exit').write_text(('0' if complete and result is not None else '1') + '\n')
        publish('T05_APPLICATION_PHASE=' + state['phase'] + ' COMMAND_EXIT=' +
                (str(result) if result is not None else 'UNKNOWN') + '\n')
    return result if result not in (None, 0) else (0 if complete and result is not None else 1)


def full_command():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Clean CI full command is required')
    runner = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    evidence = Path(os.environ['EVIDENCE_DIR']).resolve(strict=True)
    if not evidence.is_relative_to(runner):
        raise ValueError('Unowned full command evidence directory')
    command = ['dart', 'run', 'tool/application_probe.dart',
               'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow',
               '--settings-runtime', os.environ['T05_RUNTIME_RESOURCES'],
               '--web-backend', 'desktop', '--web-port', '33080', '--legacy-keychain-ci']
    return run_streamed_command(command, evidence)


def snapshot_completed_command(evidence, runner):
    evidence = evidence.resolve(strict=True)
    if not evidence.is_relative_to(runner.resolve(strict=True)):
        raise ValueError('Unowned command evidence directory')
    log, exit_file = evidence / 'application.log', evidence / 'application.exit'
    if not log.is_file() or log.is_symlink():
        raise ValueError('Command log evidence is missing')
    raw_exit = None
    if exit_file.exists():
        if not exit_file.is_file() or exit_file.is_symlink():
            raise ValueError('Unowned command exit evidence')
        raw_exit = exit_file.read_text()
        if not re.fullmatch(r'-?\d+\n?', raw_exit):
            raise ValueError('Invalid command exit evidence')
    target = evidence / 'completed-command'
    target.mkdir()
    (target / 'application.log').write_text(sanitize_text(log.read_text()))
    state_file = evidence / 'command-state.json'
    state = parse_json(state_file.read_text()) if state_file.is_file() and not state_file.is_symlink() else {}
    process_file = evidence / 'command-process.json'
    if process_file.exists():
        if not process_file.is_file() or process_file.is_symlink() or process_file.stat().st_size > 16384:
            raise ValueError('Unowned or oversized command process evidence')
        process_facts = parse_json(process_file.read_text())
        allowed = {'schema', 'pid', 'executable', 'executableKind', 'root', 'startedAt', 'normalizedArgv'}
        if (not isinstance(process_facts, dict) or set(process_facts) != allowed
            or process_facts['schema'] != 1 or type(process_facts['pid']) is not int
            or process_facts['pid'] <= 1 or process_facts['root'] != str(evidence)):
            raise ValueError('Invalid command process identity evidence')
        (target / 'command-process.json').write_text(json.dumps(sanitize_json(process_facts)) + '\n')
    state['exitKnown'] = raw_exit is not None
    (target / 'command-state.json').write_text(json.dumps(sanitize_json(state)) + '\n')
    if raw_exit is not None:
        (target / 'application.exit').write_text(raw_exit)
    print('T05_FULL_COMMAND_EXIT=' + (raw_exit.strip() if raw_exit is not None else 'UNKNOWN'), flush=True)


def run_diagnostics(root, target):
    command = [sys.executable, str(TOOLS / 'collect_probe_diagnostics.py'), str(root), str(target), '--crashes']
    print('T05_COLLECTOR_PHASE=diagnostic-start ROOT=' + root.name, flush=True)
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=45)
        code, output = result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired as error:
        code = 124
        def text(value):
            return value.decode(errors='replace') if isinstance(value, bytes) else (value or '')
        output = text(error.stdout) + text(error.stderr) + '\nDiagnostic collector deadline exceeded (45s)\n'
    (target / 'diagnostic-collector.log').write_text(sanitize_text(output))
    (target / 'diagnostic-collector.exit').write_text(str(code) + '\n')
    print(f'T05_COLLECTOR_PHASE=diagnostic-end ROOT={root.name} EXIT={code}', flush=True)
    return code


def observe_os_query(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10)
        return {'exit': result.returncode, 'stdout': sanitize_text(result.stdout),
                'stderr': sanitize_text(result.stderr), 'state': 'observed', 'timedOut': False}
    except subprocess.TimeoutExpired as error:
        def text(value):
            return value.decode(errors='replace') if isinstance(value, bytes) else (value or '')
        return {'exit': 124, 'stdout': sanitize_text(text(error.stdout)),
                'stderr': sanitize_text(text(error.stderr)), 'state': 'unknown', 'timedOut': True}



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


def inspect_host(pid, *, include_bsd_status=False):
    source = (TOOLS / 'desktop_launch_observer.dart').read_text()
    delimiter = chr(39) * 3
    script = source.split("const hostInspectionScript = r" + delimiter, 1)[1].split(delimiter, 1)[0]
    script = script.replace("('start', 'lstart=')", "('start', 'lstart='), ('uid', 'uid=')")
    script = script.replace('capture_output=True, text=True)', 'capture_output=True, text=True, timeout=10)')
    script = script.replace("facts['parentPid'] = int(commands['parent']['stdout'].strip())",
        "facts['parentPid'] = int(commands['parent']['stdout'].strip())\n        facts['uid'] = int(commands['uid']['stdout'].strip())\n        facts['probeUid'] = os.getuid()\n        parent_uid = subprocess.run(['/bin/ps', '-p', str(facts['parentPid']), '-o', 'uid='], capture_output=True, text=True, timeout=10)\n        facts['parentUid'] = int(parent_uid.stdout.strip()) if parent_uid.returncode == 0 and not parent_uid.stderr else None")
    query = run_inspection([sys.executable, '-c', script, str(pid)])
    facts = parse_json(query['stdout']) if query['exit'] == 0 else {'pid': pid, 'lookupOk': False}
    if include_bsd_status:
        command = ['/bin/ps', '-p', str(pid), '-o', 'stat=']
        facts['bsdStatus'] = dict(run_inspection(command), command=command)
    return dict(facts, query=query)


def bind_host_identity(inspection, root, receipt, desktop, probe, allowed):
    known = (inspection.get('lookupOk') is True and inspection.get('pid') == receipt.get('pid')
             and type(receipt.get('pid')) is int and receipt['pid'] > 1 and isinstance(receipt.get('lease'), str) and bool(receipt['lease'])
             and inspection.get('parentPid') == desktop.get('pid') and desktop.get('probeStartedAt') == probe.get('startedAt')
             and type(inspection.get('uid')) is int and inspection.get('uid') == inspection.get('probeUid') == inspection.get('parentUid')
             and inspection.get('executable') in allowed and isinstance(inspection.get('startUnixSeconds'), (int, float))
             and inspection.get('query', {}).get('exit') == 0)
    return {'root': str(root.resolve()), 'pid': receipt.get('pid'), 'lease': receipt.get('lease'),
            'desktopPid': desktop.get('pid'),
            'probeStartedAt': probe['startedAt'], 'ownershipKnown': known, 'inspection': inspection}


def validate_observation_root(root, runner):
    # Host identity and liveness are shared by general application and settings probes.
    original = Path(root)
    root, runner = original.resolve(strict=True), Path(runner).resolve(strict=True)
    if original.is_symlink() or root.parent != runner or not root.name.startswith(('dsh-t01-', 'dsh-t05-')) or root.stat().st_uid != os.getuid():
        raise ValueError('Unowned or non-direct probe root')
    return root


def capture_owned_host(root, runner, pid):
    root = validate_observation_root(root, runner)
    receipt = parse_json((root / 'data/global/.dsh-workflow/desktop/desktop-host.json').read_text())
    if receipt.get('pid') != pid:
        raise ValueError('Host receipt changed before identity inspection')
    probe = parse_json((root / 'probe-process.json').read_text())
    inspection = inspect_host(pid)
    captures = [parse_json(line) for line in (root / 'owned-desktop-cleanup.log').read_text().splitlines() if line.startswith('{')]
    desktop = next((row for row in reversed(captures) if row.get('event') == 'captured' and row.get('pid') == inspection.get('parentPid')), None)
    if desktop is None:
        return {'pid': pid, 'lease': receipt.get('lease'), 'ownershipKnown': False, 'pendingDesktopCapture': inspection.get('lookupOk') is True, 'inspection': inspection}
    bundle = (root / 'missing-runtime/desktop/DeepSeek Harness.app').resolve(strict=True)
    if Path(desktop['bundlePath']).resolve(strict=True) != bundle or Path(desktop['executablePath']).resolve(strict=True) != bundle / 'Contents/MacOS/DeepSeek Harness':
        raise ValueError('Desktop capture path differs from owned runtime')
    allowed = {str((root / 'missing-runtime/node').resolve(strict=True)), str(bundle / 'Contents/MacOS/DeepSeek Harness')}
    bound = bind_host_identity(inspection, root, receipt, desktop, probe, allowed)
    with (root / 'host-ownership.jsonl').open('a') as output:
        output.write(json.dumps(sanitize_json(bound)) + '\n')
    return bound



def process_exit_fact(pid):
    query = observe_os_query(['/bin/kill', '-0', str(pid)])
    fact = {'pid': pid, 'rawExit': query['exit'], 'rawStdout': query['stdout'], 'rawStderr': query['stderr'],
            'rawErrno': errno.ESRCH if query['exit'] not in (0, 124) and os.strerror(errno.ESRCH) in query['stderr'] else None,
            'state': 'unknown', 'errno': None}
    if query['timedOut']:
        return fact
    try:
        os.kill(pid, 0)
        fact['state'] = 'alive'
    except OSError as error:
        fact.update(state='gone' if error.errno == errno.ESRCH and fact['rawErrno'] == errno.ESRCH else 'unknown', errno=error.errno)
    return fact


def collect_owned_processes(log, runner):
    root, probe, timeline = launcher_ownership(log, runner, require_finally=False)
    roles = {'launcher': [probe['pid']], 'desktop': [], 'host': []}
    processes = {'launcher:' + str(probe['pid']): process_exit_fact(probe['pid'])}
    isolated = {'state': 'unknown'}
    all_bound = False
    receipt = {'state': 'unknown'}
    try:
        _, roles = ownership(log, runner, require_finally=False, require_cleanup_success=False)
        desktop_log = (root / 'owned-desktop-cleanup.log').read_text().splitlines()
        captures = {row['pid']: row for row in (parse_json(line) for line in desktop_log if line.startswith('{')) if row.get('event') == 'captured'}
        exits = [line for line in desktop_log if line.startswith('HELPER_EXIT=')]
        if not exits or any(line != 'HELPER_EXIT=0' for line in exits):
            raise ValueError('Independent cleanup helper failed; current identity is unknown')
        ledger = root / 'host-ownership.jsonl'
        if ledger.is_symlink():
            raise ValueError('Unowned Host binding evidence')
        bindings = [parse_json(line) for line in ledger.read_text().splitlines()] if ledger.is_file() else []
        bundle = (root / 'missing-runtime/desktop/DeepSeek Harness.app').resolve(strict=True)
        allowed = {str((root / 'missing-runtime/node').resolve(strict=True)), str(bundle / 'Contents/MacOS/DeepSeek Harness')}
        bound = set()
        bound_pairs = set()
        for row in bindings:
            desktop = captures.get(row.get('desktopPid'))
            if desktop and row.get('root') == str(root) and row.get('probeStartedAt') == probe['startedAt']:
                checked = bind_host_identity(row.get('inspection', {}), root, row, desktop, probe, allowed)
                if checked['ownershipKnown']:
                    bound.add(row['pid'])
                    bound_pairs.add((row['pid'], row['lease']))
        for role in ('desktop', 'host'):
            for pid in roles[role]:
                if role == 'host' and pid not in bound:
                    processes[f'{role}:{pid}'] = {'pid': pid, 'state': 'unknown', 'reason': 'Missing physical Host binding'}
                else:
                    processes[f'{role}:{pid}'] = process_exit_fact(pid)
        pairs = {(row['pid'], row['lease']) for row in timeline if row.get('event') == 'receipt-snapshot' and row.get('present')}
        all_bound = bool(roles['host']) and bound == set(roles['host']) and pairs <= bound_pairs
        receipt_file = root / 'data/global/.dsh-workflow/desktop/desktop-host.json'
        if not receipt_file.parent.resolve().is_relative_to(root):
            raise ValueError('Unowned receipt lookup path')
        try:
            receipt_file.lstat(); receipt['state'] = 'present'
        except OSError as error:
            receipt.update(state='absent' if error.errno == errno.ENOENT else 'unknown', errno=error.errno)
        isolated['state'] = 'observed'
    except Exception as error:
        isolated.update(errorType=type(error).__name__, reason=sanitize_text(str(error)))
        for role in ('desktop', 'host'):
            for pid in roles[role]:
                processes[f'{role}:{pid}'] = {'pid': pid, 'state': 'unknown', 'reason': 'Independent identity or cleanup is unknown'}
    finally_complete = all(any(row.get('event') == event for row in timeline) for event in ('application-exit', 'diagnostics-close'))
    complete = (isolated['state'] == 'observed' and all_bound and finally_complete
                and all(row.get('state') == 'gone' and row.get('errno') == errno.ESRCH and row.get('rawErrno') == errno.ESRCH for row in processes.values())
                and receipt.get('errno') == errno.ENOENT)
    normal_exit = next((row for row in reversed(timeline) if row.get('event') == 'application-normal-exit-stage' and row.get('pid') == probe['pid']), None)
    return {'ownership': roles, 'hostBindingKnown': all_bound, 'processes': processes,
            'normalExitStage': normal_exit,
            'finallyComplete': finally_complete, 'receiptLookup': receipt,
            'isolatedCleanup': isolated, 'complete': complete}


def launcher_web_released(owned, listener, bind_listen):
    launchers = owned.get('ownership', {}).get('launcher', [])
    rows = owned.get('processes', {})
    return (bool(launchers) and owned.get('finallyComplete') is True
            and all((row := rows.get('launcher:' + str(pid))) is not None and row.get('pid') == pid
                    and row.get('state') == 'gone' and row.get('errno') == errno.ESRCH
                    and row.get('rawExit') not in (None, 0) and row.get('rawErrno') == errno.ESRCH for pid in launchers)
            and listener.get('state') == 'observed' and listener.get('timedOut') is False
            and {key: listener.get(key) for key in ('exit', 'stdout', 'stderr')} == {'exit': 1, 'stdout': '', 'stderr': ''}
            and bind_listen.get('available') is True)


def check_owned_pid(root, runner, pid):
    root = validate_observation_root(root, runner)
    captures = [parse_json(line) for line in (root / 'owned-desktop-cleanup.log').read_text().splitlines() if line.startswith('{')]
    if not any(row.get('event') == 'captured' and row.get('pid') == pid for row in captures):
        raise ValueError('PID has no owned Desktop capture')
    return process_exit_fact(pid)


def copy_safe_evidence(root, destination, *, allow_independent_unknown=False):
    independent = {'owned-desktop-process.json', 'owned-desktop-cleanup.log', 'host-ownership.jsonl', 'host-inspection-results.jsonl'}
    errors = []
    for name, kind in SAFE_EVIDENCE.items():
        try:
            file = root / name
            if not file.exists():
                if allow_independent_unknown and name in {'probe-process.json', 'probe-timeline.jsonl', 'settings-evidence.json'}:
                    raise ValueError('Missing own functional evidence: ' + name)
                if allow_independent_unknown and name in independent:
                    raise ValueError('Independent evidence is absent or unsafe')
                continue
            if not file.is_file() or file.is_symlink() or file.resolve().parent != root:
                raise ValueError('Unowned cycle evidence file')
            output = destination / name
            if kind == 'png':
                shutil.copy2(file, output)
            elif kind == 'json':
                output.write_text(json.dumps(sanitize_json(parse_json(file.read_text())), indent=2) + '\n')
            elif kind == 'jsonl':
                lines = file.read_text().splitlines()
                if not lines:
                    raise ValueError('Empty JSONL evidence')
                sanitized = [json.dumps(sanitize_json(parse_json(line))) for line in lines]
                output.write_text('\n'.join(sanitized) + '\n')
            else:
                output.write_text(sanitize_text(file.read_text()))
        except Exception as error:
            if not allow_independent_unknown or name not in independent:
                raise
            errors.append({'file': name, 'state': 'unknown', 'errorType': type(error).__name__})
            print('::warning::Independent CI evidence is unavailable or unsafe; file=' + name + ', errorType=' + type(error).__name__, flush=True)
    if allow_independent_unknown:
        (destination / 'isolated-evidence-status.json').write_text(json.dumps(errors) + '\n')
    return errors


def collect(log, target, runner):
    names = re.findall(r'^ISOLATED_ROOT=(.+)$', log.read_text(), re.M)
    if len(names) != 1:
        raise ValueError('Missing or ambiguous cycle root')
    root = validate_root(names[0], runner)
    destination = target / root.name
    destination.mkdir()
    required = {'probe-process.json', 'probe-timeline.jsonl', 'owned-desktop-process.json', 'owned-desktop-cleanup.log'}
    for name in required:
        if not (root / name).is_file():
            raise ValueError('Missing required cycle evidence: ' + name)
    copy_safe_evidence(root, destination)
    auxiliary = root / 'auxiliary-cycle-diagnostics'
    result, auxiliary_error = None, None
    try:
        auxiliary.mkdir()
        result = run_diagnostics(root, auxiliary)
        if result == 0:
            shutil.copy2(auxiliary / 'diagnostic-collector.log', target / 'collector.log')
            auxiliary.rename(destination / 'auxiliary-diagnostics')
    except Exception as error:
        auxiliary_error = type(error).__name__
    retained = result == 0 and auxiliary_error is None
    if not retained:
        shutil.rmtree(auxiliary, ignore_errors=True)  # Outside the upload target and safe-evidence allowlist.
        print('::warning::Auxiliary cycle diagnostics failed or are unavailable; exit=' + str(result)
              + ', errorType=' + str(auxiliary_error), flush=True)
    (target / 'collector.exit').write_text((str(result) if result is not None else 'UNKNOWN') + '\n')
    (target / 'auxiliary-diagnostics-status.json').write_text(json.dumps({
        'exit': result, 'errorType': auxiliary_error, 'auxiliaryOutputRetained': retained}) + '\n')


def emit(key, value):
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
        output.write(f'{key}={value}\n')


def main(attempt):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or attempt not in ('1', '2', '3'):
        raise ValueError('One clean CI cycle is required')
    runner = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    evidence = Path(os.environ['EVIDENCE_DIR']).resolve(strict=True)
    if not evidence.is_relative_to(runner):
        raise ValueError('Unowned evidence directory')
    target = evidence / ('startup-' + attempt)
    target.mkdir()
    emit('cycle_started', 'true')
    emit('safe_to_repeat', 'false')
    command = ['dart', 'run', 'tool/application_probe.dart',
               'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow',
               '--settings-startup-runtime', os.environ['T05_RUNTIME_RESOURCES'],
               '--web-backend', 'desktop', '--web-port', '33080', '--legacy-keychain-ci']
    log = target / 'command.log'
    with log.open('w') as output:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            safe_line = sanitize_text(line)
            output.write(safe_line)
            output.flush()
            print(safe_line, end='', flush=True)
        result = process.wait()
    (target / 'command.exit').write_text(str(result) + '\n')
    print(f'T05_STARTUP_ATTEMPT={attempt} COMMAND_EXIT={result}', flush=True)
    emit('command_exit', str(result))
    gate = subprocess.run([sys.executable, str(TOOLS / 'settings_repeat_gate.py'), str(log)], capture_output=True, text=True)
    gate_valid = False
    try:
        gate_value = parse_json(gate.stdout)
        if not isinstance(gate_value, dict):
            raise ValueError('Gate must be a JSON object')
        gate_text = json.dumps(sanitize_json(gate_value), indent=2) + '\n'
        (target / 'gate.json').write_text(gate_text)
        gate_valid = gate_value.get('safe_to_repeat') is True
        print(gate_text, flush=True)
    except ValueError:
        (target / 'gate-format-error.txt').write_text('Malformed gate JSON; repeat refused\n')
    (target / 'gate.stderr').write_text(sanitize_text(gate.stderr))
    (target / 'gate.exit').write_text(str(gate.returncode) + '\n')
    collected = False
    try:
        collect(log, target, runner)
        collected = True
    except Exception as error:
        (target / 'collection-error.json').write_text(json.dumps({'errorType': type(error).__name__, 'reason': sanitize_text(str(error))}) + '\n')
    safe = gate.returncode == 0 and gate_valid and collected
    emit('safe_to_repeat', str(safe).lower())
    if result == 0 and not safe:
        print('::warning::Isolated CI cleanup is incomplete; safe repeat refused without changing the startup command exit', flush=True)
    return result


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--check-owned-pid':
        if os.environ.get('GITHUB_ACTIONS') != 'true':
            raise ValueError('Liveness requires clean CI')
        print(json.dumps(check_owned_pid(Path(sys.argv[2]), Path(os.environ['RUNNER_TEMP']), int(sys.argv[3]))))
        sys.exit(0)
    if len(sys.argv) == 4 and sys.argv[1] == '--capture-host':
        if os.environ.get('GITHUB_ACTIONS') != 'true':
            raise ValueError('Host capture requires clean CI')
        print(json.dumps(capture_owned_host(Path(sys.argv[2]), Path(os.environ['RUNNER_TEMP']), int(sys.argv[3]))))
        sys.exit(0)
    if sys.argv[1] == '--full':
        sys.exit(full_command())
    elif sys.argv[1] == '--completed-full':
        if os.environ.get('GITHUB_ACTIONS') != 'true':
            raise ValueError('Clean CI command snapshot is required')
        snapshot_completed_command(Path(os.environ['EVIDENCE_DIR']), Path(os.environ['RUNNER_TEMP']))
    else:
        sys.exit(main(sys.argv[1]))
