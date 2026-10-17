import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/service_task_fixture.dart';

class _StopNative extends NativeBridge {
  _StopNative(this.root, this.resources);
  final String root, resources;

  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
  });

  @override
  Future<bool> setEntryManaged(bool value) async => true;
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test(
    'official SDK safely stops an idle independent Host and starts a new instance of the same profile',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-service-stop-');
      final resources = '${root.path}/resources';
      final node = Process.runSync('/usr/bin/which', [
        'node',
      ]).stdout.toString().trim();
      final staged = await Process.run(node, [
        'tool/independent_service_resources.mjs',
        artifact!,
        resources,
      ]);
      expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
      final taskSetup = await Process.run(node, [
        'tool/service_task_resources.mjs',
        resources,
        root.path,
      ]);
      expect(
        taskSetup.exitCode,
        0,
        reason: '${taskSetup.stdout}${taskSetup.stderr}',
      );
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/sdk'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final model = LauncherController(
        _StopNative(root.path, resources),
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
      MacLauncherIntegration? integration;
      final task = ServiceTaskFixture(root.path);
      try {
        await model.initialize();
        integration = MacLauncherIntegration(
          model,
          socketPath: server.layout.socketPath,
        );
        ServerSession? session;
        for (var attempt = 0; attempt < 100 && session == null; attempt++) {
          session = server.sessionFor('dsh-workflow');
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        expect(session, isNotNull);
        final started = await session!.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(started['error'], isNull, reason: '$started');
        final receiptFile = File(
          '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
        );
        final before = jsonDecode(await receiptFile.readAsString()) as Map;
        await task.connect(before);
        final taskId = await task.acceptTask(
          'Complete the task before the idle service stop.',
        );
        await task.waitForModelRequest(1);
        await task.releaseModel(1);
        final completed = await task.waitForResult(taskId, 1);
        expect(jsonEncode(completed), contains('S04 persisted task result 1'));
        final stopped = await session.sendRequest(
          'recycle',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 25),
        );
        expect(
          stopped['error'],
          isNull,
          reason:
              'The formal SDK must support the declared DSH service stop: $stopped',
        );
        final status = await session.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        expect((status['result'] as Map)['state'], 'stopped');
        expect(await receiptFile.exists(), false);
        expect(
          (await Process.run('/bin/kill', ['-0', '${before['pid']}'])).exitCode,
          isNot(0),
        );
        final restarted = await session.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(restarted['error'], isNull, reason: '$restarted');
        final after = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(after['lease'], isNot(before['lease']));
        expect(after['pid'], isNot(before['pid']));
        final running = await session.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        expect((running['result'] as Map)['instanceId'], after['lease']);
        expect((running['result'] as Map)['ready'], true);
        await task.connect(after);
        final restored = await task.page(taskId);
        expect(jsonEncode(restored), contains('S04 persisted task result 1'));
        await File('${root.path}/restored-task-history.json')
            .writeAsString(jsonEncode(restored));
        stdout.writeln(
          'S04_IDLE_STOP_FACTS=${jsonEncode({
            'before': {'pid': before['pid'], 'lease': before['lease']},
            'after': {'pid': after['pid'], 'lease': after['lease']},
            'stopped': status['result'],
            'profile': '${root.path}/home/profiles/desktop',
            'taskId': taskId,
            'restoredResultFound': true,
            'recordCount': (restored['records'] as List).length,
          })}',
        );
      } finally {
        task.close();
        await integration?.close();
        await model.close();
        await server.close();
        // This is fixture disposal only; it is never evidence of product stop.
        final manager = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        if (await manager.exists()) {
          final pid =
              (jsonDecode(await manager.readAsString()) as Map)['pid'] as int;
          Process.killPid(pid, ProcessSignal.sigterm);
          for (
            var attempt = 0;
            attempt < 400 && await manager.exists();
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(await manager.exists(), false, reason: root.path);
        }
        stdout.writeln('S04_FIXTURE_DIRECTORY=${root.path}');
      }
    },
    timeout: const Timeout(Duration(seconds: 120)),
    skip: artifact == null
        ? 'Requires frozen packaged resources for real Host stop acceptance'
        : false,
  );
}
