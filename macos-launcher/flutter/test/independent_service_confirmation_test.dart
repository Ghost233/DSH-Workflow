import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/service_task_fixture.dart';
import 'service_stop_confirmation.dart';

class _TaskNative extends NativeBridge {
  _TaskNative(this.root, this.resources);
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
  @override
  Future<void> showWindow() async {}
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  testWidgets(
    'official SDK stop shows real unfinished work and cancel preserves its instance and task result',
    (tester) async {
      Directory? root;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceTaskFixture? task;
      Future<Map>? pending;
      try {
        final prepared = await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp('dsh-service-confirm-');
          final resources = '${root!.path}/resources';
          final node = Process.runSync('/usr/bin/which', [
            'node',
          ]).stdout.toString().trim();
          for (final args in [
            ['tool/independent_service_resources.mjs', artifact!, resources],
            ['tool/service_task_resources.mjs', resources, root!.path],
          ]) {
            final staged = await Process.run(node, args);
            expect(
              staged.exitCode,
              0,
              reason: '${staged.stdout}${staged.stderr}',
            );
          }
          server = await LauncherServer.start(
            layout: EndpointLayout(directory: '${root!.path}/sdk'),
            bindings: InMemoryBindingLookup({'dsh-workflow'}),
          );
          model = LauncherController(
            _TaskNative(root!.path, resources),
            startProcess:
                (executable, arguments, {workingDirectory, environment}) =>
                    Process.start(
                      executable,
                      arguments,
                      workingDirectory: workingDirectory,
                      environment: {
                        ...?environment,
                        'HOME': '${root!.path}/os-home',
                        'ZDOTDIR': '${root!.path}/os-home',
                        'TMPDIR': root!.path,
                      },
                    ),
          );
          await model!.initialize();
          integration = MacLauncherIntegration(
            model!,
            socketPath: server!.layout.socketPath,
          );
          for (
            var attempt = 0;
            attempt < 100 && server!.sessionFor('dsh-workflow') == null;
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 30));
          }
          final session = server!.sessionFor('dsh-workflow')!;
          final started = await session.sendRequest(
            'start',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 45),
          );
          expect(started['error'], isNull, reason: '$started');
          final receipt = jsonDecode(
            await File(
              '${root!.path}/global/.dsh-workflow/desktop/desktop-host.json',
            ).readAsString(),
          ) as Map;
          task = ServiceTaskFixture(root!.path);
          await task!.connect(receipt);
          stdout.writeln('S04_TASK_AUTH_HTTP=${task!.authenticationStatus}');
          final sessionId = await task!.acceptTask(
            'Keep this accepted task running while the user decides whether to stop.',
          );
          await task!.waitForModelRequest(1);
          return (session, receipt, sessionId);
        });
        if (prepared == null) {
          return; // runAsync has already reported the original setup failure.
        }
        final (session, receipt, sessionId) = prepared;
        await tester.pumpWidget(LauncherApp(controller: model!));
        await expectServiceStopConfirmation(tester, () {
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
          return pending!;
        });
        expect(find.textContaining(sessionId), findsWidgets);
        await tester.runAsync(() async {
          await tester.tap(find.text('取消'));
        });
        await tester.pump();
        await tester.runAsync(() async {
          final canceled = await pending!;
          expect((canceled['error'] as Map)['message'], contains('取消'));
          final status = await session.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          expect((status['result'] as Map)['instanceId'], receipt['lease']);
          expect((status['result'] as Map)['ready'], true);
          expect(await File('${root!.path}/model-canceled-1').exists(), false);
          await task!.releaseModel(1);
          final history = await task!.waitForResult(sessionId, 1);
          expect(jsonEncode(history), contains('S04 persisted task result 1'));
          await File('${root!.path}/cancel-task-history.json')
              .writeAsString(jsonEncode(history));
          stdout.writeln(
            'S04_CANCEL_TASK_FACTS=${jsonEncode({'instanceId': receipt['lease'], 'hostPid': receipt['pid'], 'sessionId': sessionId, 'resultFound': true, 'recordCount': (history['records'] as List).length})}',
          );
        });
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          task?.close();
          final settled = pending?.catchError((_) => <String, Object?>{});
          await integration?.close();
          await settled;
          await model?.close();
          await server?.close();
          if (root != null) {
            final manager = File(
              '${root!.path}/global/.dsh-workflow/service/manager.json',
            );
            if (await manager.exists()) {
              final pid =
                  (jsonDecode(await manager.readAsString()) as Map)['pid']
                      as int;
              Process.killPid(pid, ProcessSignal.sigterm);
              for (
                var attempt = 0;
                attempt < 400 && await manager.exists();
                attempt++
              ) {
                await Future<void>.delayed(const Duration(milliseconds: 50));
              }
              expect(await manager.exists(), false, reason: root!.path);
            }
            stdout.writeln('S04_CONFIRM_FIXTURE_DIRECTORY=${root!.path}');
          }
        });
      }
    },
    timeout: const Timeout(Duration(seconds: 100)),
    skip: artifact == null,
  );
}
