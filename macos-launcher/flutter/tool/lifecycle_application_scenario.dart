import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor, closeProbeResources;
import 'web_application_scenario.dart';

class LifecycleProbeOptions {
  LifecycleProbeOptions(this.resources, this.scenario);
  final String resources, scenario;
  WebProbeOptions get web => WebProbeOptions(resources, 'headless', 0);
  static LifecycleProbeOptions? parse(List<String> args) {
    if (args.length != 5 || args[1] != '--lifecycle-runtime') return null;
    if (args[3] != '--lifecycle-case' ||
        !{
          'late-handle-paused-quit',
          'recovery-paused-quit',
          'normal-quit',
        }.contains(args[4])) {
      throw ArgumentError(
        'Use --lifecycle-runtime RESOURCES --lifecycle-case late-handle-paused-quit|recovery-paused-quit|normal-quit',
      );
    }
    return LifecycleProbeOptions(Directory(args[2]).absolute.path, args[4]);
  }
}

Future<int> _webPid(WebObservation actual) async =>
    (jsonDecode(
          await File('${actual.root.path}/data/owned-web-child.json')
              .readAsString(),
        ) as Map)['pid']
        as int;

Future<void> _pidGone(int pid) async {
  final gone = await Process.run('/bin/kill', ['-0', '$pid']);
  require(
    gone.exitCode != 0 && gone.stderr.toString().contains('No such process'),
    'exact owned PID $pid is gone',
  );
}

Future<void> _portReleased(WebObservation actual) async {
  final listener = await ServerSocket.bind(
    InternetAddress.anyIPv4,
    actual.port,
  );
  await listener.close();
  require(true, 'actual Web access port can bind and listen after release');
}

Future<void> _onlyListener(WebObservation actual, int pid) async {
  final sockets = await Process.run('/usr/sbin/lsof', [
    '-nP',
    '-iTCP:${actual.port}',
    '-sTCP:LISTEN',
    '-Fp',
  ]);
  final owners = const LineSplitter()
      .convert(sockets.stdout.toString())
      .where((line) => RegExp(r'^p[0-9]+$').hasMatch(line))
      .toSet();
  await File('${actual.root.path}/lifecycle-listeners.log').writeAsString(
    'expected=$pid port=${actual.port}\n${sockets.stdout}',
    mode: FileMode.append,
  );
  require(
    sockets.exitCode == 0 && owners.length == 1 && owners.single == 'p$pid',
    'one actual tracked Web supervisor owns the access listener',
  );
}

Future<void> _ownerAtHost(
  WebObservation actual,
  Map<String, Object?> host,
) async {
  final direct = await actual.backendHealth();
  final web = await actual.webHealth();
  require(
    direct['instanceId'] == host['lease'] &&
        web['instanceId'] == host['lease'] &&
        direct['ready'] == true &&
        web['ready'] == true,
    'authenticated actual Web and direct Host health share the replacement lease',
  );
}

Future<void> _recoverAndQuit(WebObservation actual, Process application) async {
  final firstPid = await _webPid(actual);
  final first = await actual.sdk('status');
  final hosts = [actual.backend];
  final connections = [first['instanceId']];
  await actual.stopOwnedHost();
  await _pidGone(actual.backend['pid'] as int);
  await waitFor(
    'actual Host exit closes Web but retains supervisor',
    () async => (await actual.sdk('status'))['state'] == 'stopped',
  );
  require(
    (await Process.run('/bin/kill', ['-0', '$firstPid'])).exitCode == 0,
    'actual supervisor remains alive after independent Host exits',
  );
  await _portReleased(actual);
  final secondHost = await actual.replaceOwnedHost();
  hosts.add(secondHost);
  require(
    secondHost['lease'] != actual.backend['lease'] &&
        secondHost['pid'] != actual.backend['pid'],
    'replacement Host supplies its own actual new PID and lease',
  );
  await actual.sdk('start');
  await waitFor(
    'SDK recovers the living supervisor onto the replacement Host',
    () async => (await actual.sdk('status'))['ready'] == true,
  );
  final second = await actual.sdk('status');
  connections.add(second['instanceId']);
  require(
    await _webPid(actual) == firstPid &&
        second['instanceId'] != first['instanceId'],
    'SDK recovery creates a new real connection in the same supervisor',
  );
  await _onlyListener(actual, firstPid);
  await _ownerAtHost(actual, secondHost);
  await actual.reconnectManager();
  require(
    (await actual.sdk('status'))['instanceId'] == second['instanceId'],
    'manager reconnection retains the actual recovered Web connection',
  );
  final starts = await Future.wait([
    for (var i = 0; i < 2; i++)
      (() async {
        try {
          return await actual.sdk('start');
        } catch (_) {
          final lines = await File('${actual.root.path}/sdk-errors.log')
              .readAsLines();
          final reply = (jsonDecode(lines.last) as Map)['reply'] as Map;
          require(
            (reply['error'] as Map)['code'] == 'busy',
            'overlapping SDK start is either settled or accurately busy',
          );
          return null;
        }
      })(),
  ]);
  require(
    starts.any((reply) => reply != null) &&
        (await actual.sdk('status'))['instanceId'] == second['instanceId'] &&
        await _webPid(actual) == firstPid,
    'concurrent repeated SDK starts retain the one real access resource',
  );
  await _onlyListener(actual, firstPid);
  final secondReceipt = jsonDecode(await actual.receipt.readAsString()) as Map;
  require(
    secondReceipt['pid'] == secondHost['pid'] &&
        secondReceipt['lease'] == secondHost['lease'],
    'concurrent access starts do not create a second actual Host',
  );
  await actual.stopOwnedHost();
  await _pidGone(secondHost['pid'] as int);
  await waitFor(
    'second actual Host exit releases the access connection',
    () async => (await actual.sdk('status'))['state'] == 'stopped',
  );
  await _portReleased(actual);
  final thirdHost = await actual.replaceOwnedHost();
  hosts.add(thirdHost);
  require(
    thirdHost['lease'] != secondHost['lease'],
    'second replacement carries a distinct real lease',
  );
  await actual.tap('重连 Web');
  await waitFor(
    'actual management UI recovers the replacement Host',
    () async =>
        (await actual.sdk('status'))['ready'] == true &&
        await _webPid(actual) != firstPid,
  );
  final thirdPid = await _webPid(actual);
  final third = await actual.sdk('status');
  connections.add(third['instanceId']);
  require(
    third['instanceId'] != second['instanceId'],
    'management reconnect establishes its own actual new Web connection',
  );
  await _pidGone(firstPid);
  await _onlyListener(actual, thirdPid);
  await _ownerAtHost(actual, thirdHost);
  await actual.ui();
  await actual.capture('lifecycle-recovered-ui');
  await File('${actual.root.path}/lifecycle-recovery.json').writeAsString(
    jsonEncode({
      'port': actual.port,
      'supervisorBeforeUi': firstPid,
      'supervisorAfterUi': thirdPid,
      'hosts': [
        for (final host in hosts) {'pid': host['pid'], 'lease': host['lease']},
      ],
      'actualConnections': connections,
      'concurrentSdkStartReplies': starts,
    }),
  );
  await _quitRunning(actual, application, thirdHost, pause: true);
  stdout.writeln('T04 REAL HOST RECOVERY AND PAUSED QUIT PASSED');
}

