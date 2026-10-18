import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

class _FaultNative extends NativeBridge {
  _FaultNative(this.root, this.resources);
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
    'official SDK faults stay stopped, notify once per new lease, and keep explicit stop quiet after Launcher exit',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-service-fault-');
      stdout.writeln('S05_FIXTURE_DIRECTORY=${root.path}');
      final resources = '${root.path}/resources';
      final node = Platform.environment['DSH_TEST_NODE'] ?? '$artifact/node';
      final staged = await Process.run(node, [
        'tool/independent_service_resources.mjs',
        artifact!,
        resources,
      ]);
      expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
      expect(
        await Directory('$resources/DSH Service Notifications.app').exists(),
        false,
        reason: 'This SDK slice observes genuine helper unavailability and must not request OS permission or send a notification',
      );
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/sdk'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final model = LauncherController(
        _FaultNative(root.path, resources),
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
      LauncherController? reopenedModel;
      MacLauncherIntegration? reopenedIntegration;
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
        final receipt = jsonDecode(
          await File(
            '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
          ).readAsString(),
        ) as Map;
        final pid = receipt['pid'] as int;
        expect(Process.killPid(pid, ProcessSignal.sigkill), true);
        Map? failed;
        for (var attempt = 0; attempt < 100; attempt++) {
          final status = await session.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          expect(status['error'], isNull, reason: '$status');
          failed = status['result'] as Map;
          if (failed['state'] == 'failed') break;
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        expect(failed!['state'], 'failed');
        expect(failed['ready'], false);
        expect(failed['message'], contains('请检查日志后手动启动'));
        expect(
          (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode,
          isNot(0),
        );
        Map? logs;
        for (var attempt = 0; attempt < 40; attempt++) {
          final response = await session.sendRequest(
            'logs',
            serviceId: 'desktop',
            params: {'limit': 500},
            timeout: const Duration(seconds: 5),
          );
          expect(response['error'], isNull, reason: '$response');
          logs = response['result'] as Map;
          if (jsonEncode(logs).contains('macOS 通知助手不可用')) break;
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        expect(jsonEncode(logs), contains('macOS 通知助手不可用'));
        expect(jsonEncode(logs), isNot(contains('token=')));
        List<Map> reports(Map value) => (value['entries'] as List)
            .cast<Map>()
            .where((row) => (row['text'] as String).startsWith('DSH 服务故障通知：'))
            .map(
              (row) => jsonDecode(
                (row['text'] as String).substring('DSH 服务故障通知：'.length),
              ) as Map,
            )
            .toList();
        final firstReport = reports(logs!).single;
        expect(firstReport['available'], false);
        expect((firstReport['error'] as Map)['code'], 'ENOENT');
        expect((firstReport['submission'] as Map)['state'], 'not-attempted');
        expect((firstReport['delivery'] as Map)['state'], 'unknown');
        await Future<void>.delayed(const Duration(seconds: 1));
        final unchanged = await session.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        expect((unchanged['result'] as Map)['state'], 'failed');
        expect((unchanged['result'] as Map)['instanceId'], receipt['lease']);
        final repeatedLogs = await session.sendRequest(
          'logs',
          serviceId: 'desktop',
          params: {'limit': 500},
          timeout: const Duration(seconds: 30),
        );
        expect(
          reports(repeatedLogs['result'] as Map).map((row) => row['faultId']),
          [firstReport['faultId']],
        );

        final manualStart = await session.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(manualStart['error'], isNull, reason: '$manualStart');
        final receiptFile = File(
          '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
        );
        final second = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(second['lease'], isNot(receipt['lease']));
        expect(second['pid'], isNot(receipt['pid']));
        model.confirmServiceStop = (_) async => true;
        final stopped = await session.sendRequest(
          'recycle',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 25),
        );
        expect(stopped['error'], isNull, reason: '$stopped');
        final stoppedStatus = await session.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 30),
        );
        expect((stoppedStatus['result'] as Map)['state'], 'stopped');
        expect(await receiptFile.exists(), false);
        expect(
          (await Process.run('/bin/kill', ['-0', '${second['pid']}'])).exitCode,
          isNot(0),
        );
        final stoppedLogs = await session.sendRequest(
          'logs',
          serviceId: 'desktop',
          params: {'limit': 500},
          timeout: const Duration(seconds: 30),
        );
        expect(jsonEncode(stoppedLogs), contains('DSH 服务已确认正常停止'));
        expect(
          reports(stoppedLogs['result'] as Map).map((row) => row['faultId']),
          [firstReport['faultId']],
        );

