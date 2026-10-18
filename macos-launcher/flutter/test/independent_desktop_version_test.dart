import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import 'independent_desktop_test.dart' show DesktopNative;

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test(
    'opening an incompatible desktop reports the mismatch and preserves the real Host',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'dsh-desktop-version-',
      );
      final resources = '${root.path}/resources';
      final staged = await Process.run(
        Platform.environment['DSH_TEST_NODE'] ?? 'node',
        ['tool/independent_service_resources.mjs', artifact!, resources],
      );
      expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
      await Directory('${root.path}/os-home').create();
      final native = DesktopNative(root.path, resources);
      final model = LauncherController(
        native,
        startProcess:
            (executable, arguments, {workingDirectory, environment}) =>
                Process.start(
                  executable,
                  arguments,
                  workingDirectory: workingDirectory,
                  environment: {
                    ...?environment,
                    'HOME': '${root.path}/os-home',
                    'ZDOTDIR': '${root.path}/os-home',
                    'TMPDIR': root.path,
                  },
                ),
      );
      final manager = File(
        '${root.path}/global/.dsh-workflow/service/manager.json',
      );
      try {
        await model.initialize();
        await model.startService();
        final before = await model.serviceStatus();
        expect(
          before.ready,
          true,
          reason: 'This case requires the real independent Host',
        );
        final receiptFile = File(
          '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
        );
        final receipt = jsonDecode(await receiptFile.readAsString()) as Map;
        final runtimeFile = File('$resources/workflow/dsh-runtime.json');
        final runtime = jsonDecode(await runtimeFile.readAsString()) as Map;
        runtime['version'] = '0.2.1-alpha.999';
        await runtimeFile.writeAsString(jsonEncode(runtime));
        await expectLater(
          model.startDesktop(),
          throwsA(
            isA<StateError>().having(
              (failure) => failure.message,
              'explicit incompatibility',
              contains('版本不兼容'),
            ),
          ),
        );
        expect(native.opens, 0);
        final after = await model.serviceStatus();
        expect(after.ready, true);
        expect(after.instanceId, before.instanceId);
        final current = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(current['pid'], receipt['pid']);
        expect(current['lease'], receipt['lease']);
        expect(
          (await Process.run('/bin/kill', [
            '-0',
            '${receipt['pid']}',
          ])).exitCode,
          0,
        );
        stdout.writeln(
          'S02_INCOMPATIBLE_HOST_FACTS=${jsonEncode({'pid': receipt['pid'], 'instanceId': receipt['lease'], 'desktopOpens': native.opens})}',
        );
      } finally {
        await model.close();
        model.dispose();
        if (await manager.exists()) {
          Process.killPid(
            (jsonDecode(await manager.readAsString()) as Map)['pid'] as int,
            ProcessSignal.sigterm,
          );
          for (
            var attempt = 0;
            attempt < 400 && await manager.exists();
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(
            await manager.exists(),
            false,
            reason: 'Owned manager cleanup must finish',
          );
        }
        await root.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(seconds: 90)),
    skip: artifact == null ? 'Requires frozen packaged resources' : false,
  );
}
