import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/service_admission_fixture.dart';

class _AdmissionNative extends NativeBridge {
  _AdmissionNative(this.root, this.resources);
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
    'stop confirmation holds new HTTP work and established terminal input across heartbeats, then cancel resumes the same stream',
    (tester) async {
      Directory? root;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceAdmissionFixture? task;
      Future<Map>? pending;
      try {
        final prepared = await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp(
            'dsh-service-admission-',
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
            _AdmissionNative(root!.path, resources),
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
          task = ServiceAdmissionFixture(root!.path);
          final connection = await task!.managedConnection(resources);
          expect(connection['instanceId'], receipt['lease']);
          expect(connection['pid'], receipt['pid']);
          await task!.connect(connection);
          final sessionId = await task!.acceptTask(
            'Keep this accepted task running during the stop decision.',
          );
          await task!.waitForModelRequest(1);
          await task!.attachTerminal(connection, sessionId);
          return (session, receipt, sessionId);
        });
        if (prepared == null) return;
        final (session, receipt, sessionId) = prepared;
        await tester.pumpWidget(LauncherApp(controller: model!));
        await tester.runAsync(() async {
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
          await Future<void>.delayed(const Duration(milliseconds: 300));
        });
        await tester.pump();
        expect(find.byType(AlertDialog), findsOneWidget);
        final observed = await tester.runAsync(() async {
          task!.sendOwnedMarker();
          var refused = false;
          String? newTask;
          try {
            newTask = await task!.acceptTask(
              'This independent new task must wait until the stop decision is canceled.',
            );
          } catch (error) {
            if (!error.toString().contains('HTTP 503')) rethrow;
            refused = true;
          }
          // Core heartbeats run every two seconds and close after two misses.
          await Future<void>.delayed(const Duration(seconds: 7));
          return (
            newTask,
            <String, bool>{
              'newHttpWorkRefused': refused,
              'terminalInputHeld':
                  !task!.acknowledged(1) &&
                  !await File('${root!.path}/ws-input-observed').exists(),
              'sameWebSocketAlive': task!.socket!.readyState == WebSocket.open,
            },
          );
        });
        if (observed == null) return;
        final (newTask, beforeCancel) = observed;
        await tester.runAsync(() async {
          await tester.tap(find.text('取消'));
        });
        await tester.pump();
        await tester.runAsync(() async {
          final canceled = await pending!;
          expect((canceled['error'] as Map)['message'], contains('取消'));
          await task!.waitForOwnedMarker();
          expect(task!.socket!.readyState, WebSocket.open);
          expect(
            await File('${root!.path}/ws-input-observed').readAsString(),
            's04-ws-input\n',
          );
          await task!.releaseModel(1);
          await task!.waitForResult(sessionId, 1);
          if (newTask != null) {
            await task!.waitForModelRequest(2);
            await task!.releaseModel(2);
            await task!.waitForResult(newTask, 2);
          }
          stdout.writeln(
            'S04_ADMISSION_FACTS=${jsonEncode({'instanceId': receipt['lease'], 'sessionId': sessionId, 'newTaskId': newTask, 'beforeCancel': beforeCancel, 'sameTerminalResumedOnce': true})}',
          );
          expect(beforeCancel, {
            'newHttpWorkRefused': true,
            'terminalInputHeld': true,
            'sameWebSocketAlive': true,
          });
        });
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
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
            stdout.writeln('S04_ADMISSION_FIXTURE_DIRECTORY=${root!.path}');
          }
          await task?.closeTerminal();
          task?.close();
        });
      }
    },
    timeout: const Timeout(Duration(seconds: 120)),
    skip: artifact == null,
  );
}
