import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/service_admission_fixture.dart';
import 'independent_service_test.dart' show ServiceNative;

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test(
    'official SDK attempts available pinned startup packages and continues after an owned optional failure',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'dsh-startup-available-',
      );
      final resources = '${root.path}/resources';
      final node = Platform.environment['DSH_TEST_NODE24']!;
      LauncherServer? server;
      LauncherController? model;
      MacLauncherIntegration? integration;
      final task = ServiceAdmissionFixture(root.path);
      try {
        for (final args in [
          ['tool/independent_service_resources.mjs', artifact!, resources],
          ['tool/startup_plugin_fixture.mjs', resources, root.path],
        ]) {
          final staged = await Process.run(node, args);
          expect(
            staged.exitCode,
            0,
            reason: '${staged.stdout}${staged.stderr}',
          );
        }
        server = await LauncherServer.start(
          layout: EndpointLayout(directory: '${root.path}/sdk'),
          bindings: InMemoryBindingLookup({'dsh-workflow'}),
        );
        model = LauncherController(
          ServiceNative(root.path, resources),
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
        await model.initialize();
        integration = MacLauncherIntegration(
          model,
          socketPath: server.layout.socketPath,
        );
        ServerSession? session;
        for (var attempt = 0; attempt < 100; attempt++) {
          session = server.sessionFor('dsh-workflow');
          if (session != null) break;
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        expect(session, isNotNull);
        final started = await session!.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(started['error'], isNull, reason: '$started');
        final connection = await task.managedConnection(resources);
        await task.connect(connection);
        final inventory = await task.rpc('workflowDelivery/list', {}) as Map;
        final rows = (inventory['rows'] as List).cast<Map>();
        expect(
          rows.any(
            (row) =>
                row['package'] == 's08-owned-startup-good' &&
                row['current'] == '1.0.0' &&
                row['fiberPhase'] == 'active',
          ),
          true,
          reason: 'An available exact-pinned package must actually run in this Host; a skipped report is insufficient',
        );
        expect(await File('${root.path}/startup-good-applied').exists(), true);
        expect(
          await File(
            '${root.path}/home/profiles/desktop/node_modules/@deepseek-ai/dsh-app-boot/package.json',
          ).exists(),
          false,
          reason: 'The public peer belongs to Host resolution, not the profile local node_modules',
        );
        expect(
          await File('${root.path}/startup-good-applied').readAsString(),
          contains('with public peer'),
        );
        final logs = await session.sendRequest(
          'logs',
          serviceId: 'desktop',
          params: {'limit': 500},
          timeout: const Duration(seconds: 5),
        );
        final results = ((logs['result'] as Map)['entries'] as List)
            .cast<Map>()
            .map((row) => row['text'] as String)
            .where((text) => text.startsWith('项目启动插件：'))
            .map((text) => jsonDecode(text.substring('项目启动插件：'.length)) as Map)
            .toList();
        expect(
          results.singleWhere(
            (row) => row['package'] == 's08-owned-startup-good',
          )['state'],
          'loaded',
        );
        expect(
          results.singleWhere(
            (row) => row['package'] == 's08-owned-startup-fails',
          )['state'],
          'skipped',
        );
        expect(
          results.singleWhere(
            (row) => row['package'] == 's08-owned-startup-fails',
          )['reason'],
          contains('失败'),
        );
        expect(results.length, 6);
        final stopped = await session.sendRequest(
          'recycle',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 20),
        );
        expect(stopped['error'], isNull, reason: '$stopped');
        final patchFile = File(
          '${root.path}/home/profiles/desktop/cordis.patch.yml',
        );
        final patches = jsonDecode(await patchFile.readAsString()) as List;
        patches.add({
          'id': 'project-startup-s08-owned-startup-good',
          'disabled': true,
          'config': {'savedSetting': 'S08-user-choice'},
        });
        await patchFile.writeAsString(jsonEncode(patches));
        await File('${root.path}/startup-good-applied').delete();
        final restarted = await session.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(restarted['error'], isNull, reason: '$restarted');
        final nextConnection = await task.managedConnection(resources);
        expect(nextConnection['instanceId'], isNot(connection['instanceId']));
        await task.connect(nextConnection);
        final after = await task.rpc('workflowDelivery/list', {}) as Map;
        final disabled = (after['rows'] as List).cast<Map>().singleWhere(
          (row) => row['moduleName'] == 's08-owned-startup-good',
        );
        expect(disabled['enabled'], false);
        expect(disabled['fiberPhase'], isNot('active'));
        expect(
          await File('${root.path}/startup-good-applied').exists(),
          false,
          reason: 'Same-profile preparation must keep the saved user-disabled patch',
        );
        expect(jsonDecode(await patchFile.readAsString()), patches);
        stdout.writeln(
          'S08_AVAILABLE_STARTUP_FACTS=${jsonEncode({'pid': connection['pid'], 'instanceId': connection['instanceId'], 'goodActuallyApplied': true, 'results': results})}',
        );
      } finally {
        task.close();
        await task.closeTerminal();
        await integration?.close();
        await model?.close();
        await server?.close();
        final manager = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        if (await manager.exists()) {
          final managerPid =
              (jsonDecode(await manager.readAsString()) as Map)['pid'] as int;
          Process.killPid(managerPid, ProcessSignal.sigterm);
          for (
            var attempt = 0;
            attempt < 300 && await manager.exists();
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(
            await manager.exists(),
            false,
            reason: 'Owned manager and Host must settle before profile cleanup',
          );
        }
        await root.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(seconds: 75)),
    skip: artifact == null
        ? 'Requires final packaged resources; a skip is not startup acceptance'
        : false,
  );
}
