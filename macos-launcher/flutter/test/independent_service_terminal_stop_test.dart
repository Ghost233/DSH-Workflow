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
import 'service_stop_confirmation.dart';

class _TerminalNative extends NativeBridge {
  _TerminalNative(this.root, this.resources);
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
    'an idle agent with a real running terminal still requires explicit stop confirmation and cancel preserves it',
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
            'dsh-service-terminal-stop-',
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
            _TerminalNative(root!.path, resources),
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
          await task!.releaseModel(1);
          await task!.waitForResult(sessionId, 1);
          await task!.attachTerminal(connection, sessionId);
          task!.sendOwnedMarker();
          await task!.waitForOwnedMarker();
          return (session, receipt, sessionId);
        });
        if (prepared == null) return;
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
        expect(find.textContaining('s04-terminal'), findsWidgets);
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
          expect(task!.socket!.readyState, WebSocket.open);
          expect(
            await File('${root!.path}/ws-input-observed').readAsString(),
            's04-ws-input\n',
          );
          stdout.writeln(
            'S04_TERMINAL_STOP_FACTS=${jsonEncode({'instanceId': receipt['lease'], 'sessionId': sessionId, 'terminalId': 's04-terminal', 'sameSocketPreserved': true})}',
          );
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
            stdout.writeln('S04_TERMINAL_STOP_FIXTURE_DIRECTORY=${root!.path}');
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
