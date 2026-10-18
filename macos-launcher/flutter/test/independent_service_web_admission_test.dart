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

import '../tool/application_probe.dart' show closeProbeResources;
import '../tool/service_admission_fixture.dart';

class _WebAdmissionNative extends NativeBridge {
  _WebAdmissionNative(this.root, this.resources, this.socket);
  final String root, resources, socket;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'testSocket': socket,
    'password': 's03-web-admission-fixture',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
  });
  @override
  Future<bool> setEntryManaged(bool value) async => true;
  @override
  Future<void> showWindow() async {}
}

// Widget bindings override HttpClient with a 400 stub; use its real public base.
class _WebHttp extends HttpOverrides {}

Future<void> _wait(String description, Future<bool> Function() observed) async {
  for (var attempt = 0; attempt < 200; attempt++) {
    if (await observed()) return;
    await Future<void>.delayed(const Duration(milliseconds: 25));
  }
  throw StateError('Timed out: $description');
}

Future<Map> _webControl(Directory root, String resources) async {
  final child = await Process.start('$resources/node', [
    '$resources/workflow/macos-launcher/runtime/web-cli.mjs',
    root.path,
    resources,
  ]);
  final output = child.stdout.transform(utf8.decoder).join();
  final errors = child.stderr.transform(utf8.decoder).join();
  child.stdin.writeln(jsonEncode({'type': 'status'}));
  await child.stdin.close();
  final code = await child.exitCode.timeout(const Duration(seconds: 10));
  final reply = jsonDecode(await output) as Map;
  expect(code, 0, reason: await errors);
  expect(reply['ok'], true);
  return ((reply['value'] as Map)['web']) as Map;
}

Future<int?> _ownedPid(Directory root, String role) async {
  final record = File('${root.path}/global/.dsh-workflow/$role/manager.json');
  if (!await record.exists()) return null;
  expect(await root.resolveSymbolicLinks(), root.path);
  expect(await FileSystemEntity.isLink(record.path), false);
  expect(await record.parent.resolveSymbolicLinks(), record.parent.path);
  expect((await record.stat()).mode & 0x3f, 0);
  final pid = (jsonDecode(await record.readAsString()) as Map)['pid'] as int;
  final uid = (await Process.run('/usr/bin/id', [
    '-u',
  ])).stdout.toString().trim();
  final identity = await Process.run('/bin/ps', [
    '-p',
    '$pid',
    '-o',
    'uid=,command=',
  ]);
  final command = identity.stdout.toString().trim();
  expect(identity.exitCode, 0);
  expect(command.startsWith('$uid '), true);
  expect(command.contains(root.path), true);
  expect(
    command.contains(
      role == 'web' ? 'global-supervisor.mjs' : 'service-manager.mjs',
    ),
    true,
  );
  return pid;
}

Future<void> _sameWeb(
  Directory root,
  String resources,
  int pid,
  String instanceId,
  int port,
) async {
  expect(await _ownedPid(root, 'web'), pid);
  expect((await _webControl(root, resources))['instanceId'], instanceId);
  final listener = await Process.run('/usr/sbin/lsof', [
    '-nP',
    '-iTCP:$port',
    '-sTCP:LISTEN',
    '-Fp',
  ]);
  expect(listener.exitCode, 0);
  expect(
    const LineSplitter()
        .convert(listener.stdout.toString())
        .where((line) => RegExp(r'^p[0-9]+$').hasMatch(line))
        .toSet(),
    {'p$pid'},
  );
}

Future<void> _sameHost(Directory root, Map original) async {
  final receipt = jsonDecode(
    await File('${root.path}/global/.dsh-workflow/desktop/desktop-host.json')
        .readAsString(),
  ) as Map;
  expect(receipt['pid'], original['pid']);
  expect(receipt['lease'], original['lease']);
  final managerPid = await _ownedPid(root, 'service');
  expect(managerPid, isNotNull);
  final identity = await Process.run('/bin/ps', [
    '-p',
    '${receipt['pid']}',
    '-o',
    'ppid=,uid=,command=',
  ]);
  final fields = identity.stdout.toString().trim().split(RegExp(r'\s+'));
  final uid = (await Process.run('/usr/bin/id', [
    '-u',
  ])).stdout.toString().trim();
  expect(identity.exitCode, 0);
  expect(fields.take(2), ['$managerPid', uid]);
  expect(
    identity.stdout.toString(),
    contains('${root.path}/home/profiles/desktop'),
  );
  expect(identity.stdout.toString(), contains('dsh-desktop-host'));
}

