import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('diagnostics', Path(__file__).with_name('collect_probe_diagnostics.py'))
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class OwnedDiagnosticsTest(unittest.TestCase):
    def test_independent_inputs_refuse_parent_and_file_symlinks_without_exporting_external_sentinel(self):
        for kind in ('receipt-parent', 'diagnostic-file', 'receipt-file'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                base = Path(temporary).resolve()
                root, target, outside = base / 'probe', base / 'evidence', base / 'external'
                (root / 'data').mkdir(parents=True); outside.mkdir()
                sentinel = 'EXTERNAL_SENTINEL_MUST_NOT_EXPORT'
                external = outside / 'sentinel.json'
                external.write_text(json.dumps({'canary': sentinel}))
                diagnostic = root / 'data/desktop-diagnostic.json'
                receipt = root / 'data/global/.dsh-workflow/desktop/desktop-host.json'
                if kind == 'receipt-parent':
                    (outside / '.dsh-workflow/desktop').mkdir(parents=True)
                    (outside / '.dsh-workflow/desktop/desktop-host.json').write_text(external.read_text())
                    (root / 'data/global').symlink_to(outside)
                    diagnostic.write_text('owned-good-marker token=private-value')
                else:
                    receipt.parent.mkdir(parents=True)
                    if kind == 'diagnostic-file':
                        diagnostic.symlink_to(external)
                        receipt.write_text(json.dumps({'marker': 'owned-good-marker', 'token': 'private-value'}))
                    else:
                        receipt.symlink_to(external)
                        diagnostic.write_text('owned-good-marker token=private-value')
                self.assertEqual(diagnostics.collect(root, target), [])
                exported = '\n'.join(file.read_text() for file in target.iterdir())
                self.assertNotIn(sentinel, exported)
                self.assertNotIn('private-value', exported)
                self.assertIn('owned-good-marker', exported)
                observations = json.loads((target / 'independent-input-observations.json').read_text())
                self.assertTrue(any(row['state'] == 'unknown' for row in observations))

    def test_only_owned_process_report_is_exported_and_credentials_are_redacted(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root, target, reports = base / 'probe', base / 'evidence', base / 'reports'
            (root / 'data').mkdir(parents=True)
            reports.mkdir()
            executable = str(root / 'candidate.app/Contents/MacOS/DSH Workflow')
            (root / 'probe-process.json').write_text(json.dumps({
                'pid': 12345, 'executable': executable, 'startedAt': '2020-01-01T00:00:00+00:00'}))
            (root / 'data/desktop-diagnostic.json').write_text('host-failed stack token=abcdef isolated-web-probe-password')
            (root / 'data/global/.dsh-workflow/desktop').mkdir(parents=True)
            (root / 'data/global/.dsh-workflow/desktop/desktop-host.json').write_text(json.dumps({
                'pid': 54321, 'lease': 'actual-lease', 'url': 'http://127.0.0.1:1234/?token=do-not-export'}))
            owned = {'pid': 12345, 'procPath': executable, 'exception': {'signal': 'SIGSEGV'},
                     'applicationSpecificInformation': 'isolated-settings-changed-password'}
            (reports / 'DSH Workflow-owned.ips').write_text('{}\n' + json.dumps(owned))
            (reports / 'DSH Workflow-other.ips').write_text(json.dumps({**owned, 'pid': 99999}))
            result = diagnostics.collect(root, target, [reports])
            self.assertEqual([row['file'] for row in result], ['DSH Workflow-owned.ips'])
            self.assertFalse((target / 'DSH Workflow-other.ips').exists())
            scan = json.loads((target / 'crash-report-scan.json').read_text())
            self.assertEqual(len(scan), 2)
            self.assertEqual([row['file'] for row in scan if row['owned']], ['DSH Workflow-owned.ips'])
            exported = '\n'.join(file.read_text() for file in target.iterdir())
            self.assertNotIn('do-not-export', exported)
            self.assertNotIn('abcdef', exported)
            self.assertNotIn('isolated-web-probe-password', exported)
            self.assertNotIn('isolated-settings-changed-password', exported)
            self.assertIn('SIGSEGV', exported)
            self.assertIn('host-failed', exported)


if __name__ == '__main__':
    unittest.main()
