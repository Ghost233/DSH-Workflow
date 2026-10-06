#!/usr/bin/env python3
"""Run one existing startup prefix, gate cleanup, then preserve its evidence."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / 'macos-launcher/flutter/tool'
sys.path.insert(0, str(TOOLS))

from collect_probe_diagnostics import scrub
from settings_repeat_gate import validate_root


SAFE_EVIDENCE = {
    'probe-process.json': 'json',
    'owned-desktop-process.json': 'json',
    'settings-evidence.json': 'json',
    'settings-current.json': 'json',
    'settings-current.png': 'png',
    'initial-web-ui.json': 'json',
    'settings-startup-ready.json': 'json',
    'web-final.json': 'json',
    'probe-timeline.jsonl': 'jsonl',
    'owned-desktop-cleanup.log': 'text',
    'app.log': 'text',
    'settings-startup-ready.png': 'png',
    'web-final.png': 'png',
}


def sanitize_text(text):
    text = scrub(text)
    text = re.sub(r'((?:https?|wss?)://(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)[^/\s]+/', r'\1<REDACTED>/', text)
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
    (target / 'command-state.json').write_text(json.dumps({'exitKnown': raw_exit is not None}) + '\n')
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


def copy_safe_evidence(root, destination):
    for name, kind in SAFE_EVIDENCE.items():
        file = root / name
        if not file.exists():
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
    result = run_diagnostics(root, destination)
    shutil.copy2(destination / 'diagnostic-collector.log', target / 'collector.log')
    (target / 'collector.exit').write_text(str(result) + '\n')
    if result != 0:
        raise ValueError('Cycle diagnostic collector failed')


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
    return result if result != 0 else (0 if safe else 1)


if __name__ == '__main__':
    if sys.argv[1] == '--completed-full':
        if os.environ.get('GITHUB_ACTIONS') != 'true':
            raise ValueError('Clean CI command snapshot is required')
        snapshot_completed_command(Path(os.environ['EVIDENCE_DIR']), Path(os.environ['RUNNER_TEMP']))
    else:
        sys.exit(main(sys.argv[1]))
