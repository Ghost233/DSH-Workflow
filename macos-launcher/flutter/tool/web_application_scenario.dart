import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:launcher_core/launcher_core.dart';

import 'application_probe.dart' show require, waitFor;
import 'web_startup_wait.dart';
import 'probe_diagnostics.dart' show safeInspectorOutput;

Future<bool> desktopExitObserved(
  int pid, {
  void Function(Map<String, Object?>)? observe,
}) async {
  final check = await Process.run('/bin/kill', ['-0', '$pid']);
  final gone =
      check.exitCode != 0 &&
      check.stderr.toString().contains('No such process');
  observe?.call({
    'pid': pid,
    'rawExit': check.exitCode,
    'rawStdout': safeInspectorOutput(check.stdout),
    'rawStderr': safeInspectorOutput(check.stderr),
    'predicateGone': gone,
  });
  return gone;
}

Future<bool> ownedReceiptAbsent(File receipt) async {
  final parent = await receipt.parent.resolveSymbolicLinks();
  if (parent != receipt.parent.absolute.path ||
      await FileSystemEntity.isLink(receipt.path)) {
    throw StateError('Owned receipt path identity is unknown');
  }
  try {
    final actual = await receipt.resolveSymbolicLinks();
    if (actual != receipt.absolute.path) {
      throw StateError('Owned receipt path identity changed');
    }
    await receipt.length();
    return false;
  } on FileSystemException catch (error) {
    if (error.osError?.errorCode == 2) return true;
    rethrow;
  }
}

Future<ServerSession> currentSdkSession(LauncherServer server) async {
  ServerSession? current;
  await waitFor('current official SDK connection', () async {
    current = server.sessionFor('dsh-workflow');
    return current != null;
  });
  return current ??
      (throw StateError('Current official SDK session unavailable'));
}

typedef ApplicationState = Future<Map<String, Object?>> Function([
  Map<String, String>? parameters,
]);

typedef WebSdkRequest = Future<Map<String, Object?>> Function(
  String method, {
  String service,
  Map<String, Object?>? params,
});

typedef WebAppRequest = Future<Map<String, Object?>> Function(
  String method, {
  Map<String, Object?>? params,
});

class WebObservation {
  WebObservation({
    required this.root,
    required this.port,
    required this.backend,
    required this.capabilities,
    required this.sdk,
    required this.ui,
    required this.state,
    required this.backendHealth,
    required this.webHealth,
    required this.tap,
    required this.capture,
    required this.reconnectManager,
    required this.appRequest,
    required this.disconnectManager,
    required this.stopOwnedHost,
    required this.replaceOwnedHost,
    required this.applicationExit,
    required this.ownsHostReceipt,
    required this.startupFailure,
  });
  final Future<int> applicationExit;
  final Future<bool> Function(Map<String, Object?>) ownsHostReceipt;
  final Future<String?> Function(int) startupFailure;
  final Directory root;
  final int port;
  final Map<String, Object?> backend, capabilities;
  final WebSdkRequest sdk;
  final Future<Map<String, Object?>> Function() ui, backendHealth, webHealth;
  final ApplicationState state;
  String get resources => '${root.path}/missing-runtime';
  File get receipt =>
      File('${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json');
  final Future<void> Function(String) tap, capture;
  final Future<void> Function() reconnectManager;
  final WebAppRequest appRequest;
  final Future<void> Function({bool sessionOnly}) disconnectManager;
  final Future<void> Function() stopOwnedHost;
  final Future<Map<String, Object?>> Function() replaceOwnedHost;
}

class WebProbeOptions {
  WebProbeOptions(this.sourceResources, this.backend, this.port);
  final String sourceResources, backend;
  final int port;
  static WebProbeOptions? parse(List<String> args) {
    if (args.length != 7 || args[1] != '--web-runtime') return null;
    if (args[3] != '--web-backend' ||
        !{'headless', 'desktop'}.contains(args[4]) ||
        args[5] != '--web-port') {
      throw ArgumentError(
        'Use --web-runtime RESOURCES --web-backend headless|desktop --web-port PORT',
      );
    }
    final port = int.parse(args[6]);
    if (port < 0 || port > 65535) throw ArgumentError('Invalid Web probe port');
    if (args[4] == 'desktop' &&
        Platform.environment['GITHUB_ACTIONS'] != 'true') {
      throw StateError(
        'Official Desktop GUI probe requires the clean GitHub macOS CI session',
      );
    }
    return WebProbeOptions(Directory(args[2]).absolute.path, args[4], port);
  }

