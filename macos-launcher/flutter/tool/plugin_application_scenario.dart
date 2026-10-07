import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'application_probe.dart' show require, waitFor;
import 'web_application_scenario.dart';
import 'web_startup_wait.dart';

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
      jsonEncode({
        'pidProbeExit': alive.exitCode,
        'desktop': desktop,
        'health': health,
      }),
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
    await File('${damaged.path}/package.json')
        .writeAsString('{"name":"dsh-t08-ui-damaged", invalid');
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
    final failureTooltips = (snapshot['nodes'] as List)
        .cast<Map>()
        .where((node) => node['tooltip'].toString().contains('无法读取已安装插件'))
        .toList();
    await File('${app.root.path}/plugins-check-tooltip.json').writeAsString(
      jsonEncode({'nodes': failureTooltips, 'overlayDisplayed': false}),
    );
    require(
      failureTooltips.isNotEmpty,
      'the real failure cause is available through the official semantic tooltip property; overlay display is not claimed',
    );
    require(
      text(snapshot, '检查失败'),
      'the malformed self-owned plugin failure status is visible without losing completed rows',
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
      return !text(snapshot, '正在检查插件版本') && !text(snapshot, 'dsh-t08-ui-local');
    },
  );
  await preservedHost();
  await app.capture('plugins-check-recovered');
  await app.sdk('recycle');
  stdout.writeln(
    'T08 CHECK ROW, SEMANTIC TOOLTIP CAUSE AND NATIVE MINIMUM PASSED; TOOLTIP OVERLAY, UPDATE AND NATIVE DESKTOP RELOAD NOT EXERCISED',
  );
}

class PluginRegistryFixture {
  PluginRegistryFixture._(this.process, this.log);
  final Process process;
  final IOSink log;
  final _ready = Completer<void>();
  final _pending = <int, Completer<void>>{};
  final _subscriptions = <StreamSubscription<Object?>>[];
  late Map<String, String> environment;
  var _next = 0, _closed = false;

  static Future<PluginRegistryFixture> prepare(
    Directory root,
    String resources,
  ) async {
    final process = await Process.start('$resources/node', [
      File.fromUri(Platform.script.resolve('plugin_registry_fixture.mjs')).path,
      root.path,
      resources,
    ]);
    final fixture = PluginRegistryFixture._(
      process,
      File('${root.path}/plugin-registry.log').openWrite(),
    );
    fixture._subscriptions.add(
      process.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) {
            fixture.log.writeln(line);
            final value = (jsonDecode(line) as Map).cast<String, Object?>();
            if (value['ready'] == true) {
              fixture.environment = (value['environment'] as Map)
                  .cast<String, String>();
              fixture._ready.complete();
            } else if (value['ok'] == true) {
              fixture._pending.remove(value['id'])?.complete();
            }
          }),
    );
    fixture._subscriptions.add(process.stderr.listen(fixture.log.add));
    unawaited(
      process.exitCode.then((code) {
        if (!fixture._ready.isCompleted) {
          fixture._ready.completeError(
            StateError('Plugin registry preparation exited $code'),
          );
        }
        for (final pending in fixture._pending.values) {
          if (!pending.isCompleted) {
            pending.completeError(StateError('Plugin registry exited $code'));
          }
        }
      }),
    );
    await fixture._ready.future.timeout(const Duration(seconds: 45));
    return fixture;
  }

  Future<void> control(Map<String, Object?> parameters) async {
    final id = ++_next, completed = Completer<void>();
    _pending[id] = completed;
    process.stdin.writeln(jsonEncode({'id': id, ...parameters}));
    await process.stdin.flush();
    await completed.future.timeout(const Duration(seconds: 10));
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    process.stdin.writeln(jsonEncode({'close': true}));
    await process.stdin.flush();
    await process.stdin.close();
    final code = await process.exitCode.timeout(const Duration(seconds: 10));
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    await log.close();
    require(
      code == 0,
      'owned registry proxy shuts down normally with no CA/system trust changes',
    );
  }
}

