import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor, closeProbeResources;
import 'web_application_scenario.dart';
import 'service_task_fixture.dart';

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
          'host-unavailable',
          'cold-web-unavailable',
          'web-recycle',
          'host-new-lease',
          'task-continuity',
        }.contains(args[4])) {
      throw ArgumentError(
        'Use --lifecycle-runtime RESOURCES --lifecycle-case late-handle-paused-quit|recovery-paused-quit|normal-quit|host-unavailable|cold-web-unavailable|web-recycle|host-new-lease|task-continuity',
      );
    }
    return LifecycleProbeOptions(Directory(args[2]).absolute.path, args[4]);
  }
}

Future<int> _webPid(WebObservation actual) async {
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
  require(
    sockets.exitCode == 0 && owners.length == 1,
    'the actual Web access port has exactly one process owner',
  );
  final pid = int.parse(owners.single.substring(1));
  final identity = await Process.run('/bin/ps', [
    '-p',
    '$pid',
    '-o',
    'uid=,command=',
  ]);
  final uid = await Process.run('/usr/bin/id', ['-u']);
  final command = identity.stdout.toString().trim();
  await File('${actual.root.path}/lifecycle-web-identity.log').writeAsString(
    'pid=$pid port=${actual.port}\n$command\n',
    mode: FileMode.append,
  );
  require(
    identity.exitCode == 0 &&
        uid.exitCode == 0 &&
        command.startsWith('${uid.stdout.toString().trim()} ') &&
        command.contains('${actual.root.path}/') &&
        command.contains('global-supervisor.mjs'),
    'the real Web listener belongs to this UID and isolated application root',
  );
  return pid;
}

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
  final pid = await _webPid(actual);
  final before = await actual.sdk('status');
  await actual.reconnectManager();
  require(
    (await actual.sdk('status'))['instanceId'] == before['instanceId'],
    'reconnecting the official SDK retains the actual Web resource',
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
        (await actual.sdk('status'))['instanceId'] == before['instanceId'] &&
        await _webPid(actual) == pid,
    'concurrent repeated SDK starts retain the one real access resource',
  );
  await _onlyListener(actual, pid);
  await _ownerAtHost(actual, actual.backend);
  await File('${actual.root.path}/lifecycle-concurrent-starts.json')
      .writeAsString(
        jsonEncode({'webPid': pid, 'before': before, 'replies': starts}),
      );
  await _connectionLifecycle(
    actual,
    application,
    replaceHost: true,
    pauseOnQuit: true,
  );
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
    require(
      await application.exitCode.timeout(const Duration(seconds: 6)) == 0,
      'the real launcher quits normally with exit code zero',
    );
    if (pause) {
      require(
        (await Process.run('/bin/ps', [
          '-o',
          'stat=',
          '-p',
          '$pid',
        ])).stdout.toString().trim().startsWith('T'),
        'the independent Web daemon remains OS-paused after launcher quit',
      );
      require(
        (await actual.backendHealth())['instanceId'] == host['lease'],
        'the actual Host remains healthy while the independent Web is paused',
      );
      require(
        Process.killPid(pid, ProcessSignal.sigcont),
        'only the paused fixture Web daemon is resumed',
      );
      paused = false;
    }
    final web = await actual.webHealth();
    final direct = await actual.backendHealth();
    require(
      web['ready'] == true &&
          web['instanceId'] == host['lease'] &&
          direct['instanceId'] == host['lease'],
      'the password-authenticated Web entry and same real Host survive normal launcher quit',
    );
    await _onlyListener(actual, pid);
    final current = jsonDecode(await actual.receipt.readAsString()) as Map;
    require(
      current['pid'] == host['pid'] && current['lease'] == host['lease'],
      'launcher quit preserves the exact independent Host receipt',
    );
    await File('${actual.root.path}/lifecycle-quit.json').writeAsString(
      jsonEncode({
        'pause': pause,
        'pausedStat': pausedStat,
        'quitElapsedMs': elapsed.elapsedMilliseconds,
        'webPid': pid,
        'hostPid': host['pid'],
        'hostLease': host['lease'],
        'actualWebHealthAfterLauncherQuit': web,
        'actualHostHealthAfterLauncherQuit': direct,
      }),
    );
    stdout.writeln(
      'S03 WEB AND HOST SURVIVE NORMAL LAUNCHER QUIT PASSED (pause=$pause)',
    );
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'owned surviving Web fixture',
        () async {
          if (paused) Process.killPid(pid, ProcessSignal.sigcont);
          await _cleanupWebFixture(actual);
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
  if (scenario == 'host-unavailable') {
    return _hostUnavailable(actual, application);
  }
  if (scenario == 'cold-web-unavailable') {
    return _hostUnavailable(actual, application, coldStart: true);
  }
  if (scenario == 'web-recycle' || scenario == 'host-new-lease') {
    return _connectionLifecycle(
      actual,
      application,
      replaceHost: scenario == 'host-new-lease',
    );
  }
  if (scenario == 'task-continuity') {
    return _taskContinuity(actual, application);
  }
  if (scenario == 'late-handle-paused-quit') {
    return _lateHandleQuit(actual, application);
  }
  if (scenario == 'recovery-paused-quit') {
    return _recoverAndQuit(actual, application);
  }
  await _quitRunning(actual, application, actual.backend, pause: false);
}

