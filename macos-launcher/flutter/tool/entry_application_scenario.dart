import 'dart:convert';
import 'dart:io';

import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';

/// Uses the same live Web and official Host prepared by the application probe.
/// Entry/window observations never call ui(), which opens the own menu action.
Future<void> runEntryApplicationScenario(WebObservation app) async {
  final initial = await app.sdk('status');
  final webInstance = initial['instanceId'];
  final hostPid = app.backend['pid'] as int;
  final lease = app.backend['lease'];
  final launcherPid = ((await app.state())['native'] as Map)['pid'] as int;
  final children = await Process.run('/usr/bin/pgrep', [
    '-P',
    '$launcherPid',
    '-f',
    'global-supervisor.mjs',
  ]);
  require(
    children.exitCode == 0 &&
        children.stdout.toString().trim().split('\n').length == 1,
    'entry scenario observes exactly one real Web supervisor child',
  );
  final supervisorPid = int.parse(children.stdout.toString().trim());
  require(
    initial['state'] == 'running' &&
        initial['ready'] == true &&
        webInstance is String,
    'entry scenario begins with the actual ready Web instance',
  );
  final requests = File('${app.root.path}/entry-sdk-requests.jsonl');

  Future<Map<String, Object?>> native() async =>
      ((await app.state())['native'] as Map).cast<String, Object?>();

  Future<void> checkpoint(String name, {bool connected = true}) async {
    final snapshot = await app.state();
    final actual = (snapshot['native'] as Map).cast<String, Object?>();
    final receipt = (jsonDecode(await app.receipt.readAsString()) as Map)
        .cast<String, Object?>();
    final webHealth = await app.authenticatedWebHealth();
    final backendHealth = await app.backendHealth();
    final status = connected ? await app.sdk('status') : null;
    final pids = await Future.wait([
      for (final pid in [launcherPid, supervisorPid, hostPid])
        Process.run('/bin/kill', ['-0', '$pid']),
    ]);
    await File('${app.root.path}/entry-$name.json').writeAsString(
      jsonEncode({
        'checkpoint': name,
        'native': actual,
        'flutterErrors': snapshot['errors'],
        'webStatus': status,
        'webHealth': webHealth,
        'backendHealth': backendHealth,
        'hostLease': receipt['lease'],
        'hostPid': receipt['pid'],
        'supervisorPid': supervisorPid,
        'pidChecks': pids.map((result) => result.exitCode).toList(),
        'webPort': app.port,
      }),
    );
    require(
      actual['pid'] == launcherPid &&
          pids.every((result) => result.exitCode == 0) &&
          receipt['pid'] == hostPid &&
          receipt['lease'] == lease &&
          webHealth['instanceId'] == lease &&
          webHealth['ready'] == true &&
          backendHealth['instanceId'] == lease &&
          backendHealth['ready'] == true,
      '$name preserves real processes, Host lease and authenticated Web/Host access',
    );
    if (connected) {
      require(
        status!['state'] == 'running' &&
            status['ready'] == true &&
            status['instanceId'] == webInstance,
        '$name preserves this same official SDK Web instance',
      );
    }
    require(
      snapshot['errors'] is List && (snapshot['errors'] as List).isEmpty,
      '$name has no Flutter errors at the actual application boundary',
    );
  }

  Future<void> managed(bool value, String name) async {
    final reply = await app.appRequest(
      kMethodSetEntryManaged,
      params: {'managed': value},
    );
    // Observe immediately after the response: eventual invisibility cannot
    // substitute for an acknowledgement of an already completed native action.
    final actual = await native();
    await requests.writeAsString(
      '${jsonEncode({'operation': name, 'reply': reply, 'native': actual})}\n',
      mode: FileMode.append,
    );
    require(
      reply['error'] == null &&
          (reply['result'] as Map?)?['confirmed'] == true &&
          actual['entryVisible'] == !value,
      '$name acknowledges the actual native menu visibility',
    );
  }

  Future<void> openWindow(String name) async {
    final reply = await app.appRequest(kMethodOpenWindow);
    await requests.writeAsString(
      '${jsonEncode({'operation': name, 'reply': reply})}\n',
      mode: FileMode.append,
    );
    require(reply['error'] == null, '$name succeeds through the official SDK');
    await waitFor('actual SDK window activation', () async {
      final actual = await native();
      return actual['windowVisible'] == true &&
          actual['windowKey'] == true &&
          actual['appActive'] == true;
    });
  }

  Future<void> closeWindow(String name) async {
    await app.state({'action': 'close'});
    require(
      (await native())['windowVisible'] == false,
      '$name closes the actual native management window',
    );
    await checkpoint(name);
  }

  require(
    (await native())['entryVisible'] == true,
    'before takeover the real own menu remains visible',
  );
  await checkpoint('before-takeover');
  await managed(true, 'first-takeover');
  await closeWindow('managed-window-closed');
  await openWindow('managed-sdk-open');
  require(
    (await native())['entryVisible'] == false,
    'SDK activates the management window while the own menu is actually hidden',
  );
  await checkpoint('managed-window-open');
  await app.capture('entry-managed-window');
  await managed(false, 'explicit-return');
  await checkpoint('explicit-return');

  await managed(true, 'manager-exit-takeover');
  await app.disconnectManager();
  await waitFor(
    'own native entry restored after manager listener shutdown',
    () async => (await native())['entryVisible'] == true,
  );
  await checkpoint('manager-exited', connected: false);
  await app.reconnectManager();
  await checkpoint('manager-reconnected');
  await openWindow('reconnected-sdk-open');

  await managed(true, 'connection-loss-takeover');
  await app.disconnectManager(sessionOnly: true);
  await waitFor(
    'own native entry restored after accepted SDK connection ends',
    () async => (await native())['entryVisible'] == true,
  );
  await checkpoint('connection-lost', connected: false);
  await app.reconnectManager();
  await checkpoint('connection-reconnected');
  await managed(true, 'second-takeover');
  await closeWindow('reconnected-managed-window-closed');
  await openWindow('reconnected-managed-sdk-open');
  await managed(false, 'second-return');
  await checkpoint('second-return');
  await app.capture('entry-returned-window');

  // Recycle is an explicit, separate service operation after continuity has
  // been proved. Manager shutdown and entry return never request this action.
  await app.sdk('recycle');
  require(
    (await app.sdk('status'))['state'] == 'stopped' &&
        (await app.backendHealth())['instanceId'] == lease &&
        (await Process.run('/bin/kill', ['-0', '$hostPid'])).exitCode == 0 &&
        (await native())['entryVisible'] == true,
    'separate Web recycle retains the independent Host and native entry',
  );
  final listener = await ServerSocket.bind(InternetAddress.loopbackIPv4, app.port);
  await listener.close();
  require(true, 'explicit service recycle releases the private Web port');
  stdout.writeln('T06 ENTRY CORE SCENARIO PASSED');
}
