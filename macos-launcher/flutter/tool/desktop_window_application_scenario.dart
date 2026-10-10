import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:launcher_core/launcher_core.dart';
import 'package:vm_service/vm_service.dart' hide Error;
import 'package:vm_service/vm_service_io.dart';

import 'probe_diagnostics.dart';
import 'release_distribution_probe.dart' show outerSupervisorPython;

import 'application_probe.dart' show require, waitFor, closeProbeResources;
import 'web_application_scenario.dart';

/// One private Desktop's real window facts; no user application is controlled.
class DesktopWindowProbe {
  DesktopWindowProbe._(this.root, this.process, this.log);
  final Directory root;
  final Process process;
  final IOSink log;
  final rows = <Map<String, Object?>>[];
  int? callerPid;
  int coldStartIndex = 0;
  bool closed = false;
  final drained = <Completer<void>>[];
  final subscriptions = <StreamSubscription<String>>[];
  Map<String, Object?> get current => rows.lastWhere(
    (row) => row.containsKey('running'),
    orElse: () => {'ownershipKnown': false},
  );

  static Future<DesktopWindowProbe> start(
    Directory root, {
    String logName = 'desktop-window-observations.jsonl',
  }) async {
    final binary = logName == 'desktop-window-observations.jsonl'
        ? '${root.path}/desktop-window-observer'
        : '${root.path}/desktop-window-restart-observer';
    final compile = await Process.run('/usr/bin/xcrun', [
      'swiftc',
      File.fromUri(Platform.script.resolve('desktop_window_observer.swift'))
          .path,
      '-o',
      binary,
    ]);
    await File('$binary-compile.log')
        .writeAsString('${compile.stdout}${compile.stderr}');
    require(
      compile.exitCode == 0,
      'private read-only window observer compiles',
    );
    final process = await Process.start(binary, [root.path]);
    stdout.writeln('WINDOW_OBSERVER_PROCESS_PID=${process.pid}');
    unawaited(
      process.exitCode.then((code) {
        stdout.writeln('WINDOW_OBSERVER_PROCESS_EXIT=$code PID=${process.pid}');
      }),
    );
    final probe = DesktopWindowProbe._(
      root,
      process,
      File('${root.path}/$logName').openWrite(),
    );
    final ready = Completer<void>();
    final stdoutDone = Completer<void>(), stderrDone = Completer<void>();
    probe.drained.addAll([stdoutDone, stderrDone]);
    probe.subscriptions.add(
      process.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) {
            probe.log.writeln(line);
            final value = (jsonDecode(line) as Map).cast<String, Object?>();
            probe.rows.add(value);
            if (value['phase'] == 'observer-ready' && !ready.isCompleted) {
              ready.complete();
            }
          }, onDone: stdoutDone.complete),
    );
    probe.subscriptions.add(
      process.stderr
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(probe.log.writeln, onDone: stderrDone.complete),
    );
    try {
      await ready.future.timeout(const Duration(seconds: 10));
      return probe;
    } catch (_) {
      await closeProbeResources([
        ('failed window observer preparation', probe.close),
      ], preserveFailure: true);
      rethrow;
    }
  }

  Future<Map<String, Object?>> foreground(String action) async {
    final result = await Process.run(
      '${root.path}/desktop-foreground-observer',
      [root.path, action],
    );
    require(
      result.exitCode == 0,
      'external foreground $action is physically known: ${result.stderr}',
    );
    return (jsonDecode(result.stdout.toString()) as Map)
        .cast<String, Object?>();
  }

  Future<void> prepareExternalForeground() async {
    final build = await Process.run('/usr/bin/swiftc', [
      File.fromUri(Platform.script.resolve('desktop_foreground_observer.swift'))
          .path,
      '-o',
      '${root.path}/desktop-foreground-observer',
    ]);
    require(build.exitCode == 0, 'external foreground helper compiles');
    await foreground('capture');
    final normal = await Process.run('/usr/bin/swiftc', [
      File.fromUri(Platform.script.resolve('release_window_observer.swift'))
          .path,
      '-o',
      '${root.path}/release-window-observer',
    ]);
    require(
      normal.exitCode == 0,
      'existing owned normal-close helper compiles',
    );
  }

  Future<void> bindNormalLauncher(String app, int pid) async {
    await waitFor(
      'normal-close helper binds this exact private Launcher',
      () async {
        final result = await Process.run(
          '${root.path}/release-window-observer',
          [root.path, app, 'capture'],
        );
        require(
          result.exitCode == 0,
          'private Launcher physical observation is known',
        );
        return (jsonDecode(result.stdout.toString()) as Map)['pid'] == pid;
      },
    );
  }

  Future<void> beforeSdkColdStart(
    ApplicationState state,
    Future<void> Function(String) tap,
  ) async {
    await beforeStart(state, tap);
    await tap('启动时隐藏窗口');
    await waitFor(
      'real UI hide preference saved',
      () async => ((await state())['nodes'] as List).cast<Map>().any(
        (n) =>
            n['label'].toString().startsWith('启动时隐藏窗口') && n['toggled'] == true,
      ),
    );
    final saved = await Process.run('/usr/bin/plutil', [
      '-convert',
      'json',
      '-o',
      '-',
      '${root.path}/data/test-preferences.plist',
    ]);
    require(
      saved.exitCode == 0 &&
          (jsonDecode(saved.stdout.toString()) as Map)['hideWindowOnStart'] ==
              true,
      'actual private hide preference persisted',
    );
    require(
      current['ownershipKnown'] == true &&
          current['running'] == false &&
          !await File(
            '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
          ).exists() &&
          (((await state())['native'] as Map)['coldCallerObservation'] as Map)
              .isEmpty,
      'SDK request is the only cold Desktop trigger',
    );
    await state({'action': 'close'});
    final baseline = await foreground('activate');
    await File('${root.path}/external-foreground-baseline.json')
        .writeAsString(jsonEncode(baseline));
  }

  Future<void> runSdkColdFocus(WebObservation app) async {
    final baseline = jsonDecode(
      await File('${root.path}/external-foreground-baseline.json')
          .readAsString(),
    ) as Map;
    var cold =
        ((await app.state())['native'] as Map)['coldCallerObservation'] as Map;
    final live = File('${root.path}/supervision-live.pending');
    await live.writeAsString(
      jsonEncode({
        'pids': {
          'app': ((await app.state())['native'] as Map)['pid'],
          'desktop': current['pid'],
          'host': app.backend['pid'],
        },
      }),
    );
    await live.rename('${root.path}/supervision-live.json');
    await File('${root.path}/desktop-window-evidence.json').writeAsString(
      jsonEncode({
        'sdkColdTrigger': true,
        'externalBaseline': baseline,
        'nativeColdCapture': cold,
        'physicalWindow': current,
        'hostPid': app.backend['pid'],
        'hostLease': app.backend['lease'],
        'externalFocusVerified': false,
      }),
    );
    require(
      jsonEncode(cold['inputCountsBefore']) ==
          jsonEncode(baseline['inputCounts']),
      'external input epoch unchanged before native SDK cold capture',
    );
    require(
      cold['foregroundPid'] == baseline['pid'] &&
          cold['restoreSelfEligible'] == false,
      'SDK cold baseline is the actual external app',
    );
    require(
      await app.ownsHostReceipt(app.backend),
      'SDK cold case binds exact physical Host',
    );
    Map<String, Object?>? latestInput;
    var mismatchRecorded = false;
    Future<bool> currentInputKnown() async {
      cold =
          ((await app.state())['native'] as Map)['coldCallerObservation']
              as Map;
      latestInput = await foreground('query');
      require(
        sdkColdEpochUnchanged(baseline, cold, latestInput!['inputCounts']),
        'fresh OS and native input epoch are known and unchanged',
      );
      final preserved =
          [
            'pid',
            'uid',
            'kernelSeconds',
            'kernelMicroseconds',
            'executable',
          ].every((key) => latestInput![key] == baseline[key]) &&
          latestInput!['frontmostPid'] == baseline['pid'];
      if (!preserved && !mismatchRecorded) {
        mismatchRecorded = true;
        final native = (await app.state())['native'] as Map;
        await File('${root.path}/desktop-focus-first-mismatch.json')
            .writeAsString(
              jsonEncode({
                'externalBaseline': baseline,
                'nativeColdCapture': cold,
                'nativeForeground': native['foregroundObservation'],
                'freshOsInput': latestInput,
                'physicalWindow': current,
              }),
            );
      }
      return preserved;
    }

    try {
      await waitFor(
        'same hidden Desktop preserves external foreground',
        () async =>
            await currentInputKnown() &&
            current['ownershipKnown'] == true &&
            current['hidden'] == true &&
            current['onscreenWindowCount'] == 0 &&
            current['active'] == false &&
            current['frontmostPid'] == baseline['pid'],
      );
    } catch (error, stack) {
      await finishSdkColdFocusFailure(
        root: root,
        state: app.state,
        backend: app.backend,
        baseline: baseline,
        cold: cold,
        physicalWindow: current,
        freshOsInput: latestInput,
        firstError: error,
        firstStack: stack,
      );
    }
    require(
      await currentInputKnown(),
      'final external focus uses fresh input and physical identity',
    );
    await File('${root.path}/desktop-window-evidence.json').writeAsString(
      jsonEncode({
        'sdkColdTrigger': true,
        'externalBaseline': baseline,
        'nativeColdCapture': cold,
        'physicalWindow': current,
        'hostPid': app.backend['pid'],
        'hostLease': app.backend['lease'],
        'freshOsInput': latestInput,
        'externalFocusVerified': true,
      }),
    );
    require(
      (await app.appRequest('openWindow'))['error'] == null,
      'official SDK recovers management window after external focus assertion',
    );
  }

  Future<void> beforeStart(
    ApplicationState state,
    Future<void> Function(String) tap,
  ) async {
    await tap('仅显示已运行窗口');
    await waitFor(
      'missing Desktop is explicitly reported without starting',
      () async {
        final ui = await state();
        return (ui['nodes'] as List).cast<Map>().any(
          (node) => '${node['label']} ${node['value']}'.contains('Desktop 未运行'),
        );
      },
    );
    require(
      current['running'] == false && current['ownershipKnown'] == true,
      'show-existing without Desktop never creates a process or window',
    );
    callerPid = ((await state())['native'] as Map)['pid'] as int;
    coldStartIndex = rows.length;
  }

  Future<void> run(WebObservation app, {required bool coldHidden}) async {
    require(
      await app.ownsHostReceipt(app.backend),
      'window scene uses the current physically bound private Host',
    );
    final native = (await app.state())['native'] as Map;
    final pid = native['openedDesktopPid'];
    await waitFor(
      'private Desktop has current native window facts',
      () async =>
          current['ownershipKnown'] == true &&
          current['pid'] == pid &&
          current['windowLookupKnown'] == true,
    );
    if (coldHidden) {
      require(
        current['hidden'] == true &&
            current['onscreenWindowCount'] == 0 &&
            current['active'] == false,
        'cold background Desktop stays hidden while its actual Web frontend is ready',
      );
      final callerCapture = native['coldCallerObservation'] as Map;
      final foregroundBeforeCold = callerCapture['foregroundPid'];
      require(
        callerCapture['callerPid'] == callerPid &&
            foregroundBeforeCold is int &&
            callerCapture['captureUptime'] is num,
        'cold focus baseline comes from this actual native launch',
      );
      await waitFor(
        'cold launch restores the actual prior caller focus',
        () async =>
            current['hidden'] == true &&
            current['onscreenWindowCount'] == 0 &&
            current['active'] == false &&
            current['frontmostPid'] == foregroundBeforeCold,
      );
      final coldRows = rows.skip(coldStartIndex).toList();
      await File('${root.path}/desktop-window-evidence.json').writeAsString(
        jsonEncode({
          'coldHidden': true,
          'coldWindowVerified': true,
          'desktopPid': pid,
          'hostPid': app.backend['pid'],
          'hostLease': app.backend['lease'],
          'callerPidBeforeColdStart': callerPid,
          'nativeCallerCapture': callerCapture,
          'actualForegroundPidBeforeColdStart': foregroundBeforeCold,
          'frontmostPidAfterRecovery': current['frontmostPid'],
          'finalHidden': true,
          'finalOnscreenWindowCount': 0,
          'finalActive': false,
          'actualWebHostSdkReady': true,
          'transientOnscreenOrActivationObserved': coldRows.any(
            (row) =>
                (row['onscreenWindowCount'] as int? ?? 0) > 0 ||
                row['active'] == true,
          ),
          'coldObservations': coldRows,
          'nominalSampleIntervalMilliseconds': 20,
          'preciseContinuousDurationClaim': false,
          'neverActivatedClaim': false,
        }),
      );
      stdout.writeln('DESKTOP COLD FINAL STATE AND FOCUS RECOVERY PASSED');
      return;
    } else {
      require(
        rows.any(
          (row) =>
              row['pid'] == pid &&
              (row['onscreenWindowCount'] as int? ?? 0) > 0 &&
              row['active'] == true,
        ),
        'cold start-show records an actual onscreen and activated Desktop',
      );
    }
    final hostPid = app.backend['pid'], lease = app.backend['lease'];
    Future<void> sameBackend() async {
      final receipt = (jsonDecode(await app.receipt.readAsString()) as Map)
          .cast<String, Object?>();
      require(
        receipt['pid'] == hostPid &&
            receipt['lease'] == lease &&
            await app.ownsHostReceipt(receipt),
        'window action retains the same physically bound Host and lease',
      );
      require(
        (await app.webHealth())['instanceId'] == lease &&
            (await app.backendHealth())['instanceId'] == lease,
        'window action preserves actual Web and Desktop Host health',
      );
    }

    Future<void> visible() => waitFor(
      'same Desktop is shown and focused',
      () async =>
          current['pid'] == pid &&
          current['hidden'] == false &&
          (current['onscreenWindowCount'] as int? ?? 0) > 0 &&
          current['active'] == true,
    );
    await app.tap('仅显示已运行窗口');
    await visible();
    await sameBackend();
    await app.tap('后台启动');
    require(
      current['pid'] == pid &&
          current['hidden'] == false &&
          (current['onscreenWindowCount'] as int? ?? 0) > 0,
      'background startup reuses the visible Desktop without hiding it',
    );
    await sameBackend();
    await app.tap('隐藏窗口');
    await waitFor(
      'window-only hide preserves the running Desktop',
      () async =>
          current['pid'] == pid &&
          current['hidden'] == true &&
          current['onscreenWindowCount'] == 0,
    );
    await sameBackend();
    await app.tap('仅显示已运行窗口');
    await visible();
    await sameBackend();
    await prepareExternalForeground();
    await foreground('activate');
    await waitFor(
      'visible Desktop and Launcher are both inactive before accessibility hide',
      () async =>
          current['hidden'] == false &&
          current['active'] == false &&
          ((await app.state())['native'] as Map)['appActive'] == false,
    );
    await app.tap('隐藏窗口');
    await waitFor(
      'accessibility hide works without prior application activation',
      () async =>
          current['pid'] == pid &&
          current['hidden'] == true &&
          current['onscreenWindowCount'] == 0,
    );
    await sameBackend();
    await app.tap('仅显示已运行窗口');
    await visible();
    await app.tap('启动时隐藏窗口');
    final preferences = File('${root.path}/data/test-preferences.plist');
    await waitFor('actual native startup preference is saved', () async {
      if (await FileSystemEntity.type(preferences.path, followLinks: false) !=
          FileSystemEntityType.file) {
        return false;
      }
      final result = await Process.run('/usr/bin/plutil', [
        '-extract',
        'hideWindowOnStart',
        'raw',
        '-o',
        '-',
        preferences.path,
      ]);
      return result.exitCode == 0 && result.stdout.toString().trim() == 'true';
    });
    await app.tap('隐藏窗口');
    await waitFor(
      'Desktop is hidden before explicit open',
      () async => current['hidden'] == true,
    );
    await app.tap('打开桌面版');
    await visible();
    await sameBackend();
    await File('${root.path}/desktop-window-evidence.json').writeAsString(
      jsonEncode({
        'coldHidden': coldHidden,
        'coldWindowVerified': true,
        'transientWindowObservations': rows
            .where((row) => (row['onscreenWindowCount'] as int? ?? 0) > 0)
            .toList(),
        'desktopPid': pid,
        'hostPid': hostPid,
        'hostLease': lease,
        'hideShowSameBackend': true,
        'backgroundReusePreservedVisibility': true,
        'savedHideWindowOnStart': true,
        'explicitOpenOverridesPreference': true,
        'sampleIntervalMilliseconds': 20,
        'restartPreferenceVerified': false,
      }),
    );
    stdout.writeln('DESKTOP WINDOW BODY PASSED (restart pending)');
  }

  Future<void> close() async {
    if (closed) return;
    closed = true;
    var failed = false;
    int? code;
    try {
      process.stdin.writeln('stop');
      await process.stdin.flush();
      code = await process.exitCode;
      await Future.wait(drained.map((done) => done.future));
      require(
        code == 0 && rows.any((row) => row['phase'] == 'observer-complete'),
        'private window observation completes without unknown identity',
      );
    } catch (_) {
      failed = true;
      rethrow;
    } finally {
      await closeProbeResources([
        (
          'window observer process',
          () async {
            if (code == null) {
              process.kill(ProcessSignal.sigterm);
              var forced = false;
              try {
                code = await process.exitCode.timeout(
                  const Duration(seconds: 3),
                );
              } on TimeoutException {
                forced = true;
                process.kill(ProcessSignal.sigkill);
                code = await process.exitCode;
              }
              stdout.writeln(
                'WINDOW_OBSERVER_CLEANUP_EXIT=$code FORCED=$forced',
              );
              throw StateError(
                'Window observer required failure cleanup; actual exit $code forced=$forced',
              );
            }
          },
        ),
        (
          'window observer drain',
          () => Future.wait(drained.map((done) => done.future)),
        ),
        for (final subscription in subscriptions)
          ('window observer subscription', subscription.cancel),
        ('window observer log', log.close),
        (
          'external foreground restore',
          () async {
            if (await File('${root.path}/external-foreground-original.json')
                .exists()) {
              await foreground('restore');
            }
          },
        ),
      ], preserveFailure: failed);
    }
  }
}

