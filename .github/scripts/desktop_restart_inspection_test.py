import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def actual_inspection_script():
    text = (ROOT / 'macos-launcher/flutter/tool/probe_diagnostics.dart').read_text()
    return re.search(r"const desktopKernelInspectionScript = r\'\'\'(.*?)\'\'\';", text, re.S).group(1)


def actual_restart_callers():
    text = (ROOT / 'macos-launcher/flutter/tool/desktop_window_application_scenario.dart').read_text()
    calls = re.findall(r"desktopKernelInspectionScript,\s*(.*?)\n\s*\]\)", text, re.S)
    return [[line.strip().rstrip(',') for line in call.splitlines() if line.strip()] for call in calls]


class DesktopRestartInspectionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.trace = self.directory / 'fixture-trace.jsonl'
        self.module = self.directory / 'cycle-fixture.py'
        self.root = self.directory / 'dsh-t05-saved'
        self.module.write_text("import json\nfrom pathlib import Path\ntrace=Path(" + repr(str(self.trace)) + ")\n" +
            "def record(value):\n    with trace.open('a') as output: output.write(json.dumps(value)+'\\n')\n" +
            "def observation_runner(*,headless):\n    record({'event':'runner','headless':headless}); return 'owned-fixture-runner'\n" +
            "def validate_observation_root(root,runner,*,headless):\n    record({'event':'validate','root':root,'runner':runner,'headless':headless})\n" +
            "def inspect_host(pid):\n    record({'event':'inspect','pid':pid}); return {'lookupOk':True,'pid':pid,'fixtureOnly':True}\n")

    def arguments(self, tokens):
        values = {'cyclePath': str(self.module), 'root.path': str(self.root), "'$target'": '424242', "'$desktopPid'": '424243', "'false'": 'false'}
        return [values[token] for token in tokens]

    def run_script(self, arguments):
        return subprocess.run([sys.executable, '-c', actual_inspection_script(), *arguments], capture_output=True, text=True)

    def test_both_actual_restart_callers_dispatch_explicit_desktop_inspection(self):
        calls = actual_restart_callers()
        self.assertEqual(len(calls), 2)
        for tokens in calls:
            with self.subTest(caller=tokens):
                self.trace.unlink(missing_ok=True)
                result = self.run_script(self.arguments(tokens))
                self.assertEqual(result.returncode, 0, result.stderr)
                events = [json.loads(line) for line in self.trace.read_text().splitlines()]
                self.assertEqual(events, [{'event': 'runner', 'headless': False}, {'event': 'validate', 'root': str(self.root), 'runner': 'owned-fixture-runner', 'headless': False}, {'event': 'inspect', 'pid': int(self.arguments(tokens)[2])}])
                self.assertEqual(json.loads(result.stdout)['pid'], int(self.arguments(tokens)[2]))

    def test_three_arguments_fail_before_any_root_or_process_inspection(self):
        result = self.run_script(self.arguments(actual_restart_callers()[0][:3]))
        self.assertEqual(result.returncode, 1)
        self.assertIn('ValueError: not enough values to unpack (expected 4, got 3)', result.stderr)
        self.assertFalse(self.trace.exists())


if __name__ == '__main__':
    unittest.main()
