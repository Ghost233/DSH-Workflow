import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

class ServiceNative extends NativeBridge {
  ServiceNative(this.root, this.resources, {this.loginStatus = 'disabled'});
  final String root, resources;
  String loginStatus;
  int desktopOpens = 0;
  bool fullAccess = false;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.3.0',
    'loginStatus': loginStatus,
    'fullAccess': fullAccess,
  });
  @override
  Future<void> savePreferences(
    bool access,
    bool lan, {
    required bool hideWindowOnStart,
  }) async {
    fullAccess = access;
  }

  @override
  Future<String> setLoginEnabled(bool enabled) async =>
      loginStatus = enabled ? 'enabled' : 'notRegistered';

  @override
  Future<bool> setEntryManaged(bool value) async => true;
  @override
  Future<void> openDesktop(
    String path, {
    required Map<String, String> environment,
    bool hidden = false,
  }) async {
    desktopOpens++;
    throw StateError('This scenario must never open Electron');
  }
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test(
    'official SDK reports an existing legacy Host without replacing or terminating it',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-service-legacy-');
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
      final legacy = await Process.start(
        '$resources/node',
        [
          'tool/independent_service_legacy_host.mjs',
          resources,
          root.path,
          '${root.path}/home',
        ],
        environment: {
          ...Platform.environment,
          'HOME': '${root.path}/os-home',
          'TMPDIR': root.path,
        },
      );
      final output = legacy.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .first;
      final diagnostics = legacy.stderr.transform(utf8.decoder).join();
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/sdk'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final native = ServiceNative(root.path, resources);
      final model = LauncherController(native);
      MacLauncherIntegration? integration;
      await model.initialize();
      try {
        String readyLine;
        try {
          readyLine = await output.timeout(const Duration(seconds: 30));
        } catch (error) {
          throw StateError(
            'Legacy fixture failed before readiness: $error\n${await diagnostics}',
          );
        }
        final existing = jsonDecode(readyLine) as Map;
        integration = MacLauncherIntegration(
          model,
          socketPath: server.layout.socketPath,
        );
        for (
          var attempt = 0;
          attempt < 100 && server.sessionFor('dsh-workflow') == null;
          attempt++
        ) {
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        final started = await server
            .sessionFor('dsh-workflow')!
            .sendRequest(
              'start',
              serviceId: 'desktop',
              timeout: const Duration(seconds: 15),
            );
        expect((started['error'] as Map)['message'], contains('检测到已有 DSH 实例'));
        final receipt = jsonDecode(
          await File(
            '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
          ).readAsString(),
        ) as Map;
        expect(receipt['lease'], existing['instanceId']);
        expect(receipt['pid'], existing['pid']);
        expect(
          (await Process.run('/bin/kill', [
            '-0',
            '${existing['pid']}',
          ])).exitCode,
          0,
        );
        expect(native.desktopOpens, 0);
      } finally {
        await integration?.close();
        await model.close();
        await server.close();
        final manager = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        if (await manager.exists()) {
          Process.killPid(
            (jsonDecode(await manager.readAsString()) as Map)['pid'] as int,
            ProcessSignal.sigterm,
          );
          for (
            var attempt = 0;
            attempt < 100 && await manager.exists();
            attempt++
          ) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(await manager.exists(), false);
        }
        legacy.kill(ProcessSignal.sigterm);
        expect(
          await legacy.exitCode.timeout(const Duration(seconds: 20)),
          0,
          reason: await diagnostics,
        );
        await root.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(seconds: 75)),
    skip: artifact == null
        ? 'Requires frozen packaged resources for the real legacy Host conflict scenario'
        : false,
  );
  test(
    'official SDK starts a real independent Host and rediscovers it after launcher exit',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-service-sdk-');
      final resources = '${root.path}/resources';
      final node = Process.runSync('/usr/bin/which', [
        'node',
      ]).stdout.toString().trim();
      final staged = await Process.run(node, [
        'tool/independent_service_resources.mjs',
        artifact!,
        resources,
        '--login-shell',
      ]);
      expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/sdk'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final native = ServiceNative(
        root.path,
        resources,
        loginStatus: 'enabled',
      );
      LauncherController controller() => LauncherController(
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
      var model = controller();
      await model.initialize();
      var integration = MacLauncherIntegration(
        model,
        socketPath: server.layout.socketPath,
      );
      Future<ServerSession> session() async {
        for (var attempt = 0; attempt < 100; attempt++) {
          final current = server.sessionFor('dsh-workflow');
          if (current != null) return current;
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        throw StateError('Official SDK connection was not established');
      }

      try {
        final first = await session();
        final directStart = model.startService();
        final startingBySdk = first.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        await directStart;
        final started = await startingBySdk;
        final managerLog = File(
          '${root.path}/global/.dsh-workflow/service/manager.log',
        );
        expect(
          started['error'],
          isNull,
          reason:
              '$started\n${await managerLog.exists() ? await managerLog.readAsString() : 'manager was not spawned'}',
        );
        final status = await first.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        final running = status['result'] as Map;
        expect(running['state'], 'running');
        expect(running['ready'], true);
        expect(
          running['instanceId'],
          isA<String>().having(
            (value) => value.length,
            'real instance identity',
            greaterThan(10),
          ),
        );
        expect(native.desktopOpens, 0);
        expect(
          await File('${root.path}/existing-toolchain-observed').exists(),
          true,
          reason: 'A real Host MCP child must resolve the existing login-shell toolchain',
        );
        final receiptFile = File(
          '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
        );
        final receipt = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(receipt['lease'], running['instanceId']);
        expect(model.loginStatus, 'enabled');
        await model.setLoginEnabled(false);
        expect(model.loginStatus, 'notRegistered');
        final afterLoginDisabled = await first.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        expect((afterLoginDisabled['result'] as Map)['ready'], true);
        expect(
          (afterLoginDisabled['result'] as Map)['instanceId'],
          receipt['lease'],
          reason: 'Disabling login startup must keep the same real service',
        );
        expect(
          (jsonDecode(await receiptFile.readAsString()) as Map)['pid'],
          receipt['pid'],
        );
        expect((await receiptFile.stat()).mode & 0x1ff, 0x180);
        expect(
          (await Directory(
                '${root.path}/global/.dsh-workflow/service',
              ).stat()).mode &
              0x1ff,
          0x1c0,
        );
        final observed = await Process.run('/bin/ps', [
          '-axo',
          'pid=,ppid=,command=',
        ]);
        expect(observed.exitCode, 0);
        final hosts = observed.stdout
            .toString()
            .split('\n')
            .where(
              (line) =>
                  line.contains('${root.path}/resources/desktop/') &&
                  line.contains('dsh-desktop-host/lib/index.js'),
            )
            .toList();
        expect(
          hosts.length,
          1,
          reason: 'Concurrent launcher and official SDK starts must own exactly one real Host',
        );
        expect(
          hosts.single.trim().split(RegExp(r'\s+')).first,
          '${receipt['pid']}',
        );
        final client = HttpClient();
        try {
          final address = Uri.parse(receipt['url'] as String);
          final rpc = address.replace(
            path: '/api/pluginManager/listPlugins',
            query: '',
          );
          final unauthorized = await client.postUrl(rpc);
          unauthorized.headers.contentType = ContentType.json;
          unauthorized.write(
            jsonEncode({
              'type': 'client-request',
              'rpcId': 's01-unauthorized',
              'method': 'pluginManager/listPlugins',
              'payload': {'args': {}},
            }),
          );
          final rejected = await unauthorized.close();
          expect(rejected.statusCode, 401);
          await rejected.drain<void>();
          final login = await client.getUrl(address);
          login.followRedirects = false;
          final authenticated = await login.close();
          final cookies = authenticated.cookies;
          await authenticated.drain<void>();
          final request = await client.postUrl(rpc);
          request.headers.contentType = ContentType.json;
          request.cookies.addAll(cookies);
          request.write(
            jsonEncode({
              'type': 'client-request',
              'rpcId': 's01-plugins',
              'method': 'pluginManager/listPlugins',
              'payload': {'args': {}},
            }),
          );
          final response = await request.close();
          expect(response.statusCode, 200);
          final envelope =
              jsonDecode(await response.transform(utf8.decoder).join()) as Map;
          final plugins = ((envelope['result'] as Map)['value'] as List)
              .cast<Map>();
          for (final module in [
            'dsh-workflow/jev-center',
            'dsh-workflow/agent-monitor',
          ]) {
            expect(
              plugins.any(
                (row) =>
                    row['moduleName'] == module &&
                    row['fiberPhase'] == 'active',
              ),
              true,
              reason: '$module must be loaded in the actual Host',
            );
          }
          stdout.writeln(
            'S01_HOST_FACTS=${jsonEncode({
              'pid': receipt['pid'],
              'instanceId': receipt['lease'],
              'concurrentHostCount': hosts.length,
              'pluginCount': plugins.length,
              'projectPlugins': plugins.where((row) => row['moduleName'].toString().contains('dsh-workflow')).map((row) => {'module': row['moduleName'], 'phase': row['fiberPhase']}).toList(),
              'unauthenticatedRpc': rejected.statusCode,
            })}',
          );
        } finally {
          client.close(force: true);
        }
        final logs = await first.sendRequest(
          'logs',
          serviceId: 'desktop',
          params: {'limit': 100},
          timeout: const Duration(seconds: 5),
        );
        expect((logs['result'] as Map)['entries'], isNotEmpty);
        expect(jsonEncode(logs), isNot(contains('token=')));
        await integration.close();
        await model.close();
        for (
          var attempt = 0;
          attempt < 100 && server.sessionFor('dsh-workflow') != null;
          attempt++
        ) {
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
        model = controller();
        await model.initialize();
        integration = MacLauncherIntegration(
          model,
          socketPath: server.layout.socketPath,
        );
        final reopened = await session();
        final rediscovered = await reopened.sendRequest(
          'status',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 5),
        );
        expect(
          (rediscovered['result'] as Map)['instanceId'],
          running['instanceId'],
        );
        expect((rediscovered['result'] as Map)['ready'], true);
        expect(native.desktopOpens, 0);
        final managerFile = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        final managerPid =
            (jsonDecode(await managerFile.readAsString()) as Map)['pid'];
        await model.savePreferences(true, false);
        // An abrupt owned Host failure also exercises recovery with its old receipt still present.
        Process.killPid(receipt['pid'] as int, ProcessSignal.sigkill);
        var failed = false;
        for (var attempt = 0; attempt < 100; attempt++) {
          final observed = await reopened.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
          if ((observed['result'] as Map)['state'] == 'failed') {
            failed = true;
            break;
          }
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        expect(
          failed,
          true,
          reason: 'The owned Host remains stopped until another explicit start',
        );
        final next = await reopened.sendRequest(
          'start',
          serviceId: 'desktop',
          timeout: const Duration(seconds: 45),
        );
        expect(next['error'], isNull, reason: '$next');
        final currentReceipt =
            jsonDecode(await receiptFile.readAsString()) as Map;
        expect(
          currentReceipt['permissionMode'],
          'danger-full-access',
          reason: 'A persistent manager must apply the current launcher preference on each explicit start',
        );
        expect(currentReceipt['lease'], isNot(receipt['lease']));
        stdout.writeln(
          'S01_PERMISSION_NEXT_START_FACTS=${jsonEncode({'managerPid': managerPid, 'hostPid': currentReceipt['pid'], 'permissionMode': currentReceipt['permissionMode']})}',
        );
        expect(
          (jsonDecode(await managerFile.readAsString()) as Map)['pid'],
          managerPid,
        );
      } finally {
        await integration.close();
        await model.close();
        await server.close();
        // This probe owns the isolated manager and its Host; no user service is touched.
        final manager = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        if (await manager.exists()) {
          final pid =
              (jsonDecode(await manager.readAsString()) as Map)['pid'] as int;
          Process.killPid(pid, ProcessSignal.sigterm);
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
            reason:
                'Owned manager cleanup must finish before deleting its profile',
          );
        }
        await root.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(seconds: 90)),
    skip: artifact == null
        ? 'Set DSH_SERVICE_TEST_RESOURCES to frozen packaged resources for real Host acceptance'
        : false,
  );
}
