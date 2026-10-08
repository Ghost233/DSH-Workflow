import ast
import importlib.util
import sys
import io
import time
from contextlib import redirect_stdout
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

if os.environ.get("GITHUB_ACTIONS") == "true":
    tempfile.tempdir = os.environ["RUNNER_TEMP"]

spec = importlib.util.spec_from_file_location('cycle', Path(__file__).with_name('settings_startup_cycle.py'))
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)


class CollectorDurabilityTest(unittest.TestCase):
    def test_completed_command_snapshot_masks_log_and_keeps_original_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            evidence = base / 'evidence'; evidence.mkdir()
            (evidence / 'application.log').write_text('failure assertion\nhttp://127.0.0.1:1234/private-vm=/\npassword=private-pw\n')
            (evidence / 'application.exit').write_text('255\n')
            (evidence / 'unknown.json').write_text('private-userdata')
            cycle.snapshot_completed_command(evidence, base)
            target = evidence / 'completed-command'
            self.assertEqual((target / 'application.exit').read_text(), '255\n')
            self.assertEqual({file.name for file in target.iterdir()}, {'application.exit', 'application.log', 'command-state.json'})
            self.assertIn('failure assertion', (target / 'application.log').read_text())
            self.assertNotIn('private-', (target / 'application.log').read_text())

    def test_cancelled_command_log_is_preserved_without_inventing_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); evidence = base / 'evidence'; evidence.mkdir()
            (evidence / 'application.log').write_text('last real phase\npassword=private-pw\n')
            cycle.snapshot_completed_command(evidence, base)
            target = evidence / 'completed-command'
            self.assertFalse((target / 'application.exit').exists())
            self.assertFalse(json.loads((target / 'command-state.json').read_text())['exitKnown'])
            self.assertIn('last real phase', (target / 'application.log').read_text())
            self.assertNotIn('private-pw', (target / 'application.log').read_text())

    def test_diagnostic_timeout_is_persisted_as_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            tools = base / 'tools'; tools.mkdir()
            (tools / 'collect_probe_diagnostics.py').write_text('import time; print("owned diagnostic started", flush=True); time.sleep(5)')
            target = base / 'evidence'; target.mkdir()
            actual_run = subprocess.run
            def fast_actual_run(command, **options):
                options['timeout'] = .05
                return actual_run(command, **options)
            with patch.object(cycle, 'TOOLS', tools), patch.object(cycle.subprocess, 'run', side_effect=fast_actual_run):
                result = cycle.run_diagnostics(base, target)
            self.assertEqual(result, 124)
            self.assertEqual((target / 'diagnostic-collector.exit').read_text(), '124\n')
            self.assertIn('owned diagnostic started', (target / 'diagnostic-collector.log').read_text())
            self.assertIn('deadline exceeded', (target / 'diagnostic-collector.log').read_text())


