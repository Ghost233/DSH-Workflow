import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_only_safe_evidence_is_exported_with_structured_redaction(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); root, target, log = self.fixture(base)
            for name in ('preferences.json', 'keychain.json', 'userdata.log', 'unknown.png'):
                (root / name).write_text('private-userdata')
            with patch.object(cycle.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')):
                cycle.collect(log, target, base)
            out = target / root.name
            self.assertFalse(any((out / name).exists() for name in ('preferences.json', 'keychain.json', 'userdata.log', 'unknown.png')))
            exported = '\n'.join(file.read_text() for file in out.iterdir())
            for secret in ('private-password', 'private-api', 'private-token', 'private-auth', 'private-userdata'):
                self.assertNotIn(secret, exported)
            self.assertTrue(json.loads((out / 'probe-timeline.jsonl').read_text())['ready'])
            self.assertEqual(json.loads((out / 'probe-process.json').read_text())['pid'], 37)

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
