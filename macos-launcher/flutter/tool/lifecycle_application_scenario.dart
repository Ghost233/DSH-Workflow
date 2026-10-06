import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';

class LifecycleProbeOptions {
  LifecycleProbeOptions(this.resources, this.scenario);
  final String resources, scenario;
  WebProbeOptions get web => WebProbeOptions(resources, 'headless', 0);
  static LifecycleProbeOptions? parse(List<String> args) {
    if (args.length != 5 || args[1] != '--lifecycle-runtime') return null;
    if (args[3] != '--lifecycle-case' || args[4] != 'late-handle-paused-quit') {
      throw ArgumentError(
        'Use --lifecycle-runtime RESOURCES --lifecycle-case late-handle-paused-quit',
      );
    }
    return LifecycleProbeOptions(Directory(args[2]).absolute.path, args[4]);
  }
}

Future<void> runLifecycleScenario(
  WebObservation actual,
  Process application,
) async {
  final gatePath = '${actual.root.path}/data/start-gate.sock';
  final armed = File('$gatePath.arm');
  final gateServer = await ServerSocket.bind(
    InternetAddress(gatePath, type: InternetAddressType.unix),
    0,
  );
  Socket? gate;
  int? heldPid;
  var paused = false;
  Future<void> listenReleased() async {
    final listener = await ServerSocket.bind(
      InternetAddress.anyIPv4,
      actual.port,
    );
    await listener.close();
  }

  Future<void> expectBusy(String method) async {
    var rejected = false;
    try {
      await actual.sdk(method);
    } catch (_) {
      rejected = true;
      final replies = await File('${actual.root.path}/sdk-errors.log')
          .readAsLines();
      final response = jsonDecode(replies.last) as Map;
      require(
        ((response['reply'] as Map)['error'] as Map)['code'] == 'busy',
        'official SDK $method reports the real shared mutation as busy',
      );
    }
    require(
      rejected,
      'SDK $method cannot succeed before the UI start handle returns',
    );
  }

  try {
    await actual.sdk('recycle');
    await listenReleased();
    final accepted = gateServer.first;
    await armed.writeAsString('armed');
    await actual.tap('启动 Web');
    gate = await accepted.timeout(const Duration(seconds: 10));
    final gateEvent = Completer<String>();
    utf8.decoder.bind(gate).transform(const LineSplitter()).listen((line) {
      if (!gateEvent.isCompleted) gateEvent.complete(line);
    });
    final event = await gateEvent.future.timeout(const Duration(seconds: 10));
    final pid = (jsonDecode(event) as Map)['pid'] as int;
    heldPid = pid;
    require(
      (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode == 0,
      'real Web child exists while its Process.start handle is withheld',
    );
    await File('${actual.root.path}/lifecycle-owned.json').writeAsString(
      '${jsonEncode({'childPid': pid, 'hostPid': actual.backend['pid'], 'hostLease': actual.backend['lease'], 'port': actual.port})}\n',
    );
    await expectBusy('recycle');
    await actual.reconnectManager();
    await expectBusy('recycle');
    final currentBackend =
        jsonDecode(await actual.receipt.readAsString()) as Map;
    require(
      currentBackend['pid'] == actual.backend['pid'] &&
          currentBackend['lease'] == actual.backend['lease'],
      'UI start and conflicting SDK reconnect retain the same actual Host',
    );
    await actual.ui();
    await actual.capture('lifecycle-held-start');
    require(
      Process.killPid(pid, ProcessSignal.sigstop),
      'only the observed owned Web child is paused',
    );
    paused = true;
    await actual.state({'action': 'quit'});
    await waitFor(
      'actual cleanup starts before returning the process handle',
      () async =>
          await File('${actual.root.path}/data/lifecycle-close-started')
              .exists(),
    );
    await actual.state({'action': 'quit'});
    require(
      (await Process.run('/bin/kill', ['-0', '${application.pid}'])).exitCode ==
          0,
      'repeated real quit waits while the start handle remains pending',
    );
    await armed.delete();
    gate.write('release\n');
    await gate.flush();
    require(
      await application.exitCode.timeout(const Duration(seconds: 6)) == 0,
      'quit settles the late paused child before the real application exits',
    );
    paused = false;
    final gone = await Process.run('/bin/kill', ['-0', '$pid']);
    require(
      gone.exitCode != 0 && gone.stderr.toString().contains('No such process'),
      'late paused Web PID is gone after quit',
    );
    await listenReleased();
    require(
      (await actual.backendHealth())['instanceId'] == actual.backend['lease'],
      'independent real Host remains healthy after Web and launcher quit',
    );
    stdout.writeln('T04 LATE HANDLE PAUSED QUIT PASSED');
  } finally {
    final cleanupPid = heldPid;
    if (paused && cleanupPid != null) {
      Process.killPid(cleanupPid, ProcessSignal.sigcont);
      Process.killPid(cleanupPid, ProcessSignal.sigterm);
      await waitFor(
        'failed probe owned child cleanup',
        () async =>
            (await Process.run('/bin/kill', ['-0', '$cleanupPid'])).exitCode !=
            0,
      );
    }
    if (await armed.exists()) await armed.delete();
    gate?.destroy();
    await gateServer.close();
  }
}