Future<void> _quitRunning(
  WebObservation actual,
  Process application,
  Map<String, Object?> host, {
  required bool pause,
}) async {
  final pid = await _webPid(actual);
  await _onlyListener(actual, pid);
  final native = (await actual.ui())['native'] as Map;
  require(
    native['openedDesktopPid'] == null && native['isolated'] == true,
    'real native observation remains in the isolated headless profile',
  );
  await actual.capture('lifecycle-running');
  await File('${actual.root.path}/lifecycle-owned.json').writeAsString(
    jsonEncode({
      'childPid': pid,
      'hostPid': host['pid'],
      'hostLease': host['lease'],
      'port': actual.port,
    }),
  );
  var paused = false;
  var pausedStat = '';
  var failed = false;
  try {
    if (pause) {
      require(
        Process.killPid(pid, ProcessSignal.sigstop),
        'only the owned running Web is paused',
      );
      paused = true;
      await waitFor(
        'actual owned Web process enters OS stopped state',
        () async {
          pausedStat = (await Process.run('/bin/ps', [
            '-o',
            'stat=',
            '-p',
            '$pid',
          ])).stdout.toString().trim();
          return pausedStat.startsWith('T');
        },
      );
    }
    final elapsed = Stopwatch()..start();
    await actual.state({'action': 'quit'});
    if (pause) await actual.state({'action': 'quit'});
    require(
      await application.exitCode.timeout(const Duration(seconds: 6)) == 0,
      'real application waits for owned running Web cleanup before normal quit',
    );
    paused = false;
    await _pidGone(pid);
    await _portReleased(actual);
    final health = await actual.backendHealth();
    require(
      health['instanceId'] == host['lease'] && health['ready'] == true,
      'independent actual Host stays healthy after Web and Launcher exit',
    );
    final current = jsonDecode(await actual.receipt.readAsString()) as Map;
    require(
      current['pid'] == host['pid'] && current['lease'] == host['lease'],
      'Launcher cleanup preserves the exact independent Host receipt',
    );
    await File('${actual.root.path}/lifecycle-quit.json').writeAsString(
      jsonEncode({
        'pause': pause,
        'pausedStat': pausedStat,
        'quitElapsedMs': elapsed.elapsedMilliseconds,
        'webPid': pid,
        'hostPid': host['pid'],
        'hostLease': host['lease'],
        'actualHostHealth': health,
        'portBindAndListen': true,
      }),
    );
    stdout.writeln('T04 RUNNING WEB QUIT PASSED (pause=$pause)');
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'owned paused Web',
        () async {
          if (paused) {
            Process.killPid(pid, ProcessSignal.sigcont);
            Process.killPid(pid, ProcessSignal.sigterm);
            await waitFor(
              'failed probe owned paused Web cleanup',
              () async =>
                  (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode !=
                  0,
            );
          }
        },
      ),
    ], preserveFailure: failed);
  }
}

Future<void> runLifecycleScenario(
  WebObservation actual,
  Process application,
  String scenario,
) async {
  if (scenario == 'late-handle-paused-quit') {
    return _lateHandleQuit(actual, application);
  }
  if (scenario == 'recovery-paused-quit') {
    return _recoverAndQuit(actual, application);
  }
  await _quitRunning(actual, application, actual.backend, pause: false);
}

Future<void> _lateHandleQuit(WebObservation actual, Process application) async {
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

  var failed = false;
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
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'owned paused child',
        () async {
          final cleanupPid = heldPid;
          if (paused && cleanupPid != null) {
            Process.killPid(cleanupPid, ProcessSignal.sigcont);
            Process.killPid(cleanupPid, ProcessSignal.sigterm);
            await waitFor(
              'failed probe owned child cleanup',
              () async =>
                  (await Process.run('/bin/kill', [
                    '-0',
                    '$cleanupPid',
                  ])).exitCode !=
                  0,
            );
          }
        },
      ),
      (
        'late handle marker',
        () async {
          if (await armed.exists()) await armed.delete();
        },
      ),
      (
        'late handle socket',
        () {
          gate?.destroy();
        },
      ),
      ('late handle server', gateServer.close),
    ], preserveFailure: failed);
  }
}