        final thirdStart = await session.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(thirdStart['error'], isNull, reason: '$thirdStart');
        final third = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(third['lease'], isNot(second['lease']));
        await integration.close();
        await model.close();
        expect(
          (await Process.run('/bin/kill', ['-0', '${third['pid']}'])).exitCode,
          0,
        );
        expect(
          Process.killPid(third['pid'] as int, ProcessSignal.sigkill),
          true,
        );
        final serviceLog = File(
          '${root.path}/global/.dsh-workflow/service/service.log',
        );
        var closedLauncherReports = <Map>[];
        for (var attempt = 0; attempt < 100; attempt++) {
          final lines = (await serviceLog.readAsString()).split('\n');
          closedLauncherReports = lines
              .take(lines.length - 1)
              .where((line) => line.contains('DSH 服务故障通知：'))
              .map((line) => jsonDecode(line) as Map)
              .map(
                (row) => jsonDecode(
                  (row['text'] as String).substring('DSH 服务故障通知：'.length),
                ) as Map,
              )
              .toList();
          if (closedLauncherReports.length == 2) break;
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        expect(closedLauncherReports, hasLength(2));
        expect(
          closedLauncherReports.last['faultId'],
          isNot(firstReport['faultId']),
        );
        expect(closedLauncherReports.last['available'], false);

        reopenedModel = LauncherController(
          _FaultNative(root.path, resources),
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
        await reopenedModel.initialize();
        reopenedIntegration = MacLauncherIntegration(
          reopenedModel,
          socketPath: server.layout.socketPath,
        );
        ServerSession? reconnected;
        for (var attempt = 0; attempt < 100; attempt++) {
          final candidate = server.sessionFor('dsh-workflow');
          if (candidate != null && !identical(candidate, session)) {
            reconnected = candidate;
            break;
          }
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        expect(reconnected, isNotNull);
        final afterLauncherExit = await reconnected!.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 30),
        );
        expect((afterLauncherExit['result'] as Map)['state'], 'failed');
        expect(
          (afterLauncherExit['result'] as Map)['instanceId'],
          third['lease'],
        );
        await Future<void>.delayed(const Duration(seconds: 1));
        final finalLogs = await reconnected.sendRequest(
          'logs',
          serviceId: 'desktop',
          params: {'limit': 500},
          timeout: const Duration(seconds: 30),
        );
        expect(
          reports(finalLogs['result'] as Map).map((row) => row['faultId']),
          closedLauncherReports.map((row) => row['faultId']),
        );
        expect(
          (await Process.run('/bin/kill', ['-0', '${third['pid']}'])).exitCode,
          isNot(0),
        );
        stdout.writeln(
          'S05_FAULT_FACTS=${jsonEncode({'hostPid': pid, 'instanceId': receipt['lease'], 'failed': failed, 'notificationUnavailable': true, 'systemNotificationSubmitted': false, 'notificationReports': closedLauncherReports, 'explicitStopQuiet': true, 'secondLease': second['lease'], 'closedLauncherFaultLease': third['lease'], 'closedLauncherFaultReadThroughSdk': afterLauncherExit['result']})}',
        );
      } finally {
        await reopenedIntegration?.close();
        await reopenedModel?.close();
        await integration?.close();
        await model.close();
        await server.close();
        // Fixture disposal is separate from the observed unexpected Host exit.
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
      }
    },
    timeout: const Timeout(Duration(seconds: 100)),
    skip: artifact == null
        ? 'Requires frozen packaged resources for real SDK fault acceptance'
        : false,
  );
}
