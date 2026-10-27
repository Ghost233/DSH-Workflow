from pathlib import Path
import json, os, selectors, subprocess, time, shlex, uuid

ROOT = Path('/private/tmp/harness2-dsh-import-audit-20261027')
EVIDENCE = ROOT / 'evidence'
RUNTIME = Path('/Applications/Ghost DSH Station.app/Contents/Resources')
NODE = str(RUNTIME / 'node')
CLI = str(RUNTIME / 'node_modules/@deepseek-ai/dsh/lib/bin.js')
PYTHON = '/Users/ghost233/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3.12'
SESSIONS = {str(uuid.uuid4()): 'h2-original-import', str(uuid.uuid4()): 'h2-components-import'}

def main():
    workspace = ROOT / 'task-workspace'
    receipts = EVIDENCE / 'native-receipts'
    receipts.mkdir(exist_ok=True)
    commands = {name: ' '.join(shlex.quote(str(p)) for p in [PYTHON, ROOT / 'moved-bundles' / name / 'scripts/summarize.py', workspace / 'ledger.csv']) for name in ['original', 'components']}
    config = {'workspace': str(workspace), 'output': str(receipts), 'trace': str(EVIDENCE / 'native-model-requests.jsonl'), 'sessions': SESSIONS, 'commands': commands}
    patches = [{'insert': [
        {'id': 'import-probe-presets', 'name': '@deepseek-ai/dsh-agent-preset-registry', 'config': {'default': 'h2-original-import'}},
        {'id': 'import-probe', 'name': str(ROOT / 'probe-model.mjs'), 'config': config},
    ]}]
    patch = ROOT / 'native-probe.patch.yml'
    patch.write_text(json.dumps(patches, indent=2))
    args = [NODE, CLI, '--profile', 'sdk', '--patch', str(ROOT / 'moved-bundles/original/cordis.patch.yml'), '--patch', str(ROOT / 'moved-bundles/components/cordis.patch.yml'), '--patch', str(patch)]
    env = {key: value for key, value in os.environ.items() if key in ['PATH', 'LANG', 'LC_ALL']}
    env.update(HOME=str(ROOT / 'home'), TMPDIR=str(ROOT / 'tmp'), DSH_HOME=str(ROOT / 'home/dsh'))
    log = (EVIDENCE / 'native-host.stderr.log').open('w')
    wire = (EVIDENCE / 'native-host.protocol.jsonl').open('w')
    child = subprocess.Popen(args, cwd=workspace, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1)
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)
    serial = 0
    def rpc(method, params=None, timeout=30):
        nonlocal serial
        serial += 1
        request = {'jsonrpc': '2.0', 'id': serial, 'method': method}
        if params is not None: request['params'] = params
        wire.write(json.dumps({'direction': 'request', 'frame': request}) + '\n'); wire.flush()
        child.stdin.write(json.dumps(request) + '\n'); child.stdin.flush()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            events = selector.select(max(0, deadline - time.monotonic()))
            if not events: break
            line = child.stdout.readline()
            if not line: raise RuntimeError(f'Host exited with {child.poll()}')
            wire.write(line); wire.flush()
            try: frame = json.loads(line)
            except json.JSONDecodeError: continue
            if frame.get('id') != serial: continue
            if 'error' in frame: raise RuntimeError(json.dumps(frame['error']))
            return frame.get('result')
        raise TimeoutError('SDK request timed out: ' + method)
    result = {'runtime': '0.2.1-rc.3', 'command': args, 'cases': [], 'externalModelCalls': 0, 'fixtureProvider': True}
    failure = None
    try:
        result['initialize'] = rpc('initialize', {'cwd': str(workspace), 'provider': 'harness2-import-probe', 'model': 'deterministic', 'reasoningEffort': 'off', 'maxTokens': 2048})
        for index, (session_id, preset_id) in enumerate(SESSIONS.items()):
            try:
                rpc('session/working-directory/get', {'sessionId': session_id})
                receipt = json.loads((receipts / f'{session_id}.json').read_text())
                assert receipt['selected'] == preset_id
                rpc('session/prompt', {'sessionId': session_id, 'contentBlocks': [{'type': 'text', 'text': 'CASE_COMPONENTS' if index else 'CASE_ORIGINAL'}]})
                outcome = rpc('session/wait', {'sessionId': session_id})
                assert outcome.get('status') == 'ok', outcome
                result['cases'].append({'preset': preset_id, 'status': 'passed', 'receipt': receipt, 'outcome': outcome})
            except Exception as error:
                failure = error
                before = receipts / f'{session_id}-before.json'
                result['cases'].append({'preset': preset_id, 'status': 'failed', 'error': str(error), 'before': json.loads(before.read_text()) if before.exists() else None})
        if failure: raise RuntimeError('Converted presets failed activation; see per-case diagnostics')
        result['status'] = 'passed'
    except Exception as error:
        result['status'] = 'failed'; result['error'] = str(error); failure = error
    finally:
        try: result['shutdown'] = rpc('shutdown', timeout=5)
        except Exception as error: result['shutdownError'] = str(error)
        try: result['hostExitCode'] = child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.terminate()
            try: child.wait(timeout=3)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
            result['cleanupForced'] = True
        child.stdin.close(); child.stdout.close(); selector.close(); wire.close(); log.close()
        (EVIDENCE / 'native-host-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key != 'cases'}, indent=2))
    if failure or result.get('hostExitCode') != 0 or result.get('cleanupForced'): raise SystemExit(1)

if __name__ == '__main__': main()
