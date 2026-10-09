import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('actor_inputs', Path(__file__).with_name('actor_validation_inputs.py'))
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)

class ActorInputsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name, text in {
            '.github/workflows/macos-app.yml': 'env: {TOOLCHAIN: fixed}\njobs:\n  build:\n    runs-on: macos-15\n    steps: [{run: original-product-build}]\n',
            '.github/workflows/flutter-launcher-acceptance.yml': 'jobs:\n' + ''.join('  ' + job + ':\n    runs-on: macos-15\n    steps: [{run: original-native-check}]\n' for job in ['t07', 't02', 't05', 't06', 't08']),
            'macos-launcher/flutter/tool/release_close_actor/Actor.entitlements': 'original actor config',
            'macos-launcher/flutter/lib/main.dart': 'original product source',
        }.items():
            target = self.root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text)
        self.git('init', '-q'); self.git('add', '.')
        self.git('-c', 'user.name=Actor inputs fixture', '-c', 'user.email=actor@example.invalid', 'commit', '-qm', 'original real fixture inputs')
        self.base = self.git('rev-parse', 'HEAD').strip()
    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True)
    def mutate(self, name, text):
        (self.root / name).write_text(text)
    def check(self): return guard.classify(self.root, self.base, 'WORKTREE')
    def test_real_actor_file_diff_can_reuse_unchanged_product_bodies(self):
        self.mutate('macos-launcher/flutter/tool/release_close_actor/Actor.entitlements', 'changed actor only')
        value = self.check(); self.assertTrue(value['helperOnly']); self.assertTrue(value['materialInputsEqual'])
        self.assertEqual(value['changedFiles'], ['macos-launcher/flutter/tool/release_close_actor/Actor.entitlements'])
    def test_real_diagnostic_preparation_diff_reuses_only_equal_product_inputs(self):
        paths = ['.github/workflows/flutter-launcher-diagnostics.yml', '.github/scripts/macos_arm64_ci_test.py']
        for name in paths:
            target = self.root / name; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('current diagnostic executor preparation fixture')
        self.git('add', '.')
        self.git('-c', 'user.name=Actor inputs fixture', '-c', 'user.email=actor@example.invalid', 'commit', '-qm', 'diagnostic helper preparation only')
        value = guard.classify(self.root, self.base)
        self.assertTrue(value['helperOnly']); self.assertTrue(value['materialInputsEqual'])
        self.assertEqual(value['changedFiles'], sorted(paths))
        runtime = self.root / 'macos-launcher/runtime/run-dsh.mjs'
        runtime.parent.mkdir(parents=True, exist_ok=True); runtime.write_text('changed actual product runtime')
        value = self.check()
        self.assertFalse(value['helperOnly']); self.assertFalse(value['materialInputsEqual'])

    def test_window_probe_preparation_change_reuses_product_but_revalidates_native_consumers(self):
        name = 'macos-launcher/flutter/tool/application_probe.dart'
        probe = self.root / name; probe.parent.mkdir(parents=True, exist_ok=True)
        probe.write_text('changed private window fixture preparation')
        result = self.check()
        self.assertTrue(result['helperOnly']); self.assertTrue(result['materialInputsEqual'])
        self.assertFalse(result['nativeInputsEqual'])
        runtime = self.root / 'macos-launcher/flutter/lib/main.dart'
        runtime.write_text('changed actual app input')
        self.assertFalse(self.check()['helperOnly'])

    def test_exact_monitor_timeout_test_only_changes_preserve_product_inputs(self):
        name = 'agent-observation-plugin/test/agent-monitor.test.mjs'
        test = self.root / name; test.parent.mkdir(parents=True, exist_ok=True)
        test.write_text('controlled timeout fixture only')
        self.git('add', '.')
        self.git('-c', 'user.name=Actor inputs fixture', '-c', 'user.email=actor@example.invalid', 'commit', '-qm', 'owned monitor test only')
        result = guard.classify(self.root, self.base)
        self.assertTrue(result['helperOnly']); self.assertTrue(result['materialInputsEqual'])
        self.assertEqual(result['changedFiles'], [name])
        runtime = self.root / 'agent-observation-plugin/src/agent-monitor-plugin.mjs'
        runtime.parent.mkdir(parents=True, exist_ok=True); runtime.write_text('actual monitor behavior changed')
        self.assertFalse(self.check()['helperOnly'])

    def test_real_material_and_unknown_file_changes_never_skip_product(self):
        self.mutate('macos-launcher/flutter/lib/main.dart', 'changed actual product')
        self.assertFalse(self.check()['helperOnly'])
        self.mutate('macos-launcher/flutter/lib/main.dart', 'original product source')
        (self.root / 'unknown-new-input').write_text('unknown file')
        self.assertFalse(self.check()['helperOnly'])
    def test_producer_steps_environment_toolchain_and_native_bodies_cannot_be_hidden(self):
        path = '.github/workflows/macos-app.yml'; original = (self.root / path).read_text()
        for before, after in [('original-product-build', 'changed-product-build'), ('TOOLCHAIN: fixed', 'TOOLCHAIN: changed'), ('macos-15', 'another-toolchain')]:
            with self.subTest(change=after):
                self.mutate(path, original.replace(before, after)); self.assertFalse(self.check()['helperOnly'])
        self.mutate(path, original)
        self.mutate('.github/workflows/flutter-launcher-acceptance.yml', (self.root / '.github/workflows/flutter-launcher-acceptance.yml').read_text().replace('original-native-check', 'changed-native-consumer', 1))
        self.assertFalse(self.check()['helperOnly'])
    def test_routing_only_job_fields_can_change_without_changing_consumed_bodies(self):
        path = '.github/workflows/macos-app.yml'; text = (self.root / path).read_text()
        self.mutate(path, text.replace('    runs-on:', '    if: routing-only\n    needs: routing-only\n    runs-on:'))
        self.assertTrue(self.check()['helperOnly'])
    def test_unknown_base_or_malformed_yaml_is_conservative(self):
        self.assertFalse(guard.classify(self.root, 'missing-input-commit', 'WORKTREE')['helperOnly'])
        self.mutate('.github/workflows/macos-app.yml', 'jobs: [malformed: [')
        self.assertFalse(self.check()['helperOnly'])
    def test_effective_signed_actor_requires_no_sandbox_and_arm64_binaries(self):
        entitlements = {'com.apple.security.app-sandbox': False, 'com.apple.application-identifier': 'com.ghostagent.dsh.t09.PublicCloseUITests.xctrunner'}
        arches = {'actual-runner': 'arm64', 'actual-test-bundle': 'arm64'}
        self.assertTrue(guard.actor_signature(entitlements, arches))
        self.assertFalse(guard.actor_signature(dict(entitlements, **{'com.apple.security.app-sandbox': True}), arches))
        self.assertFalse(guard.actor_signature(entitlements, dict(arches, **{'actual-test-bundle': 'arm64 x86_64'})))
        self.assertFalse(guard.actor_signature(entitlements, {}))

if __name__ == '__main__': unittest.main()
