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

class _UnknownNative extends NativeBridge {
  _UnknownNative(this.root, this.resources);
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
    'unknown inspection preserves a canceled task and requires explicit confirmation before a real service restart',
    (tester) async {
      Directory? root;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceTaskFixture? task;
      Future<Map>? pending;
      Future<void>? pendingRestart;
      try {
        final prepared = await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp('dsh-service-unknown-');
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
          final disabled = await Process.run(node, [
            '--input-type=module',
            '-e',
            "import {readFileSync,writeFileSync} from 'node:fs'; const file=process.argv[1]; const rows=JSON.parse(readFileSync(file,'utf8')); rows.push({id:'schedule',disabled:true}); writeFileSync(file,JSON.stringify(rows));",
            '${root!.path}/home/profiles/desktop/cordis.patch.yml',
          ]);
          expect(
            disabled.exitCode,
            0,
            reason: '${disabled.stdout}${disabled.stderr}',
          );
          server = await LauncherServer.start(
            layout: EndpointLayout(directory: '${root!.path}/sdk'),
            bindings: InMemoryBindingLookup({'dsh-workflow'}),
          );
          model = LauncherController(
            _UnknownNative(root!.path, resources),
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
          final denied = await session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 15),
          );
          expect((denied['error'] as Map)['message'], contains('未知'));
          expect(await File('${root!.path}/model-canceled-1').exists(), false);
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
        expect(find.textContaining('任务状态未知'), findsWidgets);
        await tester.runAsync(() async {
          await tester.tap(find.text('取消'));
        });
        await tester.pump();
        final firstCanceled = await tester.runAsync(() async {
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
            'S04_UNKNOWN_CANCEL_TASK_FACTS=${jsonEncode({'instanceId': receipt['lease'], 'hostPid': receipt['pid'], 'sessionId': sessionId, 'resultFound': true, 'recordCount': (history['records'] as List).length})}',
          );
          await task!.acceptTask(
            'This actual task remains unknown to the disabled inventory service.',
          );
          await task!.waitForModelRequest(2);
          pendingRestart = model!.restartService();
          pendingRestart!.ignore();
          return true;
        });
        if (firstCanceled != true) return;
        await expectServiceStopConfirmation<void>(
          tester,
          () => pendingRestart!,
        );
        expect(find.textContaining('任务状态未知'), findsWidgets);
        await tester.runAsync(() async {
          await tester.tap(find.text('确认重启'));
        });
        await tester.pump();
        await tester.runAsync(() async {
          await pendingRestart!.timeout(const Duration(seconds: 15));
          expect(
            (await Process.run('/bin/kill', [
              '-0',
              '${receipt['pid']}',
            ])).exitCode,
            isNot(0),
          );
          expect(await File('${root!.path}/model-canceled-2').exists(), true);
          final current = jsonDecode(
            await File(
              '${root!.path}/global/.dsh-workflow/desktop/desktop-host.json',
            ).readAsString(),
          ) as Map;
          expect(current['lease'], isNot(receipt['lease']));
          expect(current['pid'], isNot(receipt['pid']));
          final status = await session.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          expect((status['result'] as Map)['instanceId'], current['lease']);
          expect((status['result'] as Map)['ready'], true);
          task!.close();
          task = ServiceTaskFixture(root!.path);
          await task!.connect(current);
          final history = await task!.waitForResult(sessionId, 1);
          expect(jsonEncode(history), contains('S04 persisted task result 1'));
          stdout.writeln(
            'S04_UNKNOWN_RESTART_FACTS=${jsonEncode({'oldLease': receipt['lease'], 'newLease': current['lease'], 'oldPidExited': true, 'heldModelCanceled': true, 'historyRetained': true})}',
          );
        });
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          task?.close();
          final settled = pending?.catchError((_) => <String, Object?>{});
          final restarted = pendingRestart?.catchError((_) {});
          await integration?.close();
          await settled;
          await restarted;
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
            stdout.writeln('S04_UNKNOWN_FIXTURE_DIRECTORY=${root!.path}');
          }
        });
      }
    },
    timeout: const Timeout(Duration(seconds: 100)),
    skip: artifact == null,
  );
}
