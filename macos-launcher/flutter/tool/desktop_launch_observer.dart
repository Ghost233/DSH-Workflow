import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

String sanitize(String value) => value
    .replaceAll(RegExp(r'\x1b\[[0-?]*[ -/]*[@-~]'), '')
    .replaceAll(RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/'), '<REDACTED_VM_URI>')
    .replaceAll(
      RegExp(r'gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+'),
      '<REDACTED>',
    )
    .replaceAll(RegExp(r'token=[^&\s]+'), 'token=<REDACTED>');

Object? sanitizeJson(Object? value) {
  if (value is Map) {
    return value.map(
      (key, child) => MapEntry(
        key.toString(),
        RegExp(
              r'password|secret|token|authorization|credential|cookie|api[_-]?key',
              caseSensitive: false,
            ).hasMatch(key.toString())
            ? '<REDACTED>'
            : sanitizeJson(child),
      ),
    );
  }
  if (value is List) return value.map(sanitizeJson).toList();
  return value is String ? sanitize(value) : value;
}

Future<void> main(List<String> args) async {
  if (args.length != 3 ||
      !Platform.isMacOS ||
      Platform.environment['GITHUB_ACTIONS'] != 'true') {
    throw ArgumentError(
      'Requires clean GitHub macOS CI; no application launched',
    );
  }
  final runner = await Directory(Platform.environment['RUNNER_TEMP']!)
      .resolveSymbolicLinks();
  final output = Directory(args[2]);
  await output.create(recursive: true);
  if (!(await output.resolveSymbolicLinks()).startsWith('$runner/')) {
    throw ArgumentError('Evidence must remain under RUNNER_TEMP');
  }
  var failures = 0;
  final results = <Map<String, Object?>>[];
  for (var iteration = 1; iteration <= 3; iteration++) {
    final evidence = Directory('${output.path}/launcher-$iteration');
    await evidence.create();
    final clock = Stopwatch()..start();
    final probe = await Process.start(Platform.resolvedExecutable, [
      'run',
      'tool/application_probe.dart',
      args[0],
      '--web-runtime',
      args[1],
      '--web-backend',
      'desktop',
      '--web-port',
      '33080',
    ]);
    String? rootPath;
    final log = File('${evidence.path}/application.log').openWrite();
    void line(String value) {
      log.writeln(sanitize(value));
      if (value.startsWith('ISOLATED_ROOT=')) rootPath = value.substring(14);
    }

    final readers = [
      probe.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .forEach(line),
      probe.stderr
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .forEach(line),
    ];
    int? commandExit;
    unawaited(probe.exitCode.then((value) => commandExit = value));
    VmService? vm;
    String? isolate;
    String? exactError;
    int? signalMs;
    int? launcherPid;
    int? desktopPid;
    String? observerError;
    var readOnlyFactsCollected = false;
    while (commandExit == null) {
      try {
        final path = rootPath;
        if (path != null) {
          final root = Directory(path);
          if (root.parent.path != runner ||
              !root.uri.pathSegments.any((s) => s.startsWith('dsh-t01-'))) {
            throw StateError('Unexpected isolated application root');
          }
          if (vm == null) {
            final file = File('$path/app.log');
            if (await file.exists()) {
              final uri = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
                  .firstMatch(await file.readAsString())
                  ?.group(0);
              if (uri != null) {
                vm = await vmServiceConnectUri(
                  '${uri.replaceFirst('http:', 'ws:')}ws',
                );
                isolate = (await vm.getVM()).isolates!.single.id;
              }
            }
          }
          if (vm != null && isolate != null) {
            final state = (await vm.callServiceExtension(
              'ext.dshlauncher.application',
              isolateId: isolate,
              args: {'action': 'observe'},
            )).json!;
            final native = state['native'] as Map? ?? {};
            launcherPid = native['pid'] as int?;
            desktopPid = native['openedDesktopPid'] as int?;
            if (!readOnlyFactsCollected && launcherPid != null) {
              final ledger = jsonDecode(
                await File('$path/probe-process.json').readAsString(),
              ) as Map;
              if (ledger['pid'] != launcherPid) {
                throw StateError('Candidate PID differs from probe ledger');
              }
              final app = '$path/candidate.app';
              for (final entry in <String, List<String>>{
                'candidate-signature': [
                  '/usr/bin/codesign',
                  '-d',
                  '--verbose=4',
                  app,
                ],
                'candidate-signature-verify': [
                  '/usr/bin/codesign',
                  '--verify',
                  '--deep',
                  '--strict',
                  '--verbose=4',
                  app,
                ],
                'candidate-xattrs': ['/usr/bin/xattr', '-lr', app],
                'candidate-payload': [
                  '/usr/bin/shasum',
                  '-a',
                  '256',
                  '$app/Contents/MacOS/DSH Workflow',
                  '$app/Contents/MacOS/DSH Workflow.debug.dylib',
                  '$app/Contents/Info.plist',
                ],
              }.entries) {
                final fact = await Process.run(
                  entry.value.first,
                  entry.value.skip(1).toList(),
                );
                await File('${evidence.path}/${entry.key}.log').writeAsString(
                  sanitize(fact.stdout.toString() + fact.stderr.toString()),
                );
                await File('${evidence.path}/${entry.key}.exit')
                    .writeAsString('${fact.exitCode}\n');
              }
              readOnlyFactsCollected = true;
            }
            final nodes = state['nodes'] as List? ?? [];
            for (final node in nodes.cast<Map>()) {
              final value = node['value']?.toString() ?? '';
              if (exactError == null &&
                  value.contains('PlatformException(open-failed')) {
                exactError = sanitize(value);
                signalMs = clock.elapsedMilliseconds;
                final signal = {
                  'iteration': iteration,
                  'boundary': 'actual-Launcher-read-only-observer',
                  'signal': 'launcher-native-open-failed',
                  'timeToSignalMs': signalMs,
                  'actualPlatformException': exactError,
                  'launcherPid': launcherPid,
                  'targetPid': desktopPid,
                };
                await File('${evidence.path}/launch-failure.json')
                    .writeAsString(jsonEncode(signal));
                stdout.writeln(jsonEncode(signal));
              }
            }
          }
        }
      } catch (error) {
        // Extension registration and normal probe teardown can race observations.
        observerError = error.runtimeType.toString();
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await vm?.dispose();
    await Future.wait(readers);
    await log.close();
    await File('${evidence.path}/application.exit')
        .writeAsString('$commandExit\n');
    final path = rootPath;
    final cleanup = <String, Object?>{};
    if (path != null &&
        Directory(path).parent.path == runner &&
        Directory(path).uri.pathSegments.any((s) => s.startsWith('dsh-t01-'))) {
      const observedFiles = {
        'probe-process.json',
        'probe-timeline.jsonl',
        'owned-desktop-process.json',
        'owned-desktop-cleanup.log',
        'web-final.json',
        'web-evidence.json',
        'initial-web-ui.json',
        'app.log',
      };
      await for (final entity in Directory(path).list()) {
        if (entity is File &&
            observedFiles.contains(entity.uri.pathSegments.last)) {
          final raw = await entity.readAsString();
          final content = entity.path.endsWith('.json')
              ? jsonEncode(sanitizeJson(jsonDecode(raw)))
              : sanitize(raw);
          await File('${evidence.path}/${entity.uri.pathSegments.last}')
              .writeAsString(content);
        }
      }
      cleanup['receiptPresentAfterCleanup'] = await File(
        '$path/data/global/.dsh-workflow/desktop/desktop-host.json',
      ).exists();
      for (final entry in {
        'launcher': launcherPid,
        'desktop': desktopPid,
      }.entries) {
        final pid = entry.value;
        if (pid != null && pid > 1) {
          final check = await Process.run('/bin/kill', ['-0', '$pid']);
          cleanup['${entry.key}PidStillExists'] = check.exitCode == 0;
        }
      }
      final listener = await Process.run('/usr/sbin/lsof', [
        '-nP',
        '-iTCP:33080',
        '-sTCP:LISTEN',
      ]);
      cleanup['listenerObservationExit'] = listener.exitCode;
      cleanup['listenerObservation'] = sanitize(listener.stdout.toString());
    }
    final result = <String, Object?>{
      'iteration': iteration,
      'boundary': 'actual-Launcher-read-only-observer',
      'commandExit': commandExit,
      'openFailureObserved': exactError != null,
      'preciseCorruptFailureObserved':
          exactError?.contains('could not be launched because it is corrupt') ??
          false,
      'cleanup': cleanup,
      'timeToSignalMs': signalMs,
      'iterationWallMs': clock.elapsedMilliseconds,
      'launcherPid': launcherPid,
      'targetPid': desktopPid,
      'lastObserverErrorType': observerError,
      'ownedCandidateReadOnlyFactsCollected': readOnlyFactsCollected,
      'nativeNSErrorAvailability': 'Platform bridge exposes only code/message; direct probe captures NSError',
    };
    results.add(result);
    await File('${evidence.path}/result.json')
        .writeAsString(jsonEncode(result));
    stdout.writeln(jsonEncode(result));
    if (commandExit != 0) failures++;
    if (cleanup['receiptPresentAfterCleanup'] == true ||
        cleanup['launcherPidStillExists'] == true ||
        cleanup['desktopPidStillExists'] == true ||
        cleanup['listenerObservationExit'] == 0) {
      failures++;
      break; // Preserve failed cleanup; never kill or start a new instance over it.
    }
  }
  await File('${output.path}/launcher-summary.json').writeAsString(
    jsonEncode({
      'requestedIterations': 3,
      'completedIterations': results.length,
      'iterations': results,
      'failedIterations': failures,
      'preciseCorruptFailureIterations': results
          .where((r) => r['preciseCorruptFailureObserved'] == true)
          .length,
      'phase1Complete': false,
      'note': 'Actual CI evidence must establish reproduction rate and per-iteration time before minimization',
    }),
  );
  exitCode = failures == 0 ? 0 : 1;
}
