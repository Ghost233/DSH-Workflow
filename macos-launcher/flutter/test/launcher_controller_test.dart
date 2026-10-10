import 'dart:async';
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

// A real Node control process: Desktop loss leaves the supervisor alive, and
// reconnect creates a new Web instance. No production ports or profiles are used.
const supervisor = r'''
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
const root = process.argv[2];
writeFileSync(root + '/pid', String(process.pid));
let instanceId, state = 'stopped';
const write = (name, payload) => console.log(name + '\t' + JSON.stringify(payload));
const snapshot = () => ({ state, instanceId: state === 'stopped' ? null : instanceId,
  url: 'http://127.0.0.1:41998/', observedAt: new Date().toISOString() });
const start = () => {
  instanceId = randomUUID(); state = 'starting';
  write('DSH_WORKFLOW_STATE', { global: snapshot() });
  console.log('output for ' + instanceId);
  state = 'running';
  write('DSH_WORKFLOW_READY', { url: snapshot().url, lanUrls: [] });
  write('DSH_WORKFLOW_STATE', { global: snapshot() });
};
start();
createInterface({ input: process.stdin }).on('line', line => {
  const input = JSON.parse(line);
  if (existsSync(root + '/disconnect')) state = 'stopped';
  if (input.type === 'open-global') {
    if (existsSync(root + '/disconnect')) unlinkSync(root + '/disconnect');
    start();
  }
  write('DSH_WORKFLOW_REPLY', { requestId: input.requestId, ok: true, global: snapshot() });
});
''';

Future<({LauncherController model, Directory root})> fixture({
  ProcessStarter? startProcess,
  bool desktopPreparation = false,
}) async {
  final root = await Directory.systemTemp.createTemp('dsh-controller-');
  final node = Process.runSync('/usr/bin/which', ['node']);
  expect(node.exitCode, 0, reason: 'A Node toolchain must be initialized');
  await Link('${root.path}/node').create(node.stdout.toString().trim());
  final scripts = await Directory(
    '${root.path}/workflow/macos-launcher/runtime',
  ).create(recursive: true);
  await File('${scripts.path}/global-supervisor.mjs').writeAsString(supervisor);
  if (desktopPreparation) {
    final executables = await Directory(
      '${root.path}/desktop/DeepSeek Harness.app/Contents/MacOS',
    ).create(recursive: true);
    await Link('${executables.path}/DeepSeek Harness')
        .create(node.stdout.toString().trim());
    await File('${scripts.path}/prepare-desktop.mjs')
        .writeAsString('process.exit(0);\n');
  }
  final model = LauncherController(
    FixtureNative(root.path),
    startProcess: startProcess,
  );
  await model.initialize();
  addTearDown(() async {
    await model.close();
    model.dispose();
    await root.delete(recursive: true);
  });
  return (model: model, root: root);
}

