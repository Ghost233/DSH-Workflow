import 'dart:convert';
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
  } finally {
    final restore = await Process.run('/bin/chmod', ['0600', receipt]);
    require(restore.exitCode == 0, 'owned receipt permissions restored');
  }
  await app.sdk('start');
  await app.sdk('recycle');
  stdout.writeln('T03 REAL LOG SCENARIO PASSED');
}
