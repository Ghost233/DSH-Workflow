import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
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
            'arch': 'arm64', 'flutter': {'frameworkRevision': 'fixed-flutter', 'engineRevision': 'fixed-engine', 'dartSdkVersion': '3.13.0'},
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
        for field, value in [('xcode', 'different actual Xcode'), ('sdkVersion', '99.0'), ('sdkBuild', 'different actual SDK')]:
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

    def test_valid_group_writable_font_mode_is_preserved_by_strict_restore(self):
        import stat
        font = self.app / 'Contents/Frameworks/App.framework/Resources/flutter_assets/fonts/MaterialIcons-Regular.otf'
        font.parent.mkdir(); font.write_bytes(b'actual-font-file-bytes'); font.chmod(0o664)
        self.pack()
        destination = self.root / 'mode-consumer/DSH Workflow.app'
        self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                     '--destination', destination, '--receipt', self.root / 'mode-receipt.json')
        restored = destination / font.relative_to(self.app)
        self.assertEqual(stat.S_IMODE(restored.stat().st_mode), 0o664)
        self.assertEqual(restored.read_bytes(), font.read_bytes())
        self.assertTrue((destination / 'Contents/Frameworks/App.framework/Current').is_symlink())

    def test_mode_preserving_restore_still_rejects_unsafe_tar_members(self):
        import hashlib
        import io
        import tarfile
        self.pack()
        archive = self.bundle / 'app.tar.gz'; original = archive.read_bytes()
        manifest_file = self.bundle / 'manifest.json'; manifest = json.loads(manifest_file.read_text())
        cases = [('absolute', '/outside', tarfile.REGTYPE, ''),
                 ('parent', 'DSH Workflow.app/../outside', tarfile.REGTYPE, ''),
                 ('symlink', 'DSH Workflow.app/Contents/escape', tarfile.SYMTYPE, '../../../outside'),
                 ('device', 'DSH Workflow.app/Contents/device', tarfile.CHRTYPE, '')]
        for label, name, kind, target in cases:
            with self.subTest(member=label):
                with tarfile.open(fileobj=io.BytesIO(original)) as source, tarfile.open(archive, 'w:gz') as changed:
                    for member in source.getmembers():
                        changed.addfile(member, source.extractfile(member) if member.isfile() else None)
                    invalid = tarfile.TarInfo(name); invalid.type = kind; invalid.linkname = target
                    changed.addfile(invalid)
                manifest['archiveSha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
                manifest_file.write_text(json.dumps(manifest))
                destination = self.root / label / 'DSH Workflow.app'
                result = self.run_cli('restore', '--inputs', self.inputs, '--bundle', self.bundle,
                                      '--destination', destination, '--receipt', self.root / 'unsafe-receipt.json', success=False)
                self.assertIn('Unsafe artifact', result.stderr)
                self.assertFalse(destination.exists())
                self.assertFalse((self.root / 'outside').exists())

    def test_non_arm_toolchain_cannot_produce_launcher_artifact(self):
        facts = json.loads(self.toolchain.read_text())
        facts['arch'] = 'unsupported-architecture'
        self.toolchain.write_text(json.dumps(facts))
        result = self.run_cli('inputs', '--root', self.root, '--toolchain', self.toolchain, '--output', self.inputs, success=False)
        self.assertIn('ARM64-only', result.stderr)
        self.assertFalse(self.inputs.exists())

    def test_incomplete_toolchain_cannot_produce_reuse_key(self):
        self.toolchain.write_text(json.dumps({'arch': 'arm64'}))
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
        for field in ('flutter', 'xcode', 'sdkVersion', 'sdkBuild'):
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


class EngineeringPrerequisitesTest(unittest.TestCase):
    def test_engineering_checks_prepare_fixed_node_and_current_matt_package(self):
        repo = Path(__file__).resolve().parents[2]
        workflows = {
            'flutter-launcher-acceptance.yml': {'t07', 't02', 't05', 't06', 't08'},
            'flutter-settings-diagnostics.yml': {'startup'},
            'macos-app.yml': {'build'},
            'ci.yml': {'verify'},
        }
        for workflow, expected_jobs in workflows.items():
            jobs = re.split(r'^  ([\w-]+):\n', (repo / '.github/workflows' / workflow).read_text().split('\njobs:\n', 1)[1], flags=re.MULTILINE)
            checked_jobs = set()
            for job, body in zip(jobs[1::2], jobs[2::2]):
                steps = re.split(r'\n(?=      - )', body)
                for gate, step in enumerate(steps):
                    if 'bash check.sh' not in step and 'flutter test --no-pub' not in step and not re.search(r'^        run: npm test$', step, flags=re.MULTILINE):
                        continue
                    checked_jobs.add(job)
                    with self.subTest(workflow=workflow, job=job):
                        node = next((i for i, value in enumerate(steps[:gate]) if 'uses: actions/setup-node@' in value and 'node-version: 24.12.0' in value), None)
                        prep = next((i for i, value in enumerate(steps[:gate]) if 'npm ci --prefix matt-skills-panel-plugin --ignore-scripts' in value and 'npm run build --prefix matt-skills-panel-plugin' in value), None)
                        self.assertIsNotNone(node, 'Engineering checks require the fixed project Node version')
                        self.assertIsNotNone(prep, 'Clean-checkout engineering checks require the current maintained Matt package')
                        self.assertLess(node, prep)
                        self.assertLess(steps[prep].index('npm ci '), steps[prep].index('npm run build '))
                        if workflow == 'ci.yml':
                            ready = next((value for value in steps[:gate] if 'node scripts/harness-runtime.mjs ensure deepseek-harness' in value and 'node scripts/harness-runtime.mjs check deepseek-harness' in value), None)
                            self.assertIsNotNone(ready, 'The project test job must publish and verify the actual public Harness build stamp')
                            self.assertLess(ready.index('harness-runtime.mjs ensure '), ready.index('harness-runtime.mjs check '))
            self.assertEqual(checked_jobs, expected_jobs)



class ReleaseActorCollectorTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.runner = Path(self.temporary.name).resolve()
        self.root = self.runner / 'dsh-t05-t09-owned'
        self.root.mkdir(mode=0o700)
        self.evidence = self.runner / 'evidence'; self.evidence.mkdir()
        self.payloads = {
            'release-distribution-evidence.json': b'{"defaultReleaseDiscoveryPassed":false,"publicCloseActorExit":65}',
            'release-window-identity.json': b'{"known":false}',
            'public-close-actor.log': b'Original XCTest actor startup failure\n',
            'public-close-actor.xctestrun': b'<plist><string>exact rewritten runner context</string></plist>',
            'public-close-actor-ready': b'actual fixed ready marker',
            'public-close-request': b'actual fixed request marker',
            'public-close-ack': b'actual fixed acknowledgement marker',
            'public-close-driver-complete': b'actual fixed completion marker',
        }
        for name, data in self.payloads.items(): (self.root / name).write_bytes(data)
        self.result = self.root / 'public-close-actor.xcresult'; self.result.mkdir()
        (self.result / 'Data').mkdir()
        (self.result / 'Info.plist').write_bytes(b'exact original result metadata')
        (self.result / 'Data/data.0').write_bytes(b'\x00\x01original result payload')
        self.products = self.evidence / 'public-close-actor-build/Build/Products'
        self.products.mkdir(parents=True)
        (self.products / 'Actor.xctestrun').write_bytes(b'original build-for-testing input')
        (self.products / 'keep-compiled-binary').write_bytes(b'compiled bytes stay on disk')
        for name in ['public-close-actor-build.log', 'public-close-actor-build.exit', 'public-close-actor-build-metadata.json']:
            (self.evidence / name).write_bytes(b'original build evidence')
        self.log = self.evidence / 'release-distribution.log'
        self.log.write_text('T09_ROOT=' + str(self.root) + '\n')

    def collector(self):
        repo = Path(__file__).resolve().parents[2]
        workflow = (repo / '.github/workflows/flutter-launcher-acceptance.yml').read_text()
        section = workflow.split('      - name: Preserve exact owned tool evidence\n', 1)[1]
        source = section.split("          python3 - <<'PYTHON'\n", 1)[1].split('          PYTHON\n', 1)[0]
        from unittest.mock import patch
        with patch.dict(os.environ, EVIDENCE_DIR=str(self.evidence), RUNNER_TEMP=str(self.runner)):
            exec(compile(textwrap.dedent(source), '<actual T09 inline collector>', 'exec'), {})
        return workflow

    def test_actual_collector_retains_runtime_bytes_and_small_build_input_without_deleting_build(self):
        workflow = self.collector()
        for name, data in self.payloads.items(): self.assertEqual((self.evidence / name).read_bytes(), data)
        for name in ['Info.plist', 'Data/data.0']:
            self.assertEqual((self.evidence / self.result.name / name).read_bytes(), (self.result / name).read_bytes())
        self.assertEqual((self.evidence / 'public-close-actor-build.xctestrun').read_bytes(), b'original build-for-testing input')
        self.assertEqual((self.products / 'keep-compiled-binary').read_bytes(), b'compiled bytes stay on disk')
        upload = workflow.split('          name: flutter-launcher-T09-release-arm64\n', 1)[1]
        self.assertIn('path: |\n            ${{ env.EVIDENCE_DIR }}\n            !${{ env.EVIDENCE_DIR }}/public-close-actor-build/**', upload)
        self.assertFalse(json.loads((self.evidence / 'release-distribution-evidence.json').read_text())['defaultReleaseDiscoveryPassed'])

    def test_unknown_or_unowned_root_rejected_without_any_payload_copy(self):
        for case in ['ambiguous', 'wrong-prefix', 'public-mode', 'symlink-root']:
            with self.subTest(case=case):
                root = self.root
                if case == 'ambiguous': self.log.write_text(('T09_ROOT=' + str(root) + '\n') * 2)
                elif case == 'wrong-prefix':
                    root = self.runner / 'unowned'; root.mkdir(mode=0o700)
                elif case == 'public-mode': root.chmod(0o755)
                else:
                    root = self.runner / 'dsh-t05-t09-alias'; root.symlink_to(self.root)
                if case != 'ambiguous': self.log.write_text('T09_ROOT=' + str(root) + '\n')
                with self.assertRaises((AssertionError, RuntimeError, ValueError)): self.collector()
                for name in self.payloads: self.assertFalse((self.evidence / name).exists(), name)
                self.assertFalse((self.evidence / 'public-close-actor-build.xctestrun').exists())
                self.root.chmod(0o700)

    def test_invalid_descendant_rejected_before_any_partial_copy(self):
        outside = self.runner / 'outside'; outside.write_bytes(b'untouched outside bytes')
        invalid = self.result / 'Data/invalid'
        for case in ['file-symlink', 'directory-symlink', 'unknown-file-kind']:
            with self.subTest(case=case):
                if case == 'file-symlink': invalid.symlink_to(outside)
                elif case == 'directory-symlink': invalid.symlink_to(self.runner, target_is_directory=True)
                else: os.mkfifo(invalid)
                with self.assertRaises((AssertionError, RuntimeError, ValueError)): self.collector()
                for name in self.payloads: self.assertFalse((self.evidence / name).exists(), name)
                self.assertFalse((self.evidence / self.result.name).exists())
                self.assertFalse((self.evidence / 'public-close-actor-build.xctestrun').exists())
                self.assertEqual(outside.read_bytes(), b'untouched outside bytes')
                invalid.unlink()

if __name__ == '__main__':
    unittest.main()
