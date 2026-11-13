import importlib.util
import sys
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


class ProcessInspectionTest(unittest.TestCase):
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
    def test_text_forwarding_masks_generic_credentials_and_vm_uris(self):
        text = 'VM http://127.0.0.1:1234/private-vm=/\nws://localhost:1234/private-ws=/ws\nAuthorization: Bearer private-auth\nCookie: sid=private-cookie\npassword=private-pw token=private-token apiKey="private-api"\nauth=private-auth-key\nBearer private-bearer\n{"authorization":"private-json-auth"}\nauthToken=private-auth-token\n'
        masked = cycle.sanitize_text(text)
        for secret in ('private-vm', 'private-ws', 'private-auth', 'private-cookie', 'private-pw', 'private-token', 'private-api', 'private-auth-key', 'private-bearer', 'private-json-auth', 'private-auth-token'):
            self.assertNotIn(secret, masked)
        self.assertIn('<REDACTED>', masked)



class HeadlessHostIdentityTest(unittest.TestCase):
    def test_real_headless_host_chain_and_unknown_driver_path_root_rejection(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary).resolve()
            root = runner / 'dsh-t06-owned'; root.mkdir(mode=0o700)
            runtime = root / 'missing-runtime'; runtime.mkdir()
            python = cycle.inspect_host(os.getpid())['executable']
            node = runtime / 'node'; node.symlink_to(python)
            (root / 'probe-process.json').write_text(json.dumps({'startedAt': 'owned-headless-fixture', 'driverPid': os.getpid(), 'driverExecutable': python}))
            receipt = root / 'data/global/.dsh-workflow/desktop/desktop-host.json'
            receipt.parent.mkdir(parents=True)
            script = 'import subprocess,sys; child=subprocess.Popen([sys.executable,"-c","import sys; sys.stdin.buffer.read()"],stdin=subprocess.PIPE); print(child.pid,flush=True); sys.stdin.buffer.read(); child.stdin.close(); child.wait(timeout=5)'
            owner = subprocess.Popen([python, '-c', script], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
            try:
                host_pid = int(owner.stdout.readline())
                receipt.write_text(json.dumps({'pid': host_pid, 'lease': 'real-headless-lease'}))
                value = cycle.capture_owned_headless_host(root, runner, host_pid, owner.pid, os.getpid())
                self.assertTrue(value['ownershipKnown'], value)
                self.assertEqual(value['ownerType'], 'headless')
                self.assertEqual(value['inspection']['parentPid'], owner.pid)
                self.assertEqual(value['ownerInspection']['parentPid'], os.getpid())
                self.assertIsInstance(value['inspection']['startUnixSeconds'], (int, float))
                wrong_driver = cycle.capture_owned_headless_host(root, runner, host_pid, owner.pid, owner.pid)
                self.assertFalse(wrong_driver['ownershipKnown'])
                missing_owner = cycle.capture_owned_headless_host(root, runner, host_pid, 99999999, os.getpid())
                self.assertFalse(missing_owner['ownershipKnown'])
                node.unlink(); node.symlink_to('/bin/sleep')
                wrong_path = cycle.capture_owned_headless_host(root, runner, host_pid, owner.pid, os.getpid())
                self.assertFalse(wrong_path['ownershipKnown'])
                node.unlink(); node.symlink_to(python)
                with self.assertRaisesRegex(ValueError, 'Host receipt changed'):
                    cycle.capture_owned_headless_host(root, runner, os.getpid(), owner.pid, os.getpid())
                alias = runner / 'dsh-t06-alias'; alias.symlink_to(root)
                with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                    cycle.capture_owned_headless_host(alias, runner, host_pid, owner.pid, os.getpid())
                root.chmod(0o755)
                with self.assertRaisesRegex(ValueError, 'Unowned or non-direct probe root'):
                    cycle.capture_owned_headless_host(root, runner, host_pid, owner.pid, os.getpid())
            finally:
                owner.stdin.close(); self.assertEqual(owner.wait(timeout=5), 0); owner.stdout.close()

if __name__ == '__main__': unittest.main()