Future<void> _connectionLifecycle(
  WebObservation actual,
  Process application, {
  required bool replaceHost,
  bool pauseOnQuit = false,
}) async {
  WebSocket? socket, staleSocket, freshSocket;
  StreamSubscription<dynamic>? subscription,
      staleSubscription,
      freshSubscription;
  var failed = false;
  try {
    final firstWeb = await actual.sdk('status');
    final directory = await Directory('${actual.root.path}/shared-workspace')
        .create();
    final workspace = await actual.hostRpc('workspace/create', {
      'request': {'path': directory.path},
    }) as Map;
    final session = await actual.hostRpc('session/create', {
      'request': {
        'workspaceId': (workspace['workspace'] as Map)['workspaceId'],
      },
    }) as Map;
    final sessionId = session['sessionId'] as String;
    const title = 'S03 shared Web session';
    final renamed = await actual.hostRpc('session/rename', {
      'request': {'sessionId': sessionId, 'title': title},
    }) as Map;
    final args = <String, Object?>{
      'request': {'sessionId': sessionId},
    };
    Future<void> assertSession({required bool throughWeb}) async {
      final result = await (throughWeb ? actual.webRpc : actual.hostRpc)(
        'session/projections',
        args,
      ) as Map;
      require(
        (result['values'] as Map)['title'] == title &&
            (result['asOfSeq'] as num) >= (renamed['seq'] as num),
        'the ${throughWeb ? 'Web client' : 'direct Host'} reads the real renamed session at its committed sequence',
      );
    }

    await assertSession(throughWeb: true);
    final oldSocket = await actual.openSocket();
    socket = oldSocket;
    final closed = Completer<void>();
    subscription = oldSocket.listen(
      (_) {},
      onError: (Object _) {},
      onDone: () {
        if (!closed.isCompleted) closed.complete();
      },
    );
    require(
      oldSocket.readyState == WebSocket.open,
      'the actual authenticated official WebSocket is open',
    );
    Map<String, Object?> currentHost = actual.backend;
    if (replaceHost) {
      await actual.stopOwnedHost();
      await closed.future.timeout(const Duration(seconds: 5));
      currentHost = await actual.replaceOwnedHost();
      require(
        currentHost['lease'] != actual.backend['lease'] &&
            currentHost['pid'] != actual.backend['pid'],
        'an explicitly started replacement Host has a distinct actual PID and lease',
      );
      require(
        await actual.initialSessionStatus() == 503,
        'the old Web connection cannot use old credentials against the replacement Host',
      );
      await actual.tap('重连 Web');
    } else {
      await actual.sdk('recycle');
      await _portReleased(actual);
      await closed.future.timeout(const Duration(seconds: 5));
      require(
        (await Process.run('/bin/kill', [
              '-0',
              '${actual.backend['pid']}',
            ])).exitCode ==
            0,
        'Web recycle preserves the actual independent Host process',
      );
      await assertSession(throughWeb: false);
      await actual.sdk('start');
    }
    require(
      oldSocket.readyState == WebSocket.closed,
      'the old physical WebSocket is closed before reconnecting',
    );
    await waitFor(
      'the actual Web reconnect is available',
      () async => (await actual.sdk('status'))['ready'] == true,
    );
    final currentWeb = await actual.sdk('status');
    require(
      currentWeb['instanceId'] != firstWeb['instanceId'],
      'reconnecting creates a new access run without another business Host',
    );
    await _ownerAtHost(actual, currentHost);
    await assertSession(throughWeb: true);
    require(
      await actual.initialSessionStatus() == 401,
      'the previous Web session cannot authenticate the new access run',
    );
    var rejectedOldSocket = false;
    try {
      final stale = await actual.openSocket(originalSession: true);
      staleSocket = stale;
      staleSubscription = stale.listen((_) {}, onError: (Object _) {});
    } on WebSocketException catch (error) {
      stdout.writeln('S03_OLD_WEBSOCKET_HTTP_STATUS=${error.httpStatusCode}');
      stdout.writeln(
        'S03_OLD_WEBSOCKET_REJECTION=${jsonEncode({'type': error.runtimeType.toString(), 'status': error.httpStatusCode, 'error': error.toString().replaceAll(RegExp(r'token=[^&\s]+'), 'token=<REDACTED>')})}',
      );
      rejectedOldSocket = error.httpStatusCode == 401;
    }
    require(
      rejectedOldSocket,
      'the old Web cookie cannot open a WebSocket on the new access run',
    );
    final fresh = await actual.openSocket();
    freshSocket = fresh;
    freshSubscription = fresh.listen((_) {}, onError: (Object _) {});
    require(
      fresh.readyState == WebSocket.open,
      'fresh password authentication opens a WebSocket to the current Host',
    );
    await fresh.close().timeout(const Duration(seconds: 5));
    await _onlyListener(actual, await _webPid(actual));
    await File('${actual.root.path}/web-connection-lifecycle.json')
        .writeAsString(
          jsonEncode({
            'replaceHost': replaceHost,
            'firstHost': {
              'pid': actual.backend['pid'],
              'lease': actual.backend['lease'],
            },
            'currentHost': {
              'pid': currentHost['pid'],
              'lease': currentHost['lease'],
            },
            'firstWeb': firstWeb,
            'currentWeb': currentWeb,
            'sessionId': sessionId,
            'sessionTitle': title,
            'port': actual.port,
            'oldSocketClosed': true,
            'oldSessionRejected': true,
            'freshSocketOpen': true,
          }),
        );
    if (Platform.environment['DSH_WEB_BROWSER_OBSERVE'] == '1') {
      final gateway = Uri.parse('http://127.0.0.1:${actual.port}/');
      final completed = File('${actual.root.path}/browser-observed.json');
      final observation = {
        'url': gateway.toString(),
        'sessionId': sessionId,
        'sessionTitle': title,
        'workspaceId': (workspace['workspace'] as Map)['workspaceId'],
        'workspacePath': directory.path,
        'hostLease': currentHost['lease'],
        'webInstanceId': currentWeb['instanceId'],
        'completionFile': completed.path,
        'holdSeconds': 180,
      };
      await File('${actual.root.path}/browser-observation-request.json')
          .writeAsString(jsonEncode(observation));
      stdout.writeln('S03_BROWSER_OBSERVATION=${jsonEncode(observation)}');
      final elapsed = Stopwatch()..start();
      while (!await completed.exists() &&
          elapsed.elapsed < const Duration(seconds: 180)) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
      require(
        await completed.exists(),
        'the bounded real browser observation completed',
      );
      final result = jsonDecode(await completed.readAsString()) as Map;
      final observed = Uri.parse(result['url'] as String);
      require(
        observed.origin == gateway.origin &&
            (result['documentTitle'] as String).contains(title),
        'the actual browser selected the same isolated session and canonical title',
      );
      stdout.writeln('S03_BROWSER_OBSERVATION_CONFIRMED=${jsonEncode(result)}');
    }
    await actual.capture('web-connection-lifecycle');
    await _quitRunning(actual, application, currentHost, pause: pauseOnQuit);
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'WebSocket fixture',
        () async {
          for (final owned in [
            socket,
            staleSocket,
            freshSocket,
          ].whereType<WebSocket>()) {
            await owned.close().timeout(const Duration(seconds: 5));
          }
          for (final owned in [
            subscription,
            staleSubscription,
            freshSubscription,
          ].whereType<StreamSubscription<dynamic>>()) {
            await owned.cancel();
          }
        },
      ),
      (
        'owned launcher fixture',
        () async {
          if ((await Process.run('/bin/kill', [
                '-0',
                '${application.pid}',
              ])).exitCode ==
              0) {
            await actual.state({'action': 'quit'});
            await application.exitCode.timeout(const Duration(seconds: 10));
          }
        },
      ),
      ('owned Web control fixture', () => _cleanupWebFixture(actual)),
    ], preserveFailure: failed);
  }
}

