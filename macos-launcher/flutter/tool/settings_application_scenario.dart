import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';

const settingsInitialPassword = 'isolated-web-probe-password';

class SettingsFixture {
  SettingsFixture(this.root, this.options, this.keychainCi);
  final Directory root;
  final WebProbeOptions options;
  final bool keychainCi;
  Process? host;
  IOSink? hostLog;
  final hostReady = Completer<void>();
  Future<void>? _closing;
  String? keychainAttributes;
  String get data => '${root.path}/data';
  String get resources => '${root.path}/missing-runtime';
  String get keychain => '${root.path}/legacy.keychain-db';

  Future<void> prepare() async {
    await Directory(data).create(recursive: true);
    await File('$data/test-preferences.plist')
        .writeAsString('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>fullAccess</key><false/><key>allowLanSettings</key><false/></dict></plist>
''');
    final history = File('${root.path}/home/history/t05-existing-history.json');
    await history.parent.create(recursive: true);
    await history.writeAsString(
      '{"workspace":"pre-migration-workspace","session":"retained-session"}\n',
    );
    if (!keychainCi) {
      await File('$data/lan-password').writeAsString(settingsInitialPassword);
      await Process.run('/bin/chmod', ['600', '$data/lan-password']);
    }
  }

  Future<void> startHeadless() async {
    if (options.backend == 'headless') {
      host = await Process.start(
        '$resources/node',
        [
          File.fromUri(Platform.script.resolve('desktop_host_probe.mjs')).path,
          resources,
          data,
          '${root.path}/home',
          'workspace-write',
        ],
        environment: {...Platform.environment, 'DSH_HOME': '${root.path}/home'},
      );
      hostLog = File('${root.path}/host.log').openWrite();
      host!.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) {
            hostLog!.writeln(line);
            if (line == 'HOST_READY' && !hostReady.isCompleted) {
              hostReady.complete();
            }
          });
      host!.stderr.listen(hostLog!.add);
      await hostReady.future.timeout(const Duration(seconds: 15));
      await waitFor(
        'private preexisting official Host receipt',
        () =>
            File('$data/global/.dsh-workflow/desktop/desktop-host.json')
                .exists(),
      );
      require(
        true,
        'private official Host is ready before password-triggered application startup',
      );
    }
  }

  Future<void> prepareKeychain(String executable) async {
    if (!keychainCi) return;
    final commands = [
      ['create-keychain', '-p', 'isolated-keychain-unlock', keychain],
      ['unlock-keychain', '-p', 'isolated-keychain-unlock', keychain],
      [
        'add-generic-password',
        '-a',
        'lan-password',
        '-s',
        'com.ghostagent.dsh-workflow-launcher',
        '-w',
        settingsInitialPassword,
        '-T',
        executable,
        keychain,
      ],
    ];
    for (final arguments in commands) {
      final result = await Process.run('/usr/bin/security', arguments);
      require(
        result.exitCode == 0,
        'owned temporary keychain preparation succeeds with an explicit application ACL',
      );
    }
    final attributes = await Process.run('/usr/bin/security', [
      'find-generic-password',
      '-a',
      'lan-password',
      '-s',
      'com.ghostagent.dsh-workflow-launcher',
      keychain,
    ]);
    require(
      attributes.exitCode == 0,
      'owned legacy item exists before application migration',
    );
    keychainAttributes = attributes.stdout.toString();
  }

  Future<void> close() => _closing ??= _close();
  Future<void> _close() async {
    final process = host;
    if (process != null) {
      try {
        process.stdin.writeln('shutdown');
        await process.stdin.flush();
      } catch (_) {
        /* The shared scenario may already have closed its owned Host. */
      }
      await process.exitCode.timeout(const Duration(seconds: 30));
    }
    if (keychainCi && await File(keychain).exists()) {
      final attributes = await Process.run('/usr/bin/security', [
        'find-generic-password',
        '-a',
        'lan-password',
        '-s',
        'com.ghostagent.dsh-workflow-launcher',
        keychain,
      ]);
      require(
        keychainAttributes == null ||
            attributes.exitCode == 0 &&
                attributes.stdout.toString() == keychainAttributes,
        'migration leaves the original owned keychain item attributes unchanged',
      );
      final result = await Process.run('/usr/bin/security', [
        'delete-keychain',
        keychain,
      ]);
      require(
        result.exitCode == 0,
        'only the owned temporary keychain is removed',
      );
    }
  }
}

Future<void> runSettingsApplicationScenario(WebObservation o) async {
  final data = '${o.root.path}/data';
  final passwordFile = File('$data/lan-password');
  final preferences = File('$data/test-preferences.plist');
  final history = File('${o.root.path}/home/history/t05-existing-history.json');
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  final nextPassword = 'isolated-settings-changed-password';
  final secrets = [
    settingsInitialPassword,
    nextPassword,
    'isolated-settings-save-failure',
  ];
  var id = 0;
  List<Map> nodes(Map<String, Object?> snapshot) =>
      (snapshot['nodes'] as List).cast<Map>();
  bool visible(Map<String, Object?> snapshot, String text) => nodes(snapshot)
      .any(
        (node) =>
            node['label'].toString().contains(text) ||
            node['value'].toString().contains(text),
      );
  Future<Map> control(
    String label,
    String action, [
    String direction = 'scrollUp',
  ]) async {
    for (var attempt = 0; attempt < 8; attempt++) {
      final snapshot = await o.ui();
      final matches = nodes(snapshot)
          .where(
            (node) =>
                node['label'].toString().contains(label) &&
                (node['actions'] as List).contains(action),
          )
          .toList();
      if (matches.isNotEmpty) return matches.single;
      final scrollers = nodes(snapshot)
          .where((node) => (node['actions'] as List).contains(direction))
          .toList();
      if (scrollers.isEmpty) break;
      await o.state({'action': direction, 'id': '${scrollers.single['id']}'});
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    throw StateError('Settings UI control not available: $label');
  }

  Future<void> switchTo(String label, bool chosen) async {
    final current = await control(label, 'tap');
    if (current['toggled'] != chosen) {
      await o.state({'action': 'tap', 'id': '${current['id']}'});
    }
    await waitFor(
      'actual switch choice $label',
      () async => (await control(label, 'tap'))['toggled'] == chosen,
    );
  }

  Future<void> setPassword(String password) async {
    final input = await control('内网访问密码', 'tap');
    await o.state({'action': 'tap', 'id': '${input['id']}'});
    await waitFor(
      'real password editing',
      () async => nodes(await o.ui()).any(
        (node) =>
            node['label'].toString().contains('内网访问密码') &&
            (node['actions'] as List).contains('setText'),
      ),
    );
    final field = await control('内网访问密码', 'setText');
    await o.state({
      'action': 'setText',
      'id': '${field['id']}',
      'text': password,
    });
    await control('修改密码', 'tap');
    await o.tap('修改密码');
  }

  Future<({int code, String body, List<Cookie> cookies})> request(
    Uri uri, {
    String method = 'GET',
    List<Cookie> cookies = const [],
    Object? json,
    String? form,
  }) async {
    final req = await client.openUrl(method, uri);
    req.followRedirects = false;
    req.cookies.addAll(cookies);
    if (json != null) {
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(json));
    }
    if (form != null) {
      req.headers.contentType = ContentType(
        'application',
        'x-www-form-urlencoded',
      );
      req.write(form);
    }
    final response = await req.close().timeout(const Duration(seconds: 10));
    return (
      code: response.statusCode,
      body: await utf8.decoder.bind(response).join(),
      cookies: response.cookies,
    );
  }

  final local = Uri.parse('http://127.0.0.1:${o.port}/');
  Future<List<Cookie>> login(Uri base, String password) async {
    final result = await request(
      base.resolve('login'),
      method: 'POST',
      form: Uri(queryParameters: {'password': password}).query,
    );
    require(
      result.code == 303,
      'isolated selected password authenticates actual access',
    );
    return result.cookies;
  }

  Future<({int code, Map? result})> rpc(
    Uri base,
    List<Cookie> cookies,
    String endpoint,
    Map<String, Object?> args,
  ) async {
    final response = await request(
      base.resolve('/api/$endpoint'),
      method: 'POST',
      cookies: cookies,
      json: {
        'type': 'client-request',
        'rpcId': 'settings-${++id}',
        'method': endpoint,
        'payload': {'args': args},
      },
    );
    return (
      code: response.code,
      result: response.body.startsWith('{')
          ? jsonDecode(response.body) as Map
          : null,
    );
  }

  Future<bool> hostSetting(List<Cookie> cookies) async {
    final response = await rpc(local, cookies, 'settings/describe', {});
    require(
      response.code == 200 && response.result?['result']['ok'] == true,
      'real Host describes its configuration',
    );
    final spaces = (response.result!['result']['value']['namespaces'] as List)
        .cast<Map>();
    return spaces.singleWhere(
          (value) => value['ns'] == 'session-log-deepseek',
        )['value']['enabled']
        as bool;
  }

  Future<Map<String, Object?>> receipt() async =>
      (jsonDecode(await o.receipt.readAsString()) as Map)
          .cast<String, Object?>();
  try {
    require(
      (await control('DSH 工具使用完整访问权限', 'tap'))['toggled'] == false &&
          (await control('允许局域网修改 DSH 设置', 'tap'))['toggled'] == false,
      'actual management UI loads both preexisting preference keys',
    );
    require(
      await passwordFile.readAsString() == settingsInitialPassword,
      'actual native compatibility boundary retains or migrates the preexisting credential',
    );
    final mode = await Process.run('/usr/bin/stat', [
      '-f',
      '%OLp',
      passwordFile.path,
    ]);
    require(
      mode.exitCode == 0 && mode.stdout.toString().trim() == '600',
      'native password file has the retained 0600 rule',
    );
    final firstBackend = await receipt();
    final oldCookies = await login(local, settingsInitialPassword);
    await setPassword('');
    await waitFor(
      'empty password error visible',
      () async => visible(await o.ui(), '密码须为 1–1024 字节'),
    );
    require(
      await passwordFile.readAsString() == settingsInitialPassword,
      'invalid empty password does not change persisted credential',
    );
    await setPassword('x' * 1025);
    await waitFor(
      'oversized password error visible',
      () async => visible(await o.ui(), '密码须为 1–1024 字节'),
    );
    require(
      await passwordFile.readAsString() == settingsInitialPassword,
      'oversized password does not change persisted credential',
    );
    await setPassword(nextPassword);
    await waitFor(
      'new credential persisted',
      () async => await passwordFile.readAsString() == nextPassword,
    );
    await waitFor(
      'actual live password update',
      () async =>
          (await request(
            local.resolve('login'),
            method: 'POST',
            form: 'password=$nextPassword',
          )).code ==
          303,
    );
    require(
      (await request(
            local.resolve('login'),
            method: 'POST',
            form: 'password=$settingsInitialPassword',
          )).code ==
          401,
      'old password is rejected by the already running access service',
    );
    require(
      (await request(
            local.resolve('owner-workflow/api/health'),
            cookies: oldCookies,
          )).code ==
          401,
      'password rotation revokes the old authenticated session',
    );
    var localCookies = await login(local, nextPassword);
    final backup = File('$data/password-before-failure');
    await passwordFile.rename(backup.path);
    await Directory(passwordFile.path).create();
    try {
      await setPassword('isolated-settings-save-failure');
      await waitFor(
        'real password write failure visible',
        () async => visible(await o.ui(), 'PlatformException'),
      );
      require(
        await backup.readAsString() == nextPassword,
        'failed persistence leaves the previous stored password intact',
      );
      await login(local, nextPassword);
    } finally {
      await Directory(passwordFile.path).delete();
      await backup.rename(passwordFile.path);
    }
    final prefsBackup = File('$data/preferences-before-failure');
    await preferences.rename(prefsBackup.path);
    await Directory(preferences.path).create();
    try {
      final toggle = await control('允许局域网修改 DSH 设置', 'tap');
      await o.state({'action': 'tap', 'id': '${toggle['id']}'});
      await waitFor(
        'real preference write failure visible',
        () async => visible(await o.ui(), 'test-preferences.plist'),
      );
      require(
        (await control('允许局域网修改 DSH 设置', 'tap'))['toggled'] == false,
        'failed setting is not presented as saved',
      );
    } finally {
      await Directory(preferences.path).delete();
      await prefsBackup.rename(preferences.path);
    }
    await control('允许局域网修改 DSH 设置', 'tap');
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    final addresses = interfaces
        .expand((interface) => interface.addresses)
        .map((address) => address.address);
    final privateAddress = addresses.firstWhere(
      (address) {
        final parts = address.split('.').map(int.parse).toList();
        return parts[0] == 10 ||
            parts[0] == 192 && parts[1] == 168 ||
            parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31 ||
            parts[0] == 100 && parts[1] >= 64 && parts[1] <= 127 ||
            parts[0] == 169 && parts[1] == 254;
      },
      orElse: () => throw StateError(
        'Actual owned private IPv4 LAN entry is unavailable',
      ),
    );
    final lan = Uri.parse('http://$privateAddress:${o.port}/');
    var lanCookies = await login(lan, nextPassword);
    final before = await hostSetting(localCookies);
    final denied = await rpc(lan, lanCookies, 'settings/update', {
      'ns': 'session-log-deepseek',
      'patch': {'enabled': !before},
    });
    require(
      denied.code == 403 && await hostSetting(localCookies) == before,
      'disabled LAN setting rejects real authenticated Host mutation without changing configuration',
    );
    await switchTo('允许局域网修改 DSH 设置', true);
    require(
      visible(await o.ui(), '重连 Web 后生效'),
      'actual UI explains LAN setting activation',
    );
    require(
      (await rpc(lan, lanCookies, 'settings/update', {
            'ns': 'session-log-deepseek',
            'patch': {'enabled': !before},
          })).code ==
          403,
      'saved LAN choice does not silently reconfigure the running access service',
    );
    await control('重连 Web', 'tap', 'scrollDown');
    await o.tap('重连 Web');
    await waitFor(
      'reconnected actual Web ready',
      () async => (await o.sdk('status'))['ready'] == true,
    );
    localCookies = await login(local, nextPassword);
    lanCookies = await login(lan, nextPassword);
    final permitted = await rpc(lan, lanCookies, 'settings/update', {
      'ns': 'session-log-deepseek',
      'patch': {'enabled': !before},
    });
    require(
      permitted.code == 200 &&
          permitted.result?['result']['ok'] == true &&
          await hostSetting(localCookies) == !before,
      'enabled LAN choice after real UI reconnect changes the actual Host configuration',
    );
    final restored = await rpc(local, localCookies, 'settings/update', {
      'ns': 'session-log-deepseek',
      'patch': {'enabled': before},
    });
    require(
      restored.result?['result']['ok'] == true,
      'authenticated loopback settings remains usable',
    );
    await switchTo('DSH 工具使用完整访问权限', true);
    require(
      visible(await o.ui(), '完全退出并重新打开 Desktop'),
      'actual UI explains permission choice requires full Desktop reopen',
    );
    require(
      (await receipt())['lease'] == firstBackend['lease'],
      'saving settings never automatically closes the existing backend',
    );
    require(
      firstBackend['permissionMode'] == 'workspace-write' &&
          (await receipt())['permissionMode'] == 'workspace-write',
      'actual backend retains its preexisting restricted policy before full reopen',
    );
    final published = jsonEncode([
      await o.sdk('status'),
      await o.sdk('status', service: 'desktop'),
      await o.sdk('logs'),
    ]);
    require(
      secrets.every((secret) => !published.contains(secret)),
      'official SDK status and logs never disclose this scenario credentials',
    );
    require(
      await history.readAsString() == '{"workspace":"pre-migration-workspace","session":"retained-session"}\n',
      'existing isolated history survives settings and credential changes',
    );
    var permissionReopen = false;
    final native = (await o.state())['native'] as Map;
    if (Platform.environment['GITHUB_ACTIONS'] == 'true' &&
        native['openedDesktopPid'] is int) {
      require(
        firstBackend['permissionMode'] == 'workspace-write',
        'initial official Desktop adopts the existing restricted policy',
      );
      require(
        (await receipt())['permissionMode'] == 'workspace-write',
        'saving full access keeps the existing backend policy until reopen',
      );
      await o.sdk('recycle');
      final oldDesktop = native['openedDesktopPid'] as int;
      await o.state({'action': 'quitDesktop'});
      await waitFor(
        'owned official Desktop exits before permission reopen',
        () async =>
            (await Process.run('/bin/kill', ['-0', '$oldDesktop'])).exitCode !=
                0 &&
            !await o.receipt.exists(),
      );
      await control('打开 DSH', 'tap', 'scrollDown');
      await o.tap('打开 DSH');
      await waitFor(
        'reopened official Desktop publishes a new real lease',
        () async =>
            await o.receipt.exists() &&
            (await receipt())['lease'] != firstBackend['lease'],
      );
      final reopened = await receipt();
      require(
        reopened['permissionMode'] == 'danger-full-access',
        'fully reopened official Desktop adopts the saved full-access policy',
      );
      await o.sdk('start');
      await waitFor(
        'Web reconnects to the reopened real backend',
        () async => (await o.sdk('status'))['ready'] == true,
      );
      await login(local, nextPassword);
      permissionReopen = true;
    }
    await o.capture('settings-current');
    await File('${o.root.path}/settings-evidence.json').writeAsString(
      jsonEncode({
        'oldBackendLease': firstBackend['lease'],
        'permissionModeBeforeReopen': firstBackend['permissionMode'],
        'hostPid': (await receipt())['pid'],
        'oldHostPid': firstBackend['pid'],
        'preexistingKeys': true,
        'passwordLiveUpdate': true,
        'invalidInputVisible': true,
        'persistenceFailureVisible': true,
        'lanDeniedThenAppliedAfterReconnect': true,
        'credentialsNotInSdk': true,
        'permissionReopenVerified': permissionReopen,
      }),
    );
    stdout.writeln(
      permissionReopen
          ? 'T05 SETTINGS APPLICATION SCENARIO PASSED (official Desktop permission reopen verified)'
          : 'T05 SETTINGS APPLICATION SCENARIO PASSED (permission reopen pending clean CI)',
    );
  } finally {
    client.close(force: true);
  }
}
