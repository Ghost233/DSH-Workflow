import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

class FixtureNative extends NativeBridge {
  FixtureNative(this.root);
  final String root;
  bool? savedHideWindowOnStart;
  bool failPreferences = false, failDesktopOpen = false;
  int desktopOpenCalls = 0;
  bool desktopIsRunning = false, desktopIsHidden = false;
  @override
  Future<void> showWindow() async {}
  @override
  Future<bool> desktopRunning(String path) async => desktopIsRunning;
  @override
  Future<void> hideDesktop(String path) async {
    if (!desktopIsRunning) throw StateError('Desktop 未运行');
    desktopIsHidden = true;
  }

  @override
  Future<void> showDesktop(String path) async {
    if (!desktopIsRunning) throw StateError('Desktop 未运行');
    desktopIsHidden = false;
  }

  @override
  Future<void> openDesktop(
    String path, {
    required Map<String, String> environment,
    bool hidden = false,
  }) async {
    desktopOpenCalls++;
    if (failDesktopOpen) throw StateError('Desktop open refused');
    desktopIsRunning = true;
    desktopIsHidden = hidden;
  }

  @override
  Future<void> savePreferences(
    bool fullAccess,
    bool allowLanSettings, {
    required bool hideWindowOnStart,
  }) async {
    if (failPreferences) throw StateError('Preference storage refused');
    savedHideWindowOnStart = hideWindowOnStart;
  }

  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': root,
    'dataRoot': root,
    'home': root,
    'appVersion': '0.2.3',
    'loginStatus': 'disabled',
    if (savedHideWindowOnStart != null)
      'hideWindowOnStart': savedHideWindowOnStart,
    'password': 'fixture-only',
  });
}

// The only test I/O adaptation is an ephemeral port. Every result comes from
// the actual project CLI and gateway; no DSH service is simulated.
const webPortAdapter = r"""
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let body = '';
for await (const chunk of process.stdin) body += chunk;
const request = JSON.parse(body);
if (request.type === 'start-web') request.port = 0;
const child = spawn(process.execPath, [fileURLToPath(new URL('./web-cli-runtime.mjs', import.meta.url)), ...process.argv.slice(2)], {
  env: process.env, stdio: ['pipe', 'inherit', 'inherit'],
});
child.stdin.end(JSON.stringify(request));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
""";

Future<int?> ownedWebPid(Directory root) async {
  final record = File('${root.path}/global/.dsh-workflow/web/manager.json');
  if (!await record.exists()) return null;
  expect(await FileSystemEntity.isLink(record.path), isFalse);
  expect(
    await record.parent.resolveSymbolicLinks(),
    record.parent.absolute.path,
  );
  expect((await record.stat()).mode & 0x3f, 0);
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
  expect(identity.exitCode, 0);
  expect(
    command.startsWith('$uid ') &&
        command.contains(root.path) &&
        command.contains('global-supervisor.mjs'),
    isTrue,
  );
  return pid;
}

