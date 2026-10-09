import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from actor_validation_inputs import parsed


class MacOSArm64CIContractTest(unittest.TestCase):
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