void main() {
  test('cold pending retries after the native open failure', () async {
    final f = await fixture(desktopPreparation: true);
    final native = f.model.native as FixtureNative;
    native.failDesktopOpen = true;
    await expectLater(f.model.startDesktopInBackground(), throwsStateError);
    native.failDesktopOpen = false;
    await f.model.startDesktop();
    expect(native.desktopOpenCalls, 2);
    expect(native.desktopIsRunning, isTrue);
    expect(native.desktopIsHidden, isFalse);
  });
  test('cold pending retries a stopped Desktop before any Web READY', () async {
    final f = await fixture(desktopPreparation: true);
    final native = f.model.native as FixtureNative;
    await f.model.startDesktopInBackground();
    expect(native.desktopIsHidden, isTrue);
    await f.model.startDesktop();
    expect(native.desktopOpenCalls, 1);
    expect(native.desktopIsHidden, isTrue);
    native.desktopIsRunning = false;
    await f.model.startDesktop();
    expect(native.desktopOpenCalls, 2);
    expect(native.desktopIsRunning, isTrue);
    expect(native.desktopIsHidden, isFalse);
  });

  test('window-only actions never start a missing Desktop and preserve a running backend', () async {
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
  test('explicit open shows an existing hidden Desktop despite the startup preference', () async {
    final f = await fixture();
    final native = f.model.native as FixtureNative;
    native.desktopIsRunning = true;
    native.desktopIsHidden = true;
    await f.model.savePreferences(true, false, hideWindowOnStart: true);
    await f.model.openDsh();
    expect(native.desktopIsRunning, isTrue);
    expect(native.desktopIsHidden, isFalse);
  });
  test(
    'background and automatic startup preserve a running visible Desktop',
    () async {
      final f = await fixture();
      final native = f.model.native as FixtureNative;
      native.desktopIsRunning = true;
      await f.model.savePreferences(true, false, hideWindowOnStart: true);
      await f.model.startDesktopInBackground();
      await f.model.startDesktop();
      expect(native.desktopIsRunning, isTrue);
      expect(native.desktopIsHidden, isFalse);
    },
  );
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
  test(
    'UI startup and SDK recycle share the mutation gate before spawn completes',
    () async {
      final spawned = Completer<void>(), release = Completer<void>();
      final f = await fixture(
        startProcess:
            (executable, arguments, {workingDirectory, environment}) async {
              spawned.complete();
              await release.future;
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
      await f.model.stopWeb();
      expect((await f.model.webStatus()).state, ServiceState.stopped);
    },
  );

  test(
    'start reconnects a living supervisor and logs retain the actual run scope',
    () async {
      final f = await fixture();
      await f.model.startWeb();
      final first = (await f.model.webStatus()).instanceId;
      final firstLogs = await f.model.recentLogs(LogQuery(limit: 1));
      expect(firstLogs.instanceId, first);
      expect(firstLogs.entries.single.text, 'output for $first');
      expect(firstLogs.truncated, isFalse);
      await File('${f.root.path}/disconnect').writeAsString('Desktop lost');
      expect((await f.model.webStatus()).state, ServiceState.stopped);
      await f.model.startWeb();
      final second = (await f.model.webStatus()).instanceId;
      expect(second, isNot(first));
      final secondLogs = await f.model.recentLogs(LogQuery(limit: 1));
      expect(secondLogs.instanceId, second);
      expect(secondLogs.entries.single.text, 'output for $second');
      expect(secondLogs.entries.single.timestamp, isNull);
      expect(secondLogs.truncated, isFalse);
      await f.model.restartWeb();
      final third = (await f.model.webStatus()).instanceId;
      expect(third, isNot(second));
      expect(
        (await f.model.recentLogs(LogQuery(limit: 1))).entries.single.text,
        'output for $third',
      );
    },
  );

  test('repeated close waits for a suspended child to be killed', () async {
    final f = await fixture();
    await f.model.startWeb();
    final pid = int.parse(await File('${f.root.path}/pid').readAsString());
    expect(Process.killPid(pid, ProcessSignal.sigstop), isTrue);
    final first = f.model.close();
    final second = f.model.close();
    expect(identical(first, second), isTrue);
    await second.timeout(const Duration(seconds: 5));
    expect((await Process.run('/bin/kill', ['-0', '$pid'])).exitCode, isNot(0));
    expect(f.model.isActive, isFalse);
  });

  test('close also waits for a pending spawn and leaves no child', () async {
    final spawned = Completer<void>(), release = Completer<void>();
    final f = await fixture(
      startProcess:
          (executable, arguments, {workingDirectory, environment}) async {
            spawned.complete();
            await release.future;
            return Process.start(
              executable,
              arguments,
              workingDirectory: workingDirectory,
              environment: environment,
            );
          },
    );
    final failure = expectLater(f.model.startWeb(), throwsStateError);
    await spawned.future;
    final close = f.model.close();
    release.complete();
    await close.timeout(const Duration(seconds: 5));
    await failure;
    expect(f.model.isActive, isFalse);
  });

  test(
    'close settles a paused real child whose start handle arrives late',
    () async {
      final spawned = Completer<Process>(), release = Completer<void>();
      final f = await fixture(
        startProcess:
            (executable, arguments, {workingDirectory, environment}) async {
              final child = await Process.start(
                executable,
                arguments,
                workingDirectory: workingDirectory,
                environment: environment,
              );
              spawned.complete(child);
              await release.future;
              return child;
            },
      );
      final failure = expectLater(f.model.startWeb(), throwsStateError);
      final child = await spawned.future;
      await (() async {
        while (!await File('${f.root.path}/pid').exists()) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      })().timeout(const Duration(seconds: 2));
      expect(child.kill(ProcessSignal.sigstop), isTrue);
      await (() async {
        while (!(await Process.run('/bin/ps', [
          '-o',
          'stat=',
          '-p',
          '${child.pid}',
        ])).stdout.toString().trim().startsWith('T')) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      })().timeout(const Duration(seconds: 2));
      final close = f.model.close();
      expect(identical(close, f.model.close()), isTrue);
      release.complete();
      try {
        await close.timeout(const Duration(seconds: 5));
        expect(
          (await Process.run('/bin/kill', ['-0', '${child.pid}'])).exitCode,
          isNot(0),
        );
        expect(f.model.isActive, isFalse);
      } finally {
        child.kill(ProcessSignal.sigcont);
        child.kill(ProcessSignal.sigkill);
        await child.exitCode;
      }
      await failure;
    },
  );
}