class LiveCommandTest(unittest.TestCase):
    def test_original_exit_is_durable_while_descendant_holds_stdout(self):
        import os
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            release = root / 'release'; pids = root / 'pids.json'
            descendant = 'import pathlib,sys,time; p=pathlib.Path(sys.argv[1]); end=time.monotonic()+4; print("DESC_PHASE password=synthetic-inherited-secret",flush=True);\nwhile not p.exists() and time.monotonic()<end: time.sleep(.01)'
            script = 'import subprocess,sys,json,pathlib,os; p=subprocess.Popen([sys.executable,"-c",sys.argv[1],sys.argv[2]]); pathlib.Path(sys.argv[3]).write_text(json.dumps({"parent":os.getpid(),"descendant":p.pid})); print("PARENT_LAST_PHASE",flush=True); sys.exit(37)'
            output = io.StringIO()
            with redirect_stdout(output), ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(cycle.run_streamed_command, [sys.executable, '-c', script, descendant, str(release), str(pids)], root)
                try:
                    for _ in range(100):
                        if pids.exists(): break
                        time.sleep(.01)
                    self.assertTrue(pids.exists())
                    for _ in range(100):
                        if (root / 'application.exit').exists(): break
                        time.sleep(.01)
                    self.assertTrue((root / 'application.exit').exists(), 'original exit is blocked behind inherited stdout EOF')
                    self.assertEqual((root / 'application.exit').read_text(), '37\n')
                    self.assertEqual(future.result(timeout=2), 37)
                    self.assertFalse(release.exists())
                    state = json.loads((root / 'command-state.json').read_text())
                    self.assertTrue(state['exitKnown']); self.assertFalse(state['streamComplete'])
                    ledger = json.loads((root / 'command-process.json').read_text())
                    self.assertEqual(ledger['pid'], json.loads(pids.read_text())['parent'])
                    self.assertEqual(ledger['executable'], str(Path(sys.executable).resolve()))
                    self.assertEqual(ledger['executableKind'], 'configured-entry')
                    self.assertNotIn('synthetic-inherited-secret', json.dumps(ledger))
                    self.assertNotIn('synthetic-inherited-secret', output.getvalue())
                    cycle.snapshot_completed_command(root, root.parent)
                    copied = json.loads((root / 'completed-command/command-process.json').read_text())
                    self.assertEqual(copied, ledger)
                finally:
                    release.touch()
                    self.assertEqual(future.result(timeout=5), 37)
            owned = json.loads(pids.read_text())['descendant']
            for _ in range(200):
                try: os.kill(owned, 0)
                except ProcessLookupError: break
                time.sleep(.01)
            else: self.fail('controlled descriptor holder did not exit')

    def test_safe_first_output_is_published_before_the_original_child_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); release = root / 'release'
            script = 'import pathlib,time,sys; print("FIRST_PHASE password=private-pw",flush=True); p=pathlib.Path(sys.argv[1]);\nwhile not p.exists(): time.sleep(.01)\nsys.exit(37)'
            output = io.StringIO()
            with redirect_stdout(output), ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(cycle.run_streamed_command, [sys.executable, '-c', script, str(release)], root)
                try:
                    for _ in range(100):
                        if 'FIRST_PHASE' in output.getvalue(): break
                        if future.done(): future.result()
                        time.sleep(.01)
                    self.assertIn('FIRST_PHASE', output.getvalue())
                    self.assertFalse(future.done())
                    self.assertNotIn('private-pw', output.getvalue())
                finally: release.touch()
                self.assertEqual(future.result(timeout=2), 37)
            self.assertEqual((root / 'application.exit').read_text(), '37\n')
            state = json.loads((root / 'command-state.json').read_text())
            self.assertTrue(state['exitKnown']); self.assertTrue(state['streamComplete'])

    def test_split_vm_uri_and_multiline_structured_credentials_are_masked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = 'import os,time; os.write(1,b"VM http://127.0.0.1:1234/private-"); time.sleep(.02); os.write(1,b"vm=/\\nSTATUS={\\n  \\"nested\\": {\\n    \\"authorization\\":\\n      \\"private-json-auth\\",\\n    \\"apiKey\\": \\"private-json-api\\"\\n  }\\n}\\nEND_PHASE\\n")'
            output = io.StringIO()
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual(result, 0)
            for content in (output.getvalue(), (root / 'application.log').read_text()):
                self.assertNotIn('private-', content)
                self.assertIn('<REDACTED>', content)
                self.assertIn('END_PHASE', content)

    def test_incomplete_json_is_unknown_and_does_not_forge_command_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            script = 'print(\'STATUS={"password":\'); print(\'"private-unfinished"\')'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual(result, 1)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            state = json.loads((root / 'command-state.json').read_text())
            self.assertTrue(state['exitKnown']); self.assertFalse(state['streamComplete'])
            self.assertNotIn('private-unfinished', output.getvalue())
            self.assertIn('UNKNOWN', output.getvalue())

    def test_incomplete_vm_line_at_eof_is_masked_and_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            script = 'import sys; sys.stdout.write("VM http://127.0.0.1:1234/private-eof-vm")'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual(result, 1)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            self.assertNotIn('private-eof-vm', output.getvalue())
            self.assertFalse(json.loads((root / 'command-state.json').read_text())['streamComplete'])

    def test_plain_password_continuation_at_eof_is_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            script = 'import sys; sys.stdout.write("password=\\nsynthetic-cross-line-password")'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            self.assertEqual(result, 1)
            self.assertFalse(json.loads((root / 'command-state.json').read_text())['streamComplete'])
            for content in (output.getvalue(), (root / 'application.log').read_text()):
                self.assertNotIn('synthetic-cross-line-password', content)

    def test_plain_access_token_continuation_with_newline_is_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            script = 'import sys; sys.stdout.write("access_token: \\nsynthetic-cross-line-token\\n")'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            self.assertEqual(result, 1)
            self.assertFalse(json.loads((root / 'command-state.json').read_text())['streamComplete'])
            for content in (output.getvalue(), (root / 'application.log').read_text()):
                self.assertNotIn('synthetic-cross-line-token', content)
                self.assertIn('UNKNOWN', content)

    def test_authorization_bearer_continuation_at_eof_is_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            script = 'import sys; sys.stdout.write("Authorization: Bearer\\nsynthetic-cross-line-bearer")'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            self.assertEqual(result, 1)
            self.assertFalse(json.loads((root / 'command-state.json').read_text())['streamComplete'])
            for content in (output.getvalue(), (root / 'application.log').read_text()):
                self.assertNotIn('synthetic-cross-line-bearer', content)
                self.assertIn('UNKNOWN', content)

    def test_ambiguous_quoted_api_key_continuation_is_dropped_through_eof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            payload = "api_key='\nsynthetic-cross-line-api-one\nsynthetic-cross-line-api-two'\n"
            script = 'import sys; sys.stdout.write(' + repr(payload) + ')'
            with redirect_stdout(output): result = cycle.run_streamed_command([sys.executable, '-c', script], root)
            self.assertEqual((root / 'application.exit').read_text(), '0\n')
            self.assertEqual(result, 1)
            self.assertFalse(json.loads((root / 'command-state.json').read_text())['streamComplete'])
            for content in (output.getvalue(), (root / 'application.log').read_text()):
                self.assertNotIn('synthetic-cross-line-api-', content)
                self.assertIn('UNKNOWN', content)

    def test_spawn_failure_remains_unknown_without_a_command_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = io.StringIO()
            with redirect_stdout(output): result = cycle.run_streamed_command([str(root / 'not-an-executable')], root)
            self.assertEqual(result, 1)
            self.assertFalse((root / 'application.exit').exists())
            state = json.loads((root / 'command-state.json').read_text())
            self.assertFalse(state['exitKnown']); self.assertFalse(state['streamComplete'])
            self.assertIn('UNKNOWN', output.getvalue())


