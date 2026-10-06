import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CLI = Path(__file__).with_name('flutter_debug_artifact.py')


class DebugArtifactTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / 'macos-launcher/flutter'
        for name, content in {
            'lib/main.dart': 'void main() {}\n',
            'macos/Runner/Info.plist': '<plist/>\n',
            'pubspec.yaml': 'name: launcher\n',
            'pubspec.lock': 'packages: {}\n',
            'tool/collector.py': 'print("original")\n',
        }.items():
            target = self.project / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Artifact Test', '-c', 'user.email=artifact@example.invalid', 'commit', '-qm', 'actual build inputs'], check=True)
        self.producer_sha = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], text=True).strip()
        self.toolchain = self.root / 'toolchain.json'
        self.toolchain.write_text(json.dumps({
            'arch': 'x86_64', 'flutter': {'frameworkRevision': 'fixed-flutter', 'engineRevision': 'fixed-engine', 'dartSdkVersion': '3.13.0'},
            'xcode': 'Xcode 26.0\nBuild version 17A1', 'sdkVersion': '26.0', 'sdkBuild': '25A1', 'macos': '15.6',
        }))
        self.inputs = self.root / 'inputs.json'
        self.build_exit = self.root / 'build.exit'
        self.build_exit.write_text('0\n')
        self.bundle = self.root / 'bundle'
        self.app = self.root / 'DSH Workflow.app'
        for name, content in {
            'Contents/MacOS/DSH Workflow': "#!/bin/sh\nprintf '%s\\n' actual-app-byte\n",
            'Contents/Info.plist': '<plist/>',
            'Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin': 'actual-kernel',
        }.items():
            path = self.app / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        (self.app / 'Contents/MacOS/DSH Workflow').chmod(0o755)
        (self.app / 'Contents/Frameworks/App.framework/Current').symlink_to('Resources')
        self.env = dict(os.environ, GITHUB_SHA='a' * 40, GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='1', GITHUB_JOB='producer', GITHUB_REPOSITORY='owner/repo', GITHUB_WORKFLOW='producer-workflow')

    def run_cli(self, command, *args, success=True):
        result = subprocess.run([sys.executable, str(CLI), command, *map(str, args)], capture_output=True, text=True, env=self.env, cwd=self.root)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def key(self):
        self.run_cli('inputs', '--root', self.root, '--toolchain', self.toolchain, '--output', self.inputs)
        return json.loads(self.inputs.read_text())['key']

    def pack(self):
        self.key()
        self.run_cli('pack', '--inputs', self.inputs, '--app', self.app, '--bundle', self.bundle, '--build-exit', self.build_exit)

    def test_consumer_runs_exact_bytes_and_preserves_producer_identity(self):
        self.pack()
        destination = self.root / 'consumer/DSH Workflow.app'
        receipt = self.root / 'reuse.json'
        (self.project / 'tool/collector.py').write_text('print(\"consumer collector\")\n')
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Artifact Test', '-c', 'user.email=artifact@example.invalid', 'commit', '-qam', 'external collector only'], check=True)
        consumer_sha = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], text=True).strip()
        self.env['GITHUB_SHA'] = 'b' * 40
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle, '--destination', destination, '--receipt', receipt)
        output = subprocess.check_output([str(destination / 'Contents/MacOS/DSH Workflow')], text=True)
        self.assertEqual(output, 'actual-app-byte\n')
        result = json.loads(receipt.read_text())
        self.assertEqual(result['producer']['sourceCommit'], self.producer_sha)
        self.assertEqual(result['consumer']['sourceCommit'], consumer_sha)
        self.assertTrue((destination / 'Contents/Frameworks/App.framework/Current').is_symlink())

    def test_same_run_arm_consumers_restore_real_bytes_and_reject_other_toolchains(self):
        # Public CLI/file contract, not a physical Flutter ARM build or App acceptance.
        facts = json.loads(self.toolchain.read_text()); facts['arch'] = 'arm64'
        self.toolchain.write_text(json.dumps(facts))
        self.env.update(GITHUB_JOB='t07', GITHUB_WORKFLOW='Flutter Launcher Acceptance')
        self.pack()
        (self.project / 'tool/collector.py').write_text('print("consumer only")\n')
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Artifact Test', '-c', 'user.email=artifact@example.invalid', 'commit', '-qam', 'external consumer source'], check=True)
        consumer_sha = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], text=True).strip()
        self.key()
        for job in ('t02', 't06', 't08'):
            with self.subTest(consumer=job):
                self.env['GITHUB_JOB'] = job
                destination = self.root / job / 'DSH Workflow.app'; receipt = self.root / (job+'.json')
                self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle, '--destination', destination, '--receipt', receipt)
                value = json.loads(receipt.read_text())
                self.assertEqual(value['producer']['job'], 't07')
                self.assertEqual(value['producer']['sourceCommit'], self.producer_sha)
                self.assertEqual(value['consumer']['job'], job)
                self.assertEqual(value['consumer']['sourceCommit'], consumer_sha)
                self.assertEqual(value['producer']['runId'], value['consumer']['runId'])
                self.assertEqual(subprocess.check_output([str(destination / 'Contents/MacOS/DSH Workflow')], text=True), 'actual-app-byte\n')
        for field, value in [('arch', 'x86_64'), ('xcode', 'different actual Xcode'), ('sdkVersion', '99.0'), ('sdkBuild', 'different actual SDK')]:
            with self.subTest(mismatch=field):
                self.toolchain.write_text(json.dumps(dict(facts, **{field: value})))
                self.key(); destination = self.root / ('rejected-'+field) / 'DSH Workflow.app'
                result = self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle, '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
                self.assertIn('Artifact build inputs do not match', result.stderr)
                self.assertFalse(destination.exists())
        self.toolchain.write_text(json.dumps(facts)); self.key()
        missing = self.root / 'missing-producer'; missing.mkdir()
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', missing, '--destination', self.root / 'missing.app', '--receipt', self.root / 'missing.json', success=False)
        self.assertFalse((self.root / 'missing.app').exists())

    def test_incomplete_toolchain_cannot_produce_reuse_key(self):
        self.toolchain.write_text(json.dumps({'arch': 'x86_64'}))
        self.run_cli('inputs', '--root', self.root, '--toolchain', self.toolchain, '--output', self.inputs, success=False)
        self.assertFalse(self.inputs.exists())


    def test_external_test_changes_keep_key_and_actual_build_input_changes_reject_old_app(self):
        self.pack()
        old_key = json.loads(self.inputs.read_text())['key']
        (self.project / 'tool/collector.py').write_text('print("new external collector")\n')
        self.assertEqual(self.key(), old_key)
        for name in ('lib/main.dart', 'macos/Runner/Info.plist', 'pubspec.lock'):
            with self.subTest(input=name):
                file = self.project / name
                original = file.read_bytes()
                file.write_bytes(original + b'changed actual build input')
                self.assertNotEqual(self.key(), old_key)
                destination = self.root / 'rejected/DSH Workflow.app'
                self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                             '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
                self.assertFalse(destination.exists())
                file.write_bytes(original)

    def test_arch_flutter_xcode_and_sdk_changes_cannot_consume_old_app(self):
        self.pack()
        original = json.loads(self.toolchain.read_text())
        for field in ('arch', 'flutter', 'xcode', 'sdkVersion', 'sdkBuild'):
            with self.subTest(toolchain=field):
                changed = dict(original)
                changed[field] = dict(original[field], frameworkRevision='other-revision') if field == 'flutter' else 'different'
                self.toolchain.write_text(json.dumps(changed))
                self.key()
                destination = self.root / 'rejected/DSH Workflow.app'
                self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                             '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
                self.assertFalse(destination.exists())

    def test_modified_archive_and_payload_hash_are_rejected_before_use(self):
        self.pack()
        archive = self.bundle / 'app.tar.gz'
        original = archive.read_bytes()
        archive.write_bytes(original + b'corrupted actual archive bytes')
        destination = self.root / 'rejected/DSH Workflow.app'
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                     '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
        self.assertFalse(destination.exists())
        archive.write_bytes(original)
        manifest_file = self.bundle / 'manifest.json'
        manifest = json.loads(manifest_file.read_text())
        manifest['payload']['Contents/Info.plist']['sha256'] = '0' * 64
        manifest_file.write_text(json.dumps(manifest))
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                     '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
        self.assertFalse(destination.exists())

    def test_hash_without_real_application_bytes_cannot_be_produced(self):
        self.key()
        (self.app / 'Contents/MacOS/DSH Workflow').unlink()
        self.run_cli('pack', '--inputs', self.inputs, '--app', self.app, '--bundle', self.bundle, '--build-exit', self.build_exit, success=False)
        self.assertFalse((self.bundle / 'manifest.json').exists())


    def test_missing_producer_identity_cannot_be_relabelled_as_current_candidate(self):
        self.pack()
        manifest_file = self.bundle / 'manifest.json'
        manifest = json.loads(manifest_file.read_text())
        manifest['producer'] = {}
        manifest_file.write_text(json.dumps(manifest))
        destination = self.root / 'rejected/DSH Workflow.app'
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                     '--destination', destination, '--receipt', self.root / 'rejected.json', success=False)
        self.assertFalse(destination.exists())


    def test_failed_or_unknown_producer_build_cannot_seal_existing_app_bytes(self):
        self.key()
        for exit_text in ('255\n', 'unknown\n'):
            with self.subTest(build_exit=exit_text):
                self.build_exit.write_text(exit_text)
                self.run_cli('pack', '--inputs', self.inputs, '--app', self.app, '--bundle', self.bundle,
                             '--build-exit', self.build_exit, success=False)
                self.assertFalse((self.bundle / 'manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
