"""Exercise the release CLI using real local Git refs and fake external auth."""

import hashlib
import json
import os
import plistlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parent
REAL_GIT = shutil.which("git")


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dsh-workflow-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "workspace"
        self.remote = self.root / "origin.git"
        self.repo.mkdir()
        (self.repo / "scripts").mkdir()
        for name in ("release.sh", "release.py"):
            shutil.copy2(SOURCE / name, self.repo / "scripts" / name)
        self.git("init", "--bare", str(self.remote))
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Release Fixture")
        self.git("config", "user.email", "release@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "tag.gpgsign", "false")
        self.git("remote", "add", "origin", str(self.remote))
        launcher = self.repo / "macos-launcher"
        (launcher / "flutter").mkdir(parents=True)
        self.pubspec = launcher / "flutter/pubspec.yaml"
        harness = self.repo / "deepseek-harness"
        (harness / "apps/cli").mkdir(parents=True)
        (harness / "apps/cli/package.json").write_text(json.dumps({"name": "@deepseek-ai/dsh", "version": "0.2.1-alpha.2"}))
        self.git("-C", str(harness), "init", "-b", "master")
        self.git("-C", str(harness), "config", "user.name", "Release Fixture")
        self.git("-C", str(harness), "config", "user.email", "release@example.invalid")
        self.git("-C", str(harness), "config", "commit.gpgsign", "false")
        self.git("-C", str(harness), "add", ".")
        self.git("-C", str(harness), "commit", "-m", "upstream fixture")
        runtime = {"package": "@deepseek-ai/dsh", "version": "0.2.1-alpha.2", "commit": self.git("-C", str(harness), "rev-parse", "HEAD")}
        (self.repo / "dsh-runtime.json").write_text(json.dumps(runtime))
        plugins = json.dumps({"registry": "https://registry.npmjs.org/", "plugins": []})
        (self.repo / "project-plugins.json").write_text(plugins)
        (self.repo / "project-plugins.lock.json").write_text(json.dumps({"schema": 1, "registry": "https://registry.npmjs.org/", "harnessVersion": runtime["version"], "manifestSha256": hashlib.sha256(plugins.encode()).hexdigest(), "plugins": []}))
        self.version("0.2.4")
        self.git("add", ".")
        self.git("commit", "-m", "baseline")
        self.git("tag", "-a", "macos-v0.2.4", "-m", "baseline")
        self.git("push", "origin", "main", "macos-v0.2.4")
        self.version("0.2.5")
        self.git("add", "macos-launcher")
        self.git("commit", "-m", "manual version")
        self.git("push", "origin", "main")
        self.git("remote", "set-url", "origin", "https://github.com/Ghost233/DSH-Workflow.git")
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.wrapper("git", '''import os,sys,subprocess
a=sys.argv[1:]
while a[:1]==['-c']: a=a[2:]
if a==['credential','fill']:
 print('protocol=https\\nhost=github.com\\nusername=Ghost233\\npassword='+os.environ.get('FIXTURE_GIT_TOKEN','fixture-ghost'))
 sys.exit(0)
if a[:1] in (['ls-remote'],['push'],['fetch']):
 a=[os.environ['FIXTURE_REMOTE'] if x=='origin' else x for x in a]
 if a[:1]==['push'] and os.environ.get('FIXTURE_PUSH_FAIL')=='1':
  print('fixture tag push failure',file=sys.stderr);sys.exit(1)
sys.exit(subprocess.call([os.environ['FIXTURE_REAL_GIT']]+a))
''')
        self.wrapper("gh", '''import os,sys
if sys.argv[1:3]==['auth','switch']:sys.exit(0)
if sys.argv[1:2]==['api']:
 print('OtherAccount' if os.environ.get('GH_TOKEN')=='fixture-other' else 'Ghost233');sys.exit(0)
print('unexpected gh operation',file=sys.stderr);sys.exit(2)
''')
        self.env = os.environ.copy()
        self.env.pop("GH_TOKEN", None)
        self.env.pop("GITHUB_TOKEN", None)
        self.env.update(PATH=str(self.bin) + os.pathsep + self.env["PATH"],
                        FIXTURE_REMOTE=str(self.remote), FIXTURE_REAL_GIT=REAL_GIT,
                        GH_CONFIG_DIR=str(self.root / "gh"))

    def wrapper(self, name, source):
        path = self.bin / name
        path.write_text("#!/usr/bin/env python3\n" + source)
        path.chmod(0o755)

    def git(self, *args):
        return subprocess.run([REAL_GIT, *args], cwd=self.repo, check=True,
                              capture_output=True, text=True).stdout.strip()

    def version(self, value):
        self.pubspec.write_text(f"name: dsh_workflow_launcher\nversion: {value}+1\n")
        app = {"name": "dsh-workflow-macos-runtime", "version": value, "dependencies": {"@deepseek-ai/dsh": "0.2.1-alpha.2"}}
        (self.repo / "macos-launcher/package.json").write_text(json.dumps(app))
        (self.repo / "macos-launcher/package-lock.json").write_text(json.dumps({"name": app["name"], "version": value, "lockfileVersion": 3, "packages": {"": app, "node_modules/@deepseek-ai/dsh": {"version": "0.2.1-alpha.2"}}}))

    def cli(self, *args, extra_env=None):
        env = self.env.copy()
        env.update(extra_env or {})
        return subprocess.run(["bash", str(self.repo / "scripts/release.sh"), *args],
                              cwd=self.root, env=env, capture_output=True, text=True,
                              timeout=20)

    def snapshot(self):
        return (self.pubspec.read_bytes(), self.git("rev-parse", "HEAD"),
                self.git("show-ref"), self.git("status", "--porcelain"),
                self.git("ls-remote", str(self.remote)))

    def test_dry_run_is_read_only_and_uses_manual_version(self):
        before = self.snapshot()
        result = self.cli("--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("发布 tag：macos-v0.2.5", result.stdout)
        self.assertNotIn("下一版本", result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_publish_pushes_exact_tag_without_changing_main_or_pubspec(self):
        before = self.snapshot()[:2]
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("完成：macos-v0.2.5 已推送", result.stdout)
        self.assertEqual(self.snapshot()[:2], before)
        actual = self.git("ls-remote", str(self.remote), "refs/tags/macos-v0.2.5^{}")
        self.assertEqual(actual.split()[0], before[1])

    def test_push_failure_keeps_tag_for_exact_retry(self):
        result = self.cli(extra_env={"FIXTURE_PUSH_FAIL": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--retry-tag", result.stderr)
        head = self.git("rev-parse", "HEAD")
        self.assertEqual(self.git("rev-parse", "macos-v0.2.5^{commit}"), head)
        self.assertNotEqual(self.cli("--dry-run").returncode, 0)
        self.assertEqual(self.cli("--dry-run", "--retry-tag").returncode, 0)
        self.assertEqual(self.cli("--retry-tag").returncode, 0)

    def test_wrong_effective_account_and_git_credential_are_rejected(self):
        for env in ({"GH_TOKEN": "fixture-other"}, {"FIXTURE_GIT_TOKEN": "fixture-other"}):
            with self.subTest(env=env):
                before = self.snapshot()
                result = self.cli("--dry-run", extra_env=env)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Ghost233", result.stderr)
                self.assertNotIn("fixture-other", result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_dirty_feature_and_wrong_origin_are_rejected(self):
        (self.repo / "untracked.txt").write_text("preserve me")
        self.assertIn("不干净", self.cli("--dry-run").stderr)
        (self.repo / "untracked.txt").unlink()
        self.git("checkout", "-b", "feature")
        self.assertIn("main", self.cli("--dry-run").stderr)
        self.git("checkout", "main")
        self.git("remote", "set-url", "origin", "https://github.com/Ghost233/MacLauncher.git")
        self.assertIn("origin", self.cli("--dry-run").stderr)

    def test_existing_remote_tag_and_bad_manual_version_are_rejected(self):
        self.git("tag", "-a", "macos-v0.2.5", "-m", "existing")
        self.git("push", str(self.remote), "macos-v0.2.5")
        self.assertIn("已推送", self.cli("--dry-run").stderr)
        for value in ("0.2.5+1", "0.2.5-beta", "01.2.5"):
            self.version(value)
            self.assertIn("版本", self.cli("--dry-run").stderr)

    def test_main_ahead_of_actual_remote_is_rejected(self):
        (self.repo / "new.txt").write_text("unpublished")
        self.git("add", "new.txt")
        self.git("commit", "-m", "local only")
        self.assertIn("实际远端", self.cli("--dry-run").stderr)

    def test_retry_cannot_move_a_tag_and_minor_rollover_is_manual(self):
        self.git("tag", "-a", "macos-v0.2.5", "HEAD~1", "-m", "wrong target")
        self.assertIn("不移动", self.cli("--retry-tag").stderr)
        self.git("tag", "-d", "macos-v0.2.5")
        self.version("0.10.0")
        self.git("add", "macos-launcher")
        self.git("commit", "-m", "manual rollover")
        self.git("push", str(self.remote), "main")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        result = self.cli("--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("macos-v0.10.0", result.stdout)

    def test_version_bindings_reject_stale_inputs_and_preserve_files(self):
        paths = {
            'lock': self.repo / 'macos-launcher/package-lock.json',
            'runtime': self.repo / 'dsh-runtime.json',
            'plugins': self.repo / 'project-plugins.lock.json',
        }
        changes = {
            'lock': lambda value: value.update(version='0.2.4'),
            'runtime': lambda value: value.update(commit='0' * 40),
            'plugins': lambda value: value.update(manifestSha256='0' * 64),
        }
        for key, path in paths.items():
            with self.subTest(binding=key):
                before = path.read_bytes()
                value = json.loads(before)
                changes[key](value)
                path.write_text(json.dumps(value))
                changed = path.read_bytes()
                result = self.cli('--dry-run')
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(path.read_bytes(), changed)
                self.assertFalse(self.git('tag', '--list', 'macos-v0.2.5'))
                path.write_bytes(before)
        self.pubspec.write_text('version: 0.2.4+1\n')
        self.assertIn('Flutter', self.cli('--dry-run').stderr)

    def test_stale_tracking_ref_is_rejected(self):
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD~1')
        result = self.cli('--dry-run')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('缓存过期', result.stderr)
        self.assertFalse(self.git('tag', '--list', 'macos-v0.2.5'))

    def test_reserved_remote_version_is_not_reused(self):
        self.git('tag', '-a', 'macos-v0.2.9', '-m', 'reserved')
        self.git('push', str(self.remote), 'macos-v0.2.9')
        self.assertIn('版本必须高于', self.cli('--dry-run').stderr)

    def test_retry_rejects_lightweight_tag(self):
        self.git('tag', 'macos-v0.2.5')
        result = self.cli('--retry-tag')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('附注', result.stderr)

    def packaging_fixture(self):
        shutil.copy2(SOURCE / 'build-release.sh', self.repo / 'scripts/build-release.sh')
        app = self.root / 'DSH Workflow.app'
        (app / 'Contents/MacOS').mkdir(parents=True)
        (app / 'Contents/MacOS/DSH Workflow').write_bytes(b'fixture executable')
        with (app / 'Contents/Info.plist').open('wb') as file:
            plistlib.dump({'CFBundleIdentifier': 'com.ghostagent.dsh-workflow-launcher',
                          'CFBundleShortVersionString': '0.2.5'}, file)
        resources = app / 'Contents/Resources'
        (resources / 'node_modules/@deepseek-ai/dsh').mkdir(parents=True)
        (resources / 'node_modules/@deepseek-ai/dsh/package.json').write_text(json.dumps(
            {'name': '@deepseek-ai/dsh', 'version': '0.2.1-alpha.2'}))
        (resources / 'desktop/DeepSeek Harness.app').mkdir(parents=True)
        self.wrapper('lipo', "print('arm64')")
        self.wrapper('codesign', 'import os,sys;sys.exit(int(os.environ.get("FIXTURE_SIGN_FAIL","0")))')
        self.wrapper('ditto', 'import shutil,sys;shutil.copytree(sys.argv[1],sys.argv[2])')
        self.wrapper('hdiutil', '''import json,os,sys
from pathlib import Path
args=sys.argv[1:]
if args[0]=='create':
 Path(args[-1]).write_bytes(b'fixture DMG bytes')
 Path(os.environ['FIXTURE_HDI_LOG']).write_text(json.dumps(args))
elif args[0]=='verify':
 if os.environ.get('FIXTURE_VERIFY_FAIL')=='1':
  print('fixture DMG verification failure',file=sys.stderr);sys.exit(7)
else:sys.exit(2)
''')
        return app, self.root / 'package-output'

    def package_cli(self, app, output, extra_env=None):
        env = self.env.copy()
        env['FIXTURE_HDI_LOG'] = str(self.root / 'hdiutil.json')
        env.update(extra_env or {})
        return subprocess.run(['bash', str(self.repo / 'scripts/build-release.sh'),
                               '--app-path', str(app), '--output-dir', str(output)],
                              env=env, capture_output=True, text=True, timeout=15)

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS packaging CLI seam')
    def test_packaging_publishes_matching_manifest_and_checksums_without_overwrite(self):
        app, output = self.packaging_fixture()
        result = self.package_cli(app, output)
        self.assertEqual(result.returncode, 0, result.stderr)
        names = {'DSH-Workflow-macOS-0.2.5-arm64.dmg', 'manifest.json', 'SHA256SUMS'}
        self.assertEqual({path.name for path in output.iterdir()}, names)
        manifest = json.loads((output / 'manifest.json').read_text())
        self.assertEqual(manifest['tag'], 'macos-v0.2.5')
        self.assertEqual(manifest['sourceCommit'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(manifest['dshVersion'], '0.2.1-alpha.2')
        asset = manifest['assets'][0]
        self.assertEqual(asset['size'], (output / asset['name']).stat().st_size)
        self.assertEqual(asset['sha256'], hashlib.sha256((output / asset['name']).read_bytes()).hexdigest())
        for line in (output / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split(maxsplit=1)
            self.assertEqual(digest, hashlib.sha256((output / name).read_bytes()).hexdigest())
        before = {path.name: path.read_bytes() for path in output.iterdir()}
        self.assertNotEqual(self.package_cli(app, output).returncode, 0)
        self.assertEqual({path.name: path.read_bytes() for path in output.iterdir()}, before)

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS packaging CLI seam')
    def test_failed_dmg_verification_preserves_exit_and_publishes_no_assets(self):
        app, output = self.packaging_fixture()
        result = self.package_cli(app, output, {'FIXTURE_VERIFY_FAIL': '1'})
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertIn('fixture DMG verification failure', result.stderr)
        self.assertFalse(output.exists())
        args = json.loads((self.root / 'hdiutil.json').read_text())
        staging = Path(args[args.index('-srcfolder') + 1]).parent
        self.assertFalse(staging.exists())

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS packaging CLI seam')
    def test_cleanup_failure_does_not_replace_the_original_packaging_error(self):
        app, output = self.packaging_fixture()
        self.wrapper('rm', 'import sys;sys.exit(1)')
        result = self.package_cli(app, output, {'FIXTURE_VERIFY_FAIL': '1'})
        args = json.loads((self.root / 'hdiutil.json').read_text())
        staging = Path(args[args.index('-srcfolder') + 1]).parent
        self.addCleanup(shutil.rmtree, staging)
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertIn('fixture DMG verification failure', result.stderr)
        self.assertIn('清理临时目录失败', result.stderr)
        self.assertFalse(output.exists())

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS packaging CLI seam')
    def test_packaging_rejects_old_dsh_before_creating_assets(self):
        app, output = self.packaging_fixture()
        manifest = app / 'Contents/Resources/node_modules/@deepseek-ai/dsh/package.json'
        manifest.write_text(json.dumps({'name': '@deepseek-ai/dsh', 'version': '0.2.1-alpha.1'}))
        result = self.package_cli(app, output)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DSH 版本', result.stderr)
        self.assertFalse(output.exists())

    def release_job_cli(self, assets):
        workflow = (SOURCE.parent / '.github/workflows/macos-app.yml').read_text()
        parsed = subprocess.run(['/usr/bin/ruby', '-rpsych', '-rjson', '-e',
                                 'puts JSON.generate(Psych.safe_load(STDIN.read, aliases: true))'],
                                input=workflow, capture_output=True, text=True, check=True)
        steps = json.loads(parsed.stdout)['jobs']['release']['steps']
        shell = next(step['run'] for step in steps if step.get('name') == 'Publish GitHub Release')
        shutil.copytree(assets, self.repo / 'release-assets')
        self.wrapper('gh', '''import json,os,sys
from pathlib import Path
if sys.argv[1:3]!=['release','create']:sys.exit(2)
Path(os.environ['FIXTURE_RELEASE_LOG']).write_text(json.dumps(sys.argv[1:]))
''')
        env = self.env.copy()
        env.update(RELEASE_TAG='macos-v0.2.5', RELEASE_COMMIT=self.git('rev-parse', 'HEAD'),
                   FIXTURE_RELEASE_LOG=str(self.root / 'release-command.json'))
        return subprocess.run(['bash', '-c', shell], cwd=self.repo, env=env,
                              capture_output=True, text=True, timeout=15)

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS release job CLI seam')
    def test_release_job_creates_release_with_the_three_verified_assets(self):
        app, assets = self.packaging_fixture()
        result = self.package_cli(app, assets)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = self.release_job_cli(assets)
        self.assertEqual(result.returncode, 0, result.stderr)
        args = json.loads((self.root / 'release-command.json').read_text())
        self.assertEqual(args[:3], ['release', 'create', 'macos-v0.2.5'])
        self.assertEqual(args[3:6], ['release-assets/DSH-Workflow-macOS-0.2.5-arm64.dmg',
                                   'release-assets/manifest.json', 'release-assets/SHA256SUMS'])
        self.assertIn('--verify-tag', args)

    @unittest.skipUnless(os.uname().sysname == 'Darwin', 'macOS release job CLI seam')
    def test_release_job_rejects_inconsistent_manifest_even_with_valid_checksum_file(self):
        app, assets = self.packaging_fixture()
        result = self.package_cli(app, assets)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((assets / 'manifest.json').read_text())
        manifest['assets'][0]['sha256'] = '0' * 64
        (assets / 'manifest.json').write_text(json.dumps(manifest))
        checksum = '\n'.join(hashlib.sha256((assets / name).read_bytes()).hexdigest() + '  ' + name
                             for name in ['DSH-Workflow-macOS-0.2.5-arm64.dmg', 'manifest.json']) + '\n'
        (assets / 'SHA256SUMS').write_text(checksum)
        result = self.release_job_cli(assets)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'release-command.json').exists())

    @unittest.skipUnless(os.uname().sysname == "Darwin", "macOS package validation")
    def test_prebuilt_app_version_mismatch_fails_before_packaging(self):
        shutil.copy2(SOURCE / "build-release.sh", self.repo / "scripts/build-release.sh")
        app = self.root / "DSH Workflow.app"
        (app / "Contents/MacOS").mkdir(parents=True)
        (app / "Contents/MacOS/DSH Workflow").write_bytes(b"fixture executable")
        with (app / "Contents/Info.plist").open("wb") as file:
            plistlib.dump({"CFBundleIdentifier": "com.ghostagent.dsh-workflow-launcher",
                          "CFBundleShortVersionString": "0.2.4"}, file)
        out = self.root / "package-output"
        result = subprocess.run(["bash", str(self.repo / "scripts/build-release.sh"),
                                 "--app-path", str(app), "--output-dir", str(out)],
                                capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("应用版本不匹配", result.stderr)
        self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
