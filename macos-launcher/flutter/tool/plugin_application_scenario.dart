import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';

/// This first application slice checks real on-disk plugin reports and preserves
/// the connected official Host. It does not claim update or Desktop reload proof.
Future<void> runPluginApplicationScenario(WebObservation app) async {
  final initial = await app.ui();
  require(
    app.root.path.startsWith('/private/tmp/dsh-') &&
        (initial['native'] as Map)['isolated'] == true,
    'plugin faults are restricted to this probe-owned private profile',
  );
  final profile = Directory('${app.root.path}/home/profiles/desktop');
  final profileManifest = File('${profile.path}/package.json');
  final original = await profileManifest.readAsBytes();
  final healthy = Directory('${profile.path}/node_modules/dsh-t08-ui-local');
  final damaged = Directory('${profile.path}/node_modules/dsh-t08-ui-damaged');
  require(
    !await healthy.exists() && !await damaged.exists(),
    'self-owned plugin fixture identities were absent before this scenario',
  );
  final lease = app.backend['lease'];
  final hostPid = app.backend['pid'] as int;
  final runtimeVersion = app.backend['runtimeVersion'] as String;
  bool text(Map<String, Object?> snapshot, String value) =>
      (snapshot['nodes'] as List).cast<Map>().any(
        (node) => node['label'].toString().contains(value),
      );
  Future<void> scrollTable(String action) async {
    for (var attempt = 0; attempt < 6; attempt++) {
      final snapshot = await app.ui();
      final matches = (snapshot['nodes'] as List).cast<Map>().where(
        (node) => (node['actions'] as List).contains(action),
      );
      if (matches.isEmpty) return;
      final scroll = matches.single;
      await app.state({'action': action, 'id': '${scroll['id']}'});
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
  }

  Future<void> preservedHost() async {
    final alive = await Process.run('/bin/kill', ['-0', '$hostPid']);
    final desktop = await app.sdk('status', service: 'desktop');
    final health = await app.backendHealth();
    await File('${app.root.path}/plugin-host-check.json').writeAsString(
      jsonEncode({'pidProbeExit': alive.exitCode, 'desktop': desktop, 'health': health}),
    );
    require(
      alive.exitCode == 0 &&
          desktop['instanceId'] == lease &&
          health['instanceId'] == lease &&
          health['ready'] == true,
      'plugin checking preserves the same live and ready official Desktop Host',
    );
  }

  try {
    await app.tap('插件');
    await waitFor(
      'the initial automatic plugin check has settled before the owned fault',
      () async => !text(await app.ui(), '正在检查插件版本'),
    );
    await healthy.create(recursive: true);
    await damaged.create(recursive: true);
    await File('${healthy.path}/package.json').writeAsString(
      jsonEncode({
        'name': 'dsh-t08-ui-local',
        'version': '0.4.2',
        'dsh': {
          'compatibility': {
            'dshReleases': {runtimeVersion: 'compatible'},
          },
        },
      }),
    );
    await File('${damaged.path}/package.json').writeAsString(
      '{"name":"dsh-t08-ui-damaged", invalid',
    );
    final manifest = (jsonDecode(utf8.decode(original)) as Map)
        .cast<String, Object?>();
    final dependencies = (manifest['dependencies'] as Map)
        .cast<String, Object?>();
    manifest['dependencies'] = {
      ...dependencies,
      'dsh-t08-ui-local': 'file:${healthy.path}',
      'dsh-t08-ui-damaged': 'file:${damaged.path}',
    };
    await profileManifest.writeAsString(jsonEncode(manifest));
    await File('${app.root.path}/plugin-fixture.json').writeAsString(
      jsonEncode({
        'profile': profile.path,
        'healthy': 'dsh-t08-ui-local@0.4.2',
        'damaged': 'dsh-t08-ui-damaged: invalid JSON',
        'hostPid': hostPid,
        'hostLease': lease,
        'runtimeVersion': runtimeVersion,
        'scope': 'check failure and minimum window only',
      }),
    );
    await app.state({'action': 'minimum'});
    await app.tap('插件');
    await app.tap('检查插件版本');
    await waitFor(
      'the explicit management plugin check has settled',
      () async => !text(await app.ui(), '正在检查插件版本'),
    );
    await scrollTable('scrollUp');
    var snapshot = await app.ui();
    final native = snapshot['native'] as Map;
    require(
      native['windowWidth'] == 780 && native['windowHeight'] == 560,
      'plugin page is exercised at the supported 780 × 560 native minimum',
    );
    require(
      text(snapshot, 'DSH Desktop profile') &&
          text(snapshot, 'dsh-t08-ui-local') &&
          text(snapshot, '0.4.2 / —') &&
          text(snapshot, 'dsh-t08-ui-damaged'),
      'real plugin page retains source, current version and both self-owned plugin identities',
    );
    await app.capture('plugins-check-left');
    await scrollTable('scrollLeft');
    snapshot = await app.ui();
    await app.capture('plugins-check-right');
    await preservedHost();
    require(
      text(snapshot, '$runtimeVersion（明确标注）') &&
          text(snapshot, '本地依赖') &&
          text(snapshot, '更新'),
      'real horizontal accessibility scrolling reaches declared compatibility, status and the row controls',
    );
    require(
      text(snapshot, '检查失败') &&
          text(snapshot, '无法读取已安装插件'),
      'the malformed self-owned plugin failure reason is visible without losing completed rows',
    );
    require(
      (snapshot['errors'] as List).isEmpty,
      'the actual minimum-size plugin window has no Flutter layout errors',
    );
  } finally {
    await profileManifest.writeAsBytes(original);
    if (await healthy.exists()) await healthy.delete(recursive: true);
    if (await damaged.exists()) await damaged.delete(recursive: true);
  }
  await scrollTable('scrollRight');
  await app.tap('检查插件版本');
  await waitFor(
    'management retry observes the restored real profile',
    () async {
      final snapshot = await app.ui();
      return !text(snapshot, '正在检查插件版本') &&
          !text(snapshot, 'dsh-t08-ui-local');
    },
  );
  await preservedHost();
  await app.capture('plugins-check-recovered');
  await app.sdk('recycle');
  stdout.writeln(
    'T08 PLUGIN CHECK WINDOW SLICE PASSED; UPDATE AND NATIVE DESKTOP RELOAD NOT EXERCISED',
  );
}
