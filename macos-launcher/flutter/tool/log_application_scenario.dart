import 'dart:async';
import 'dart:convert';

import 'package:launcher_core/launcher_core.dart';

import 'dart:io';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';

Future<void> runLogApplicationScenario(WebObservation app) async {
  final first = await app.sdk('status');
  final instance = first['instanceId'];
  final receipt =
      '${app.root.path}/data/global/.dsh-workflow/desktop/desktop-host.json';
  final launcherPid = ((await app.ui())['native'] as Map)['pid'] as int;
  final children = await Process.run('/usr/bin/pgrep', [
    '-P',
    '$launcherPid',
    '-f',
    'global-supervisor.mjs',
  ]);
  final supervisorPid = int.parse(children.stdout.toString().trim());
  final hostPid = app.backend['pid'] as int;
  final lease = app.backend['lease'];
  require(
    first['state'] == 'running' && first['ready'] == true && instance is String,
    'logs scenario begins with a real ready Web connection',
  );
  // Corrupt only the owned receipt permissions to trigger the actual Web
  // connection's receipt validator; no backend output is fabricated.
  final corrupt = await Process.run('/bin/chmod', ['0644', receipt]);
  require(corrupt.exitCode == 0, 'owned receipt permission fault was applied');
  try {
    await waitFor(
      'actual Web resource disconnects',
      () async => (await app.sdk('status'))['state'] == 'stopped',
    );
    final status = await app.sdk('status');
    require(
      status['ready'] == false && status['instanceId'] == null,
      'live supervisor does not report disconnected access resources as running',
    );
    final supervisorAlive = await Process.run('/bin/kill', [
      '-0',
      '$supervisorPid',
    ]);
    require(
      supervisorAlive.exitCode == 0,
      'actual supervisor PID remains alive after connection failure',
    );
    final alive = await Process.run('/bin/kill', ['-0', '$hostPid']);
    require(
      alive.exitCode == 0,
      'receipt failure does not kill the independent Host',
    );
    final bind = await ServerSocket.bind(
      InternetAddress.loopbackIPv4,
      app.port,
    );
    await bind.close();
    require(true, 'actual failed Web connection released its private port');
    final batch = await app.sdk('logs', params: {'limit': 500});
    await File('${app.root.path}/log-fault.json').writeAsString(
      jsonEncode({
        'status': status,
        'logs': batch,
        'supervisorPid': supervisorPid,
        'hostPid': hostPid,
        'hostLease': lease,
        'chmod': '0644',
        'privatePort': app.port,
      }),
    );
    await app.tap('日志');
    await app.ui();
    await app.capture('logs-fault-observed');
    final entries = (batch['entries'] as List).cast<Map>();
    require(
      entries.any((entry) => entry['text'] == 'Unsafe Desktop Host receipt'),
      'official SDK exposes the real Web connection error as original log text',
    );
    require(
      entries.single['timestamp'] == null &&
          entries.single['stream'] == 'unknown' &&
          batch['observedAt'] is String,
      'source does not provide write time or stream; stdout carrier supplies neither',
    );
    require(
      batch['instanceId'] == instance,
      'real connection error retains the actual failed Web instance scope',
    );
    await waitFor(
      'real connection error visible in log page',
      () async => ((await app.ui())['nodes'] as List).any(
        (node) => (node as Map)['label'].toString().contains(
          'Unsafe Desktop Host receipt',
        ),
      ),
    );
    await app.capture('logs-fault');
    require(
      ((await app.ui())['nodes'] as List).any(
        (node) => (node as Map)['label'].toString().contains('日志实例：$instance'),
      ),
      'actual log page identifies the retained real connection scope',
    );
  } finally {
    final restore = await Process.run('/bin/chmod', ['0600', receipt]);
    require(restore.exitCode == 0, 'owned receipt permissions restored');
  }
  await app.sdk('start');
  final second = await app.sdk('status');
  require(
    second['instanceId'] != instance && second['ready'] == true,
    'real reconnect creates a new access connection',
  );
  final secondLogs = await app.sdk('logs', params: {'limit': 500});
  require(
    (secondLogs['entries'] as List).isEmpty &&
        secondLogs['instanceId'] == second['instanceId'],
    'new real connection contains no previous connection log',
  );
  await app.reconnectManager();
  require(
    (await app.sdk('status'))['instanceId'] == second['instanceId'],
    'official SDK session replacement preserves the actual access instance',
  );
  final pause = await Process.run('/bin/kill', ['-STOP', '$hostPid']);
  require(pause.exitCode == 0, 'only the exact owned Host PID was paused');
  Map<String, Object?>? unavailable;
  try {
    unavailable = await app.sdk('status', service: 'desktop');
    require(
      unavailable['state'] == 'running' &&
          unavailable['instanceId'] == lease &&
          unavailable['ready'] == null,
      'live trusted Host with unavailable health preserves running and unknown readiness',
    );
  } finally {
    final resume = await Process.run('/bin/kill', ['-CONT', '$hostPid']);
    require(resume.exitCode == 0, 'owned Host resumed before cleanup');
  }
  require(
    (await app.sdk('status', service: 'desktop'))['ready'] == true,
    'real Host health recovers after resume',
  );
  await File('${app.root.path}/log-state-observations.json').writeAsString(
    jsonEncode({
      'firstInstance': instance,
      'second': second,
      'afterReconnect': await app.sdk('status'),
      'desktopUnavailable': unavailable,
      'hostPid': hostPid,
      'hostLease': lease,
    }),
  );
  await app.tap('管理');
  await app.tap('重连 Web');
  await waitFor(
    'actual restarted connection ready',
    () async => (await app.sdk('status'))['ready'] == true,
  );
  final third = await app.sdk('status');
  final thirdLogs = await app.sdk('logs', params: {'limit': 500});
  require(
    third['instanceId'] != second['instanceId'] &&
        (thirdLogs['entries'] as List).isEmpty &&
        thirdLogs['instanceId'] == third['instanceId'],
    'real supervisor restart begins a clean new access log scope',
  );
  await app.sdk('recycle');
  stdout.writeln('T03 REAL LOG SCENARIO PASSED');
}

