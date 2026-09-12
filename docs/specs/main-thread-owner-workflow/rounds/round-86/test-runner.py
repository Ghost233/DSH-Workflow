from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import signal
import subprocess

root = Path('/Volumes/LargeStorage/code/DSH-Workflow')
out = root / 'docs/specs/main-thread-owner-workflow/rounds/round-86'
suites = [
    'planning-compile-native',
    'plan-revision',
    'planning-packages',
    'plugin',
    'workflow-state',
    'external-runner',
    'planning-checkpoint-native',
    'control',
]
paths = [root / 'owner-workflow-plugin/index.js']
paths += list((root / 'owner-workflow-plugin/src').glob('*.mjs'))
paths += [root / f'owner-workflow-plugin/test/{suite}.test.mjs' for suite in suites]
paths += list((root / 'owner-workflow-plugin/test/fixtures').glob('*.mjs'))
paths += [
    root / 'docs/specs/main-thread-owner-workflow/contracts/planning-activation-v1.md',
    root / 'docs/specs/main-thread-owner-workflow/contracts/planning-review-receipt-v1.md',
]
for base in [
    'deepseek-harness/vendor/cordis/lib',
    'deepseek-harness/packages/core/agent/lib',
    'deepseek-harness/packages/core/tools/lib',
    'deepseek-harness/packages/core/system-prompt/lib',
    'deepseek-harness/packages/interaction/user-questions/lib',
    'deepseek-harness/packages/subagent/subagent/lib',
    'deepseek-harness/packages/core/agent-loop/lib',
    'deepseek-harness/packages/preset/agent-presets/lib',
]:
    paths += list((root / base).rglob('*.js'))
paths = sorted(set(path for path in paths if path.exists()))


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


hashes = {str(path.relative_to(root)): digest(path) for path in paths}
(out / 'candidate.json').write_text(json.dumps({'at': now(), 'hashes': hashes}, indent=2))
rows = []
for suite in suites:
    command = [
        '/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node',
        '--import', str(root / 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),
        '--test', '--test-force-exit', '--test-reporter=tap',
        f'owner-workflow-plugin/test/{suite}.test.mjs',
    ]
    environment = dict(os.environ, TSX_TSCONFIG_PATH=str(root / 'deepseek-harness/tsconfig.json'))
    row = {'suite': suite, 'command': command, 'start': now(), 'timeoutSeconds': 240}
    process = subprocess.Popen(command, cwd=root, env=environment, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        log, _ = process.communicate(timeout=240)
        row.update(exitCode=process.returncode, timedOut=False)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        log, _ = process.communicate()
        row.update(exitCode=process.returncode, timedOut=True)
    (out / f'formal-{suite}.log').write_text(log)
    row['end'] = now()
    row['counts'] = {key: int(value) for key, value in re.findall(
        r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', log, re.M)}
    rows.append(row)
    print({key: row[key] for key in ['suite', 'exitCode', 'timedOut', 'counts']}, flush=True)

drift = [path for path, expected in hashes.items() if digest(root / path) != expected]
result = {'results': rows, 'drift': drift}
(out / 'test-results.json').write_text(json.dumps(result, indent=2))
print('drift', drift, flush=True)
valid = not drift and all(row['exitCode'] == 0 and not row['timedOut']
                          and row['counts'].get('tests', 0) > 0 for row in rows)
raise SystemExit(0 if valid else 1)
