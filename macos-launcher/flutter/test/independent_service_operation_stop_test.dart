import 'dart:async';
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

class _OperationNative extends NativeBridge {
  _OperationNative(this.root, this.resources);
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

Future<void> _expectStopConfirmation(
  WidgetTester tester,
  Future<Map> request,
) async {
  Map? response;
  Object? requestError;
  var completed = false;
  unawaited(
    request.then<void>(
      (value) {
        response = value;
        completed = true;
      },
      onError: (Object error) {
        requestError = error;
        completed = true;
      },
    ),
  );
  for (
    var attempt = 0;
    attempt < 100 && !completed && find.byType(AlertDialog).evaluate().isEmpty;
    attempt++
  ) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }
  expect(
    requestError,
    isNull,
    reason: 'Actual SDK stop request failed before confirmation.',
  );
  expect(
    completed,
    false,
    reason: 'Actual SDK stop returned before confirmation: $response',
  );
  expect(
    find.byType(AlertDialog),
    findsOneWidget,
    reason: 'A real SDK stop must wait for explicit user confirmation of the actual running task.',
  );
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  testWidgets(
    'stale operation and stale instance confirmations cannot stop the current real service',
    (tester) async {
      Directory? root;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceTaskFixture? task;
      Future<Map>? pending;
      LauncherServer? secondServer;
      LauncherController? secondModel;
      MacLauncherIntegration? secondIntegration;
      ServerSession? other;
      try {
        final prepared = await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp(
            'dsh-service-operation-',
          );
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
            _OperationNative(root!.path, resources),
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
          secondServer = await LauncherServer.start(
            layout: EndpointLayout(directory: '${root!.path}/sdk-other'),
            bindings: InMemoryBindingLookup({'dsh-workflow'}),
          );
          secondModel = LauncherController(
            _OperationNative(root!.path, resources),
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
          await secondModel!.initialize();
          secondIntegration = MacLauncherIntegration(
            secondModel!,
            socketPath: secondServer!.layout.socketPath,
          );
          for (var attempt = 0; attempt < 100 && other == null; attempt++) {
            other = secondServer!.sessionFor('dsh-workflow');
            await Future<void>.delayed(const Duration(milliseconds: 30));
          }
          expect(other, isNotNull);
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
        await tester.runAsync(() async {
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
        });
        await _expectStopConfirmation(tester, pending!);
        expect(find.textContaining(sessionId), findsWidgets);
        await tester.runAsync(() async {
          final unconfirmed = await other!.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 15),
          );
          expect((unconfirmed['error'] as Map)['message'], contains('确认'));
          await tester.tap(find.text('确认停止'));
        });
        await tester.pump();
        final firstPhase = await tester.runAsync(() async {
          final expired = await pending!;
          expect((expired['error'] as Map)['message'], contains('过期'));
          final status = await other!.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          expect((status['result'] as Map)['instanceId'], receipt['lease']);
          expect((status['result'] as Map)['ready'], true);
          expect(await File('${root!.path}/model-canceled-1').exists(), false);
          await task!.releaseModel(1);
          await task!.waitForResult(sessionId, 1);
          final nextId = await task!.acceptTask(
            'Hold this second task while the old instance confirmation expires.',
          );
          await task!.waitForModelRequest(2);
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
          return nextId;
        });
        if (firstPhase == null) return;
        await _expectStopConfirmation(tester, pending!);
        final replaced = await tester.runAsync(() async {
          // Owned fault setup only: this is never counted as a normal product stop.
          Process.killPid(receipt['pid'] as int, ProcessSignal.sigkill);
          var failed = false;
          for (var attempt = 0; attempt < 100 && !failed; attempt++) {
            final status = await other!.sendRequest(
              'status',
              serviceId: 'desktop',
              timeout: const Duration(seconds: 5),
            );
            failed = (status['result'] as Map)['state'] == 'failed';
            if (!failed) {
              await Future<void>.delayed(const Duration(milliseconds: 50));
            }
          }
          expect(failed, true);
          final start = await other!.sendRequest(
            'start',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 45),
          );
          expect(start['error'], isNull, reason: '$start');
          final current = jsonDecode(
            await File(
              '${root!.path}/global/.dsh-workflow/desktop/desktop-host.json',
            ).readAsString(),
          ) as Map;
          expect(current['lease'], isNot(receipt['lease']));
          await tester.tap(find.text('确认停止'));
          return current;
        });
        if (replaced == null) return;
        await tester.pump();
        await tester.runAsync(() async {
          final expired = await pending!;
          expect((expired['error'] as Map)['message'], contains('过期'));
          final status = await other!.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          expect((status['result'] as Map)['instanceId'], replaced['lease']);
          expect((status['result'] as Map)['ready'], true);
          expect(
            (await Process.run('/bin/kill', [
              '-0',
              '${replaced['pid']}',
            ])).exitCode,
            0,
          );
          stdout.writeln(
            'S04_OPERATION_FACTS=${jsonEncode({'oldLease': receipt['lease'], 'newLease': replaced['lease'], 'sameLeaseOldOperationRejected': true, 'oldLeaseConfirmationRejected': true, 'newHostStillReady': true})}',
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
          await secondIntegration?.close();
          await secondModel?.close();
          await secondServer?.close();
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
            stdout.writeln('S04_OPERATION_FIXTURE_DIRECTORY=${root!.path}');
          }
        });
      }
    },
    timeout: const Timeout(Duration(seconds: 120)),
    skip: artifact == null,
  );
}