Future<({LauncherController model, Directory root})> fixture({
  ProcessStarter? startProcess,
  bool webRuntime = false,
}) async {
  final root = await Directory('/private/tmp').createTemp('dsh-controller-');
  final node = Process.runSync('/usr/bin/which', ['node']);
  expect(node.exitCode, 0, reason: 'A Node toolchain must be initialized');
  await Link('${root.path}/node').create(node.stdout.toString().trim());
  final scripts = await Directory(
    '${root.path}/workflow/macos-launcher/runtime',
  ).create(recursive: true);
  final model = LauncherController(
    FixtureNative(root.path),
    startProcess: startProcess,
  );
  await model.initialize();
  addTearDown(() async {
    await model.close();
    final pid = await ownedWebPid(root);
    if (pid != null) {
      Process.killPid(pid, ProcessSignal.sigcont);
      Process.killPid(pid, ProcessSignal.sigterm);
      final elapsed = Stopwatch()..start();
      final record = File('${root.path}/global/.dsh-workflow/web/manager.json');
      while (elapsed.elapsed < const Duration(seconds: 10)) {
        if (!await record.exists() &&
            (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode != 0) {
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(
        await record.exists(),
        isFalse,
        reason: 'owned Web fixture control resources are released',
      );
      expect(
        (await Process.run('/bin/kill', ['-0', '$pid'])).exitCode,
        isNot(0),
      );
    }
    model.dispose();
    await root.delete(recursive: true);
  });
  if (webRuntime) {
    final launcher = Directory.current.parent;
    expect(
      File('${launcher.path}/flutter/pubspec.yaml').existsSync(),
      isTrue,
      reason: 'The fixed Flutter test command runs from macos-launcher/flutter',
    );
    for (final name in [
      'global-supervisor.mjs',
      'launcher-events.mjs',
      'manager-control.mjs',
      'manager-websocket.mjs',
      'lan-gateway.mjs',
      'lan-settings-client.mjs',
      'web-control.mjs',
      'service-control.mjs',
      'status-notifications.mjs',
    ]) {
      await File('${launcher.path}/runtime/$name')
          .copy('${scripts.path}/$name');
    }
    await Link('${root.path}/node_modules')
        .create('${launcher.path}/node_modules');
    await File('${launcher.path}/runtime/web-cli.mjs')
        .copy('${scripts.path}/web-cli-runtime.mjs');
    await File('${launcher.parent.path}/dsh-runtime.json')
        .copy('${root.path}/workflow/dsh-runtime.json');
    await File('${scripts.path}/web-cli.mjs').writeAsString(webPortAdapter);
  }
  return (model: model, root: root);
}

Future<int> responseCode(Uri url) async {
  final client = HttpClient();
  try {
    final response = await (await client.getUrl(url))
        .close()
        .timeout(const Duration(seconds: 5));
    await response.drain<void>();
    return response.statusCode;
  } finally {
    client.close(force: true);
  }
}

void main() {
  // The four Desktop launch preference cases moved unchanged in behavior to
  // desktop_launch_preferences_test.dart, backed by an actual independent Host.
  test('window-only actions never start a missing Desktop and preserve a running Desktop', () async {
    final f = await fixture();
    final native = f.model.native as FixtureNative;
    await expectLater(f.model.showExistingDesktop(), throwsStateError);
    await expectLater(f.model.hideDesktop(), throwsStateError);
    expect(native.desktopIsRunning, isFalse);
    native.desktopIsRunning = true;
    await f.model.hideDesktop();
    expect(native.desktopIsRunning, isTrue);
    expect(native.desktopIsHidden, isTrue);
    await f.model.showExistingDesktop();
    expect(native.desktopIsRunning, isTrue);
    expect(native.desktopIsHidden, isFalse);
  });
  test('startup window preference migrates missing values and preserves storage failures', () async {
    final f = await fixture();
    final native = f.model.native as FixtureNative;
    expect(f.model.hideWindowOnStart, isFalse);
    await f.model.savePreferences(true, false, hideWindowOnStart: true);
    await f.model.initialize();
    expect(f.model.hideWindowOnStart, isTrue);
    native.failPreferences = true;
    await expectLater(
      f.model.savePreferences(true, false, hideWindowOnStart: false),
      throwsStateError,
    );
    expect(f.model.hideWindowOnStart, isTrue);
    await f.model.initialize();
    expect(f.model.hideWindowOnStart, isTrue);
  });
  test('UI startup and SDK recycle share the mutation gate before process startup completes', () async {
    final spawned = Completer<void>(), release = Completer<void>();
    final f = await fixture(
      webRuntime: true,
      startProcess:
          (executable, arguments, {workingDirectory, environment}) async {
            if (!spawned.isCompleted) {
              spawned.complete();
              await release.future;
            }
            return Process.start(
              executable,
              arguments,
              workingDirectory: workingDirectory,
              environment: environment,
            );
          },
    );
    final start = f.model.startWeb();
    await spawned.future;
    try {
      await expectLater(
        f.model.stopWeb(),
        throwsA(isA<ProtocolError>().having((e) => e.code, 'code', 'busy')),
      );
    } finally {
      release.complete();
    }
    await start;
    expect((await f.model.webStatus()).state, ServiceState.running);
    expect((await f.model.webStatus()).ready, isFalse);
    final url = f.model.webUrl!;
    expect(await responseCode(url), 503);
    await f.model.stopWeb();
    final check = await ServerSocket.bind(
      InternetAddress.loopbackIPv4,
      url.port,
    );
    await check.close();
    expect((await f.model.webStatus()).state, ServiceState.stopped);
  });
  test('reopening access keeps logs in the actual new Web run scope', () async {
    final f = await fixture(webRuntime: true);
    await f.model.startWeb();
    final first = (await f.model.webStatus()).instanceId;
    final firstLogs = await f.model.recentLogs(LogQuery(limit: 100));
    expect(firstLogs.instanceId, first);
    expect(
      firstLogs.entries.any((entry) => entry.text.contains(first!)),
      isTrue,
    );
    await f.model.restartWeb();
    final second = (await f.model.webStatus()).instanceId;
    expect(second, isNot(first));
    final logs = await f.model.recentLogs(LogQuery(limit: 100));
    expect(logs.instanceId, second);
    expect(logs.entries.any((entry) => entry.text.contains(second!)), isTrue);
    expect(logs.entries.any((entry) => entry.text.contains(first!)), isFalse);
    expect(logs.truncated, isFalse);
  });
  test('repeated close preserves a suspended independent Web daemon', () async {
    final f = await fixture(webRuntime: true);
    await f.model.startWeb();
    final url = f.model.webUrl!;
    final pid = (await ownedWebPid(f.root))!;
    expect(Process.killPid(pid, ProcessSignal.sigstop), isTrue);
    try {
      final first = f.model.close(), second = f.model.close();
      expect(identical(first, second), isTrue);
      await second.timeout(const Duration(seconds: 1));
      expect((await Process.run('/bin/kill', ['-0', '$pid'])).exitCode, 0);
    } finally {
      Process.killPid(pid, ProcessSignal.sigcont);
    }
    expect(await responseCode(url), 503);
    final reconnected = LauncherController(FixtureNative(f.root.path));
    await reconnected.initialize();
    try {
      expect(reconnected.snapshot.instanceId, f.model.snapshot.instanceId);
      expect(reconnected.snapshot.state, ServiceState.running);
      expect(reconnected.snapshot.ready, isFalse);
    } finally {
      await reconnected.close();
      reconnected.dispose();
    }
  });
  test('close waits for an authorized pending Web start and preserves its resource', () async {
    final spawned = Completer<void>(), release = Completer<void>();
    final f = await fixture(
      webRuntime: true,
      startProcess:
          (executable, arguments, {workingDirectory, environment}) async {
            if (!spawned.isCompleted) {
              spawned.complete();
              await release.future;
            }
            return Process.start(
              executable,
              arguments,
              workingDirectory: workingDirectory,
              environment: environment,
            );
          },
    );
    final starting = f.model.startWeb();
    await spawned.future;
    final closing = f.model.close();
    release.complete();
    await starting;
    await closing.timeout(const Duration(seconds: 5));
    expect(await responseCode(f.model.webUrl!), 503);
    expect(await ownedWebPid(f.root), isNotNull);
  });
  test('a late paused transport handle does not turn launcher close into Web recycle', () async {
    final spawned = Completer<Process>(), release = Completer<void>();
    final f = await fixture(
      webRuntime: true,
      startProcess:
          (executable, arguments, {workingDirectory, environment}) async {
            final child = await Process.start(
              executable,
              arguments,
              workingDirectory: workingDirectory,
              environment: environment,
            );
            if (!spawned.isCompleted) {
              spawned.complete(child);
              await release.future;
            }
            return child;
          },
    );
    final starting = f.model.startWeb();
    final child = await spawned.future;
    expect(child.kill(ProcessSignal.sigstop), isTrue);
    var closed = false;
    final closing = f.model.close().then((_) {
      closed = true;
    });
    release.complete();
    try {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(closed, isFalse);
      expect(
        (await Process.run('/bin/kill', ['-0', '${child.pid}'])).exitCode,
        0,
      );
    } finally {
      child.kill(ProcessSignal.sigcont);
    }
    await starting;
    await closing.timeout(const Duration(seconds: 5));
    expect(await child.exitCode, 0);
    expect(await responseCode(f.model.webUrl!), 503);
  });
  test('a missing Node executable reports the real startup failure without a Web resource', () async {
    final f = await fixture(webRuntime: true);
    await Link('${f.root.path}/node').delete();
    await expectLater(f.model.startWeb(), throwsA(isA<ProcessException>()));
    expect(f.model.snapshot.state, ServiceState.failed);
    expect(await ownedWebPid(f.root), isNull);
  });
}