/// Reopen the same saved private profile, then reopen only its Launcher while
/// retaining the exact visible Desktop. This is separate from the cold case.
Future<void> runDesktopWindowRestarts(
  File sourceExecutable,
  Directory root,
) async {
  final validation = await Process.run('/usr/bin/python3', [
    '-c',
    'import importlib.util,sys; s=importlib.util.spec_from_file_location("cycle",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.validate_observation_root(sys.argv[2],m.observation_runner()); print("owned")',
    File.fromUri(
      Platform.script.resolve(
        '../../../.github/scripts/settings_startup_cycle.py',
      ),
    ).path,
    root.path,
  ]);
  require(
    validation.exitCode == 0 && validation.stdout.toString().trim() == 'owned',
    'saved profile is a direct canonical UID-owned private case',
  );
  final data = Directory('${root.path}/data');
  require(
    await data.resolveSymbolicLinks() == data.path,
    'saved profile data path is physical',
  );
  final prefs = File('${data.path}/test-preferences.plist');
  require(
    await FileSystemEntity.type(prefs.path, followLinks: false) ==
        FileSystemEntityType.file,
    'saved preferences are a regular private file',
  );
  final prefRead = await Process.run('/usr/bin/plutil', [
    '-extract',
    'hideWindowOnStart',
    'raw',
    '-o',
    '-',
    prefs.path,
  ]);
  require(
    prefRead.exitCode == 0 && prefRead.stdout.toString().trim() == 'true',
    'prior real UI saved startup-hidden in this same profile',
  );
  final original = File('${root.path}/candidate.app/Contents/Info.plist');
  require(
    await FileSystemEntity.type(original.path, followLinks: false) ==
        FileSystemEntityType.file,
    'saved candidate isolation metadata is a regular file',
  );
  final sessionRoot = await Directory('${root.path}/restart-sessions')
      .create(recursive: true);
  final session = await sessionRoot.createTemp('run-');
  final app = Directory('${session.path}/restart-candidate.app');
  require(!await app.exists(), 'restart candidate path is fresh');
  final copy = await Process.run('/usr/bin/ditto', [
    sourceExecutable.parent.parent.parent.path,
    app.path,
  ]);
  require(
    copy.exitCode == 0,
    'current actual Debug producer is copied for the same saved profile',
  );
  await File('${app.path}/Contents/Info.plist')
      .writeAsBytes(await original.readAsBytes());
  final sign = await Process.run('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    app.path,
  ]);
  require(
    sign.exitCode == 0,
    'restart copy is signed after exact private isolation metadata',
  );
  final executable = File('${app.path}/Contents/MacOS/DSH Workflow');
  final manifest = '${app.path}/Contents/Resources/maclauncher.json';
  final layout = EndpointLayout(directory: '${root.path}/manager');
  await Directory(layout.directory).create();
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': data.path,
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': '${root.path}/missing-runtime',
    'DSH_LAUNCHER_TEST_SOCKET': layout.socketPath,
    'DSH_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_PORT': '33080',
  };
  // Observe before reopening; outputs have distinct names from the earlier body.
  final windows = await DesktopWindowProbe.start(
    root,
    logName:
        '${session.uri.pathSegments.where((part) => part.isNotEmpty).last}-window-observations.jsonl',
  );
  final phases = <Map<String, Object?>>[];
  int? desktopPid, hostPid;
  Object? lease;
  final expectedBundle =
      '${root.path}/missing-runtime/desktop/DeepSeek Harness.app';
  final cyclePath = File.fromUri(
    Platform.script.resolve(
      '../../../.github/scripts/settings_startup_cycle.py',
    ),
  ).path;
  Map<String, Object?>? hostBaseline;
  Object? firstError;
  StackTrace? firstStack;
  Future<bool> owns(Map<String, Object?> value) async {
    final target = value['pid'];
    if (target is! int ||
        target <= 1 ||
        windows.current['ownershipKnown'] != true ||
        windows.current['pid'] is! int) {
      return false;
    }
    final result = await Process.run('/usr/bin/python3', [
      '-c',
      desktopKernelInspectionScript,
      cyclePath,
      root.path,
      '$target',
      'false',
    ]);
    if (result.exitCode != 0) return false;
    final identity = (jsonDecode(result.stdout.toString()) as Map)
        .cast<String, Object?>();
    final expectedNode = await File('${root.path}/missing-runtime/node')
        .resolveSymbolicLinks();
    final desktopExecutable = await File(
      '$expectedBundle/Contents/MacOS/DeepSeek Harness',
    ).resolveSymbolicLinks();
    final known =
        identity['lookupOk'] == true &&
        identity['pid'] == target &&
        {expectedNode, desktopExecutable}.contains(identity['executable']) &&
        identity['uid'] == identity['probeUid'] &&
        identity['parentUid'] == identity['uid'] &&
        identity['parentPid'] == windows.current['pid'] &&
        identity['startUnixSeconds'] is num &&
        (identity['query'] as Map?)?['exit'] == 0 &&
        value['lease'] is String &&
        (value['lease'] as String).isNotEmpty;
    final binding = <String, Object?>{
      'pid': target,
      'lease': value['lease'],
      for (final key in ['executable', 'uid', 'parentPid', 'startUnixSeconds'])
        key: identity[key],
    };
    await File('${session.path}/restart-host-binding.json')
        .writeAsString(jsonEncode({'known': known, 'binding': binding}));
    if (!known) return false;
    hostBaseline ??= binding;
    return binding.entries.every(
      (entry) => hostBaseline![entry.key] == entry.value,
    );
  }

  try {
    for (var phase = 1; phase <= 2; phase++) {
      final child = await Process.start(executable.path, [
        '--vm-service-port=0',
      ], environment: environment);
      Future<void> lifecycle(Map<String, Object?> facts) async {
        try {
          await File('${session.path}/restart-launcher-lifecycle.jsonl')
              .writeAsString(
                '${jsonEncode({'phase': phase, 'pid': child.pid, ...facts})}\n',
                mode: FileMode.append,
              );
        } catch (error) {
          stderr.writeln(
            'RESTART_CHILD_EVIDENCE_WARNING: ${error.runtimeType}',
          );
        }
      }

      await lifecycle({'event': 'started', 'executable': executable.path});
      final output = File('${session.path}/restart-$phase-app.log').openWrite();
      final uri = Completer<String>();
      final drained = <Completer<void>>[];
      final subscriptions = <StreamSubscription<String>>[];
      for (final stream in [child.stdout, child.stderr]) {
        final done = Completer<void>();
        drained.add(done);
        subscriptions.add(
          stream.transform(utf8.decoder).transform(const LineSplitter()).listen(
            (line) {
              output.writeln(line);
              final match = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
                  .firstMatch(line);
              if (match != null && !uri.isCompleted) {
                uri.complete(match.group(0)!);
              }
            },
            onDone: done.complete,
          ),
        );
      }
      VmService? vm;
      var exited = false;
      var exitStage = 'vm-uri-await';
      final exitRecorded = child.exitCode.then((code) async {
        exited = true;
        await lifecycle({
          'event': 'exited',
          'code': code,
          'stage': exitStage,
          'vmUriObserved': uri.isCompleted,
        });
      });
      var failed = false;
      try {
        final address = await uri.future.timeout(const Duration(seconds: 30));
        exitStage = 'scenario';
        vm = await vmServiceConnectUri(
          '${address.replaceFirst('http:', 'ws:')}ws',
        );
        final isolate = (await vm.getVM()).isolates!.single.id!;
        await waitFor(
          'restarted application extension',
          () async =>
              (await vm!.getIsolate(isolate)).extensionRPCs!
                  .contains('ext.dshlauncher.application'),
        );
        Future<Map<String, Object?>> state([
          Map<String, String>? params,
        ]) async {
          final response = await vm!.callServiceExtension(
            'ext.dshlauncher.application',
            isolateId: isolate,
            args: params ?? {},
          );
          final snapshot = response.json!.cast<String, Object?>();
          require(
            (snapshot['native'] as Map)['pid'] == child.pid,
            'restart snapshot belongs to this current owned Launcher',
          );
          return snapshot;
        }

        await waitFor(
          'restarted real management UI',
          () async => ((await state())['nodes'] as List).cast<Map>().any(
            (n) => n['label'].toString().contains('启动时隐藏窗口'),
          ),
        );
        final initial = await state();
        require(
          ((initial['nodes'] as List).cast<Map>().singleWhere(
                (n) => n['label'].toString().split('\n').first == '启动时隐藏窗口',
              ))['toggled'] ==
              true,
          'restarted Launcher reads the actual saved startup-hidden preference',
        );
        await runWebApplicationScenario(
          options: WebProbeOptions(
            '${root.path}/missing-runtime',
            'desktop',
            33080,
          ),
          root: root,
          layout: layout,
          manifestPath: manifest,
          port: 33080,
          state: state,
          applicationExit: child.exitCode,
          ownsHostReceipt: owns,
          startupFailure: (_) async => null,
          tap: (_) async => throw StateError(
            'restart scene uses existing bounded semantic control',
          ),
          capture: (_) async {},
          bindingsPath: '${session.path}/bindings.json',
          passwordPreloaded: true,
          settingsOwnedWebCleanup: true,
          beforeWebStart: (_, _) async {},
          onConnected: (actual) async {
            require(
              await owns(actual.backend),
              'restarted profile uses the exact physical private Host',
            );
            if (phase == 1) {
              require(
                windows.current['hidden'] == true &&
                    windows.current['onscreenWindowCount'] == 0,
                'saved preference hides the cold Desktop on normal Launcher restart',
              );
              desktopPid = windows.current['pid'] as int;
              hostPid = actual.backend['pid'] as int;
              lease = actual.backend['lease'];
              await actual.tap('打开桌面版');
              await waitFor(
                'explicit open after persisted hidden startup shows and focuses',
                () async =>
                    windows.current['hidden'] == false &&
                    (windows.current['onscreenWindowCount'] as int? ?? 0) > 0 &&
                    windows.current['active'] == true,
              );
            } else {
              require(
                windows.current['pid'] == desktopPid &&
                    windows.current['hidden'] == false &&
                    (windows.current['onscreenWindowCount'] as int? ?? 0) > 0 &&
                    actual.backend['pid'] == hostPid &&
                    actual.backend['lease'] == lease,
                'automatic restart preserves the existing visible Desktop and same Host lease despite saved hidden preference',
              );
              await actual.tap('隐藏窗口');
              await waitFor(
                'restart scene hides only the existing window',
                () async =>
                    windows.current['hidden'] == true &&
                    windows.current['onscreenWindowCount'] == 0,
              );
              await actual.tap('打开桌面版');
              await waitFor(
                'explicit open recovers that same running Desktop',
                () async =>
                    windows.current['pid'] == desktopPid &&
                    windows.current['hidden'] == false &&
                    windows.current['active'] == true &&
                    (windows.current['onscreenWindowCount'] as int? ?? 0) > 0,
              );
            }
            require(
              (await actual.webHealth())['instanceId'] == lease &&
                  (await actual.backendHealth())['instanceId'] == lease,
              'restart actions keep real Web and Host health',
            );
            phases.add({
              'phase': phase,
              'launcherPid': child.pid,
              'desktopPid': windows.current['pid'],
              'hostPid': actual.backend['pid'],
              'hostLease': actual.backend['lease'],
              'savedPreferenceRead': true,
            });
          },
        );
        exitStage = 'normal-quit';
        await state({'action': 'quit'});
        final code = await child.exitCode.timeout(const Duration(seconds: 10));
        require(
          code == 0,
          'restarted Launcher quits through original normal stage',
        );
        phases.last['normalLauncherExit'] = code;
      } catch (_) {
        failed = true;
        rethrow;
      } finally {
        await closeProbeResources([
          (
            'restart vm',
            () async {
              await vm?.dispose();
            },
          ),
          (
            'restart Launcher',
            () async {
              if (!exited) {
                exitStage = 'finally-cleanup';
                child.kill(ProcessSignal.sigterm);
                await child.exitCode;
              }
            },
          ),
          ('restart drain', () => Future.wait(drained.map((c) => c.future))),
          for (final subscription in subscriptions)
            ('restart output subscription', subscription.cancel),
          ('restart output log', output.close),
          (
            'restart exit receipt',
            () async {
              await exitRecorded;
            },
          ),
          (
            'restart output receipt',
            () => lifecycle({
              'event': 'output-complete',
              'log': 'restart-$phase-app.log',
            }),
          ),
        ], preserveFailure: failed);
      }
    }
    await File('${session.path}/desktop-window-restart-evidence.json')
        .writeAsString(
          jsonEncode({
            'sameProfile': data.path,
            'phases': phases,
            'startupPreferenceRestartVerified': true,
            'existingVisiblePreserved': true,
            'explicitRecoveryVerified': true,
          }),
        );
    stdout.writeln('DESKTOP SAVED PROFILE RESTART SCENARIO PASSED');
  } catch (error, stack) {
    firstError = error;
    firstStack = stack;
  } finally {
    try {
      await windows.close();
    } catch (error, stack) {
      firstError ??= error;
      firstStack ??= stack;
    }
    // Independent normal cleanup cannot replace the first functional failure.
    final cleanupLog = File('${session.path}/restart-independent-cleanup.log');
    try {
      if (windows.current['pid'] is! int ||
          windows.current['ownershipKnown'] != true) {
        throw StateError('Independent Desktop identity is unknown; no request');
      }
      desktopPid = windows.current['pid'] as int;
      final fresh = await Process.run('/usr/bin/python3', [
        '-c',
        desktopKernelInspectionScript,
        cyclePath,
        root.path,
        '$desktopPid',
        'false',
      ]);
      final identity = fresh.exitCode == 0
          ? jsonDecode(fresh.stdout.toString()) as Map
          : null;
      if (identity?['lookupOk'] != true ||
          identity?['pid'] != desktopPid ||
          identity?['uid'] != windows.current['uid'] ||
          identity?['uid'] != identity?['probeUid'] ||
          identity?['parentPid'] != windows.current['parentPid'] ||
          identity?['executable'] != windows.current['executable'] ||
          identity?['startUnixSeconds'] !=
              windows.current['kernelStartSeconds']) {
        throw StateError(
          'Independent Desktop kernel identity changed; no request',
        );
      }
      final cleanupRoot = await Directory('${session.path}/dsh-restart-cleanup')
          .create();
      await File('${cleanupRoot.path}/probe-process.json').writeAsString(
        jsonEncode({'startedAt': DateTime.now().toUtc().toIso8601String()}),
      );
      final helper = File.fromUri(
        Platform.script.resolve('owned_desktop_cleanup.swift'),
      ).path;
      final capture = await Process.run('/usr/bin/swift', [
        helper,
        cleanupRoot.path,
        'capture',
        expectedBundle,
        '$desktopPid',
      ]);
      await cleanupLog.writeAsString(
        'captureExit=${capture.exitCode}\n${capture.stdout}${capture.stderr}',
      );
      if (capture.exitCode != 0) {
        throw StateError('Independent Desktop capture refused; no request');
      }
      final cleanup = await Process.run('/usr/bin/swift', [
        helper,
        cleanupRoot.path,
        'terminate',
      ]);
      await cleanupLog.writeAsString(
        'terminateExit=${cleanup.exitCode}\n${cleanup.stdout}${cleanup.stderr}',
        mode: FileMode.append,
      );
      if (cleanup.exitCode != 0) {
        throw StateError('Independent Desktop normal cleanup failed');
      }
    } catch (error) {
      await cleanupLog.writeAsString(
        'unknown: ${error.runtimeType}\n',
        mode: FileMode.append,
      );
      stderr.writeln(
        'RESTART_INDEPENDENT_CLEANUP_WARNING: ${error.runtimeType}',
      );
    }
  }
  if (firstError != null) Error.throwWithStackTrace(firstError, firstStack!);
}

