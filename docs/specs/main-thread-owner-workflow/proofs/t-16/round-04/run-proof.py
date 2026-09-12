from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import subprocess

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent
NODE = '/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
TSX = ROOT / 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'
TSCONFIG = ROOT / 'deepseek-harness/tsconfig.json'

SOURCE_PATHS = [
    'owner-workflow-plugin/src/runtime.mjs',
    'owner-workflow-plugin/src/owner-submission.mjs',
    'owner-workflow-plugin/index.js',
    'owner-workflow-plugin/src/owner-agent.mjs',
    'owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs',
    'deepseek-harness/packages/core/agent-loop/src/agent.ts',
    'deepseek-harness/packages/core/agent-loop/src/index.ts',
    'deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts',
    'deepseek-harness/packages/subagent/subagent/src/index.ts',
    'deepseek-harness/packages/subagent/subagent/src/continuation.ts',
    'deepseek-harness/packages/core/session/src/index.ts',
    'deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts',
]
ARCHIVE_PAIRS = {
    'owner-workflow-plugin/src/runtime.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-04/runtime-source.mjs',
    'owner-workflow-plugin/src/owner-submission.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-04/owner-submission-source.mjs',
    'owner-workflow-plugin/index.js': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-04/owner-submit-definition-source.js',
}
PROOF_PATHS = [
    *ARCHIVE_PAIRS.values(),
    'docs/specs/main-thread-owner-workflow/proofs/t-16/round-04/probe.mjs',
    'docs/specs/main-thread-owner-workflow/proofs/t-16/round-04/run-proof.py',
]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(paths):
    return {path: digest(ROOT / path) for path in paths}


initial_source = hashes(SOURCE_PATHS)
initial_proof = hashes(PROOF_PATHS)
for source, archive in ARCHIVE_PAIRS.items():
    if initial_source[source] != initial_proof[archive]:
        raise RuntimeError(f'round-04 source archive does not match frozen source: {source}')
freeze = {
    'at': now(),
    'source': initial_source,
    'proof': initial_proof,
    'harnessHead': subprocess.run(
        ['git', '-C', str(ROOT / 'deepseek-harness'), 'rev-parse', 'HEAD'],
        text=True,
        check=True,
        capture_output=True,
    ).stdout.strip(),
}
(OUT / 'freeze.json').write_text(json.dumps(freeze, indent=2) + '\n')

command = [NODE, '--import', str(TSX), str(OUT / 'probe.mjs')]
environment = {**os.environ, 'TSX_TSCONFIG_PATH': str(TSCONFIG)}
result = {
    'name': 'old-owner-lease-and-stale-structured-submission-rejection',
    'command': command,
    'cwd': str(ROOT),
    'start': now(),
    'timeoutSeconds': 45,
}
process = subprocess.Popen(
    command,
    cwd=ROOT,
    env=environment,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    start_new_session=True,
)
try:
    output, _ = process.communicate(timeout=45)
    result.update(exitCode=process.returncode, timedOut=False)
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGKILL)
    output, _ = process.communicate()
    result.update(exitCode=process.returncode, timedOut=True)
result['end'] = now()
(OUT / 'formal-probe.log').write_text(output)

try:
    rows = [json.loads(line) for line in output.splitlines() if line.strip()]
    result['collectedScenarios'] = len(rows)
    result['probeErrors'] = [row for row in rows if 'probeError' in row]
    result['collectionComplete'] = len(rows) == 1 and not result['probeErrors']
except Exception as error:
    result['collectionError'] = str(error)

drift = []
for path, expected in {**initial_source, **initial_proof}.items():
    actual_path = ROOT / path
    if not actual_path.is_file() or digest(actual_path) != expected:
        drift.append(path)
(OUT / 'formal-results.json').write_text(json.dumps({'runs': [result], 'drift': drift}, indent=2) + '\n')
