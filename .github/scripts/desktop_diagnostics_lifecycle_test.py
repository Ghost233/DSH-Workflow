import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'macos-launcher/flutter/tool/desktop_launch_diagnostics.swift'


class DesktopDiagnosticsLifecycleTest(unittest.TestCase):
    def test_actual_readiness_gate_precedes_the_one_normal_request(self):
        source = SOURCE.read_text()
        self.assertIn('func workspaceJournalReadiness(', source)
        self.assertIn('func requestReadyTermination(', source)
        main = source.split('    } else if let app = application', 1)[1]
        self.assertLess(main.index('workspaceJournalReadiness('), main.index('requestReadyTermination('))
        self.assertEqual(source.count('current?.terminate()'), 1)
        self.assertIn('let deadline = Date().addingTimeInterval(15)', source)
        self.assertNotIn('forceTerminate', source)

    def test_actual_foundation_readiness_and_request_gate_with_private_journals(self):
        source = SOURCE.read_text()
        self.assertIn('// BEGIN WORKSPACE READINESS', source)
        functions = source.split('// BEGIN WORKSPACE READINESS', 1)[1].split('// END WORKSPACE READINESS', 1)[0]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            harness = root / 'readiness.swift'
            harness.write_text('import Foundation\n' + functions + r'''
let directory = CommandLine.arguments[1]
let began = Date(timeIntervalSince1970: 1000)
let readiness = workspaceJournalReadiness(directory, pid: 424242, began: began)
var requests = 0
let owned = CommandLine.arguments.count == 2 || CommandLine.arguments[2] == "true"
let requested = requestReadyTermination(readiness, ownershipKnown: owned) { requests += 1; return true }
let output: [String: Any] = ["readiness": readiness, "requests": requests, "requested": requested]
print(String(decoding: try JSONSerialization.data(withJSONObject: output), as: UTF8.self))
''')
            binary = root / 'readiness'
            compile = subprocess.run(['swiftc', str(harness), '-o', str(binary)], capture_output=True, text=True)
            self.assertEqual(compile.returncode, 0, compile.stderr)
            for events, pid, state, requests in [(['started'], 424242, 'pending', 0), (['started', 'workspace-ready'], 424242, 'ready', 1), (['started', 'workspace-failed'], 424242, 'failed', 0), (['started', 'quit-requested', 'workspace-failed'], 424242, 'failed', 0), (['started', 'workspace-ready'], 999999, 'pending', 0)]:
                with self.subTest(events=events, pid=pid):
                    journal = root / 'journal.jsonl'
                    journal.write_text(''.join(json.dumps({'schemaVersion': 1, 'sequence': index, 'time': '1970-01-01T00:16:41.000Z', 'pid': pid, 'version': 'fixture-only', 'event': event}) + '\n' for index, event in enumerate(events)))
                    result = subprocess.run([str(binary), str(root)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    value = json.loads(result.stdout)
                    self.assertEqual(value['readiness']['state'], state)
                    self.assertEqual(value['requests'], requests)
                    self.assertEqual(value['requested'], requests == 1)
                    refused = subprocess.run([str(binary), str(root), 'false'], capture_output=True, text=True)
                    self.assertEqual(json.loads(refused.stdout)['requests'], 0)
                    if state == 'ready':
                        self.assertEqual(value['readiness']['pid'], 424242)
                        self.assertEqual(value['readiness']['source'], str(journal))
                        self.assertEqual(value['readiness']['event'], 'workspace-ready')


if __name__ == '__main__':
    unittest.main()
