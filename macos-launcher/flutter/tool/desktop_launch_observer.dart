import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

String sanitize(String value) => value
    .replaceAll(RegExp(r'\x1b\[[0-?]*[ -/]*[@-~]'), '')
    .replaceAll(
      RegExp(r'(?:https?|wss?)://127\.0\.0\.1:\d+/[^\s]+/'),
      '<REDACTED_VM_URI>',
    )
    .replaceAll(
      RegExp(r'gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+'),
      '<REDACTED>',
    )
    .replaceAll(RegExp(r'token=[^&\s]+'), 'token=<REDACTED>')
    .replaceAllMapped(
      RegExp(r'(https?://[^\s?#]+)\?[^\s]+'),
      (match) => '${match[1]}?<REDACTED_QUERY>',
    )
    .replaceAllMapped(
      RegExp(
        r'(authorization|password|secret|credential|api[_-]?key|token)\s*[:=]\s*\S+',
        caseSensitive: false,
      ),
      (match) => '${match[1]}=<REDACTED>',
    );

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

bool processProvedGone(Object? lookup) {
  if (lookup is! Map ||
      lookup['pid'] is! int ||
      (lookup['pid'] as int) <= 1 ||
      lookup['exit'] != 1 ||
      lookup['stdout'] != '' ||
      lookup['stderr'] is! String) {
    return false;
  }
  final stderr = (lookup['stderr'] as String).trim();
  return !stderr.contains('\n') &&
      stderr.contains('${lookup['pid']}') &&
      stderr.endsWith('No such process');
}

int cleanupGateExit(Map<String, Object?> cleanup) {
  final receipt = cleanup['receiptLookup'];
  final listener = cleanup['listenerLookup'];
  final complete =
      cleanup['root'] is String &&
      (cleanup['root'] as String).isNotEmpty &&
      cleanup['rootOwnershipKnown'] == true &&
      cleanup['launcherOwnershipKnown'] == true &&
      cleanup['desktopOwnershipKnown'] == true &&
      cleanup['hostOwnershipKnown'] == true &&
      processProvedGone(cleanup['launcherLookup']) &&
      processProvedGone(cleanup['desktopLookup']) &&
      processProvedGone(cleanup['hostLookup']) &&
      receipt is Map &&
      receipt['state'] == 'absent' &&
      receipt['osErrorCode'] == 2 &&
      listener is Map &&
      listener['exit'] == 1 &&
      listener['stdout'] == '' &&
      listener['stderr'] == '';
  return complete ? 0 : 2;
}

