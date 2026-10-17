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

import '../tool/service_admission_fixture.dart';

class _FinalStopNative extends NativeBridge {
  _FinalStopNative(this.root, this.resources);
  final String root, resources;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
    'fullAccess': true,
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
    'one confirmation includes scheduled derivatives, stops actual queued and background work, and persists the same profile',
    (tester) async {
      Directory? root;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceAdmissionFixture? task;
      Future<Map>? pending;
      Future<void>? racedInputs;
      var racing = true;
      var acceptedInputs = 0, heldInputs = 0, inputAttempt = 0;
      Object? raceError;
      try {
        final prepared = await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp(
            'dsh-service-final-stop-',
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
          final command =
              "echo \$\$ > '${root!.path}/job-pid'; while [ ! -f '${root!.path}/release-job' ]; do sleep 0.05; done";
          final calls = <Map<String, Object?>>[
            {
              'name': 'bash',
              'args': {
                'description': 'S04 held background task',
                'command': command,
                'workdir': root!.path,
                'run_in_background': true,
              },
            },
            {
              'name': 'schedule_create',
              'args': {
                'title': 'S04 due reminder',
                'prompt': 'Continue the confirmed reminder task.',
                'after_seconds': 12,
              },
            },
            {
              'name': 'schedule_create',
              'args': {
                'title': 'S04 future reminder',
                'prompt': 'Preserve this future reminder across restart.',
                'after_seconds': 3600,
              },
            },
          ];
          final chunks = <Map<String, Object?>>[];
          for (var i = 0; i < calls.length; i++) {
            final call = calls[i],
                id = 's04-tool-$i',
                args = jsonEncode(calls[i]['args']);
            chunks.addAll([
              {'type': 'block-start', 'index': i, 'blockType': 'tool-call'},
              {
                'type': 'tool-call-delta',
                'index': i,
                'id': id,
                'name': call['name'],
                'argumentsDelta': args,
              },
              {
                'type': 'block-end',
                'index': i,
                'block': {
                  'type': 'tool-call',
                  'id': id,
                  'name': call['name'],
                  'arguments': args,
                },
              },
            ]);
          }
          chunks.addAll([
            {
              'type': 'usage',
              'usage': {'inputTokens': 10, 'outputTokens': 20},
            },
            {
              'type': 'finish',
              'reason': {'kind': 'tool-calls'},
            },
          ]);
          await File('${root!.path}/model-response-1.json')
              .writeAsString(jsonEncode(chunks));
          server = await LauncherServer.start(
            layout: EndpointLayout(directory: '${root!.path}/sdk'),
            bindings: InMemoryBindingLookup({'dsh-workflow'}),
          );
          model = LauncherController(
            _FinalStopNative(root!.path, resources),
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
          expect(receipt['permissionMode'], 'danger-full-access');
          task = ServiceAdmissionFixture(root!.path);
          final connection = await task!.managedConnection(resources);
          expect(connection['instanceId'], receipt['lease']);
          expect(connection['pid'], receipt['pid']);
          await task!.connect(connection);
          final sessionId = await task!.acceptTask(
            'Start the controlled background task and two reminders.',
          );
          await task!.waitForModelRequest(1);
          await task!.releaseModel(1);
          await task!.waitForModelRequest(2);
          final jobPid = int.parse(
            await File('${root!.path}/job-pid').readAsString(),
          );
          expect(
            (await Process.run('/bin/kill', ['-0', '$jobPid'])).exitCode,
            0,
          );
          final queue = await task!.rpc('session/prompt', {
            'request': {
              'requestId': 's04-queued-input',
              'sessionId': sessionId,
              'mode': 'queue',
              'content': [
                {
                  'type': 'text',
                  'text':
                      'This pending message is included in the stop decision.',
                },
              ],
            },
          }) as Map;
          expect(queue['accepted'], true);
          final catalog = (await task!.rpc('schedule/catalog', {})) as List;
          final due = catalog.cast<Map>().singleWhere(
            (row) => row['title'] == 'S04 due reminder',
          );
          final future = catalog.cast<Map>().singleWhere(
            (row) => row['title'] == 'S04 future reminder',
          );
          expect(due['status'], 'active');
          expect(future['status'], 'active');
          await task!.attachTerminal(connection, sessionId);
          return (
            session,
            receipt,
            sessionId,
            due['id'] as String,
            future['id'] as String,
            jobPid,
          );
        });
        if (prepared == null) return;
        final (session, receipt, sessionId, dueId, futureId, jobPid) = prepared;
        await tester.pumpWidget(LauncherApp(controller: model!));
        await tester.runAsync(() async {
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
        });
        await _expectStopConfirmation(tester, pending!);
        expect(find.textContaining('S04 due reminder'), findsWidgets);
        expect(find.textContaining('S04 future reminder'), findsWidgets);
        expect(find.textContaining('待处理消息'), findsWidgets);
        expect(find.textContaining('job-pid'), findsWidgets);
        expect(find.textContaining('s04-terminal'), findsWidgets);
        await tester.runAsync(() async {
          final delivery = File('${root!.path}/reminder-delivery-$dueId.json');
          for (
            var attempt = 0;
            attempt < 400 && !await delivery.exists();
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(
            await delivery.exists(),
            true,
            reason: 'Actual ScheduleRuntime must durably deliver the confirmed reminder.',
          );
          final delivered = jsonDecode(await delivery.readAsString()) as Map;
          expect(delivered['status'], 'inactive');
          expect(delivered['lastDelivery'], isNotNull);
          task!.sendOwnedMarker();
          racedInputs = () async {
            while (racing) {
              try {
                final result = await task!.rpc('session/prompt', {
                  'request': {
                    'requestId': 's04-during-stop-${++inputAttempt}',
                    'sessionId': sessionId,
                    'mode': 'queue',
                    'content': [
                      {
                        'type': 'text',
                        'text': 'This unconfirmed input must never be admitted during stop.',
                      },
                    ],
                  },
                }) as Map;
                if (result['accepted'] == true) acceptedInputs++;
              } catch (error) {
                if (error.toString().contains('HTTP 503')) {
                  heldInputs++;
                } else if (error is! SocketException &&
                    error is! HttpException &&
                    !error.toString().contains('HTTP 502')) {
                  raceError = error;
                  racing = false;
                }
              }
              await Future<void>.delayed(const Duration(milliseconds: 25));
            }
          }();
          await Future<void>.delayed(const Duration(milliseconds: 100));
          expect(heldInputs, greaterThan(0));
          expect(task!.acknowledged(1), false);
          expect(await File('${root!.path}/ws-input-observed').exists(), false);
          await tester.tap(find.text('确认停止'));
          await Future<void>.delayed(const Duration(seconds: 1));
        });
        await tester.pump();
        expect(
          find.byType(AlertDialog),
          findsNothing,
          reason: 'A reminder already included in this decision must not demand a second confirmation solely because its delivery produced queued work.',
        );
        final stoppedAndRestarted = await tester.runAsync(() async {
          final stopped = await pending!;
          expect(stopped['error'], isNull, reason: '$stopped');
          racing = false;
          await racedInputs;
          expect(raceError, isNull);
          expect(acceptedInputs, 0);
          expect(task!.acknowledged(1), false);
          expect(await File('${root!.path}/ws-input-observed').exists(), false);
          expect(
            (await Process.run('/bin/kill', ['-0', '$jobPid'])).exitCode,
            isNot(0),
          );
          expect(
            (await Process.run('/bin/kill', [
              '-0',
              '${receipt['pid']}',
            ])).exitCode,
            isNot(0),
          );
          expect(await File('${root!.path}/model-canceled-2').exists(), true);
          final restart = await session.sendRequest(
            'start',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 45),
          );
          expect(restart['error'], isNull, reason: '$restart');
          final current = jsonDecode(
            await File(
              '${root!.path}/global/.dsh-workflow/desktop/desktop-host.json',
            ).readAsString(),
          ) as Map;
          expect(current['lease'], isNot(receipt['lease']));
          final connection = await task!.managedConnection(
            '${root!.path}/resources',
          );
          expect(connection['instanceId'], current['lease']);
          await task!.connect(connection);
          final history = await task!.page(sessionId);
          await File('${root!.path}/final-stop-history.json')
              .writeAsString(jsonEncode(history));
          expect(
            jsonEncode(history),
            contains('Start the controlled background task and two reminders.'),
          );
          final projection = await task!.rpc('session/projections', {
            'request': {'sessionId': sessionId},
          }) as Map;
          final inbox = (projection['values'] as Map)['inbox'] as Map;
          expect(inbox['next-turn'], isEmpty);
          expect(inbox['next-step'], isEmpty);
          final catalog = await task!.rpc('schedule/catalog', {}) as List;
          expect(
            catalog.cast<Map>().singleWhere(
              (row) => row['id'] == futureId,
            )['status'],
            'active',
          );
          stdout.writeln(
            'S04_FINAL_STOP_FACTS=${jsonEncode({'oldLease': receipt['lease'], 'newLease': current['lease'], 'sessionId': sessionId, 'jobPid': jobPid, 'dueReminderId': dueId, 'futureReminderId': futureId, 'historyRecordCount': (history['records'] as List).length, 'modelAborted': true, 'queueCleared': true, 'heldHttpInputs': heldInputs, 'acceptedUnconfirmedInputs': acceptedInputs, 'terminalInputNotAdmitted': true})}',
          );
          pending = session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
          return true;
        });
        if (stoppedAndRestarted != true) return;
        await _expectStopConfirmation(tester, pending!);
        expect(find.textContaining('S04 future reminder'), findsWidgets);
        await tester.runAsync(() async {
          await tester.tap(find.text('取消'));
        });
        await tester.pump();
        await tester.runAsync(() async {
          final canceled = await pending!;
          expect((canceled['error'] as Map)['message'], contains('取消'));
        });
      } finally {
        racing = false;
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          final settled = pending?.catchError((_) => <String, Object?>{});
          await integration?.close();
          await settled;
          await racedInputs;
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
            stdout.writeln('S04_FINAL_STOP_FIXTURE_DIRECTORY=${root!.path}');
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
