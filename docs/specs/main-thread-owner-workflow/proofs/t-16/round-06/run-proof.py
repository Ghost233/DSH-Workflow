from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent
NODE = '/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
TSX = ROOT / 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'
TSCONFIG = ROOT / 'deepseek-harness/tsconfig.json'

SOURCE_PATHS = [
    'owner-workflow-plugin/src/runtime.mjs',
    'owner-workflow-plugin/src/recovery-admission.mjs',
    'owner-workflow-plugin/src/recovery-session.mjs',
    'owner-workflow-plugin/src/owner-agent.mjs',
    'owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs',
    'deepseek-harness/packages/core/agent-loop/src/agent.ts',
    'deepseek-harness/packages/core/session/src/index.ts',
    'deepseek-harness/packages/session/session-persistence/src/coordinator.ts',
    'deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts',
    'deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts',
]
ARCHIVE_PAIRS = {
    'owner-workflow-plugin/src/runtime.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/runtime-source.mjs',
    'owner-workflow-plugin/src/recovery-admission.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/recovery-admission-source.mjs',
    'owner-workflow-plugin/src/recovery-session.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/recovery-session-source.mjs',
    'owner-workflow-plugin/src/owner-agent.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/owner-agent-source.mjs',
    'owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/recovery-session-fixture-source.mjs',
    'deepseek-harness/packages/core/agent-loop/src/agent.ts': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/agent-loop-agent-source.ts',
    'deepseek-harness/packages/core/session/src/index.ts': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/session-source.ts',
    'deepseek-harness/packages/session/session-persistence/src/coordinator.ts': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/persistence-coordinator-source.ts',
    'deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/jsonl-persistence-source.ts',
    'deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts': 'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/mock-adapter-source.ts',
}
PROOF_PATHS = [
    *ARCHIVE_PAIRS.values(),
    'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/primary.mjs',
    'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/probe.mjs',
    'docs/specs/main-thread-owner-workflow/proofs/t-16/round-06/run-proof.py',
]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(paths):
    return {path: digest(ROOT / path) for path in paths}


# Candidate freeze: copy the exact source bytes before hashing or launching.
for source, archive in ARCHIVE_PAIRS.items():
    shutil.copyfile(ROOT / source, ROOT / archive)
initial_source = hashes(SOURCE_PATHS)
initial_proof = hashes(PROOF_PATHS)
for source, archive in ARCHIVE_PAIRS.items():
    if initial_source[source] != initial_proof[archive]:
        raise RuntimeError(f'round-06 source archive does not match frozen source: {source}')
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
    'name': 'real-cancel-sigkill-jsonl-lease-recovery-and-deadline-reference',
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
