import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


def parsed(text):
    result = subprocess.run(['/usr/bin/ruby', '-rpsych', '-rjson', '-e',
                             'puts JSON.generate(Psych.safe_load(STDIN.read, aliases: true))'],
                            input=text, text=True, capture_output=True)
    if result.returncode: raise ValueError('Could not parse workflow YAML')
    return json.loads(result.stdout)


class MacOSArm64CIContractTest(unittest.TestCase):
    def test_station_build_jobs_check_macOS_ARM64_before_building(self):
        root = Path(__file__).resolve().parents[2]
        workflows = [root / '.github/workflows' / name for name in ('macos-app.yml', 'macos-candidate.yml')]
        with tempfile.TemporaryDirectory() as directory:
            uname = Path(directory) / 'uname'
            uname.write_text('#!/bin/sh\ncase "$1" in -s) printf "%s\\n" "$FIXTURE_OS" ;; -m) printf "%s\\n" "$FIXTURE_ARCH" ;; *) exit 2 ;; esac\n')
            uname.chmod(0o755)
            for workflow in workflows:
                for name, job in parsed(workflow.read_text())['jobs'].items():
                    with self.subTest(workflow=workflow.name, job=name):
                        self.assertEqual(job['runs-on'], 'macos-15')
                        steps = job['steps']
                        check = next(i for i, step in enumerate(steps) if 'and ARM64 platform' in step.get('name', ''))
                        build = next(i for i, step in enumerate(steps) if 'scripts/build-local-release.sh' in step.get('run', ''))
                        self.assertLess(check, build)
                        command = steps[check]['run']
                        source = next(line for line in command.splitlines() if 'uname -s' in line and 'uname -m' in line)
                        for platform, arch, accepted in [('Darwin', 'arm64', True), ('Linux', 'aarch64', False), ('MINGW64_NT', 'x86_64', False), ('Darwin', 'x86_64', False)]:
                            environment = dict(os.environ, PATH=directory + ':' + os.environ['PATH'], FIXTURE_OS=platform, FIXTURE_ARCH=arch)
                            result = subprocess.run(['/bin/bash', '-e', '-c', source], env=environment, capture_output=True)
                            self.assertEqual(result.returncode == 0, accepted, (platform, arch, result.stderr))


if __name__ == '__main__':
    unittest.main()
