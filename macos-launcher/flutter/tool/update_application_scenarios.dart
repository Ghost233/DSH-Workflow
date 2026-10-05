import 'dart:async';
import 'dart:convert';
import 'dart:io';

class ReleaseFixture {
  ReleaseFixture._(this.server);
  final HttpServer server;
  int status = 200;
  String body = jsonEncode([
    {'tag_name': 'macos-v1.9.9', 'draft': false, 'prerelease': false},
    {'tag_name': 'macos-v1.10.0', 'draft': false, 'prerelease': false},
    {'tag_name': 'macos-v3.0.0', 'draft': true, 'prerelease': false},
    {'tag_name': 'macos-v4.0.0', 'draft': false, 'prerelease': true},
    {'tag_name': 'macos-v09.0.0', 'draft': false, 'prerelease': false},
    {'tag_name': 'macos-v9.0.0-beta', 'draft': false, 'prerelease': false},
    {'tag_name': 'v9.0.0', 'draft': false, 'prerelease': false},
  ]);
  bool hang = false;
  final _held = <Completer<void>>[];

  String get endpoint => 'http://127.0.0.1:${server.port}/releases';

  static Future<ReleaseFixture> start() async {
    final fixture = ReleaseFixture._(
      await HttpServer.bind(InternetAddress.loopbackIPv4, 0),
    );
    fixture.server.listen((request) async {
      stdout.writeln(
        'RELEASE_REQUEST=${request.uri} STATUS=${fixture.status} HANG=${fixture.hang}',
      );
      if (fixture.hang) {
        final released = Completer<void>();
        fixture._held.add(released);
        request.response.headers.contentType = ContentType.json;
        request.response.write('[');
        await request.response.flush();
        await released.future;
        try {
          await request.response.close();
        } on IOException {
          // The stalled response has already been closed by the client.
        }
        return;
      }
      try {
        request.response.statusCode = fixture.status;
        request.response.headers.contentType = ContentType.json;
        request.response.write(fixture.body);
        await request.response.close();
      } on IOException {
        // The timeout scenario intentionally closes its client connection.
      }
    });
    return fixture;
  }

  void releases(List<Map<String, Object>> values) {
    status = 200;
    body = jsonEncode(values);
    hang = false;
  }

  Future<void> close() async {
    for (final released in _held) {
      if (!released.isCompleted) released.complete();
    }
    await server.close(force: true);
  }
}