Future<void> _cleanupWebFixture(WebObservation actual) async {
  final record = File(
    '${actual.root.path}/data/global/.dsh-workflow/web/manager.json',
  );
  if (!await record.exists()) return;
  require(
    !await FileSystemEntity.isLink(record.path) &&
        await record.parent.resolveSymbolicLinks() ==
            record.parent.absolute.path &&
        ((await record.stat()).mode & 0x3f) == 0,
    'Web fixture cleanup retains private canonical record permissions',
  );
  final value = jsonDecode(await record.readAsString()) as Map;
  final pid = value['pid'] as int;
  final identity = await Process.run('/bin/ps', [
    '-p',
    '$pid',
    '-o',
    'uid=,command=',
  ]);
  final uid = (await Process.run('/usr/bin/id', [
    '-u',
  ])).stdout.toString().trim();
  final command = identity.stdout.toString().trim();
  require(
    identity.exitCode == 0 &&
        command.startsWith('$uid ') &&
        command.contains('global-supervisor.mjs') &&
        command.contains('${actual.root.path}/data'),
    'cleanup only signals this UID and isolated Web control process',
  );
  Process.killPid(pid, ProcessSignal.sigterm);
  await waitFor(
    'owned Web control fixture cleanup',
    () async =>
        !await record.exists() &&
        (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode != 0,
  );
}

Future<void> _hostUnavailable(
  WebObservation actual,
  Process application, {
  bool coldStart = false,
}) async {
  var webPid = await _webPid(actual);
  final before = await actual.sdk('status');
  var expectedInstance = before['instanceId'];
  var failed = false;
  try {
    if (coldStart) {
      await actual.sdk('recycle');
      await _portReleased(actual);
      require(
        (await actual.sdk('status'))['state'] == 'stopped',
        'cold Web startup begins with no access resource',
      );
    }
    await actual.stopOwnedHost();
    await _pidGone(actual.backend['pid'] as int);
    if (coldStart) {
      await actual.sdk('start');
      webPid = await _webPid(actual);
      expectedInstance = (await actual.sdk('status'))['instanceId'];
      require(
        expectedInstance != before['instanceId'],
        'cold Web startup creates its own resource without an existing Host',
      );
    }
    final page = await actual.webEntry();
    require(
      page.code == 503 &&
          RegExp(
            r'服务不可用|service unavailable',
            caseSensitive: false,
          ).hasMatch(page.body),
      'the existing browser entry clearly reports DSH service unavailable',
    );
    final after = await actual.sdk('status');
    require(
      after['state'] == 'running' && after['instanceId'] == expectedInstance,
      'the official SDK keeps the same Web resource running when its Host is absent',
    );
    require(
      after['ready'] == false && after['message'].toString().contains('服务不可用'),
      'the official SDK marks a listening Web entry unavailable when its Host is absent',
    );
    final service = await actual.sdk('status', service: 'desktop');
    require(
      service['state'] == 'stopped' &&
          service['ready'] == false &&
          !await File(
            '${actual.root.path}/data/global/.dsh-workflow/service/manager.json',
          ).exists(),
      'Web startup and refresh leave the absent business manager and Host stopped',
    );
    await _onlyListener(actual, webPid);
    final native = (await actual.ui())['native'] as Map;
    require(
      native['openedDesktopPid'] == null && !await actual.receipt.exists(),
      'the Web entry neither opens a Desktop client nor starts a replacement Host',
    );
    await actual.capture('web-host-unavailable');
    await File('${actual.root.path}/web-host-unavailable.json').writeAsString(
      jsonEncode({
        'webPid': webPid,
        'coldStart': coldStart,
        'hostPid': actual.backend['pid'],
        'hostLease': actual.backend['lease'],
        'before': before,
        'after': after,
        'browserStatus': page.code,
        'browserBody': page.body,
        'native': native,
      }),
    );
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'owned launcher',
        () async {
          await actual.state({'action': 'quit'});
          require(
            await application.exitCode.timeout(const Duration(seconds: 10)) ==
                0,
            'the isolated launcher quits normally after the Host-unavailable observation',
          );
        },
      ),
      (
        'owned Web fixture',
        () async {
          Process.killPid(webPid, ProcessSignal.sigterm);
          await waitFor(
            'owned Web fixture exits',
            () async =>
                (await Process.run('/bin/kill', ['-0', '$webPid'])).exitCode !=
                0,
          );
        },
      ),
    ], preserveFailure: failed);
  }
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
    await Future<void>.delayed(const Duration(milliseconds: 100));
    require(
      (await Process.run('/bin/kill', ['-0', '${application.pid}'])).exitCode ==
              0 &&
          (await Process.run('/bin/ps', [
            '-o',
            'stat=',
            '-p',
            '$pid',
          ])).stdout.toString().trim().startsWith('T'),
      'launcher close waits for the admitted start while its real CLI is paused',
    );
    require(
      Process.killPid(pid, ProcessSignal.sigcont),
      'only the owned paused transport is resumed to complete the admitted start',
    );
    paused = false;
    require(
      await application.exitCode.timeout(const Duration(seconds: 6)) == 0,
      'the admitted Web start settles before the real launcher quits normally',
    );
    await _pidGone(pid);
    final webPid = await _webPid(actual);
    await _onlyListener(actual, webPid);
    require(
      (await actual.webHealth())['instanceId'] == actual.backend['lease'] &&
          (await actual.backendHealth())['instanceId'] ==
              actual.backend['lease'],
      'the independent Web and same Host survive the pending-start launcher quit',
    );
    await File('${actual.root.path}/lifecycle-late-handle-quit.json')
        .writeAsString(
          jsonEncode({
            'transportPid': pid,
            'webPid': webPid,
            'hostPid': actual.backend['pid'],
            'hostLease': actual.backend['lease'],
          }),
        );
    stdout.writeln(
      'S03 LATE HANDLE SETTLED AND INDEPENDENT WEB SURVIVED QUIT PASSED',
    );
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
      ('independent Web fixture', () => _cleanupWebFixture(actual)),
    ], preserveFailure: failed);
  }
}

