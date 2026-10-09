import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from actor_validation_inputs import parsed


class MacOSArm64CIContractTest(unittest.TestCase):
    def test_native_diagnostics_prepares_the_locked_current_Matt_package_before_consumption(self):
        root = Path(__file__).resolve().parents[2]
        steps = parsed((root / '.github/workflows/flutter-launcher-diagnostics.yml').read_text())['jobs']['desktop-launch-loop']['steps']
        install = 'npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund'
        build = 'npm run build --prefix matt-skills-panel-plugin'
        preparations = [(index, step) for index, step in enumerate(steps) if install in step.get('run', '')]
        self.assertEqual(len(preparations), 1, 'The clean diagnostic executor must prepare the current maintained package')
        preparation_index, preparation = preparations[0]
        self.assertEqual(preparation['run'].strip().splitlines(), [install, build])
        self.assertNotIn('if', preparation)
        node = [(index, step) for index, step in enumerate(steps) if step.get('uses', '').startswith('actions/setup-node@')]
        self.assertEqual(len(node), 1)
        self.assertLess(node[0][0], preparation_index)
        self.assertEqual(str(node[0][1]['with']['node-version']), '24.12.0')
        for name in ['Mount and stage the unchanged runtime', 'Prepare the locked current Debug candidate once', 'Repeat the unmodified actual Launcher command with a read-only observer']:
            consumer = next(index for index, step in enumerate(steps) if step.get('name') == name)
            self.assertLess(preparation_index, consumer, name)

    def test_direct_diagnostics_stages_a_complete_current_project_layer_before_importing_the_subject(self):
        root = Path(__file__).resolve().parents[2]
        steps = parsed((root / '.github/workflows/flutter-launcher-diagnostics.yml').read_text())['jobs']['desktop-launch-loop']['steps']
        body = next(step['run'] for step in steps if step.get('name') == 'Mount and stage the unchanged runtime')
        stage = body[body.index('stage='):body.index('desktop="$resources/desktop/')]
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            resources = temporary / 'frozen-runtime-fixture'
            resources.mkdir()
            fixture = subprocess.run(['node', 'macos-launcher/project-resources.mjs', 'create', str(root), str(resources / 'workflow')],
                                     cwd=root, capture_output=True, text=True)
            self.assertEqual(fixture.returncode, 0, fixture.stderr)
            # The retained runtime may lack a newer project integration dependency.
            # The diagnostic subject must use the current sealed layer, not a partial overlay.
            (resources / 'workflow/scripts/dsh-launch-composition.mjs').unlink()
            environment = dict(os.environ, RUNNER_TEMP=str(temporary), GITHUB_ENV=str(temporary / 'github-env'))
            result = subprocess.run(['/bin/bash', '-e', '-c', 'resources="$1"\n' + stage, 'stage-fixture', str(resources)],
                                    cwd=root, env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            subject = temporary / 'dsh-native-stage/workflow/macos-launcher/runtime/desktop-profile.mjs'
            imported = subprocess.run(['node', '--input-type=module', '-e',
                                       'const mod = await import(process.argv[1]); if (typeof mod.prepareDesktopProfile !== "function") process.exit(2)',
                                       subject.as_uri()], cwd=root, env=environment, capture_output=True, text=True)
            self.assertEqual(imported.returncode, 0, imported.stderr)

    def test_every_project_job_checks_its_macOS_ARM64_runner_before_work(self):
        root = Path(__file__).resolve().parents[2]
        workflows = sorted((root / '.github/workflows').glob('*.yml'))
        self.assertTrue(workflows)
        with tempfile.TemporaryDirectory() as directory:
            uname = Path(directory) / 'uname'
            uname.write_text('#!/bin/sh\ncase "$1" in -s) printf "%s\\n" "$FIXTURE_OS" ;; -m) printf "%s\\n" "$FIXTURE_ARCH" ;; *) exit 2 ;; esac\n')
            uname.chmod(0o755)
            for workflow in workflows:
                for name, job in parsed(workflow.read_text())['jobs'].items():
                    with self.subTest(workflow=workflow.name, job=name):
                        self.assertEqual(job['runs-on'], 'macos-15')
                        first = job['steps'][0]
                        self.assertEqual(first['name'], 'Require macOS ARM64 runner')
                        for platform, arch, accepted in [('Darwin', 'arm64', True), ('Linux', 'aarch64', False), ('MINGW64_NT', 'x86_64', False), ('Darwin', 'x86_64', False)]:
                            environment = dict(os.environ, PATH=directory + ':' + os.environ['PATH'], FIXTURE_OS=platform, FIXTURE_ARCH=arch)
                            result = subprocess.run(['/bin/bash', '-e', '-c', first['run']], env=environment, capture_output=True)
                            self.assertEqual(result.returncode == 0, accepted, (platform, arch, result.stderr))
                        self.assertNotIn('prepare-ci-bubblewrap', '\n'.join(step.get('run', '') for step in job['steps']))


if __name__ == '__main__':
    unittest.main()