Future<void> runUpdateScenarios({
  required ReleaseFixture fixture,
  required bool systemCi,
  required Future<Map<String, Object?>> Function([Map<String, String>?]) state,
  required bool Function(Map<String, Object?>, String) text,
  required Future<void> Function(String) tap,
  required Future<void> Function(String) capture,
  required Future<void> Function(String, Future<bool> Function()) waitFor,
  required void Function(bool, String) require,
}) async {
  await waitFor('management UI', () async => text(await state(), '启动 Web'));
  final initialNative = (await state())['native']! as Map;
  require(
    initialNative['isolated'] == true &&
        initialNative['systemBoundaryTest'] == systemCi,
    'real native application confirms the requested isolated boundary',
  );
  // Scroll the real management ListView to the general settings section.
  for (var attempt = 0; attempt < 6; attempt++) {
    final snapshot = await state();
    if (text(snapshot, '检查更新')) break;
    final scroll = (snapshot['nodes']! as List).cast<Map>().firstWhere(
      (node) => (node['actions']! as List).contains('scrollDown'),
    );
    await state({'action': 'scrollDown', 'id': '${scroll['id']}'});
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
  await waitFor(
    'numeric minor update',
    () async => text(await state(), '发现新版本 1.10.0'),
  );
  require(
    true,
    'actual management UI selects numeric minor 1.10.0 and excludes draft, prerelease, invalid and unmatched tags',
  );
  await capture('update-minor');

  fixture.status = 500;
  await tap('检查更新');
  await waitFor(
    'failed release request visible',
    () async => text(await state(), '检查更新失败'),
  );
  await capture('update-failed');
  require(
    !text(await state(), '查看新版本'),
    'failed refresh removes the stale release action',
  );

  fixture.releases([
    {'tag_name': 'macos-v1.10.0', 'draft': false, 'prerelease': false},
    {'tag_name': 'macos-v2.0.0', 'draft': false, 'prerelease': false},
  ]);
  await tap('检查更新');
  await waitFor(
    'numeric major update',
    () async => text(await state(), '发现新版本 2.0.0'),
  );
  await tap('查看新版本');
  final nativeOpen = (await state())['native']! as Map;
  final opened = nativeOpen['lastOpenedUrl'];
  require(
    opened ==
        'https://github.com/Ghost233/DSH-Workflow/releases/tag/macos-v2.0.0',
    systemCi
        ? 'actual management UI opens the selected project release via NSWorkspace in disposable CI'
        : 'actual UI reaches the native URL bridge with the selected project release; local browser opening is intentionally guarded',
  );
  require(
    nativeOpen['urlOpenMode'] == (systemCi ? 'NSWorkspace' : 'guarded'),
    'native URL observation identifies the exercised boundary',
  );
  await capture('update-major');

  fixture.releases([
    {'tag_name': 'macos-v1.9.0', 'draft': false, 'prerelease': false},
    {'tag_name': 'macos-v1.8.9', 'draft': false, 'prerelease': false},
  ]);
  await tap('检查更新');
  await waitFor('no newer release', () async => text(await state(), '暂无新版本'));
  require(
    !text(await state(), '查看新版本'),
    'equal and older releases expose no update action',
  );
  await capture('update-none');

  fixture.releases([]);
  await tap('检查更新');
  await waitFor('empty release list', () async => text(await state(), '暂无新版本'));
  require(!text(await state(), '查看新版本'), 'empty list exposes no update action');

  fixture.hang = true;
  await tap('检查更新');
  await waitFor(
    'request waiting UI',
    () async => text(await state(), '正在检查更新'),
  );
  require(
    !text(await state(), '查看新版本'),
    'pending request exposes no stale update action',
  );
  try {
    await waitFor(
      'bounded request failure',
      () async => text(await state(), '检查更新失败'),
    );
  } catch (_) {
    await capture('update-timeout-red');
    rethrow;
  }
  require(
    text(await state(), 'TimeoutException'),
    'response stall ends with an honest timeout result',
  );
  await capture('update-timeout');
  fixture.releases([]);
  await tap('检查更新');
  await waitFor(
    'retry after timeout',
    () async => text(await state(), '暂无新版本'),
  );
  require(true, 'check action becomes usable after a timed-out response');

  if (systemCi) {
    Map native(Map<String, Object?> value) => value['native']! as Map;
    var snapshot = await state();
    require(
      native(snapshot)['systemBoundaryTest'] == true,
      'native system boundary independently confirms disposable CI isolation',
    );
    require(
      native(snapshot)['loginStatus'] == 'notRegistered',
      'disposable runner begins with this app unregistered',
    );
    require(
      text(snapshot, '登录启动：未注册'),
      'UI renders the actual unregistered system state',
    );
    await tap('登录后启动应用');
    await waitFor('actual system registration result', () async {
      final current = await state();
      return native(current)['loginStatus'] != 'notRegistered' ||
          text(current, 'native-error');
    });
    snapshot = await state();
    await capture('login-registration');
    final registered = native(snapshot)['loginStatus'];
    require(
      registered == 'enabled' || registered == 'requiresApproval',
      'SMAppService actually registered this CI app',
    );
    require(
      text(snapshot, registered == 'enabled' ? '登录启动：已启用' : '登录启动：需要系统批准'),
      'UI displays the actual system registration or approval requirement',
    );
    stdout.writeln('SYSTEM_LOGIN_REGISTERED=$registered');
    stdout.writeln(
      'SYSTEM_APPROVAL_OBSERVED=${registered == 'requiresApproval'}; NO APPROVAL WAS GRANTED',
    );
    await tap('刷新登录项状态');
    await tap('登录后启动应用');
    await waitFor(
      'actual system unregistration',
      () async => native(await state())['loginStatus'] == 'notRegistered',
    );
    require(
      text(await state(), '登录启动：未注册'),
      'UI unregister action agrees with the actual macOS system status',
    );
    await capture('login-unregistered');
    stdout.writeln('T07 DISPOSABLE CI APPLICATION SCENARIOS PASSED');
  } else {
    await capture('login-before');
    require(
      text(await state(), '登录启动：测试环境不访问系统登录项'),
      'management UI clearly identifies the guarded system login boundary',
    );
    await tap('登录后启动应用');
    await waitFor(
      'guarded login error',
      () async => text(await state(), '测试环境不更改系统登录项'),
    );
    require(
      text(await state(), '登录启动：测试环境不访问系统登录项'),
      'guarded registration rejection remains visible and never claims enabled',
    );
    await capture('login-guarded');
    stdout.writeln(
      'T07 LOCAL APPLICATION SCENARIOS PASSED; SYSTEM REGISTRATION NOT EXERCISED',
    );
  }
}