Future<void> _taskContinuity(WebObservation actual, Process application) async {
  require(
    Platform.environment['DSH_WEB_TASK_CONTINUITY'] == '1',
    'the external model fixture was staged before the actual Host started',
  );
  final task = ServiceTaskFixture(actual.root.path);
  final host = jsonDecode(await actual.receipt.readAsString()) as Map;
  final first = await actual.sdk('status');
  final webPid = await _webPid(actual);
  var failed = false;
  try {
    await task.connect(host);
    final id = await task.acceptTask(
      'S03 keep this accepted task across Web recycle and launcher quit',
    );
    await task.waitForModelRequest(1);
    require(
      !jsonEncode(await task.page(id)).contains('S04 persisted task result 1'),
      'the real accepted task is awaiting its external model response',
    );
    await actual.sdk('recycle');
    await _portReleased(actual);
    require(
      (await actual.backendHealth())['instanceId'] == host['lease'],
      'Web recycle leaves the same actual Host healthy with its task in flight',
    );
    await actual.sdk('start');
    await waitFor(
      'reopened Web can reach the still-running task Host',
      () async => (await actual.sdk('status'))['ready'] == true,
    );
    final current = await actual.sdk('status');
    require(
      current['instanceId'] != first['instanceId'] &&
          await _webPid(actual) == webPid &&
          await actual.initialSessionStatus() == 401,
      'reopened Web has a new access instance and rejects the old session',
    );
    await actual.state({'action': 'quit'});
    require(
      await application.exitCode.timeout(const Duration(seconds: 6)) == 0,
      'the real launcher quits normally while its accepted task is in flight',
    );
    require(
      (await actual.webHealth())['instanceId'] == host['lease'],
      'the authenticated Web still reaches the same task Host after launcher quit',
    );
    await task.releaseModel(1);
    final result = await task.waitForResult(id, 1);
    final projection = await actual.webRpc('session/projections', {
      'request': {'sessionId': id},
    }) as Map;
    final webPage = await actual.webRpc('session/page', {
      'request': {
        'address': {'kind': 'session', 'sessionId': id},
        'throughSeq': projection['asOfSeq'],
        'maxMessages': 20,
      },
    }) as Map;
    require(
      jsonEncode(webPage).contains('S04 persisted task result 1'),
      'the reauthenticated real Web reads the completed task result after launcher quit',
    );
    final retainedHost = jsonDecode(await actual.receipt.readAsString()) as Map;
    require(
      retainedHost['pid'] == host['pid'] &&
          retainedHost['lease'] == host['lease'],
      'the in-flight task kept its original Host PID and lease throughout both client boundaries',
    );
    await _onlyListener(actual, webPid);
    await File('${actual.root.path}/web-task-continuity.json').writeAsString(
      jsonEncode({
        'sessionId': id,
        'hostPid': host['pid'],
        'hostLease': host['lease'],
        'webPid': webPid,
        'firstWeb': first,
        'reopenedWeb': current,
        'actualHostPage': result,
        'actualWebPage': webPage,
      }),
    );
    stdout.writeln(
      'S03 ACCEPTED TASK SURVIVES WEB RECYCLE AND LAUNCHER QUIT PASSED session=$id',
    );
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      ('task HTTP client', task.close),
      (
        'owned launcher fixture',
        () async {
          if ((await Process.run('/bin/kill', [
                '-0',
                '${application.pid}',
              ])).exitCode ==
              0) {
            await actual.state({'action': 'quit'});
            await application.exitCode.timeout(const Duration(seconds: 10));
          }
        },
      ),
      ('owned Web control fixture', () => _cleanupWebFixture(actual)),
    ], preserveFailure: failed);
  }
}