Future<void> runPluginUpdateApplicationScenario(
  WebObservation app,
  PluginRegistryFixture fixture, {
  required bool desktop,
}) async {
  const owned = 'dsh-t08-owned-plugin', other = 'dsh-t08-other-plugin';
  await File('${app.root.path}/plugin-case.json').writeAsString(
    jsonEncode({
      'webPort': app.port,
      'launcherPid': ((await app.ui())['native'] as Map)['pid'],
      'registryPid': fixture.process.pid,
      'hostPid': app.backend['pid'],
      'hostLease': app.backend['lease'],
      'desktop': desktop,
    }),
  );
  final observations = <Map<String, Object?>>[];
  final http = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  bool text(Map<String, Object?> state, String value) =>
      (state['nodes'] as List).cast<Map>().any(
        (node) => node['label'].toString().contains(value),
      );
  Future<void> settled() =>
      waitFor('actual plugin check/update completes', () async {
        final state = await app.ui();
        return !text(state, '正在检查插件版本') && !text(state, '正在更新插件');
      });
  Future<void> scroll(String action) async {
    for (var attempt = 0; attempt < 6; attempt++) {
      final nodes = ((await app.ui())['nodes'] as List).cast<Map>().where(
        (node) => (node['actions'] as List).contains(action),
      );
      if (nodes.isEmpty) return;
      await app.state({'action': action, 'id': '${nodes.single['id']}'});
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
  }

  Future<void> updateOne(String name) async {
    await scroll('scrollLeft');
    final nodes = ((await app.ui())['nodes'] as List).cast<Map>().toList();
    final row = nodes.indexWhere(
      (node) => node['label'].toString().split('\n').first == name,
    );
    require(
      row >= 0,
      'real semantic table contains the selected plugin identity $name',
    );
    final action = nodes
        .skip(row + 1)
        .firstWhere(
          (node) =>
              node['label'] == '更新' &&
              (node['actions'] as List).contains('tap'),
        );
    await app.state({'action': 'tap', 'id': '${action['id']}'});
    await settled();
  }

  Future<Map<String, Object?>> version(String name) async {
    final receipt = (jsonDecode(await app.receipt.readAsString()) as Map)
        .cast<String, Object?>();
    final uri = Uri.parse(receipt['url'] as String);
    final authentication = await http.getUrl(uri);
    authentication.followRedirects = false;
    final login = await authentication.close();
    final cookies = login.cookies;
    await login.drain<void>();
    final request = await http.getUrl(uri.resolve('/t08-plugin/$name'));
    request.cookies.addAll(cookies);
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    require(
      response.statusCode == 200,
      'actual official Host serves the self-owned plugin version endpoint',
    );
    final value = (jsonDecode(body) as Map).cast<String, Object?>();
    require(
      value['name'] == name && value['hostPid'] == receipt['pid'],
      'version response comes from the actual receipt Host process',
    );
    return {...value, 'hostLease': receipt['lease']};
  }

  Future<void> observe(
    String stage,
    String expectedOwned,
    String expectedOther,
  ) async {
    final currentOwned = await version(owned),
        currentOther = await version(other);
    final status = await app.sdk('status', service: 'desktop');
    require(
      currentOwned['version'] == expectedOwned &&
          currentOther['version'] == expectedOther &&
          status['instanceId'] == currentOwned['hostLease'],
      'actual loaded plugin versions and official SDK agree at $stage',
    );
    observations.add({
      'stage': stage,
      'owned': currentOwned,
      'other': currentOther,
      'desktop': status,
    });
    await File('${app.root.path}/plugin-loaded-versions.json')
        .writeAsString(jsonEncode(observations));
  }

  try {
    await observe('before-update', '1.0.0', '1.0.0');
    await app.state({'action': 'minimum'});
    await app.tap('插件');
    await settled();
    await updateOne(owned);
    await observe('after-selected-update-before-reload', '1.0.0', '1.0.0');
    await scroll('scrollRight');
    require(
      text(await app.ui(), '1.1.0 / 1.1.0'),
      'the real page shows the actual selected package version after installation',
    );
    await app.capture('plugins-selected-versions');
    await scroll('scrollLeft');
    await app.capture('plugins-selected');
    var snapshot = await app.ui();
    require(
      text(snapshot, '已更新 1 个插件'),
      'real single update result is visible',
    );
    final failedRows = (snapshot['nodes'] as List)
        .cast<Map>()
        .where(
          (node) =>
              node['label'] == '检查失败' &&
              node['tooltip'].toString().contains('npm registry HTTP 404'),
        )
        .toList();
    require(
      failedRows.length == 4,
      'the real page retains four failed checks with their accessible actual HTTP causes alongside the completed selected update',
    );
    await scroll('scrollUp');
    await app.capture('plugins-selected-failed-rows');
    await scroll('scrollDown');
    require(
      text(snapshot, '完全退出并重新打开 Desktop'),
      'completed update presents the real Desktop reload instruction',
    );

    await fixture.control({
      'latest': {owned: '1.2.0'},
    });
    await app.tap('检查插件版本');
    await settled();
    await app.tap('更新全部可更新插件');
    await settled();
    await observe('after-batch-before-reload', '1.0.0', '1.0.0');
    await scroll('scrollRight');
    snapshot = await app.ui();
    require(
      text(snapshot, '1.2.0 / 1.2.0') && text(snapshot, '1.1.0 / 1.1.0'),
      'actual current versions after batch match both installed self-owned tarballs',
    );
    await app.capture('plugins-batch-versions');
    await scroll('scrollLeft');
    await app.capture('plugins-batch');
    require(
      text(await app.ui(), '已更新 2 个插件'),
      'real batch update returns the two completed self-owned package versions',
    );

    // A registry changed between check and user click: the actual updater
    // rechecks and legitimately returns no newly changed package.
    await fixture.control({
      'latest': {owned: '1.3.0'},
    });
    await app.tap('检查插件版本');
    await settled();
    await fixture.control({
      'latest': {owned: '1.2.0'},
    });
    await updateOne(owned);
    await observe('after-noop-before-reload', '1.0.0', '1.0.0');
    await app.capture('plugins-noop-after-update');
    require(
      text(await app.ui(), '完全退出并重新打开 Desktop'),
      'a real no-op after earlier updates preserves the pending Desktop reload instruction',
    );

    await fixture.control({
      'latest': {owned: '1.3.0'},
      'unavailable': ['$owned@1.3.0'],
    });
    await app.tap('检查插件版本');
    await settled();
    await updateOne(owned);
    await app.capture('plugins-install-failure');
    snapshot = await app.ui();
    require(
      text(snapshot, 'No matching version') ||
          text(snapshot, 'NO_MATCHING_VERSION'),
      'actual DSH/pnpm update failure is visible with its original cause',
    );
    require(
      text(snapshot, '已更新 0 个插件'),
      'failed installation never claims completed self-owned updates',
    );
    require(
      text(snapshot, '完全退出并重新打开 Desktop'),
      'failed later update preserves the earlier pending reload instruction',
    );
    require(
      (snapshot['errors'] as List).isEmpty,
      'minimum-size plugin page remains usable while real update failure diagnostics are visible',
    );
    final diagnostic = (snapshot['nodes'] as List).cast<Map>().firstWhere(
      (node) =>
          node['scrollPosition'] is num &&
          (node['actions'] as List).contains('scrollUp'),
    );
    final beforeScroll = diagnostic['scrollPosition'] as num;
    await app.state({'action': 'scrollUp', 'id': '${diagnostic['id']}'});
    await Future<void>.delayed(const Duration(milliseconds: 250));
    snapshot = await app.ui();
    final afterScroll =
        (snapshot['nodes'] as List).cast<Map>().singleWhere(
              (node) => node['id'] == diagnostic['id'],
            )['scrollPosition']
            as num;
    require(
      afterScroll > beforeScroll,
      'the actual failure diagnostic region scrolls so its complete original text remains readable',
    );
    require(
      text(snapshot, '更新') && text(snapshot, '完全退出并重新打开 Desktop'),
      'the real plugin table operations and reload instruction remain available beside long failure diagnostics',
    );
    await app.capture('plugins-install-failure-scrolled');
    await observe('after-failed-update-before-reload', '1.0.0', '1.0.0');
    await fixture.control({
      'latest': {owned: '1.2.0'},
      'unavailable': <String>[],
    });

    if (desktop) {
      require(
        Platform.environment['GITHUB_ACTIONS'] == 'true',
        'normal official Desktop reload is restricted to disposable CI',
      );
      final before = (jsonDecode(await app.receipt.readAsString()) as Map)
          .cast<String, Object?>();
      final oldDesktopPid =
          ((await app.state())['native'] as Map)['openedDesktopPid'];
      require(
        oldDesktopPid is int && oldDesktopPid > 1,
        'native reopen starts from the actual tracked official Desktop PID',
      );
      final termination = <Map<String, Object?>>[];
      await app.state({'action': 'quitDesktop'});
      await waitFor(
        'tracked official Desktop and Host have actually exited',
        () async {
          final present = await app.receipt.exists();
          final checks = await Future.wait([
            for (final pid in [oldDesktopPid, before['pid']])
              Process.run('/bin/kill', ['-0', '$pid']),
          ]);
          termination.add({
            'observedAt': DateTime.now().toUtc().toIso8601String(),
            'receiptPresent': present,
            'desktopPid': oldDesktopPid,
            'hostPid': before['pid'],
            'processChecks': [
              for (final check in checks)
                {'exit': check.exitCode, 'stderr': check.stderr.toString()},
            ],
          });
          await File('${app.root.path}/plugin-native-termination.json')
              .writeAsString(jsonEncode(termination));
          return !present &&
              checks.every(
                (check) =>
                    check.exitCode != 0 &&
                    check.stderr.toString().contains('No such process'),
              );
        },
      );
      require(
        true,
        'normal Desktop termination actually releases both tracked Desktop and old Host before reopening',
      );
      await app.tap('管理');
      await app.tap('打开 DSH');
      final after = await waitForActualDesktopLease(
        oldLease: before['lease'] as String,
        receipt: () async => await app.receipt.exists()
            ? (jsonDecode(await app.receipt.readAsString()) as Map)
                  .cast<String, Object?>()
            : null,
        isOwned: app.ownsHostReceipt,
        ui: () => app.state(),
        applicationExit: app.applicationExit,
        dependencyFailure: () => app.startupFailure(oldDesktopPid as int),
      );
      require(
        after['lease'] != before['lease'] && after['pid'] != before['pid'],
        'normal user reopen creates a new real Desktop Host identity',
      );
      await observe('after-native-Desktop-reopen', '1.2.0', '1.1.0');
      await app.capture('plugins-native-reloaded');
      stdout.writeln(
        'T08 FULL NATIVE DESKTOP PLUGIN RELOAD APPLICATION SCENARIO PASSED',
      );
    } else {
      stdout.writeln(
        'T08 REAL UI PLUGIN UPDATE APPLICATION SCENARIO PASSED; NATIVE DESKTOP RELOAD NOT EXERCISED',
      );
    }
    await app.sdk('recycle');
  } finally {
    http.close(force: true);
  }
}