  Future<int> stage(Directory root) async {
    final check = await ServerSocket.bind(InternetAddress.loopbackIPv4, port);
    final selected = check.port;
    await check.close();
    final resources = '${root.path}/missing-runtime';
    final copied = await Process.run('/usr/bin/ditto', [
      '$sourceResources/workflow',
      '$resources/workflow',
    ]);
    require(
      copied.exitCode == 0,
      'private resource stage contains the packaged project integration',
    );
    for (final name in ['node', 'desktop', 'node_modules', 'bin']) {
      await Link('$resources/$name').create('$sourceResources/$name');
    }
    final runtime = File.fromUri(Platform.script.resolve('../../runtime')).path;
    final updated = await Process.run('/usr/bin/ditto', [
      runtime,
      '$resources/workflow/macos-launcher/runtime',
    ]);
    require(
      updated.exitCode == 0,
      'private stage uses this candidate runtime scripts and unchanged packaged backend',
    );
    return selected;
  }
}

Future<void> runWebApplicationScenario({
  required WebProbeOptions options,
  required Directory root,
  required EndpointLayout layout,
  required String manifestPath,
  required int port,
  required ApplicationState state,
  required Future<int> applicationExit,
  required Future<bool> Function(Map<String, Object?>) ownsHostReceipt,
  required Future<String?> Function(int) startupFailure,
  required Future<void> Function(String) tap,
  required Future<void> Function(String) capture,
  Future<void> Function(WebObservation)? onConnected,
  Process? prestartedHost,
  IOSink? prestartedHostLog,
  bool passwordPreloaded = false,
  bool settingsOwnedWebCleanup = false,
  void Function(String, Map<String, Object?>)? diagnose,
}) async {
  final data = '${root.path}/data';
  final home = '${root.path}/home';
  final resources = '${root.path}/missing-runtime';
  final receipt = File('$data/global/.dsh-workflow/desktop/desktop-host.json');
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  final password = 'isolated-web-probe-password';
  Process? host = prestartedHost;
  LauncherServer? server;
  IOSink? hostLog = prestartedHostLog;
  var hostExited = false;
  Future<Map<String, Object?>> ui() async {
    await state({'action': 'ownEntry'});
    await Future<void>.delayed(const Duration(milliseconds: 100));
    return state();
  }

  Future<void> tapUi(String label) async {
    await ui();
    await tap(label);
  }

  Future<Map<String, Object?>> readReceipt() async =>
      (jsonDecode(await receipt.readAsString()) as Map).cast<String, Object?>();
  Future<({int code, String body, List<Cookie> cookies})> request(
    Uri uri, {
    String method = 'GET',
    String? body,
    List<Cookie> cookies = const [],
  }) async {
    final request = await client.openUrl(method, uri);
    request.followRedirects = false;
    request.cookies.addAll(cookies);
    if (body != null) {
      request.headers.contentType = ContentType(
        'application',
        'x-www-form-urlencoded',
      );
      request.write(body);
    }
    final response = await request.close().timeout(const Duration(seconds: 10));
    return (
      code: response.statusCode,
      body: await utf8.decoder.bind(response).join(),
      cookies: response.cookies,
    );
  }

  Future<Map<String, Object?>> health(Uri uri, List<Cookie> cookies) async {
    final response = await request(
      uri.resolve('/owner-workflow/api/health'),
      cookies: cookies,
    );
    require(
      response.code == 200,
      'real backend Owner health is reachable through this authenticated entry',
    );
    return (jsonDecode(response.body) as Map).cast<String, Object?>();
  }

  Future<void> portReleased() async {
    await waitFor('Web-owned access port released', () async {
      try {
        final check = await ServerSocket.bind(
          InternetAddress.loopbackIPv4,
          port,
        );
        await check.close();
        return true;
      } on SocketException {
        return false;
      }
    });
    require(true, 'Web recycle releases its actual listening port');
  }

  Future<void> startOwnedHost() async {
    require(
      options.backend == 'headless',
      'owned Host helper is headless only',
    );
    hostExited = false;
    host = await Process.start(
      '$resources/node',
      [
        File.fromUri(Platform.script.resolve('desktop_host_probe.mjs')).path,
        resources,
        data,
        home,
      ],
      environment: {...Platform.environment, 'DSH_HOME': home},
    );
    hostLog ??= File('${root.path}/host.log').openWrite();
    final hostReady = Completer<void>();
    host!.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen(
      (line) {
        hostLog!.writeln(line);
        if (line == 'HOST_READY' && !hostReady.isCompleted) {
          hostReady.complete();
        }
      },
    );
    host!.stderr.listen(hostLog!.add);
    unawaited(
      host!.exitCode.then((code) {
        hostExited = true;
        stdout.writeln('HOST_HARNESS_EXIT=$code');
      }),
    );
    await waitFor(
      'unchanged official packaged Host receipt',
      () async => await receipt.exists(),
    );
    await hostReady.future.timeout(const Duration(seconds: 15));
    require(!hostExited, 'official packaged Host runs in the private profile');
  }

  Future<void> stopOwnedHost() async {
    require(
      options.backend == 'headless' && host != null && !hostExited,
      'only this probe owned headless Host is shut down',
    );
    final pid = (await readReceipt())['pid'] as int;
    host!.stdin.writeln('shutdown');
    await host!.stdin.flush();
    require(
      await host!.exitCode.timeout(const Duration(seconds: 30)) == 0,
      'owned official Host shuts down through its actual IPC',
    );
    await waitFor(
      'owned Host PID and receipt released',
      () async =>
          !await receipt.exists() &&
          (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode != 0,
    );
  }

  var bodyFailed = false;
  try {
    await waitFor('native entry ready before menu actions', () async {
      final native = (await state())['native'] as Map;
      return native['entryVisible'] == true && native['windowVisible'] == true;
    });
    await waitFor(
      'real management UI',
      () async => ((await ui())['nodes'] as List).any(
        (node) => (node as Map)['label'].toString().contains('启动 Web'),
      ),
    );
    if (prestartedHost != null) {
      require(await receipt.exists(), 'private prestarted Host receipt exists');
      unawaited(prestartedHost.exitCode.then((_) => hostExited = true));
    } else if (options.backend == 'headless') {
      await startOwnedHost();
    } else if (!passwordPreloaded) {
      require(
        !await receipt.exists(),
        'Desktop-open scenario begins without a backend receipt',
      );
    }
    final bindings = await BindingStore.load('${root.path}/bindings.json');
    await bindings.associate(manifestPath);
    server = await LauncherServer.start(layout: layout, bindings: bindings);
    await waitFor(
      'official manager connection',
      () async => server!.sessionFor('dsh-workflow') != null,
    );
    final session = server.sessionFor('dsh-workflow')!;
    Future<Map<String, Object?>> sdk(
      String method, {
      String service = 'web',
      Map<String, Object?>? params,
    }) async {
      final elapsed = Stopwatch()..start();
      diagnose?.call('sdk-session-lookup', {
        'service': service,
        'method': method,
        'available': server!.sessionFor('dsh-workflow') != null,
      });
      final active = await currentSdkSession(server!);
      diagnose?.call('sdk-session-current', {
        'service': service,
        'method': method,
        'launcherSessionId': active.launcherSessionId,
      });
      final response = await active.sendRequest(
        method,
        serviceId: service,
        params: params,
        timeout: const Duration(seconds: 30),
      );
      final result = response['result'] as Map?;
      diagnose?.call('sdk-response', {
        'service': service,
        'method': method,
        'requestElapsedMs': elapsed.elapsedMilliseconds,
        'state': result?['state'],
        'ready': result?['ready'],
        'instanceId': result?['instanceId'],
        'hasError': response['error'] != null,
      });
      if (response['error'] != null) {
        final evidence =
            jsonEncode({
                  'service': service,
                  'method': method,
                  'elapsedMs': elapsed.elapsedMilliseconds,
                  'reply': response,
                })
                .replaceAll(RegExp(r'token=[^&\s]+'), 'token=<REDACTED>')
                .replaceAll(password, '<REDACTED>');
        await File('${root.path}/sdk-errors.log')
            .writeAsString('$evidence\n', mode: FileMode.append);
        stderr.writeln('SDK_ERROR: $evidence');
      }
      require(
        response['error'] == null,
        'official SDK $service $method succeeds',
      );
      return (response['result'] as Map).cast<String, Object?>();
    }

    final services = server.registry
        .byProject('dsh-workflow')!
        .capabilities
        .services;
    require(
      services.singleWhere((s) => s.id == 'web').methods.toSet().containsAll({
            'start',
            'recycle',
            'status',
            'logs',
          }) &&
          services.singleWhere((s) => s.id == 'desktop').methods.join(',') ==
              'status',
      'official SDK capabilities match Web ownership and Desktop observation',
    );
    for (final method in ['start', 'recycle', 'logs']) {
      final denied = await session.sendRequest(
        method,
        serviceId: 'desktop',
        timeout: const Duration(seconds: 5),
      );
      require(
        (denied['error'] as Map)['code'] == 'unsupported',
        'Desktop $method explicitly returns unsupported',
      );
    }
    if (!passwordPreloaded) {
      require(
        (await sdk('status'))['ready'] != true,
        'Web is not ready before any real access service exists',
      );
    }
    Future<Map> control(String label, String action, String direction) async {
      for (var scroll = 0; scroll < 6; scroll++) {
        final snapshot = await ui();
        final nodes = (snapshot['nodes'] as List).cast<Map>().toList();
        final matches = nodes
            .where(
              (node) =>
                  node['label'].toString().contains(label) &&
                  (node['actions'] as List).contains(action),
            )
            .toList();
        if (matches.isNotEmpty) return matches.single;
        final scroller = nodes.singleWhere(
          (node) => (node['actions'] as List).contains(direction),
        );
        await state({'action': direction, 'id': '${scroller['id']}'});
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }
      throw StateError(
        'Actual UI control unavailable after bounded scrolling: $label',
      );
    }

    await File('${root.path}/initial-web-ui.json')
        .writeAsString(jsonEncode(await state()));
    if (!passwordPreloaded) {
      final input = await control('内网访问密码', 'tap', 'scrollUp');
      await state({'action': 'tap', 'id': '${input['id']}'});
      await waitFor(
        'actual password input exposes editing after focus',
        () async => ((await ui())['nodes'] as List).cast<Map>().any(
          (node) =>
              node['label'].toString().contains('内网访问密码') &&
              (node['actions'] as List).contains('setText'),
        ),
      );
      final field = ((await ui())['nodes'] as List).cast<Map>().singleWhere(
        (node) =>
            node['label'].toString().contains('内网访问密码') &&
            (node['actions'] as List).contains('setText'),
      );
      await state({
        'action': 'setText',
        'id': '${field['id']}',
        'text': password,
      });
      await tapUi('设置密码');
      await waitFor(
        'password saved by the actual management UI',
        () async => ((await ui())['nodes'] as List).cast<Map>().any(
          (node) => node['label'].toString().contains('修改密码'),
        ),
      );
      await control('启动 Web', 'tap', 'scrollDown');
      await tapUi('启动 Web');
    } else {
      require(
        ((await ui())['nodes'] as List).cast<Map>().any(
          (node) => node['label'].toString().contains('修改密码'),
        ),
        'application reads the preexisting credential through its real native boundary',
      );
    }
    if (!await receipt.exists()) {
      require(
        (await sdk('status'))['ready'] != true,
        'missing-backend startup does not report ready before the actual Desktop receipt',
      );
    }
    await waitForActualWebStartup(
      status: () => sdk('status'),
      ui: () => state(),
      applicationExit: applicationExit,
    );
    final first = await sdk('status');
    final backend = await readReceipt();
    final lease = backend['lease'];
    final backendPid = backend['pid'] as int;
    final url = Uri.parse('http://127.0.0.1:$port/');
    require(
      (await request(url.resolve('owner-workflow/api/health'))).code == 401,
      'unauthenticated clients cannot access the real backend',
    );
    Future<List<Cookie>> authenticate() async {
      final rejected = await request(
        url.resolve('login'),
        method: 'POST',
        body: 'password=wrong',
      );
      require(rejected.code == 401, 'incorrect Web password is rejected');
      final login = await request(
        url.resolve('login'),
        method: 'POST',
        body: 'password=$password',
      );
      require(
        login.code == 303 && login.cookies.isNotEmpty,
        'isolated Web password authenticates against the actual backend',
      );
      return login.cookies;
    }

    final webCookies = await authenticate();
    final webPage = await request(url, cookies: webCookies);
    require(
      webPage.code == 200 && webPage.body.contains('<html'),
      'authenticated Web entry serves the actual packaged DSH frontend',
    );
    final webHealth = await health(url, webCookies);
    var backendUrl = Uri.parse(backend['url'] as String);
    var backendLogin = await request(backendUrl);
    final desktopPage = await request(
      backendUrl.resolve('/'),
      cookies: backendLogin.cookies,
    );
    require(
      desktopPage.code == 200 && desktopPage.body.contains('<html'),
      'direct Desktop Host serves its actual packaged frontend',
    );
    final directHealth = await health(backendUrl, backendLogin.cookies);
    require(
      webHealth['instanceId'] == lease &&
          directHealth['instanceId'] == lease &&
          webHealth['ready'] == true,
      'browser entry and direct Desktop Host expose the same real ready Owner instance',
    );
    require(
      (await sdk('status', service: 'desktop'))['instanceId'] == lease,
      'official SDK observes this same backend lease',
    );
    if (onConnected != null) {
      Future<Map<String, Object?>> appRequest(
        String method, {
        Map<String, Object?>? params,
      }) async {
        final session = server!.sessionFor('dsh-workflow')!;
        final trace = File('${root.path}/manager-app-requests.jsonl');
        Future<void> record(Map<String, Object?> detail) => trace.writeAsString(
          '${jsonEncode({'method': method, 'managed': params?['managed'], 'launcherSessionId': session.launcherSessionId, ...detail})}\n',
          mode: FileMode.append,
        );
        await record({'phase': 'request'});
        try {
          final reply = await session.sendRequest(
            method,
            params: params,
            timeout: const Duration(seconds: 5),
          );
          await record({'phase': 'response', 'reply': reply});
          return reply;
        } catch (error) {
          await record({
            'phase': 'transport-error',
            'errorType': error.runtimeType.toString(),
            'error': error.toString(),
          });
          rethrow;
        }
      }

      Future<void> disconnectManager({bool sessionOnly = false}) async {
        if (sessionOnly) {
          await server!.sessionFor('dsh-workflow')!.close();
          return;
        }
        await server!.close();
        server = null;
        await waitFor(
          'application observes manager disconnect',
          () async => ((await state())['nodes'] as List).any(
            (node) =>
                (node as Map)['label'].toString().contains('disconnected'),
          ),
        );
      }

      await onConnected(
        WebObservation(
          root: root,
          applicationExit: applicationExit,
          ownsHostReceipt: ownsHostReceipt,
          startupFailure: startupFailure,
          port: port,
          backend: backend,
          capabilities: server!.registry
              .byProject('dsh-workflow')!
              .capabilities
              .toJson(),
          sdk: sdk,
          ui: ui,
          state: state,
          backendHealth: () => health(backendUrl, backendLogin.cookies),
          webHealth: () async => health(url, await authenticate()),
          tap: tapUi,
          capture: capture,
          appRequest: appRequest,
          disconnectManager: disconnectManager,
          reconnectManager: () async {
            if (server != null) await disconnectManager();
            server = await LauncherServer.start(
              layout: layout,
              bindings: bindings,
            );
            await waitFor(
              'official manager reconnects application',
              () async => server!.sessionFor('dsh-workflow') != null,
            );
          },
          stopOwnedHost: stopOwnedHost,
          replaceOwnedHost: () async {
            require(hostExited, 'previous owned Host has actually exited');
            await startOwnedHost();
            final replacement = await readReceipt();
            backendUrl = Uri.parse(replacement['url'] as String);
            backendLogin = await request(backendUrl);
            await health(backendUrl, backendLogin.cookies);
            return replacement;
          },
        ),
      );
      if (settingsOwnedWebCleanup) {
        diagnose?.call('cleanup-web-stop-start', {'service': 'web'});
        await tapUi('停止 Web');
        await portReleased();
        require(
          (await sdk('status'))['state'] == 'stopped',
          'settings cleanup stops the owned Web service',
        );
        diagnose?.call('cleanup-web-stop-end', {
          'service': 'web',
          'present': true,
        });
      }
      return;
    }
    if (options.backend == 'desktop') {
      final native = (await state())['native'] as Map;
      final desktopPid = native['openedDesktopPid'] as int;
      final parent = await Process.run('/bin/ps', [
        '-o',
        'ppid=',
        '-p',
        '$backendPid',
      ]);
      require(
        int.parse(parent.stdout.toString().trim()) == desktopPid,
        'receipt Host is the child of the actual NSWorkspace-opened official Desktop',
      );
      require(
        await Directory('$home/profiles/desktop').exists() &&
            await Directory('$data/desktop-user-data').exists(),
        'official Desktop uses the private DSH profile and Electron browser data',
      );
      await ui();
      await capture('web-shared-desktop');
    }
    await sdk('start');
    await sdk('start');
    require(
      (await sdk('status'))['instanceId'] == first['instanceId'] &&
          (await readReceipt())['lease'] == lease,
      'sequential SDK starts reuse the running access resource and backend',
    );
    await sdk('logs');
    await sdk('recycle');
    await portReleased();
    final alive = await Process.run('/bin/kill', ['-0', '$backendPid']);
    require(
      alive.exitCode == 0 && (await readReceipt())['lease'] == lease,
      'SDK recycle preserves the independent backend and receipt',
    );
    await health(backendUrl, backendLogin.cookies);
    await sdk('start');
    await health(url, await authenticate());
    await tapUi('停止 Web');
    await portReleased();
    require(
      (await sdk('status'))['state'] == 'stopped' &&
          (await readReceipt())['lease'] == lease,
      'management recycle preserves the backend while SDK remains usable',
    );
    await health(backendUrl, backendLogin.cookies);
    await File('${root.path}/web-evidence.json').writeAsString(
      jsonEncode({
        'backend': options.backend,
        'port': port,
        'hostPid': backendPid,
        'hostLease': lease,
        'firstWebInstance': first['instanceId'],
        'uiAndSdkStartRecycle': true,
      }),
    );
    stdout.writeln(
      'T02 WEB APPLICATION SCENARIO PASSED (${options.backend}, port $port)',
    );
  } catch (error, stack) {
    bodyFailed = true;
    final message = error
        .toString()
        .replaceAll(RegExp(r'token=[^&\s]+'), 'token=<REDACTED>')
        .replaceAll(password, '<REDACTED>');
    stderr.writeln('WEB_SCENARIO_ERROR: $message\n$stack');
    Error.throwWithStackTrace(StateError(message), stack);
  } finally {
    if (options.backend == 'desktop') {
      try {
        await ui();
        await capture('web-final');
      } catch (error) {
        stderr.writeln('WEB_FINAL_CAPTURE_ERROR: $error');
      }
    }
    Object? firstCleanupError;
    StackTrace? firstCleanupStack;
    void cleanupFailed(Object error, StackTrace stack) {
      firstCleanupError ??= error;
      firstCleanupStack ??= stack;
      stderr.writeln(
        'WEB_CLEANUP_SECONDARY_ERROR: ${safeInspectorOutput(error).replaceAll(password, '<REDACTED>')}\n${safeInspectorOutput(stack)}',
      );
    }

    try {
      await server?.close();
      final remainingHost = host;
      if (remainingHost != null && !hostExited) {
        remainingHost.stdin.writeln('shutdown');
        await remainingHost.stdin.flush();
        require(
          await remainingHost.exitCode.timeout(const Duration(seconds: 30)) ==
              0,
          'owned official Host acknowledges disposal and is reaped through the fixed official owner contract',
        );
      }
      if (options.backend == 'headless' && await receipt.exists()) {
        await waitFor(
          'owned backend receipt cleanup',
          () async => !await receipt.exists(),
        );
      }
    } catch (error, stack) {
      cleanupFailed(error, stack);
    } finally {
      try {
        await hostLog?.close();
      } catch (error, stack) {
        cleanupFailed(error, stack);
      } finally {
        client.close(force: true);
      }
    }
    if (!bodyFailed && firstCleanupError != null) {
      Error.throwWithStackTrace(firstCleanupError!, firstCleanupStack!);
    }
  }
}