const _controlledProducer = r'''
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
const root = process.argv[2];
let instanceId = null, state = 'starting';
const write = (name, value) => process.stdout.write(name + '\t' + JSON.stringify(value) + '\n');
const snapshot = () => ({ state, instanceId, url: 'http://127.0.0.1:1/' });
const log = (scope, text) => write('DSH_WORKFLOW_LOG', { instanceId: scope, entry: { text } });
write('DSH_WORKFLOW_STATE', { global: snapshot() });
log(null, 'controlled unknown before first connection');
const socket = createServer(client => {
  createInterface({ input: client }).on('line', command => {
    if (command !== 'known') { client.end('invalid command\n'); return; }
    instanceId = 'controlled-scope-A'; state = 'running';
    write('DSH_WORKFLOW_STATE', { global: snapshot() });
    write('DSH_WORKFLOW_READY', { url: snapshot().url, lanUrls: [] });
    log(instanceId, 'controlled known A');
    client.end('done\n');
  });
});
socket.listen(root + '/log-fixture.sock');
const input = createInterface({ input: process.stdin });
input.on('close', () => { socket.close(); process.exit(0); });
process.once('SIGTERM', () => { socket.close(); process.exit(0); });
input.on('line', line => {
  const request = JSON.parse(line);
  write('DSH_WORKFLOW_REPLY', { requestId: request.requestId, ok: true, global: snapshot() });
});
''';

Future<void> stageControlledLogs(Directory root, String node) async {
  final runtime = Directory(
    '${root.path}/missing-runtime/workflow/macos-launcher/runtime',
  );
  await runtime.create(recursive: true);
  await Directory('${root.path}/data').create();
  await File('${root.path}/data/lan-password')
      .writeAsString('controlled-private-only');
  await Link('${root.path}/missing-runtime/node')
      .create(File(node).absolute.path);
  await File('${runtime.path}/global-supervisor.mjs')
      .writeAsString(_controlledProducer);
  await File('${runtime.path}/plugin-versions.mjs')
      .writeAsString('console.log(JSON.stringify({rows:[]}));\n');
}

Future<void> runControlledLogs(
  Directory root,
  EndpointLayout layout,
  String manifestPath,
  ApplicationState state,
  Future<void> Function(String) tap,
  Future<void> Function(String) capture,
) async {
  final bindings = await BindingStore.load('${root.path}/bindings.json');
  await bindings.associate(manifestPath);
  final manager = await LauncherServer.start(
    layout: layout,
    bindings: bindings,
  );
  try {
    await waitFor(
      'controlled producer socket',
      () async =>
          FileSystemEntity.type('${root.path}/data/log-fixture.sock')
              .then((type) => type != FileSystemEntityType.notFound),
    );
    await waitFor(
      'official SDK connected to controlled transport app',
      () async => manager.sessionFor('dsh-workflow') != null,
    );
    Future<Map<String, Object?>> sdk(
      String method, {
      Map<String, Object?>? params,
    }) async {
      final reply = await manager
          .sessionFor('dsh-workflow')!
          .sendRequest(
            method,
            serviceId: 'web',
            params: params,
            timeout: const Duration(seconds: 5),
          );
      require(
        reply['error'] == null,
        'controlled transport SDK $method succeeds',
      );
      return (reply['result'] as Map).cast<String, Object?>();
    }

    await waitFor(
      'unknown scope log delivered through actual app pipe',
      () async => ((await sdk('logs'))['entries'] as List).isNotEmpty,
    );
    final unknown = await sdk('logs');
    require(
      unknown['instanceId'] == null &&
          (unknown['entries'] as List).single['timestamp'] == null &&
          (unknown['entries'] as List).single['stream'] == 'unknown',
      'controlled transport preserves unknown scope and source metadata',
    );
    final socket = await Socket.connect(
      InternetAddress(
        '${root.path}/data/log-fixture.sock',
        type: InternetAddressType.unix,
      ),
      0,
    );
    socket.writeln('known');
    await socket.flush();
    await socket.transform(utf8.decoder).join();
    await socket.close();
    await waitFor(
      'controlled first connection ready',
      () async => (await sdk('status'))['ready'] == true,
    );
    final known = await sdk('logs');
    await File('${root.path}/controlled-scope.json')
        .writeAsString(jsonEncode({'unknown': unknown, 'known': known}));
    await state({'action': 'ownEntry'});
    await tap('日志');
    await Future<void>.delayed(const Duration(milliseconds: 200));
    await capture('controlled-known');
    require(
      known['instanceId'] == 'controlled-scope-A' &&
          (known['entries'] as List).length == 1 &&
          (known['entries'] as List).single['text'] == 'controlled known A',
      'unknown origin log is never relabelled as the first known instance',
    );
    await sdk('recycle');
    stdout.writeln(
      'T03 CONTROLLED TRANSPORT SUPPLEMENT PASSED; NO REAL BACKEND',
    );
  } finally {
    await manager.close();
  }
}