class QueryBoundaryTest(unittest.TestCase):
    def test_both_collector_listener_queries_record_timeout_as_unknown(self):
        actual_run = subprocess.run
        def short_owned_query(command, **options):
            options['timeout'] = .1 if options.get('timeout') == 10 else None
            script = 'import time; print("password=private-query-secret", flush=True); time.sleep(.3)'
            return actual_run([sys.executable, '-c', script], **options)
        repo = Path(__file__).resolve().parents[2]
        queries = []
        for workflow in ('flutter-launcher-acceptance.yml', 'flutter-settings-diagnostics.yml'):
            text = (repo / '.github/workflows' / workflow).read_text()
            section = text.split('      - name: Collect T05 observed application and process evidence', 1)[1].split('      - name: Detach', 1)[0]
            source = section.split("python3 - <<'PY'\n", 1)[1].split('          PY', 1)[0]
            tree = ast.parse('\n'.join(line[10:] for line in source.splitlines()))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and node.args and isinstance(node.args[0], ast.List):
                    first = node.args[0].elts[0]
                    if isinstance(first, ast.Constant) and first.value == '/usr/sbin/lsof':
                        queries.append((workflow, node))
        self.assertEqual(len(queries), 2)
        for workflow, node in queries:
            with self.subTest(workflow=workflow, query=node.args[0].elts[0].value), patch.object(cycle.subprocess, 'run', side_effect=short_owned_query):
                namespace = {'subprocess': cycle.subprocess, 'observe_os_query': getattr(cycle, 'observe_os_query', None), 'pid': 37}
                result = eval(compile(ast.Expression(node), '<owned collector query>', 'eval'), namespace)
                if isinstance(result, subprocess.CompletedProcess):
                    result = {'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr, 'state': 'observed'}
                self.assertEqual(result['exit'], 124)
                self.assertEqual(result['state'], 'unknown')
                self.assertTrue(result['timedOut'])
                self.assertNotIn('private-query-secret', result['stdout'])
                self.assertIn('<REDACTED>', result['stdout'])

    def test_shared_pid_query_timeout_remains_unknown_and_is_not_gone(self):
        actual_run = subprocess.run
        def short_owned_query(command, **options):
            options['timeout'] = .05
            return actual_run([sys.executable, '-c', 'import time; time.sleep(.2)'], **options)
        with patch.object(cycle.subprocess, 'run', side_effect=short_owned_query):
            value = cycle.process_exit_fact(37)
        self.assertEqual(value['rawExit'], 124)
        self.assertEqual(value['state'], 'unknown')
        self.assertIsNone(value['errno'])

    def test_timeout_does_not_skip_the_next_owned_query(self):
        actual_run = subprocess.run
        def short_owned_query(command, **options):
            options['timeout'] = .1
            script = 'import time; print("partial", flush=True); time.sleep(.3)' if command[0] == 'first' else 'print("later owned fact")'
            return actual_run([sys.executable, '-c', script], **options)
        with patch.object(cycle.subprocess, 'run', side_effect=short_owned_query):
            observations = [cycle.observe_os_query(command) for command in (['first'], ['later'])]
        self.assertEqual(observations[0]['state'], 'unknown')
        self.assertEqual(observations[0]['exit'], 124)
        self.assertEqual(observations[1]['exit'], 0)
        self.assertIn('later owned fact', observations[1]['stdout'])


class PartialCollectorTest(unittest.TestCase):
    def test_missing_finally_collects_real_known_pids_but_never_allows_repeat(self):
        import datetime
        import os
        import shutil
        import socket
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary).resolve()
            root = runner / 'dsh-t05-partial'; root.mkdir()
            launcher = root / 'candidate.app/Contents/MacOS/DSH Workflow'
            bundle = root / 'missing-runtime/desktop/DeepSeek Harness.app'
            desktop_exe = bundle / 'Contents/MacOS/DeepSeek Harness'
            host_exe = root / 'missing-runtime/node'
            launcher.parent.mkdir(parents=True); desktop_exe.parent.mkdir(parents=True)
            source = runner / 'finite.c'
            source.write_text('#include <unistd.h>\n#include <stdio.h>\n#include <sys/wait.h>\nint main(int n,char **v){int p=0;if(n>1){p=fork();if(!p){execl(v[1],v[1],NULL);_exit(2);}printf("%d\\n",p);fflush(stdout);}sleep(3);if(p)waitpid(p,0,0);return 0;}\n')
            subprocess.run(['cc', str(source), '-o', str(launcher)], check=True, capture_output=True)
            shutil.copy2(launcher, desktop_exe); shutil.copy2(launcher, host_exe)
            started = datetime.datetime.now(datetime.timezone.utc).isoformat()
            parent = subprocess.Popen([str(launcher)])
            desktop = subprocess.Popen([str(desktop_exe), str(host_exe)], stdout=subprocess.PIPE, text=True)
            try:
                host = int(desktop.stdout.readline().strip())
                probe = {'pid': parent.pid, 'executable': str(launcher), 'startedAt': started}
                capture = {'event': 'captured', 'pid': desktop.pid, 'bundlePath': str(bundle), 'executablePath': str(desktop_exe), 'probeStartedAt': started, 'launchDateUnix': time.time()}
                receipt = {'pid': host, 'lease': 'controlled-live-lease'}
                inspection = cycle.inspect_host(host)
                binding = cycle.bind_host_identity(inspection, root, receipt, capture, probe, {str(host_exe)})
                self.assertTrue(binding['ownershipKnown'], inspection)
                (root / 'probe-process.json').write_text(json.dumps(probe))
                (root / 'owned-desktop-process.json').write_text(json.dumps(capture))
                (root / 'owned-desktop-cleanup.log').write_text(json.dumps(capture)+'\nHELPER_EXIT=0\n')
                timeline = [dict(probe, event='application-started'), {'event': 'ui-response', 'pid': parent.pid, 'openedDesktopPid': desktop.pid}, dict(receipt, event='receipt-snapshot', present=True)]
                (root / 'probe-timeline.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in timeline))
                (root / 'host-ownership.jsonl').write_text(json.dumps(binding)+'\n')
                (root / 'data/global/.dsh-workflow/desktop').mkdir(parents=True)
                log = runner / 'command.log'; log.write_text('ISOLATED_ROOT='+str(root)+'\n')
                live = cycle.collect_owned_processes(log, runner)
                self.assertEqual({row['pid'] for row in live['processes'].values()}, {parent.pid, desktop.pid, host})
                self.assertTrue(all(row['state']=='alive' for row in live['processes'].values()))
                self.assertFalse(live['finallyComplete']); self.assertFalse(live['complete'])
                with self.assertRaisesRegex(ValueError, 'Incomplete application finally'):
                    cycle.ownership(log, runner)
                parent.wait(timeout=5); desktop.wait(timeout=5)
                completed = timeline + [{'event': 'application-exit', 'code': parent.returncode}, {'event': 'diagnostics-close'}]
                (root / 'probe-timeline.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in completed))
                (root / 'owned-desktop-cleanup.log').write_text(json.dumps(capture)+'\nHELPER_EXIT=0\nHELPER_EXIT=1\n')
                separate = cycle.collect_owned_processes(log, runner)
                self.assertEqual(separate['processes']['launcher:'+str(parent.pid)]['state'], 'gone')
                self.assertEqual(separate['processes']['desktop:'+str(desktop.pid)]['state'], 'unknown')
                self.assertEqual(separate['isolatedCleanup']['state'], 'unknown')
                listener = {'state': 'observed', 'exit': 1, 'stdout': '', 'stderr': '', 'timedOut': False}
                self.assertTrue(cycle.launcher_web_released(separate, listener, {'available': True}))
                with self.assertRaisesRegex(ValueError, 'Missing or failed Desktop ownership'):
                    cycle.ownership(log, runner)
                (root / 'owned-desktop-cleanup.log').write_text(json.dumps(capture)+'\nHELPER_EXIT=0\n')
                (root / 'probe-timeline.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in timeline))
                gone = cycle.collect_owned_processes(log, runner)
                self.assertTrue(all(row['state']=='gone' and row['rawErrno']==__import__('errno').ESRCH for row in gone['processes'].values()))
                self.assertFalse(gone['complete'])
                with socket.socket() as owned_port:
                    owned_port.bind(('127.0.0.1', 0)); owned_port.listen(1)
                    bind = {'available': True}
                gate = {'ownership': gone['ownership'], 'processes': list(gone['processes'].values()), 'finallyComplete': gone['finallyComplete'], 'receipt': gone['receiptLookup'], 'listener': {'exit': 1, 'stdout': '', 'stderr': ''}, 'bindListen': bind}
                self.assertFalse(cycle.can_repeat(gate))
                (root / 'host-ownership.jsonl').write_text('')
                unknown = cycle.collect_owned_processes(log, runner)
                self.assertEqual(unknown['processes']['host:'+str(host)]['state'], 'unknown')
                self.assertFalse(unknown['hostBindingKnown']); self.assertFalse(unknown['complete'])
                # An early failure may never produce a Host receipt. The real,
                # already reaped Launcher/Desktop observations still matter.
                missing_host = [row for row in timeline if row.get('event') != 'receipt-snapshot']
                missing_host += [{'event': 'application-exit', 'code': parent.returncode},
                                 {'event': 'diagnostics-close'}]
                (root / 'probe-timeline.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in missing_host))
                partial = cycle.collect_owned_processes(log, runner)
                self.assertEqual(partial['ownership']['host'], [])
                self.assertEqual({row['pid'] for row in partial['processes'].values()}, {parent.pid, desktop.pid})
                self.assertTrue(all(row['state']=='gone' and row['rawErrno']==__import__('errno').ESRCH for row in partial['processes'].values()))
                self.assertTrue(partial['finallyComplete'])
                self.assertFalse(partial['hostBindingKnown']); self.assertFalse(partial['complete'])
                with self.assertRaisesRegex(ValueError, 'Missing Host receipt ownership'):
                    cycle.ownership(log, runner)
                gate.update(ownership=partial['ownership'], processes=list(partial['processes'].values()), finallyComplete=True)
                self.assertFalse(cycle.can_repeat(gate))
                for bad in ({'pid': 1, 'lease': 'invalid-pid'}, {'pid': host, 'lease': ''}):
                    invalid = missing_host + [dict(bad, event='receipt-snapshot', present=True)]
                    (root / 'probe-timeline.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in invalid))
                    independent_unknown = cycle.collect_owned_processes(log, runner)
                    self.assertEqual(independent_unknown['isolatedCleanup']['state'], 'unknown')
                    self.assertEqual(independent_unknown['processes']['launcher:'+str(parent.pid)]['state'], 'gone')
                    self.assertTrue(cycle.launcher_web_released(independent_unknown, listener, {'available': True}))
                    with self.assertRaisesRegex(ValueError, 'Missing Host receipt ownership'):
                        cycle.ownership(log, runner)
            finally:
                parent.wait(timeout=5); desktop.wait(timeout=5)
                desktop.stdout.close()


class HostIdentityTest(unittest.TestCase):
    def test_launcher_web_release_does_not_require_independent_desktop_cleanup(self):
        import copy
        import errno
        owned = {'ownership': {'launcher': [11], 'desktop': [12], 'host': [13]},
                 'processes': {'launcher:11': {'pid': 11, 'state': 'gone', 'errno': errno.ESRCH, 'rawExit': 1, 'rawErrno': errno.ESRCH},
                               'desktop:12': {'pid': 12, 'state': 'alive'}, 'host:13': {'pid': 13, 'state': 'unknown'}},
                 'finallyComplete': True, 'receiptLookup': {'state': 'present'}}
        listener = {'state': 'observed', 'exit': 1, 'stdout': '', 'stderr': '', 'timedOut': False}
        bind = {'available': True}
        self.assertTrue(cycle.launcher_web_released(owned, listener, bind))
        self.assertFalse(cycle.can_repeat({'ownership': owned['ownership'], 'processes': list(owned['processes'].values()),
                                         'finallyComplete': True, 'receipt': owned['receiptLookup'], 'listener': {key: listener[key] for key in ('exit', 'stdout', 'stderr')}, 'bindListen': bind}))
        for mutation in ('missing-launcher', 'unknown-launcher', 'missing-finally'):
            bad = copy.deepcopy(owned)
            if mutation == 'missing-launcher': bad['processes'].pop('launcher:11')
            elif mutation == 'unknown-launcher': bad['processes']['launcher:11']['state'] = 'unknown'
            else: bad['finallyComplete'] = False
            self.assertFalse(cycle.launcher_web_released(bad, listener, bind), mutation)
        self.assertFalse(cycle.launcher_web_released(owned, listener, {'available': False}))
        for changes in ({'state': 'unknown'}, {'exit': 124, 'timedOut': True}, {'stderr': 'query rejected'}, {'exit': 0, 'stdout': 'p123\n'}):
            self.assertFalse(cycle.launcher_web_released(owned, dict(listener, **changes), bind), changes)

    def test_t08_host_capture_binds_real_owned_child_and_keeps_root_guards(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary).resolve()
            root = runner / 'dsh-t01-host-capture'; root.mkdir()
            runtime = root / 'missing-runtime'; runtime.mkdir()
            executable = cycle.inspect_host(os.getpid())['executable']
            (runtime / 'node').symlink_to(executable)
            bundle = runtime / 'desktop/DeepSeek Harness.app'
            desktop_executable = bundle / 'Contents/MacOS/DeepSeek Harness'
            desktop_executable.parent.mkdir(parents=True); desktop_executable.touch()
            captured = {'event': 'captured', 'pid': os.getpid(), 'bundlePath': str(bundle),
                        'executablePath': str(desktop_executable), 'probeStartedAt': 'owned-fixture-start'}
            (root / 'owned-desktop-cleanup.log').write_text(json.dumps(captured) + '\n')
            (root / 'probe-process.json').write_text(json.dumps({'startedAt': 'owned-fixture-start'}))
            receipt = root / 'data/global/.dsh-workflow/desktop/desktop-host.json'
            receipt.parent.mkdir(parents=True)
            child = subprocess.Popen([str(runtime / 'node'), '-c', 'import sys; sys.stdin.buffer.read()'], stdin=subprocess.PIPE)
            try:
                receipt.write_text(json.dumps({'pid': child.pid, 'lease': 'owned-t08-fixture-lease'}))
                value = cycle.capture_owned_host(root, runner, child.pid)
                self.assertTrue(value['ownershipKnown'], value)
                self.assertEqual(value['desktopPid'], os.getpid())
                self.assertEqual(value['lease'], 'owned-t08-fixture-lease')
                inspection = cycle.inspect_host(child.pid, include_bsd_status=True)
                self.assertTrue(inspection['lookupOk'], inspection)
                self.assertEqual(inspection['bsdStatus']['exit'], 0)
                self.assertTrue(inspection['bsdStatus']['stdout'].strip())
                self.assertEqual(inspection['bsdStatus']['stderr'], '')
                wrong = runner / 'unowned-host-capture'; wrong.mkdir()
                with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                    cycle.capture_owned_host(wrong, runner, child.pid)
                alias = runner / 'dsh-t01-alias'; alias.symlink_to(root)
                with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                    cycle.capture_owned_host(alias, runner, child.pid)
                with self.assertRaisesRegex(ValueError, 'Host receipt changed'):
                    cycle.capture_owned_host(root, runner, os.getpid())
                with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                    cycle.validate_root(str(root), runner)
            finally:
                child.stdin.close(); child.wait(timeout=2)

    def test_owned_t08_pid_liveness_keeps_root_and_capture_guards(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary).resolve()
            root = runner / 'dsh-t01-liveness'; root.mkdir()
            pid = os.getpid()
            captured = json.dumps({'event': 'captured', 'pid': pid}) + '\n'
            (root / 'owned-desktop-cleanup.log').write_text(captured)
            value = cycle.check_owned_pid(root, runner, pid)
            self.assertEqual(value['pid'], pid)
            self.assertEqual(value['state'], 'alive')
            self.assertEqual(value['rawExit'], 0)
            wrong = runner / 'unowned-liveness'; wrong.mkdir()
            (wrong / 'owned-desktop-cleanup.log').write_text(captured)
            with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                cycle.check_owned_pid(wrong, runner, pid)
            with self.assertRaisesRegex(ValueError, 'PID has no owned Desktop capture'):
                cycle.check_owned_pid(root, runner, 1)
            with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                cycle.validate_root(str(root), runner)

    def test_all_old_and_new_pid_facts_are_required_by_the_existing_gate(self):
        import errno
        import copy
        good = {'ownership': {'launcher': [11], 'desktop': [12, 14], 'host': [13, 15]},
                'processes': [{'pid': pid, 'state': 'gone', 'errno': errno.ESRCH, 'rawExit': 1, 'rawErrno': errno.ESRCH} for pid in (11, 12, 13, 14, 15)],
                'receipt': {'errno': errno.ENOENT}, 'listener': {'exit': 1, 'stdout': '', 'stderr': ''}, 'bindListen': {'available': True}}
        self.assertTrue(cycle.can_repeat(good))
        missing = copy.deepcopy(good); missing['processes'].pop()
        self.assertFalse(cycle.can_repeat(missing))
        unknown = copy.deepcopy(good); unknown['processes'][-1].update(state='unknown', errno=None, rawExit=124, rawErrno=None)
        self.assertFalse(cycle.can_repeat(unknown))

    def test_real_owned_child_identity_binds_and_mismatches_remain_unknown(self):
        import os
        import time
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            actual_python = cycle.inspect_host(os.getpid())['executable']
            started = time.time()
            child = subprocess.Popen([actual_python, '-c', 'import time; time.sleep(5)'])
            try:
                inspection = cycle.inspect_host(child.pid)
                receipt = {'pid': child.pid, 'lease': 'owned-fixture-lease'}
                probe = {'startedAt': __import__('datetime').datetime.fromtimestamp(started, __import__('datetime').timezone.utc).isoformat()}
                desktop = {'pid': os.getpid(), 'launchDateUnix': started - 1, 'probeStartedAt': probe['startedAt']}
                allowed = {actual_python}
                bound = cycle.bind_host_identity(inspection, root, receipt, desktop, probe, allowed)
                self.assertTrue(bound['ownershipKnown'], inspection)
                for field, value in (('parentPid', child.pid), ('uid', -1), ('executable', '/not-the-owned-child'), ('lookupOk', False)):
                    with self.subTest(field=field):
                        bad = dict(inspection, **{field: value})
                        self.assertFalse(cycle.bind_host_identity(bad, root, receipt, desktop, probe, allowed)['ownershipKnown'])
            finally:
                child.terminate(); child.wait(timeout=2)


    def test_outer_query_timeout_reaps_the_owned_readonly_probe(self):
        import os
        result = cycle.run_inspection([sys.executable, '-c', 'import time; print("probe-started", flush=True); time.sleep(20)'])
        self.assertEqual(result['exit'], 124)
        self.assertTrue(result['timedOut']); self.assertTrue(result['waited'])
        self.assertNotEqual(result['childExit'], 0)
        self.assertIn('probe-started', result['stdout'])
        with self.assertRaises(ProcessLookupError): os.kill(result['childPid'], 0)


class LocalObservationRootTest(unittest.TestCase):
    def test_explicit_local_runner_requires_current_uid_private_physical_root(self):
        base = Path('/private/tmp') / ('dsh-launcher-local-' + str(os.getuid()))
        created = not base.exists()
        if created:
            base.mkdir(mode=0o700)
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', 'DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT': str(base)}):
            self.assertEqual(cycle.observation_runner(), base)
            with patch.dict(os.environ, {'DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT': str(base) + '-alias'}):
                with self.assertRaisesRegex(ValueError, 'UID namespace'):
                    cycle.observation_runner()
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true'}):
                with self.assertRaisesRegex(ValueError, 'Mixed CI and local'):
                    cycle.observation_runner()
            if created:
                try:
                    base.chmod(0o755)
                    with self.assertRaisesRegex(ValueError, 'owned and private'):
                        cycle.observation_runner()
                finally:
                    base.chmod(0o700)
                base.rmdir()
                with tempfile.TemporaryDirectory(prefix='dsh-local-policy-target-', dir='/private/tmp') as target:
                    base.symlink_to(target, target_is_directory=True)
                    try:
                        with self.assertRaisesRegex(ValueError, 'UID namespace'):
                            cycle.observation_runner()
                    finally:
                        base.unlink()
                base.mkdir(mode=0o700)


class PrivacyTest(unittest.TestCase):
    def fixture(self, base):
        root = base / 'dsh-t05-owned'; root.mkdir()
        evidence = base / 'evidence'; evidence.mkdir()
        log = base / 'command.log'; log.write_text('ISOLATED_ROOT=' + str(root) + '\n')
        (root / 'probe-process.json').write_text(json.dumps({'pid': 37, 'password': 'private-password'}))
        (root / 'owned-desktop-process.json').write_text(json.dumps({'pid': 38, 'apiKey': 'private-api'}))
        (root / 'probe-timeline.jsonl').write_text(json.dumps({'event': 'status', 'nested': {'token': 'private-token'}, 'ready': True}) + '\n')
        (root / 'owned-desktop-cleanup.log').write_text('HELPER_EXIT=0\nAuthorization: Bearer private-auth\n')
        return root, evidence, log

    def test_failed_auxiliary_diagnostics_keeps_only_masked_log_and_actual_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); root, target, log = self.fixture(base)
            def failed_diagnostics(command, **options):
                Path(command[3], 'unknown-auxiliary.log').write_text('private-userdata')
                return subprocess.CompletedProcess(command, 124, 'last phase password=private-password\n', 'deadline exceeded\n')
            with patch.object(cycle.subprocess, 'run', side_effect=failed_diagnostics):
                cycle.collect(log, target, base)
            self.assertEqual((target / 'collector.exit').read_text(), '124\n')
            text = (target / 'collector.log').read_text()
            self.assertIn('last phase', text)
            self.assertIn('deadline exceeded', text)
            self.assertNotIn('private-password', text)
            self.assertFalse((root / 'auxiliary-cycle-diagnostics').exists())
            self.assertFalse(any(path.name == 'unknown-auxiliary.log' for path in target.rglob('*')))

    def test_only_safe_evidence_is_exported_with_structured_redaction(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); root, target, log = self.fixture(base)
            for name in ('preferences.json', 'keychain.json', 'userdata.log', 'unknown.png'):
                (root / name).write_text('private-userdata')
            with patch.object(cycle.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')):
                cycle.collect(log, target, base)
            out = target / root.name
            self.assertFalse(any((out / name).exists() for name in ('preferences.json', 'keychain.json', 'userdata.log', 'unknown.png')))
            outputs = list(out.rglob('*'))
            self.assertFalse(any(file.is_symlink() for file in outputs))
            exported = '\n'.join(file.read_text() for file in outputs if file.is_file())
            for secret in ('private-password', 'private-api', 'private-token', 'private-auth', 'private-userdata'):
                self.assertNotIn(secret, exported)
            self.assertTrue(json.loads((out / 'probe-timeline.jsonl').read_text())['ready'])
            self.assertEqual(json.loads((out / 'probe-process.json').read_text())['pid'], 37)

    def test_observational_copy_refuses_unknown_independent_evidence_without_weakening_own_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); root, target, _ = self.fixture(base)
            (root / 'settings-evidence.json').write_text(json.dumps({'fullAccessSaved': True}))
            (root / 'owned-desktop-process.json').write_text('{invalid')
            errors = cycle.copy_safe_evidence(root.resolve(), target, allow_independent_unknown=True)
            self.assertTrue(any(row['file'] == 'owned-desktop-process.json' and row['state'] == 'unknown' for row in errors))
            self.assertFalse((target / 'owned-desktop-process.json').exists())
            self.assertNotIn('private-password', (target / 'probe-process.json').read_text())
            (root / 'probe-process.json').write_text('{invalid-own')
            with self.assertRaises(ValueError):
                cycle.copy_safe_evidence(root.resolve(), target, allow_independent_unknown=True)

    def test_missing_business_evidence_still_preserves_safe_app_log(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve(); root, target, _ = self.fixture(base)
            (root / 'app.log').write_text('first failure phase\npassword=private-app-secret\n')
            with self.assertRaisesRegex(ValueError, 'Missing own functional evidence: settings-evidence.json'):
                cycle.copy_safe_evidence(root, target, allow_independent_unknown=True)
            self.assertTrue((target / 'app.log').is_file())
            self.assertIn('first failure phase', (target / 'app.log').read_text())
            self.assertNotIn('private-app-secret', (target / 'app.log').read_text())

    def test_app_log_copy_refuses_leaf_and_parent_symlink_without_read(self):
        actual_read = Path.read_text
        for link_parent in (False, True):
            with self.subTest(link_parent=link_parent), tempfile.TemporaryDirectory() as directory:
                base = Path(directory).resolve(); root, target, _ = self.fixture(base)
                external = base / 'external.log'; external.write_text('external-private-sentinel')
                (root / 'app.log').symlink_to(external)
                if link_parent:
                    alias = base / 'dsh-t05-alias'; alias.symlink_to(root, target_is_directory=True)
                    source = alias
                else:
                    source = root
                read_paths = []
                def tracked_read(file, *args, **kwargs):
                    read_paths.append(file)
                    return actual_read(file, *args, **kwargs)
                with patch.object(Path, 'read_text', new=tracked_read), self.assertRaises(ValueError):
                    cycle.copy_safe_evidence(source, target, allow_independent_unknown=True)
                self.assertNotIn(source / 'app.log', read_paths)
                self.assertNotIn(external, read_paths)
                self.assertFalse((target / 'app.log').exists())

    def test_diagnostics_permission_body_gate_excludes_prefix_and_requires_full(self):
        import re
        repo = Path(__file__).resolve().parents[2]
        workflow = (repo / '.github/workflows/flutter-settings-diagnostics.yml').read_text()
        section = workflow.split('      - name: Collect T05 observed application and process evidence', 1)[1]
        source = section.split("python3 - <<'PY'\n", 1)[1].split('          PY', 1)[0]
        tree = ast.parse('\n'.join(line[10:] for line in source.splitlines()))
        def selects(node, names):
            return isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in names for target in node.targets)
        header = [node for node in tree.body if selects(node, {'logs', 'roots', 'full_roots', 'functional_failed'})]
        loop = next(node for node in tree.body if isinstance(node, ast.For))
        verdict = [node for node in loop.body if selects(node, {'permission_applicable', 'permission_verified', 'functional_complete', 'functional_failed'})
                   or isinstance(node, ast.If) and isinstance(node.test, ast.Name) and node.test.id == 'permission_applicable']
        for full_present in (False, True):
            with self.subTest(full_present=full_present), tempfile.TemporaryDirectory() as directory:
                evidence = Path(directory).resolve()
                startup = evidence / 'startup-1'; startup.mkdir()
                prefix_root, full_root = str(evidence / 'dsh-t05-prefix'), str(evidence / 'dsh-t05-full')
                (startup / 'command.log').write_text('ISOLATED_ROOT=' + prefix_root + '\n')
                if full_present:
                    (evidence / 'application.log').write_text('ISOLATED_ROOT=' + full_root + '\n')
                namespace = {'evidence': evidence, 're': re}
                exec(compile(ast.Module(body=header, type_ignores=[]), '<actual diagnostic root header>', 'exec'), namespace)
                namespace.update(name=prefix_root, settings_body={'startupOnly': True}, request={},
                                 functional_command_exit=0, normal_exit={'code': 0}, resources_released=True)
                exec(compile(ast.Module(body=verdict, type_ignores=[]), '<actual diagnostic permission verdict>', 'exec'), namespace)
                self.assertTrue(namespace['functional_complete'])
                self.assertFalse(namespace['permission_applicable'])
                self.assertIsNone(namespace['permission_verified'])
                self.assertEqual(namespace['functional_failed'], not full_present)
                if full_present:
                    namespace.update(name=full_root, settings_body={'startupOnly': True}, request={})
                    exec(compile(ast.Module(body=verdict, type_ignores=[]), '<actual full missing body verdict>', 'exec'), namespace)
                    self.assertFalse(namespace['functional_complete'])
                    self.assertTrue(namespace['permission_applicable'])
                    self.assertFalse(namespace['permission_verified'])
                    self.assertTrue(namespace['functional_failed'])

    def test_malformed_safe_json_and_jsonl_fail_collection(self):
        for name in ('probe-process.json', 'probe-timeline.jsonl'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                base = Path(directory); root, target, log = self.fixture(base)
                (root / name).write_text('{"password":"private-password"')
                with self.assertRaises(ValueError): cycle.collect(log, target, base)
                self.assertFalse((target / root.name / name).exists())

    def test_text_forwarding_masks_generic_credentials_and_vm_uris(self):
        text = 'VM http://127.0.0.1:1234/private-vm=/\nws://localhost:1234/private-ws=/ws\nAuthorization: Bearer private-auth\nCookie: sid=private-cookie\npassword=private-pw token=private-token apiKey="private-api"\nauth=private-auth-key\nBearer private-bearer\n{"authorization":"private-json-auth"}\nauthToken=private-auth-token\n'
        masked = cycle.sanitize_text(text)
        for secret in ('private-vm', 'private-ws', 'private-auth', 'private-cookie', 'private-pw', 'private-token', 'private-api', 'private-auth-key', 'private-bearer', 'private-json-auth', 'private-auth-token'):
            self.assertNotIn(secret, masked)
        self.assertIn('<REDACTED>', masked)


if __name__ == '__main__': unittest.main()
