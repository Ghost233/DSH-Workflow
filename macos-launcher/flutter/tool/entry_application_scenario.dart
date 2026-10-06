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
    final webHealth = await app.webHealth();
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
      '${jsonEncode({'operation': name, 'reply': reply, 'native': await native()})}\n',
      mode: FileMode.append,
    );
    require(reply['error'] == null, '$name succeeds through the official SDK');
    try {
      await waitFor('actual SDK window activation', () async {
        final actual = await native();
        await File('${app.root.path}/entry-window-$name.jsonl').writeAsString(
          '${jsonEncode({'observedAt': DateTime.now().toUtc().toIso8601String(), 'native': actual})}\n',
          mode: FileMode.append,
        );
        return actual['windowVisible'] == true &&
            actual['windowKey'] == true &&
            actual['appActive'] == true;
      });
    } catch (_) {
      final actual = await native();
      await File('${app.root.path}/entry-window-$name-failure.json')
          .writeAsString(jsonEncode(actual));
      if (actual['windowVisible'] == true) {
        await app.capture('entry-window-$name-failure');
      }
      rethrow;
    }
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

  final gateRoot = Directory('${app.root.path}/data');
  await File('${gateRoot.path}/entry-probe-owner')
      .writeAsString('$launcherPid');
  final gateTrace = File('${gateRoot.path}/entry-native.jsonl');
  Future<List<Map>> trace(String token) async {
    if (!await gateTrace.exists()) return [];
    return (await gateTrace.readAsLines())
        .where((line) => line.isNotEmpty)
        .map((line) => jsonDecode(line) as Map)
        .where((line) => line['token'] == token)
        .toList();
  }

  Future<void> hold(String token) async {
    await File('${gateRoot.path}/entry-hold').writeAsString(token);
  }

  Future<Map<String, Object?>> outcome() async {
    try {
      return await app.appRequest(
        kMethodSetEntryManaged,
        params: {'managed': true},
      );
    } catch (error) {
      // Retain the real transport exception distinctly from a protocol reply.
      return {
        'transportError': error.toString(),
        'transportErrorType': error.runtimeType.toString(),
      };
    }
  }

  Future<void> held(String token) async {
    await waitFor(
      'actual native entry action held',
      () async => (await trace(token)).any((line) => line['phase'] == 'held'),
    );
    require(
      (await native())['entryVisible'] == true,
      '$token leaves the real entry available before native action completion',
    );
  }

  Future<void> clearGate() async {
    for (final name in ['entry-hold', 'entry-release', 'entry-cancel']) {
      final file = File('${gateRoot.path}/$name');
      if (await file.exists()) await file.delete();
    }
  }

  Future<void> fault(String token, {bool cancel = false}) async {
    await hold(token);
    final pending = outcome();
    await held(token);
    if (cancel) {
      await File('${gateRoot.path}/entry-cancel').writeAsString(token);
    }
    final reply = await pending;
    final actual = await native();
    await File('${app.root.path}/entry-$token.json').writeAsString(
      jsonEncode({
        'condition': cancel
            ? 'owned native action cancellation'
            : 'owned native I/O release timeout',
        'reply': reply,
        'native': actual,
        'trace': await trace(token),
      }),
    );
    require(
      reply['error'] is Map &&
          (reply['error'] as Map)['code'] == 'failed' &&
          (reply['error'] as Map)['message'].toString().contains(
            cancel ? 'entry_gate_cancelled' : 'entry_gate_timeout',
          ) &&
          reply['result'] == null &&
          actual['entryVisible'] == true,
      '$token reports a real native failure without claiming takeover or hiding the entry',
    );
    await clearGate();
    await openWindow('$token-sdk-open');
    await checkpoint(token);
  }

  await fault('cancelled-takeover', cancel: true);
  await fault('timeout-takeover');

  Future<void> late(String token, {bool reconnectBeforeRelease = false}) async {
    await hold(token);
    final pending = outcome();
    await held(token);
    await checkpoint('$token-held');
    await app.disconnectManager();
    require(
      (await native())['entryVisible'] == true,
      '$token retains the actual entry while the takeover is still incomplete',
    );
    await checkpoint('$token-disconnected', connected: false);
    if (reconnectBeforeRelease) {
      await app.reconnectManager();
      await openWindow('$token-current-session-open');
      await checkpoint('$token-reconnected-before-release');
    }
    await File('${gateRoot.path}/entry-release').writeAsString(token);
    await waitFor('actual delayed entry action and restoration', () async {
      final actions = await trace(token);
      return actions.any(
            (line) =>
                line['phase'] == 'released-applied' &&
                line['managed'] == true &&
                line['entryVisible'] == false,
          ) &&
          actions.any(
            (line) =>
                line['phase'] == 'applied' &&
                line['managed'] == false &&
                line['entryVisible'] == true,
          ) &&
          (await native())['entryVisible'] == true;
    });
    final reply = await pending;
    final actions = await trace(token);
    final hidden = actions.firstWhere(
      (line) => line['phase'] == 'released-applied',
    );
    final returned = actions.firstWhere(
      (line) =>
          line['phase'] == 'applied' &&
          line['managed'] == false &&
          line['entryVisible'] == true,
    );
    require(
      reply['transportErrorType'] == 'StateError' &&
          reply['transportError'].toString().contains('connection lost') &&
          (hidden['uptime'] as num) <= (returned['uptime'] as num),
      '$token completes the actual delayed hide then restore without acknowledging the dead session',
    );
    await File('${app.root.path}/entry-$token.json').writeAsString(
      jsonEncode({
        'condition': 'owned native action released after manager disconnect',
        'reconnectedBeforeRelease': reconnectBeforeRelease,
        'oldRequestOutcome': reply,
        'trace': actions,
        'native': await native(),
      }),
    );
    await clearGate();
    if (!reconnectBeforeRelease) await app.reconnectManager();
    await checkpoint('$token-restored');
    await managed(true, '$token-new-takeover');
    await openWindow('$token-new-sdk-open');
    await managed(false, '$token-new-return');
    await checkpoint('$token-new-return');
  }

  await late('late-disconnected');
  await late('late-reconnected', reconnectBeforeRelease: true);
  await app.capture('entry-after-late-window');

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
  final listener = await ServerSocket.bind(
    InternetAddress.loopbackIPv4,
    app.port,
  );
  await listener.close();
  require(true, 'explicit service recycle releases the private Web port');
  stdout.writeln('T06 ENTRY APPLICATION SCENARIO PASSED');
}