Future<void> superviseSdkColdWindow(List<String> arguments) async {
  final local = Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'];
  final ci = Platform.environment['GITHUB_ACTIONS'] == 'true';
  require(
    (ci && local == null) || (!ci && local != null),
    'external SDK cold scene uses a disposable runner or explicit private local context',
  );
  final requested = local ?? Platform.environment['RUNNER_TEMP']!;
  final base = await Directory(requested).resolveSymbolicLinks();
  require(base == requested, 'external SDK cold root input is physical');
  if (local != null) {
    final validation = await Process.run('/usr/bin/python3', [
      '-c',
      'import sys; sys.path.insert(0, sys.argv[1]); from settings_startup_cycle import observation_runner; print(observation_runner())',
      File.fromUri(
        Platform.script.resolve(
          '../../../.github/scripts/settings_startup_cycle.py',
        ),
      ).parent.path,
    ]);
    require(
      validation.exitCode == 0 && validation.stdout.toString().trim() == base,
      'external SDK cold local base is canonical, UID owned and mode 0700',
    );
  }
  final configuration = {
    'evidence':
        '${Platform.environment['EVIDENCE_DIR']!}/external-sdk-cold-supervision',
    'rootParent': base,
    'appRelativePath': 'candidate.app',
    'desktopSdkCold': true,
    'totalSeconds': 180,
    'cleanupReserveSeconds': 30,
    'termBeforeDeadlineSeconds': 15,
    'forceBeforeDeadlineSeconds': 5,
    'command': [
      Platform.resolvedExecutable,
      Platform.script.toFilePath(),
      ...arguments,
    ],
    'environmentOverrides': {'DSH_EXTERNAL_SDK_COLD_DRIVER': '1'},
    'requiredRoles': ['driver', 'app', 'desktop', 'host'],
    'cleanupRoles': ['host', 'desktop', 'app', 'driver'],
    'expectedExecutables': <String, String>{},
    'supervisorSource': outerSupervisorPython,
  };
  await Directory(configuration['evidence'] as String).create(recursive: true);
  await File('${configuration['evidence']}/actual-configuration.json')
      .writeAsString(jsonEncode(configuration));
  final outer = await Process.start('/usr/bin/python3', [
    '-c',
    outerSupervisorPython,
    jsonEncode(configuration),
  ]);
  await Future.wait([
    stdout.addStream(outer.stdout),
    stderr.addStream(outer.stderr),
  ]);
  exitCode = await outer.exitCode;
}

