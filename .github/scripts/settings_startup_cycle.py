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
    for file in root.iterdir():
        if file.is_file() and file.suffix in ('.json', '.jsonl', '.log', '.png'):
            if file.resolve().parent != root or file.is_symlink():
                raise ValueError('Unowned cycle evidence file')
            output = destination / file.name
            if file.suffix == '.png':
                shutil.copy2(file, output)
            else:
                text = scrub(file.read_text(errors='replace'))
                text = re.sub(r'(http://127\.0\.0\.1:\d+/)[^/\s]+/', r'\1<REDACTED>/', text)
                output.write_text(text)
    command = [sys.executable, str(TOOLS / 'collect_probe_diagnostics.py'), str(root), str(destination), '--crashes']
    result = subprocess.run(command, capture_output=True, text=True)
    (target / 'collector.log').write_text(scrub(result.stdout + result.stderr))
    (target / 'collector.exit').write_text(str(result.returncode) + '\n')
    if result.returncode != 0:
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
            output.write(line)
            output.flush()
            print(scrub(line), end='', flush=True)
        result = process.wait()
    (target / 'command.exit').write_text(str(result) + '\n')
    print(f'T05_STARTUP_ATTEMPT={attempt} COMMAND_EXIT={result}', flush=True)
    emit('command_exit', str(result))
    gate = subprocess.run([sys.executable, str(TOOLS / 'settings_repeat_gate.py'), str(log)], capture_output=True, text=True)
    (target / 'gate.json').write_text(gate.stdout)
    (target / 'gate.stderr').write_text(gate.stderr)
    (target / 'gate.exit').write_text(str(gate.returncode) + '\n')
    print(gate.stdout, flush=True)
    collected = False
    try:
        collect(log, target, runner)
        collected = True
    except Exception as error:
        (target / 'collection-error.json').write_text(json.dumps({'errorType': type(error).__name__, 'reason': str(error)}) + '\n')
    safe = gate.returncode == 0 and collected
    emit('safe_to_repeat', str(safe).lower())
    return result if result != 0 else (0 if safe else 1)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