const hostInspectionScript = r'''
import ctypes, datetime, json, os, subprocess, sys
pid = int(sys.argv[1])
facts = {'pid': pid, 'lookupOk': False}
try:
    proc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    proc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    proc.proc_pidpath.restype = ctypes.c_int
    path = ctypes.create_string_buffer(4096)
    length = proc.proc_pidpath(pid, path, len(path))
    facts['executableLookup'] = {'bytes': length, 'errno': ctypes.get_errno() if length <= 0 else 0}
    facts['executable'] = os.path.realpath(path.value.decode()) if length > 0 else None
    commands = {}
    for name, column in [('parent', 'ppid='), ('start', 'lstart=')]:
        command = ['/bin/ps', '-p', str(pid), '-o', column]
        result = subprocess.run(command, capture_output=True, text=True)
        commands[name] = {'command': command, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    facts['queries'] = commands
    if length > 0 and all(c['exit'] == 0 and not c['stderr'] for c in commands.values()):
        facts['parentPid'] = int(commands['parent']['stdout'].strip())
        start = datetime.datetime.strptime(commands['start']['stdout'].strip(), '%a %b %d %H:%M:%S %Y')
        facts['startUnixSeconds'] = start.replace(tzinfo=datetime.timezone.utc).timestamp()
        facts['startPrecisionSeconds'] = 1
        facts['lookupOk'] = True
except Exception as error:
    facts['lookupError'] = str(error)
print(json.dumps(facts))
''';

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
  var cleanupStopped = false;
  final results = <Map<String, Object?>>[];
  for (var iteration = 1; iteration <= 3; iteration++) {
    final evidence = Directory('${output.path}/launcher-$iteration');
    await evidence.create();
    final iterationStartedAt = DateTime.now().toUtc();
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
    var successfulReads = 0;
    var legacyContractCaptured = false;
    var legacyContractAttempted = false;
    Map<String, Object?>? activeRpcRequest;
    var firstReadCaptured = false;
    var firstRpcErrorCaptured = false;
    var hostCaptured = false;
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
                activeRpcRequest = {'method': 'getVM'};
                isolate = (await vm.getVM()).isolates!.single.id;
              }
            }
          }
          if (vm != null && isolate != null) {
            activeRpcRequest = {'method': 'getIsolate', 'isolateId': isolate};
            if (iteration == 1 &&
                !legacyContractAttempted &&
                (await vm.getIsolate(isolate)).extensionRPCs!
                    .contains('ext.dshlauncher.application')) {
              final contract = <String, Object?>{
                'label': 'readonly-contract-negative',
                'request': {
                  'method': 'ext.dshlauncher.application',
                  'isolateId': isolate,
                  'args': {'action': 'observe'},
                },
                'businessCorruptReproduction': false,
              };
              legacyContractAttempted = true;
              activeRpcRequest = Map<String, Object?>.from(
                contract['request'] as Map,
              );
              try {
                final response = await vm.callServiceExtension(
                  'ext.dshlauncher.application',
                  isolateId: isolate,
                  args: {'action': 'observe'},
                );
                contract['response'] = response.json;
                contract['legacyRequestRejected'] = false;
              } on RPCError catch (error) {
                contract['response'] = {
                  'code': error.code,
                  'message': error.message,
                  'data': error.data,
                };
                contract['legacyRequestRejected'] = true;
              } catch (error) {
                contract['response'] = {
                  'errorType': error.runtimeType.toString(),
                  'error': error.toString(),
                };
                contract['legacyRequestRejected'] = null;
              }
              await File('${evidence.path}/observer-contract-negative.json')
                  .writeAsString(jsonEncode(sanitizeJson(contract)));
              legacyContractCaptured = true;
            }
            activeRpcRequest = {
              'method': 'ext.dshlauncher.application',
              'isolateId': isolate,
              'args': null,
            };
            final state = (await vm.callServiceExtension(
              'ext.dshlauncher.application',
              isolateId: isolate,
            )).json!;
            successfulReads++;
            if (!firstReadCaptured) {
              await File('${evidence.path}/observer-first-read.json')
                  .writeAsString(
                    jsonEncode(
                      sanitizeJson({
                        'label': 'readonly-contract-positive',
                        'request': {
                          'method': 'ext.dshlauncher.application',
                          'isolateId': isolate,
                          'args': null,
                        },
                        'response': {
                          'native': state['native'],
                          'nodeCount': (state['nodes'] as List?)?.length,
                          'framesEnabled': state['framesEnabled'],
                          'lifecycleState': state['lifecycleState'],
                        },
                        'businessCorruptReproduction': false,
                      }),
                    ),
                  );
              firstReadCaptured = true;
            }
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
            if (!hostCaptured && desktopPid != null) {
              final receipt = File(
                '$path/data/global/.dsh-workflow/desktop/desktop-host.json',
              );
              final desktopLedger = File('$path/owned-desktop-process.json');
              if (await receipt.exists() &&
                  await desktopLedger.exists() &&
                  (await receipt.resolveSymbolicLinks()).startsWith('$path/')) {
                final value = jsonDecode(await receipt.readAsString()) as Map;
                final desktop =
                    jsonDecode(await desktopLedger.readAsString()) as Map;
                final hostPid = value['pid'];
                if (hostPid is int &&
                    hostPid > 1 &&
                    value['lease'] is String &&
                    desktop['pid'] == desktopPid &&
                    desktop['launchDateUnix'] is num) {
                  final query = await Process.run(
                    '/usr/bin/python3',
                    ['-c', hostInspectionScript, '$hostPid'],
                    environment: {'LC_ALL': 'C', 'TZ': 'UTC'},
                  );
                  await File(
                    '${evidence.path}/host-inspection.log',
                  ).writeAsString(
                    sanitize(query.stdout.toString() + query.stderr.toString()),
                  );
                  await File('${evidence.path}/host-inspection.exit')
                      .writeAsString('${query.exitCode}\n');
                  if (query.exitCode == 0) {
                    final facts = jsonDecode(query.stdout.toString()) as Map;
                    final allowed = {
                      await File('${args[1]}/node').resolveSymbolicLinks(),
                      await File(
                        '${args[1]}/desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
                      ).resolveSymbolicLinks(),
                    };
                    if (facts['lookupOk'] == true &&
                        facts['pid'] == hostPid &&
                        facts['parentPid'] == desktopPid &&
                        allowed.contains(facts['executable']) &&
                        facts['startUnixSeconds'] is num &&
                        (facts['startUnixSeconds'] as num) >=
                            (desktop['launchDateUnix'] as num) - 1) {
                      await File('${evidence.path}/host-process.json')
                          .writeAsString(
                            jsonEncode(
                              sanitizeJson({
                                'root': path,
                                'pid': hostPid,
                                'lease': value['lease'],
                                'desktopPid': desktopPid,
                                'probeStartedAt': jsonDecode(
                                  await File('$path/probe-process.json')
                                      .readAsString(),
                                )['startedAt'],
                                'inspection': facts,
                              }),
                            ),
                          );
                      hostCaptured = true;
                    }
                  }
                }
              }
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
        if (error is RPCError && !firstRpcErrorCaptured) {
          await File('${evidence.path}/observer-first-rpc-error.json')
              .writeAsString(
                jsonEncode(
                  sanitizeJson({
                    'request': activeRpcRequest,
                    'response': {
                      'code': error.code,
                      'message': error.message,
                      'data': error.data,
                    },
                    'businessCorruptReproduction': false,
                  }),
                ),
              );
          firstRpcErrorCaptured = true;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await vm?.dispose();
    await Future.wait(readers);
    await log.close();
    await File('${evidence.path}/application.exit')
        .writeAsString('$commandExit\n');
    final path = rootPath;
    final cleanup = <String, Object?>{
      'rootOwnershipKnown': false,
      'launcherOwnershipKnown': false,
      'desktopOwnershipKnown': false,
      'hostOwnershipKnown': false,
    };
    try {
      if (path == null) throw StateError('Isolated root was not observed');
      final root = await Directory(path).resolveSymbolicLinks();
      if (Directory(root).parent.path != runner ||
          !Directory(root).uri.pathSegments
              .any((s) => s.startsWith('dsh-t01-'))) {
        throw StateError('Isolated root is not owned by this runner');
      }
      cleanup['rootOwnershipKnown'] = true;
      cleanup['root'] = root;
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
      await for (final entity in Directory(root).list()) {
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
      final ledger = jsonDecode(
        await File('$root/probe-process.json').readAsString(),
      ) as Map;
      final started = DateTime.tryParse(ledger['startedAt']?.toString() ?? '');
      final pid = ledger['pid'];
      final executable = ledger['executable'];
      if (pid is! int ||
          pid <= 1 ||
          started == null ||
          started.isBefore(
            iterationStartedAt.subtract(const Duration(seconds: 5)),
          ) ||
          started.isAfter(
            DateTime.now().toUtc().add(const Duration(seconds: 1)),
          ) ||
          executable is! String ||
          await File(executable).resolveSymbolicLinks() !=
              '$root/candidate.app/Contents/MacOS/DSH Workflow' ||
          (launcherPid != null && launcherPid != pid)) {
        throw StateError(
          'Launcher ownership ledger is incomplete or mismatched',
        );
      }
      launcherPid = pid;
      cleanup['launcherOwnershipKnown'] = true;
      final desktopFile = File('$root/owned-desktop-process.json');
      if (await desktopFile.exists()) {
        final desktop = jsonDecode(await desktopFile.readAsString()) as Map;
        final bundle = await Directory(
          '$root/missing-runtime/desktop/DeepSeek Harness.app',
        ).resolveSymbolicLinks();
        final expected = await Directory(
          '${args[1]}/desktop/DeepSeek Harness.app',
        ).resolveSymbolicLinks();
        final launched = desktop['launchDateUnix'];
        final desktopLedgerPid = desktop['pid'];
        final desktopExecutable = desktop['executablePath'];
        if (bundle == expected &&
            bundle.startsWith('$runner/') &&
            desktop['bundlePath'] == bundle &&
            desktopExecutable is String &&
            desktopExecutable.startsWith('$bundle/Contents/MacOS/') &&
            await File(desktopExecutable).resolveSymbolicLinks() ==
                desktopExecutable &&
            desktopLedgerPid is int &&
            desktopLedgerPid > 1 &&
            (desktopPid == null || desktopPid == desktopLedgerPid) &&
            desktop['probeStartedAt'] == ledger['startedAt'] &&
            launched is num &&
            launched.isFinite &&
            launched * 1000 >= started.millisecondsSinceEpoch - 5000 &&
            launched * 1000 <=
                DateTime.now().toUtc().millisecondsSinceEpoch + 1000) {
          desktopPid = desktopLedgerPid;
          cleanup['desktopOwnershipKnown'] = true;
        }
      }
      final hostFile = File('${evidence.path}/host-process.json');
      int? hostPid;
      if (await hostFile.exists() && cleanup['desktopOwnershipKnown'] == true) {
        final host = jsonDecode(await hostFile.readAsString()) as Map;
        final inspection = host['inspection'] as Map?;
        final hostWeb = jsonDecode(
          await File('$root/web-evidence.json').readAsString(),
        ) as Map;
        if (host['root'] == root &&
            host['probeStartedAt'] == ledger['startedAt'] &&
            host['pid'] is int &&
            (host['pid'] as int) > 1 &&
            host['desktopPid'] == desktopPid &&
            hostWeb['hostPid'] == host['pid'] &&
            hostWeb['hostLease'] == host['lease'] &&
            inspection?['lookupOk'] == true &&
            inspection?['parentPid'] == desktopPid) {
          hostPid = host['pid'] as int;
          cleanup['hostOwnershipKnown'] = true;
          cleanup['hostIdentity'] = host;
        }
      }
      // An open-failed message with no Desktop ledger is not proof of native absence.
      cleanup['desktopAbsentWithoutPidProved'] = false;
      for (final entry in {
        'launcher': launcherPid,
        'desktop': desktopPid,
        'host': hostPid,
      }.entries) {
        if (cleanup['${entry.key}OwnershipKnown'] != true) continue;
        final check = await Process.run(
          '/bin/kill',
          ['-0', '${entry.value}'],
          environment: {'LC_ALL': 'C'},
        );
        final lookup = <String, Object?>{
          'pid': entry.value,
          'exit': check.exitCode,
          'stdout': sanitize(check.stdout.toString()),
          'stderr': sanitize(check.stderr.toString()),
        };
        lookup['state'] = check.exitCode == 0
            ? 'exists'
            : processProvedGone(lookup)
            ? 'gone-ESRCH'
            : 'unknown';
        cleanup['${entry.key}Lookup'] = lookup;
      }
      try {
        final receipt = await File(
          '$root/data/global/.dsh-workflow/desktop/desktop-host.json',
        ).open();
        await receipt.close();
        cleanup['receiptLookup'] = {'state': 'present'};
      } on FileSystemException catch (error) {
        cleanup['receiptLookup'] = {
          'state': error.osError?.errorCode == 2 ? 'absent' : 'unknown',
          'osErrorCode': error.osError?.errorCode,
          'error': sanitize(error.toString()),
        };
      }
      final listener = await Process.run(
        '/usr/sbin/lsof',
        ['-nP', '-iTCP:33080', '-sTCP:LISTEN'],
        environment: {'LC_ALL': 'C'},
      );
      cleanup['listenerLookup'] = {
        'exit': listener.exitCode,
        'stdout': sanitize(listener.stdout.toString()),
        'stderr': sanitize(listener.stderr.toString()),
        'state': listener.exitCode == 0
            ? 'listener-present'
            : listener.exitCode == 1 &&
                  listener.stdout.toString().isEmpty &&
                  listener.stderr.toString().isEmpty
            ? 'no-listener'
            : 'unknown',
      };
    } catch (error) {
      cleanup['collectionErrorType'] = error.runtimeType.toString();
      cleanup['collectionError'] = sanitize(error.toString());
    }
    cleanup['ownershipKnown'] =
        cleanup['rootOwnershipKnown'] == true &&
        cleanup['launcherOwnershipKnown'] == true &&
        cleanup['desktopOwnershipKnown'] == true &&
        cleanup['hostOwnershipKnown'] == true;
    final cleanupExit = cleanupGateExit(cleanup);
    cleanup['cleanupComplete'] = cleanupExit == 0;
    cleanup['gateExit'] = cleanupExit;
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
      'successfulReadOnlyRpcCount': successfulReads,
      'liveHostIdentityCaptured': hostCaptured,
      'legacyContractNegativeCaptured': legacyContractCaptured,
      'legacyContractNegativeAttempted': legacyContractAttempted,
      'firstReadOnlyResponseCaptured': firstReadCaptured,
      'nativeNSErrorAvailability': 'Platform bridge exposes only code/message; direct probe captures NSError',
    };
    results.add(result);
    await File('${evidence.path}/result.json')
        .writeAsString(jsonEncode(result));
    stdout.writeln(jsonEncode(result));
    if (commandExit != 0) failures++;
    if (cleanupExit == 2) {
      cleanupStopped = true;
      break; // Unknown ownership or cleanup always blocks the next actual launch.
    }
  }
  await File('${output.path}/launcher-summary.json').writeAsString(
    jsonEncode({
      'requestedIterations': 3,
      'completedIterations': results.length,
      'iterations': results,
      'failedIterations': failures,
      'stoppedForIncompleteCleanup': cleanupStopped,
      'preciseCorruptFailureIterations': results
          .where((r) => r['preciseCorruptFailureObserved'] == true)
          .length,
      'phase1Complete': false,
      'note': 'Actual CI evidence must establish reproduction rate and per-iteration time before minimization',
    }),
  );
  exitCode = cleanupStopped
      ? 2
      : failures == 0
      ? 0
      : 1;
}