/// The cold-scene failure boundary, also when its VM or evidence path has failed.
Future<Never> finishSdkColdFocusFailure({
  required Directory root,
  required ApplicationState state,
  required Map backend,
  required Map baseline,
  required Map cold,
  required Map physicalWindow,
  required Object? freshOsInput,
  required Object firstError,
  required StackTrace firstStack,
}) async {
  Map? native;
  await closeProbeResources([
    (
      'cold native diagnostics',
      () async {
        native = (await state())['native'] as Map;
      },
    ),
    (
      'cold failure evidence',
      () => File('${root.path}/desktop-window-evidence.json').writeAsString(
        jsonEncode({
          'sdkColdTrigger': true,
          'externalBaseline': baseline,
          'nativeStateAvailable': native != null,
          'nativeColdCapture': native?['coldCallerObservation'] ?? cold,
          'nativeForeground': native?['foregroundObservation'],
          'physicalWindow': physicalWindow,
          'hostPid': backend['pid'],
          'hostLease': backend['lease'],
          'freshOsInput': freshOsInput,
          'externalFocusVerified': false,
          'failure': '$firstError',
        }),
      ),
    ),
  ], preserveFailure: true);
  Error.throwWithStackTrace(firstError, firstStack);
}

bool sdkColdEpochUnchanged(Map baseline, Map cold, Object? currentInputCounts) {
  final expected = baseline['inputCounts'];
  bool matches(Object? value) =>
      expected is List &&
      expected.length == 4 &&
      expected.every((item) => item is int && item >= 0) &&
      value is List &&
      value.length == 4 &&
      value.every((item) => item is int && item >= 0) &&
      jsonEncode(value) == jsonEncode(expected);
  if (!matches(currentInputCounts) || !matches(cold['inputCountsBefore'])) {
    return false;
  }
  final recoveryObserved = [
    'hiddenRecoveryUptime',
    'inputCountsAtRecovery',
    'inputUnchangedAtRecovery',
  ].any(cold.containsKey);
  return !recoveryObserved ||
      (cold['hiddenRecoveryUptime'] is num &&
          cold['inputUnchangedAtRecovery'] == true &&
          matches(cold['inputCountsAtRecovery']));
}
