import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:launcher_core/launcher_core.dart';

import 'application_probe.dart' show require, waitFor;
import 'web_startup_wait.dart';
import 'probe_diagnostics.dart' show safeInspectorOutput;

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
    required this.webEntry,
    required this.hostRpc,
    required this.webRpc,
    required this.initialSessionStatus,
    required this.openSocket,
    required this.tap,
    required this.capture,
    required this.reconnectManager,
    required this.appRequest,
    required this.disconnectManager,
    required this.stopOwnedHost,
    required this.replaceOwnedHost,
  });
  final Directory root;
  final int port;
  final Map<String, Object?> backend, capabilities;
  final WebSdkRequest sdk;
  final Future<Map<String, Object?>> Function() ui, backendHealth, webHealth;
  final Future<({int code, String body})> Function() webEntry;
  final Future<Object?> Function(String, Map<String, Object?>) hostRpc, webRpc;
  final Future<int> Function() initialSessionStatus;
  final Future<WebSocket> Function({bool originalSession}) openSocket;
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
  WebProbeOptions(this.sourceResources, this.port);
  final String sourceResources;
  final int port;
  static WebProbeOptions? parse(List<String> args) {
    if (args.length != 7 || args[1] != '--web-runtime') return null;
    if (args[3] != '--web-backend' ||
        args[4] != 'headless' ||
        args[5] != '--web-port') {
      throw ArgumentError(
        'Use --web-runtime RESOURCES --web-backend headless --web-port PORT',
      );
    }
    final port = int.parse(args[6]);
    if (port < 0 || port > 65535) throw ArgumentError('Invalid Web probe port');
    return WebProbeOptions(Directory(args[2]).absolute.path, port);
  }

  Future<int> stage(Directory root) async {
    final check = await ServerSocket.bind(InternetAddress.loopbackIPv4, port);
    final selected = check.port;
    await check.close();
    final resources = '${root.path}/missing-runtime';
    final library = await Isolate.resolvePackageUri(
      Uri.parse('package:dsh_workflow_launcher/main.dart'),
    );
    if (library == null) {
      throw StateError('Current candidate package source is unavailable');
    }
    final project = await File.fromUri(library).parent.parent.parent.parent
        .resolveSymbolicLinks();
    if (Platform.environment['DSH_WEB_TASK_CONTINUITY'] == '1') {
      final staged = await Process.run('$sourceResources/node', [
        '$project/macos-launcher/flutter/tool/independent_service_resources.mjs',
        sourceResources,
        resources,
      ]);
      require(
        staged.exitCode == 0,
        'the task fixture stages the current project and frozen Host: ${staged.stderr}',
      );
      final configured = await Process.run('$sourceResources/node', [
        '$project/macos-launcher/flutter/tool/service_task_resources.mjs',
        resources,
        root.path,
      ]);
      require(
        configured.exitCode == 0,
        'the task fixture configures only the external model boundary before Host startup: ${configured.stderr}',
      );
      return selected;
    }
    final copier = '$project/macos-launcher/project-resources.mjs';
    final prepared = Platform.environment['DSH_CANDIDATE_PROJECT_LAYER'];
    final copied = await Process.run('$sourceResources/node', [
      copier,
      if (prepared == null) 'create' else 'restore',
      project,
      ?prepared,
      '$resources/workflow',
    ]);
    require(
      copied.exitCode == 0,
      'private project layer matches this candidate source and complete membership: ${copied.stderr}',
    );
    for (final name in [
      'node',
      'node_modules',
      'bin',
      'plugins',
      'plugin-payload.json',
      'package.json',
      'package-lock.json',
    ]) {
      await Link('$resources/$name').create('$sourceResources/$name');
    }
    final seeded = await Process.run('$sourceResources/node', [
      '$project/macos-launcher/flutter/tool/independent_service_resources.mjs',
      sourceResources,
      resources,
      '--profile-only',
    ]);
    require(
      seeded.exitCode == 0,
      'the private test profile has the required plugins installed: ${seeded.stderr}',
    );
    return selected;
  }
}

