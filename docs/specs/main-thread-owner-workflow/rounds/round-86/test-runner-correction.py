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
candidate = json.loads((out / 'candidate.json').read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


before = [path for path, expected in candidate['hashes'].items() if digest(root / path) != expected]
if before:
    raise SystemExit(f'candidate drift before corrected runner suite: {before}')
runner_test = root / 'owner-workflow-plugin/test/runner.test.mjs'
runner_test_hash = digest(runner_test)
command = [
    '/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node',
    '--import', str(root / 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),
    '--test', '--test-force-exit', '--test-reporter=tap',
    'owner-workflow-plugin/test/runner.test.mjs',
]
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
process = subprocess.Popen(command, cwd=root,
                           env=dict(os.environ, TSX_TSCONFIG_PATH=str(root / 'deepseek-harness/tsconfig.json')),
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
try:
    log, _ = process.communicate(timeout=240)
    timed_out = False
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGKILL)
    log, _ = process.communicate()
    timed_out = True
(out / 'formal-runner-corrected.log').write_text(log)
counts = {key: int(value) for key, value in re.findall(
    r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', log, re.M)}
drift = [path for path, expected in candidate['hashes'].items() if digest(root / path) != expected]
if digest(runner_test) != runner_test_hash:
    drift.append(str(runner_test.relative_to(root)))
result = {'suite': 'runner', 'command': command, 'start': start,
          'end': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'timeoutSeconds': 240, 'exitCode': process.returncode,
          'timedOut': timed_out, 'counts': counts, 'drift': drift,
          'runnerTestSha256': runner_test_hash}
(out / 'test-results-runner-corrected.json').write_text(json.dumps(result, indent=2))
print(result, flush=True)
raise SystemExit(0 if process.returncode == 0 and not timed_out and counts.get('tests', 0) > 0 and not drift else 1)