Future<void> _cleanupDaemon(
  Directory root,
  String resources,
  String role, {
  Map? host,
  String? webInstance,
}) async {
  final pid = await _ownedPid(root, role);
  if (pid == null) return;
  if (role == 'web' && webInstance != null) {
    expect((await _webControl(root, resources))['instanceId'], webInstance);
  }
  if (role == 'service' && host != null) {
    final receipt = File(
      '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
    );
    if (await receipt.exists()) {
      await _sameHost(root, host);
    } else {
      expect(
        (await Process.run('/bin/kill', ['-0', '${host['pid']}'])).exitCode,
        isNot(0),
      );
    }
  }
  Process.killPid(pid, ProcessSignal.sigterm);
  final record = File('${root.path}/global/.dsh-workflow/$role/manager.json');
  final elapsed = Stopwatch()..start();
  while (elapsed.elapsed < const Duration(seconds: 20)) {
    if (!await record.exists() &&
        (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode != 0) {
      stdout.writeln('S03_WEB_ADMISSION_OWN_CLEANUP=$role:$pid');
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  throw StateError(
    'Owned $role daemon did not naturally release its control record and PID',
  );
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  testWidgets(
    'Web keeps its authenticated instance through actual stop admission and cancel',
    (tester) async {
      Directory? root;
      String? resources, webInstance;
      Map? host;
      LauncherController? model;
      LauncherServer? server;
      MacLauncherIntegration? integration;
      ServiceAdmissionFixture? task;
      Future<Map>? pending;
      WebSocket? socket;
      StreamSubscription? framesSubscription;
      final frames = <Map>[];
      Object? socketError;
      final http = _WebHttp().createHttpClient(null)
        ..connectionTimeout = const Duration(seconds: 5);
      var failed = false;
      try {
        expect(
          Platform.environment['DSH_LAUNCHER_TEST_PORT'],
          '0',
          reason: 'The fixed isolated test command must request a real ephemeral Web port.',
        );
        final prepared = await tester.runAsync(() async {
          root = await Directory('/private/tmp')
              .createTemp('dsh-web-admission-');
          await Directory('${root!.path}/os-home').create();
          resources = '${root!.path}/resources';
          final node = Process.runSync('/usr/bin/which', [
            'node',
          ]).stdout.toString().trim();
          for (final args in [
            ['tool/independent_service_resources.mjs', artifact!, resources!],
            ['tool/service_task_resources.mjs', resources!, root!.path],
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
            _WebAdmissionNative(
              root!.path,
              resources!,
              server!.layout.socketPath,
            ),
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
          await _wait(
            'the actual SDK connection',
            () async => server!.sessionFor('dsh-workflow') != null,
          );
          final session = server!.sessionFor('dsh-workflow')!;
          final started = await session.sendRequest(
            'start',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 45),
          );
          expect(started['error'], isNull, reason: '$started');
          host = jsonDecode(
            await File(
              '${root!.path}/global/.dsh-workflow/desktop/desktop-host.json',
            ).readAsString(),
          ) as Map;
          task = ServiceAdmissionFixture(root!.path);
          final connection = await task!.managedConnection(resources!);
          expect(connection['instanceId'], host!['lease']);
          expect(connection['pid'], host!['pid']);
          await task!.connect(connection);
          final taskId = await task!.acceptTask(
            'S03 retain this real accepted task across the Web stop decision.',
          );
          await task!.waitForModelRequest(1);
          final opened = await session.sendRequest(
            'start',
            serviceId: 'web',
            timeout: const Duration(seconds: 15),
          );
          expect(opened['error'], isNull, reason: '$opened');
          final status =
              (await session.sendRequest(
                    'status',
                    serviceId: 'web',
                    timeout: const Duration(seconds: 5),
                  ))['result']
                  as Map;
          expect(status['ready'], true);
          expect(status['state'], 'running');
          webInstance = status['instanceId'] as String;
          final url = model!.webUrl!;
          expect(url.port, greaterThan(0));
          final webPid = (await _ownedPid(root!, 'web'))!;
          await _sameWeb(root!, resources!, webPid, webInstance!, url.port);
          await _sameHost(root!, host!);
          final login = await http.postUrl(url.resolve('/login'));
          login.followRedirects = false;
          login.headers.contentType = ContentType(
            'application',
            'x-www-form-urlencoded',
          );
          login.write('password=s03-web-admission-fixture');
          final response = await login.close().timeout(
            const Duration(seconds: 5),
          );
          expect(response.statusCode, 303);
          final cookies = response.cookies;
          expect(cookies, isNotEmpty);
          await response.drain<void>();
          return (
            session: session,
            taskId: taskId,
            url: url,
            cookies: cookies,
            webPid: webPid,
            before: status,
          );
        });
        expect(prepared, isNotNull);
        final actual = prepared!;
        var rpcId = 0;
        Future<({int code, String text})> webRpc(
          String method,
          Map<String, Object?> args,
        ) async {
          final request = await http.postUrl(
            actual.url.resolve('/api/$method'),
          );
          request.cookies.addAll(actual.cookies);
          request.headers.contentType = ContentType.json;
          request.write(
            jsonEncode({
              'type': 'client-request',
              'rpcId': 'web-admission-${++rpcId}',
              'method': method,
              'payload': {'args': args},
            }),
          );
          final response = await request.close().timeout(
            const Duration(seconds: 5),
          );
          return (
            code: response.statusCode,
            text: await response
                .transform(utf8.decoder)
                .join()
                .timeout(const Duration(seconds: 5)),
          );
        }

        final attached = await tester.runAsync(() async {
          final rpc = await webRpc('pluginInventory/list', {});
          expect(rpc.code, 200);
          expect((jsonDecode(rpc.text) as Map)['result']['ok'], true);
          final terminal = await webRpc('terminal/create', {
            'agentId': actual.taskId,
            'request': {'id': 's03-web-terminal', 'cols': 80, 'rows': 24},
          });
          expect(terminal.code, 200);
          expect((jsonDecode(terminal.text) as Map)['result']['ok'], true);
          socket = await WebSocket.connect(
            actual.url
                .replace(scheme: 'ws', path: '/api/remote.mux')
                .toString(),
            headers: {
              'Cookie': actual.cookies
                  .map((row) => '${row.name}=${row.value}')
                  .join('; '),
            },
            customClient: http,
          ).timeout(const Duration(seconds: 10));
          framesSubscription = socket!.listen(
            (data) {
              frames.add(
                jsonDecode(
                  data is String ? data : utf8.decode(data as List<int>),
                ) as Map,
              );
            },
            onError: (Object error) {
              socketError = error;
            },
          );
          socket!.add(
            jsonEncode({
              'type': 'open',
              'streamId': 's03-web-terminal',
              'endpoint': 'terminal/attach',
              'payload': {
                'args': {'agentId': actual.taskId, 'id': 's03-web-terminal'},
              },
            }),
          );
          await _wait(
            'a real terminal snapshot through authenticated WebSocket',
            () async {
              if (socketError != null) throw socketError!;
              return frames.any(
                (row) =>
                    row['type'] == 'item' &&
                    row['value'] is Map &&
                    (row['value'] as Map)['type'] == 'snapshot',
              );
            },
          );
          return true;
        });
        expect(attached, true);
        await tester.pumpWidget(LauncherApp(controller: model!));
        Map? earlyReply;
        Object? requestError;
        var completed = false;
        await tester.runAsync(() async {
          pending = actual.session.sendRequest(
            'recycle',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 30),
          );
          unawaited(
            pending!.then<void>(
              (value) {
                earlyReply = value;
                completed = true;
              },
              onError: (Object error) {
                requestError = error;
                completed = true;
              },
            ),
          );
        });
        for (
          var attempt = 0;
          attempt < 100 &&
              !completed &&
              find.byType(AlertDialog).evaluate().isEmpty;
          attempt++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)),
          );
          await tester.pump();
        }
        expect(requestError, isNull);
        expect(
          completed,
          false,
          reason: 'The actual stop must await confirmation: $earlyReply',
        );
        expect(find.byType(AlertDialog), findsOneWidget);
        final paused = await tester.runAsync(() async {
          final marker =
              "'${'${root!.path}/web-input-observed'.replaceAll("'", "'\"'\"'")}'";
          socket!.add(
            jsonEncode({
              'type': 'item',
              'streamId': 's03-web-terminal',
              'value': {
                'type': 'write',
                'sequence': 1,
                'data': "printf 's03-web-input\\n' >> $marker\n",
              },
            }),
          );
          final refused = await webRpc('pluginInventory/list', {});
          expect(refused.code, 503);
          final service =
              (await actual.session.sendRequest(
                    'status',
                    serviceId: 'desktop',
                    timeout: const Duration(seconds: 5),
                  ))['result']
                  as Map;
          final web =
              (await actual.session.sendRequest(
                    'status',
                    serviceId: 'web',
                    timeout: const Duration(seconds: 5),
                  ))['result']
                  as Map;
          expect(service['state'], 'running');
          expect(service['ready'], false);
          expect(service['instanceId'], host!['lease']);
          expect(service['message'], contains('等待停止或重启确认'));
          expect(web['state'], 'running');
          expect(web['ready'], false);
          expect(web['message'], contains(service['message'] as String));
          expect(web['instanceId'], webInstance);
          await _sameWeb(
            root!,
            resources!,
            actual.webPid,
            webInstance!,
            actual.url.port,
          );
          await _sameHost(root!, host!);
          await Future<void>.delayed(const Duration(milliseconds: 250));
          expect(socket!.readyState, WebSocket.open);
          expect(
            frames.any(
              (row) =>
                  row['type'] == 'item' &&
                  row['value'] is Map &&
                  (row['value'] as Map)['type'] == 'ack' &&
                  (row['value'] as Map)['sequence'] == 1,
            ),
            false,
          );
          expect(
            await File('${root!.path}/web-input-observed').exists(),
            false,
          );
          return (service: service, web: web, httpCode: refused.code);
        });
        expect(paused, isNotNull);
        final beforeCancel = paused!;
        await tester.tap(find.text('取消'));
        await tester.pump();
        final restored = await tester.runAsync(() async {
          final canceled = await pending!;
          expect((canceled['error'] as Map)['message'], contains('取消'));
          await _wait(
            'the original WebSocket input resumes after cancel',
            () async {
              if (socketError != null) throw socketError!;
              return frames.any(
                    (row) =>
                        row['type'] == 'item' &&
                        row['value'] is Map &&
                        (row['value'] as Map)['type'] == 'ack' &&
                        (row['value'] as Map)['sequence'] == 1,
                  ) &&
                  await File('${root!.path}/web-input-observed').exists();
            },
          );
          expect(
            await File('${root!.path}/web-input-observed').readAsString(),
            's03-web-input\n',
          );
          expect(socket!.readyState, WebSocket.open);
          final sameCookieRpc = await webRpc('pluginInventory/list', {});
          expect(sameCookieRpc.code, 200);
          expect((jsonDecode(sameCookieRpc.text) as Map)['result']['ok'], true);
          final web =
              (await actual.session.sendRequest(
                    'status',
                    serviceId: 'web',
                    timeout: const Duration(seconds: 5),
                  ))['result']
                  as Map;
          expect(web['ready'], true);
          expect(web['instanceId'], webInstance);
          await _sameWeb(
            root!,
            resources!,
            actual.webPid,
            webInstance!,
            actual.url.port,
          );
          await _sameHost(root!, host!);
          await task!.releaseModel(1);
          await task!.waitForResult(actual.taskId, 1);
          final projection = await webRpc('session/projections', {
            'request': {'sessionId': actual.taskId},
          });
          expect(projection.code, 200);
          final sequence =
              ((jsonDecode(projection.text) as Map)['result']['value']
                  as Map)['asOfSeq'];
          final page = await webRpc('session/page', {
            'request': {
              'address': {'kind': 'session', 'sessionId': actual.taskId},
              'throughSeq': sequence,
              'maxMessages': 20,
            },
          });
          expect(page.code, 200);
          expect(page.text, contains('S04 persisted task result 1'));
          final facts = {
            'hostPid': host!['pid'],
            'hostLease': host!['lease'],
            'webPid': actual.webPid,
            'webInstance': webInstance,
            'port': actual.url.port,
            'taskId': actual.taskId,
            'before': actual.before,
            'pausedService': beforeCancel.service,
            'pausedWeb': beforeCancel.web,
            'pausedHttpCode': beforeCancel.httpCode,
            'after': web,
            'restoredHttpCode': sameCookieRpc.code,
            'actualWebTaskPage': jsonDecode(page.text),
          };
          await File('${root!.path}/web-admission-result.json')
              .writeAsString(jsonEncode(facts));
          stdout.writeln(
            'S03_WEB_ADMISSION_FACTS=${jsonEncode({...facts}..remove('actualWebTaskPage'))}',
          );
          return true;
        });
        expect(restored, true);
      } catch (_) {
        failed = true;
        rethrow;
      } finally {
        if (find.byType(AlertDialog).evaluate().isNotEmpty) {
          await tester.tap(find.text('取消'));
          await tester.pump();
        }
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          await closeProbeResources([
            (
              'pending stop decision',
              () async {
                await pending;
              },
            ),
            (
              'WebSocket',
              () async {
                await socket?.close().timeout(const Duration(seconds: 5));
                await framesSubscription?.cancel();
              },
            ),
            (
              'SDK integration',
              () async {
                await integration?.close();
              },
            ),
            (
              'launcher controller',
              () async {
                await model?.close();
              },
            ),
            (
              'SDK server',
              () async {
                await server?.close();
              },
            ),
            (
              'owned Web daemon',
              () async {
                if (root != null && resources != null) {
                  await _cleanupDaemon(
                    root!,
                    resources!,
                    'web',
                    webInstance: webInstance,
                  );
                }
              },
            ),
            (
              'owned service manager',
              () async {
                if (root != null && resources != null) {
                  await _cleanupDaemon(
                    root!,
                    resources!,
                    'service',
                    host: host,
                  );
                }
              },
            ),
            (
              'HTTP clients',
              () async {
                http.close(force: true);
                await task?.closeTerminal();
                task?.close();
              },
            ),
          ], preserveFailure: failed);
          stdout.writeln('S03_WEB_ADMISSION_FIXTURE=${root?.path}');
        });
        model?.dispose();
      }
    },
    timeout: const Timeout(Duration(seconds: 120)),
    skip: artifact == null,
  );
}
