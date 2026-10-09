import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class DesktopWindowFixtureTest(unittest.TestCase):
    def test_visible_preference_owns_a_private_desktop_without_setting_sdk_cold_mode(self):
        root = Path(__file__).resolve().parents[2]
        flutter = root / 'macos-launcher/flutter'
        source = (flutter / 'tool/application_probe.dart').read_text()
        start = source.index("  final webPort = await webScenario?.stage(root);")
        end = source.index("  settingsPhase('resources-stage-end');", start)
        stage = source[start:end]
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory).resolve()
            resources = temporary / 'readonly-runtime-fixture'
            desktop = resources / 'desktop/DeepSeek Harness.app/Contents/MacOS'
            desktop.mkdir(parents=True)
            binary = desktop / 'DeepSeek Harness'
            binary.write_bytes(b'private staging fixture; never execute')
            binary.chmod(0o755)
            node = subprocess.check_output(['node', '-p', 'process.execPath'], text=True).strip()
            (resources / 'node').symlink_to(node)
            fixture = temporary / 'private-root'; fixture.mkdir(mode=0o700)
            script = temporary / 'stage.dart'
            web_module = (flutter / 'tool/web_application_scenario.dart').as_uri()
            script.write_text("import 'dart:io';\nimport '" + web_module + "';\n"
                              "void require(bool value, String reason) { if (!value) throw StateError(reason); }\n"
                              "Future<void> main(List<String> args) async {\n"
                              "final root=Directory(args[0]); final webScenario=WebProbeOptions(args[1], 'desktop', 0);\n"
                              "const externalSdkCold=false, desktopWindowScenario=true; String? localAcceptanceRoot;\n"
                              + stage +
                              "require(!await FileSystemEntity.isLink(root.path+'/missing-runtime/desktop'), 'window observer requires an owned canonical bundle, not the frozen symlink');\n"
                              "require(await Directory(root.path+'/missing-runtime/desktop/DeepSeek Harness.app').resolveSymbolicLinks()==root.path+'/missing-runtime/desktop/DeepSeek Harness.app', 'window observer canonical bundle guard');\n"
                              "}\n")
            result = subprocess.run(['dart', '--packages=' + str(flutter / '.dart_tool/package_config.json'),
                                     str(script), str(fixture), str(resources)], cwd=flutter,
                                    env=dict(os.environ), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(binary.read_bytes(), b'private staging fixture; never execute')


if __name__ == '__main__':
    unittest.main()