Future<void> runWebApplicationScenario({
  required Directory root,
  required EndpointLayout layout,
  required String manifestPath,
  required int port,
  required ApplicationState state,
  required Future<int> applicationExit,
  required Future<bool> Function(Map<String, Object?>) ownsHostReceipt,
  required Future<void> Function(String) tap,
  required Future<void> Function(String) capture,
  Future<void> Function(WebObservation)? onConnected,
  bool startWebBySdk = false,
  Future<void> Function(int)? observeOwnedHeadlessHost,
  Process? prestartedHost,
  IOSink? prestartedHostLog,
  String? bindingsPath,
  bool passwordPreloaded = false,
  void Function(String, Map<String, Object?>)? diagnose,
}) async {
  final data = '${root.path}/data';
  final home = '${root.path}/home';
  final resources = '${root.path}/missing-runtime';
  final receipt = File('$data/global/.dsh-workflow/desktop/desktop-host.json');
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  final password = 'isolated-web-probe-password';
  Process? host = prestartedHost;
  final independentHost = prestartedHost == null;
  int? ownedManagerPid;
  late WebSdkRequest sdkControl;
  LauncherServer? server;
  IOSink? hostLog = prestartedHostLog;
  var hostExited = false;
  bool? profilePlugins;
  Future<Map<String, Object?>> ui() async {
    await state({'action': 'ownEntry'});
    await Future<void>.delayed(const Duration(milliseconds: 100));
    return state();
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

  Future<void> tapUi(String label) async {
    await ui();
    if (label == '设置密码') {
      final node = await control(label, 'tap', 'scrollDown');
      await state({'action': 'tap', 'id': '${node['id']}'});
      await Future<void>.delayed(const Duration(milliseconds: 250));
    } else {
      await tap(label);
    }
  }

  Future<Map<String, Object?>> readReceipt() async =>
      (jsonDecode(await receipt.readAsString()) as Map).cast<String, Object?>();
  Future<bool> ownsReceipt(Map<String, Object?> value) async {
    if (!independentHost) return ownsHostReceipt(value);
    final manager = jsonDecode(
      await File('$data/global/.dsh-workflow/service/manager.json')
          .readAsString(),
    ) as Map;
    final current = await readReceipt();
    if (manager['pid'] != ownedManagerPid ||
        current['pid'] != value['pid'] ||
        current['lease'] != value['lease']) {
      return false;
    }
    final uid = (await Process.run('/usr/bin/id', [
      '-u',
    ])).stdout.toString().trim();
    final owner = await Process.run('/bin/ps', [
      '-p',
      '$ownedManagerPid',
      '-o',
      'uid=,command=',
    ]);
    final process = await Process.run('/bin/ps', [
      '-p',
      '${value['pid']}',
      '-o',
      'ppid=,uid=,command=',
    ]);
    final managerIdentity = owner.stdout.toString().trim();
    final hostIdentity = process.stdout.toString().trim();
    final hostFields = hostIdentity.split(RegExp(r'\s+'));
    final owned =
        owner.exitCode == 0 &&
        process.exitCode == 0 &&
        managerIdentity.startsWith('$uid ') &&
        managerIdentity.contains('service-manager.mjs') &&
        managerIdentity.contains('$data ') &&
        hostFields.length > 2 &&
        hostFields[0] == '$ownedManagerPid' &&
        hostFields[1] == uid &&
        hostIdentity.contains('$home/profiles/desktop') &&
        hostIdentity.contains('web-host.mjs');
    await File('${root.path}/web-independent-host-identity.log').writeAsString(
      'owned=$owned lease=${value['lease']}\n$managerIdentity\n$hostIdentity\n',
      mode: FileMode.append,
    );
    return owned;
  }

  Future<({int code, String body, List<Cookie> cookies})> request(
    Uri uri, {
    String method = 'GET',
    String? body,
    ContentType? contentType,
    List<Cookie> cookies = const [],
  }) async {
    final request = await client.openUrl(method, uri);
    request.followRedirects = false;
    request.cookies.addAll(cookies);
    if (body != null) {
      request.headers.contentType =
          contentType ?? ContentType('application', 'x-www-form-urlencoded');
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
    profilePlugins ??=
        (jsonDecode(
          await File('$resources/workflow/project-plugins.json').readAsString(),
        ) as Map)['npmStartup'] ==
        'profile';
    final rpcId = 'dsh-ready-${DateTime.now().microsecondsSinceEpoch}';
    final response = await request(
      uri.resolve('/api/pluginInventory/list'),
      method: 'POST',
      cookies: cookies,
      body: jsonEncode({
        'type': 'client-request',
        'rpcId': rpcId,
        'method': 'pluginInventory/list',
        'payload': {'args': <String, Object?>{}},
      }),
      contentType: ContentType.json,
    );
    final envelope = (jsonDecode(response.body) as Map).cast<String, Object?>();
    final result = envelope['result'] as Map?;
    require(
      response.code == 200 &&
          envelope['type'] == 'server-response' &&
          envelope['rpcId'] == rpcId &&
          result?['ok'] == true &&
          result?['value'] is Map &&
          (result?['value'] as Map)['entries'] is List &&
          ((result?['value'] as Map)['managementAvailable'] == true) ==
              profilePlugins,
      'authenticated DSH inventory proves readiness with the packaged plugin policy',
    );
    final bound = await readReceipt();
    require(
      await ownsReceipt(bound),
      'ready DSH response retains the exact physical Host lease',
    );
    return {
      'ready': true,
      'instanceId': bound['lease'],
      'plugins': (result!['value'] as Map)['entries'],
    };
  }

  Future<Object?> rpc(
    Uri uri,
    List<Cookie> cookies,
    String method,
    Map<String, Object?> args,
  ) async {
    final rpcId = 's03-${DateTime.now().microsecondsSinceEpoch}';
    final response = await request(
      uri.resolve('/api/$method'),
      method: 'POST',
      cookies: cookies,
      contentType: ContentType.json,
      body: jsonEncode({
        'type': 'client-request',
        'rpcId': rpcId,
        'method': method,
        'payload': {'args': args},
      }),
    );
    final envelope = jsonDecode(response.body) as Map;
    final result = envelope['result'] as Map?;
    require(
      response.code == 200 &&
          envelope['rpcId'] == rpcId &&
          result?['ok'] == true,
      'the actual authenticated Host accepts $method',
    );
    return result!['value'];
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
    if (independentHost) {
      await sdkControl('start', service: 'desktop');
      final manager = jsonDecode(
        await File('$data/global/.dsh-workflow/service/manager.json')
            .readAsString(),
      ) as Map;
      ownedManagerPid = manager['pid'] as int;
      hostExited = false;
      require(
        await ownsReceipt(await readReceipt()),
        'the replacement Host is owned by the isolated independent manager',
      );
      return;
    }
    hostExited = false;
    host = await Process.start(
      '$resources/node',
      [
        File.fromUri(Platform.script.resolve('web_host_probe.mjs')).path,
        resources,
        data,
        home,
      ],
      environment: {...Platform.environment, 'DSH_HOME': home},
    );
    await observeOwnedHeadlessHost?.call(host!.pid);
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
    if (independentHost) {
      final bound = await readReceipt();
      require(
        await ownsReceipt(bound),
        'only this isolated independent manager fixture is terminated',
      );
      Process.killPid(ownedManagerPid!, ProcessSignal.sigterm);
      await waitFor(
        'owned manager and real Host fixture stop',
        () async =>
            !await File('$data/global/.dsh-workflow/service/manager.json')
                .exists() &&
            !await receipt.exists() &&
            (await Process.run('/bin/kill', [
                  '-0',
                  '${bound['pid']}',
                ])).exitCode !=
                0,
      );
      hostExited = true;
      return;
    }
    require(
      host != null && !hostExited,
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
      await observeOwnedHeadlessHost?.call(prestartedHost.pid);
    } else {
      require(
        !await receipt.exists() ||
            await File('$data/global/.dsh-workflow/service/manager.json')
                .exists(),
        'the Web fixture has no external unmanaged Host',
      );
    }
    final bindings = await BindingStore.load(
      bindingsPath ?? '${root.path}/bindings.json',
    );
    await bindings.associate(manifestPath);
    server = await LauncherServer.start(layout: layout, bindings: bindings);
    await waitFor(
      'official manager connection',
      () async => server!.sessionFor('dsh-workflow') != null,
    );
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

    sdkControl = sdk;

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
          services
              .singleWhere((s) => s.id == 'desktop')
              .methods
              .toSet()
              .containsAll({'start', 'recycle', 'status', 'logs'}),
      'official SDK capabilities match Web ownership and DSH service start, recycle, status and logs',
    );
    if (independentHost) {
      await sdk('start', service: 'desktop');
      await waitFor(
        'official SDK creates an independent ready Host',
        () async => (await sdk('status', service: 'desktop'))['ready'] == true,
      );
      final manager = jsonDecode(
        await File('$data/global/.dsh-workflow/service/manager.json')
            .readAsString(),
      ) as Map;
      ownedManagerPid = manager['pid'] as int;
      require(
        await ownsReceipt(await readReceipt()),
        'the official SDK Host is owned by this isolated independent manager',
      );
    }
    if (!passwordPreloaded) {
      require(
        (await sdk('status'))['ready'] != true,
        'Web is not ready before any real access service exists',
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
      if (startWebBySdk) {
        await sdk('start');
      } else {
        await control('启动 Web', 'tap', 'scrollDown');
        await tapUi('启动 Web');
      }
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
      (await request(url.resolve('api/pluginInventory/list'))).code == 401,
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
      'direct Web Host serves its actual packaged frontend',
    );
    final directHealth = await health(backendUrl, backendLogin.cookies);
    require(
      webHealth['instanceId'] == lease &&
          directHealth['instanceId'] == lease &&
          webHealth['ready'] == true,
      'browser entry and direct Web Host expose the same real ready DSH instance',
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
          webEntry: () async {
            final response = await request(url);
            return (code: response.code, body: response.body);
          },
          hostRpc: (method, args) =>
              rpc(backendUrl, backendLogin.cookies, method, args),
          webRpc: (method, args) async =>
              rpc(url, await authenticate(), method, args),
          initialSessionStatus: () async {
            final response = await request(
              url.resolve('/api/pluginInventory/list'),
              method: 'POST',
              cookies: webCookies,
              contentType: ContentType.json,
              body: jsonEncode({
                'type': 'client-request',
                'rpcId': 's03-old-session',
                'method': 'pluginInventory/list',
                'payload': {'args': <String, Object?>{}},
              }),
            );
            return response.code;
          },
          openSocket: ({bool originalSession = false}) async {
            final cookies = originalSession ? webCookies : await authenticate();
            return WebSocket.connect(
              url.resolve('/api/remote.mux').replace(scheme: 'ws').toString(),
              headers: {
                'cookie': cookies
                    .map((cookie) => '${cookie.name}=${cookie.value}')
                    .join('; '),
              },
            ).timeout(const Duration(seconds: 10));
          },
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
      return;
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
        'backend': 'headless',
        'port': port,
        'hostPid': backendPid,
        'hostLease': lease,
        'firstWebInstance': first['instanceId'],
        'uiAndSdkStartRecycle': true,
      }),
    );
    stdout.writeln(
      'T02 WEB APPLICATION SCENARIO PASSED (headless, port $port)',
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
      final managerFile = File(
        '$data/global/.dsh-workflow/service/manager.json',
      );
      if (independentHost && await managerFile.exists()) {
        final manager = jsonDecode(await managerFile.readAsString()) as Map;
        final managerPid = manager['pid'] as int;
        final identity = await Process.run('/bin/ps', [
          '-p',
          '$managerPid',
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
              command.contains('service-manager.mjs') &&
              command.contains('$data '),
          'cleanup only signals this UID and isolated service manager fixture',
        );
        Process.killPid(managerPid, ProcessSignal.sigterm);
        await waitFor(
          'owned independent service fixture cleanup',
          () async => !await managerFile.exists(),
        );
      }
      if (await receipt.exists()) {
        await waitFor(
          'owned backend receipt cleanup',
          () async => ownedReceiptAbsent(receipt),
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
