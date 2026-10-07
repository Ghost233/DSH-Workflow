import 'dart:async';
import 'dart:convert';
import 'dart:io';

Map<String, Object?> publicProbePhase(Map<String, Object?> value) => {
  for (final key in const [
    'at',
    'elapsedMs',
    'event',
    'service',
    'method',
    'action',
    'mode',
    'pid',
    'code',
    'present',
    'permissionMode',
    'textUtf8Bytes',
    'requestElapsedMs',
    'errorType',
    'expectedPid',
    'lookupFound',
    'accepted',
    'hasTerminated',
    'predicateGone',
    'rawExit',
  ])
    if (value.containsKey(key)) key: value[key],
};

Map<String, Object?> desktopQuitFacts(Object? value) {
  final facts = value is Map ? value : const {};
  return {
    'expectedPid': facts['expectedPid'] is int ? facts['expectedPid'] : null,
    for (final key in ['lookupFound', 'accepted', 'hasTerminated'])
      key: facts[key] is bool ? facts[key] : null,
  };
}

String safeInspectorOutput(Object? value) {
  var text = value?.toString() ?? '';
  text = text.replaceAll(RegExp(r'\x1b\[[0-?]*[ -/]*[@-~]'), '');
  final sensitive = RegExp(
    r"""["']?(?:authorization|proxy-authorization|password|secret|credential|cookie|set-cookie|auth|(?:(?:access|auth)[_-]?)?token|api[_-]?key)["']?\s*[:=]""",
    caseSensitive: false,
  ).firstMatch(text);
  if (sensitive != null) {
    text = '${text.substring(0, sensitive.start)}<REDACTED>';
  }
  text = text
      .replaceAll(
        RegExp(r'gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+'),
        '<REDACTED>',
      )
      .replaceAll(
        RegExp(
          r'(?:https?|wss?)://(?:127\.0\.0\.1|localhost|\[::1\]):\d+/[^\s]+',
        ),
        '<REDACTED_VM_URI>',
      );
  final output = StringBuffer();
  var bytes = 0;
  for (final rune in text.runes) {
    final character = String.fromCharCode(rune);
    final size = utf8.encode(character).length;
    if (bytes + size > 16384) break;
    output.write(character);
    bytes += size;
  }
  return output.toString();
}

Future<void> preserveHostInspectionFailure(
  Directory root,
  int pid,
  String script,
  ProcessResult result,
) async {
  final runnerPath = Platform.environment['RUNNER_TEMP'];
  if (Platform.environment['GITHUB_ACTIONS'] != 'true' || runnerPath == null) {
    throw StateError('Lower observation requires clean CI root');
  }
  final runner = await Directory(runnerPath).resolveSymbolicLinks();
  final actual = await root.resolveSymbolicLinks();
  if (root.absolute.path != actual ||
      Directory(actual).parent.path != runner ||
      !root.uri.pathSegments
          .where((part) => part.isNotEmpty)
          .last
          .startsWith('dsh-t05-')) {
    throw StateError('Unowned lower observation root');
  }
  final target = File('$actual/host-inspection-results.jsonl');
  if (await Link(target.path).exists()) {
    throw StateError('Symlink lower observation');
  }
  final stdoutText = result.stdout.toString();
  final stderrText = result.stderr.toString();
  final value = {
    'schema': 1,
    'state': 'unknown',
    'root': actual,
    'pid': pid,
    'interpreter': '/usr/bin/python3',
    'script': script,
    'operation': '--capture-host',
    'exit': result.exitCode,
    'stdout': safeInspectorOutput(stdoutText),
    'stderr': safeInspectorOutput(stderrText),
    'outputByteCap': 16384,
    'stdoutTruncated': utf8.encode(stdoutText).length > 16384,
    'stderrTruncated': utf8.encode(stderrText).length > 16384,
  };
  await target.writeAsString(
    '${jsonEncode(value)}\n',
    mode: FileMode.append,
    flush: true,
  );
}

const desktopRequestIdentityScript = r'''
import importlib.util, json, os, sys
from pathlib import Path
if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise ValueError('Desktop request identity requires clean CI')
source, root_name, mode, driver_pid, driver_executable = sys.argv[1:]
spec = importlib.util.spec_from_file_location('settings_startup_cycle', source)
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)
runner = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
root = cycle.validate_root(root_name, runner)
if root.parent != runner or not root.name.startswith('dsh-t05-'):
    raise ValueError('Unowned settings Desktop request root')
probe_file = root / 'probe-process.json'
probe = cycle.parse_json(probe_file.read_text())
driver_pid = int(driver_pid)
expected_app = Path(probe['executable']).resolve(strict=True)
if expected_app.parent.parent.parent != root / 'candidate.app':
    raise ValueError('Launcher executable is outside the owned candidate')
def identity(pid, executable):
    allowed = {str(executable)}
    # Dart can report its SDK launcher while libproc observes the actual dartvm.
    sibling = executable.with_name('dartvm')
    if pid == driver_pid and executable.name == 'dart' and sibling.is_file():
        allowed.add(str(sibling.resolve(strict=True)))
    value = cycle.inspect_host(pid)
    if (value.get('lookupOk') is not True or value.get('pid') != pid
        or value.get('executable') not in allowed or value.get('uid') != os.getuid()
        or value.get('query', {}).get('exit') != 0 or not isinstance(value.get('startUnixSeconds'), (int, float))):
        raise ValueError('Live process identity is unknown')
    return {key:value[key] for key in ['pid', 'executable', 'parentPid', 'startUnixSeconds', 'uid']}
launcher = identity(probe['pid'], expected_app)
driver = identity(driver_pid, Path(driver_executable).resolve(strict=True))
if launcher['parentPid'] != driver_pid:
    raise ValueError('Launcher parent differs from the live Dart driver')
if mode == 'prepare':
    started = cycle.datetime.datetime.fromisoformat(probe['startedAt'].replace('Z', '+00:00')).timestamp()
    if launcher['startUnixSeconds'] < started - 5:
        raise ValueError('Launcher predates this probe')
    probe['liveProcesses'] = {'launcher':launcher, 'driver':driver}
    temporary = probe_file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(probe)+'\n')
    temporary.replace(probe_file)
    print(json.dumps({'launcher':launcher, 'driver':driver}))
elif mode == 'request':
    if probe.get('liveProcesses') != {'launcher':launcher, 'driver':driver}:
        raise ValueError('Launcher or Dart driver identity changed')
    expected = json.loads(sys.stdin.read())
    desktop = cycle.parse_json((root/'owned-desktop-process.json').read_text())
    if desktop.get('pid') != expected['desktopPid'] or desktop.get('probeStartedAt') != probe['startedAt']:
        raise ValueError('Desktop ledger differs from the current PID')
    desktop_identity = identity(desktop['pid'], Path(desktop['executablePath']).resolve(strict=True))
    if abs(desktop_identity['startUnixSeconds']-desktop['launchDateUnix']) > 1:
        raise ValueError('Desktop process start differs from captured launch')
    bound = cycle.capture_owned_host(root, runner, expected['hostPid'])
    if (bound.get('ownershipKnown') is not True or bound.get('pid') != expected['hostPid']
        or bound.get('lease') != expected['hostLease'] or bound.get('desktopPid') != expected['desktopPid']
        or bound.get('root') != str(root) or bound.get('probeStartedAt') != probe['startedAt']):
        raise ValueError('Current Host/Desktop binding is unknown or changed')
    facts = {'root':str(root), 'launcher':launcher, 'driver':driver, 'desktop':desktop_identity,
             'hostPid':bound['pid'], 'hostLease':bound['lease'], 'desktopPid':bound['desktopPid'],
             'hostInspection':{key:bound['inspection'][key] for key in ['executable','parentPid','startUnixSeconds','uid']}}
    (root/'owned-desktop-request.json').write_text(json.dumps(facts)+'\n')
    print(json.dumps(facts))
else:
    raise ValueError('Unknown fixed Desktop request identity operation')
''';

/// External observations and clean-CI normal cleanup for exact owned processes.
class ProbeDiagnostics {
  ProbeDiagnostics(this.root, {this.publishPhases = false})
    : _sink = File('${root.path}/probe-timeline.jsonl').openWrite() {
    _clock.start();
  }
  final Directory root;
  final bool publishPhases;
  final IOSink _sink;
  final Stopwatch _clock = Stopwatch();
  Timer? _timer;
  Future<void> _snapshots = Future<void>.value();
  int? _desktopPid, _appPid;
  bool _requestFailurePending = false;
  final Map<String, Map<String, Object?>> _hosts = {};

  void record(String event, [Map<String, Object?> facts = const {}]) {
    final value = <String, Object?>{
      'at': DateTime.now().toUtc().toIso8601String(),
      'elapsedMs': _clock.elapsedMilliseconds,
      'event': event,
      ...facts,
    };
    _sink.writeln(jsonEncode(value));
    if (publishPhases) {
      stdout.writeln('T05_PHASE=${jsonEncode(publicProbePhase(value))}');
    }
  }

  Future<void> start(int pid, String executable) async {
    _appPid = pid;
    final facts = {
      'pid': pid,
      'executable': executable,
      'startedAt': DateTime.now().toUtc().toIso8601String(),
    };
    await File('${root.path}/probe-process.json')
        .writeAsString(jsonEncode(facts));
    record('application-started', facts);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _snapshots = _snapshots.then((_) => _receipt());
    });
  }

  Future<void> _receipt() async {
    final file = File(
      '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
    );
    try {
      if (!await file.exists()) {
        record('receipt-snapshot', {'present': false});
        return;
      }
      final value = jsonDecode(await file.readAsString()) as Map;
      record('receipt-snapshot', {
        'present': true,
        for (final key in [
          'schema',
          'pid',
          'lease',
          'runtimeVersion',
          'permissionMode',
        ])
          key: value[key],
      });
      if (publishPhases &&
          Platform.environment['GITHUB_ACTIONS'] == 'true' &&
          value['pid'] is int &&
          value['lease'] is String &&
          await File('${root.path}/owned-desktop-cleanup.log').exists()) {
        final key = '${value['pid']}:${value['lease']}';
        if (_hosts[key]?['ownershipKnown'] != true) {
          final result = await Process.run('/usr/bin/python3', [
            File.fromUri(
              Platform.script.resolve(
                '../../../.github/scripts/settings_startup_cycle.py',
              ),
            ).path,
            '--capture-host',
            root.path,
            '${value['pid']}',
          ]);
          if (result.exitCode != 0) {
            await preserveHostInspectionFailure(
              root,
              value['pid'] as int,
              File.fromUri(
                Platform.script.resolve(
                  '../../../.github/scripts/settings_startup_cycle.py',
                ),
              ).path,
              result,
            );
            _hosts[key] = {
              'pid': value['pid'],
              'lease': value['lease'],
              'ownershipKnown': false,
              'observationError': true,
            };
            record('host-inspection-error', {
              'pid': value['pid'],
              'code': result.exitCode,
            });
          } else {
            _hosts[key] = (jsonDecode(result.stdout.toString()) as Map)
                .cast<String, Object?>();
            record('host-inspection', {
              'pid': value['pid'],
              'present': _hosts[key]!['ownershipKnown'],
            });
          }
        }
      }
    } catch (error) {
      record('receipt-snapshot', {'errorType': error.runtimeType.toString()});
    }
  }

  Future<bool> ownsHostReceipt(Map<String, Object?> value) async =>
      _hosts['${value['pid']}:${value['lease']}']?['ownershipKnown'] == true;

  Future<String?> startupFailure(int oldDesktop) async {
    for (final row in _hosts.values) {
      if (row['desktopPid'] == oldDesktop ||
          row['pendingDesktopCapture'] == true) {
        continue;
      }
      if (row['ownershipKnown'] != true) {
        return 'Host startup ownership observation is unknown';
      }
    }
    final pid = _desktopPid;
    if (pid != null && pid != oldDesktop) {
      final result = await Process.run('/usr/bin/python3', [
        File.fromUri(
          Platform.script.resolve(
            '../../../.github/scripts/settings_startup_cycle.py',
          ),
        ).path,
        '--check-owned-pid',
        root.path,
        '$pid',
      ]);
      if (result.exitCode != 0) {
        return 'Owned Desktop liveness observation failed';
      }
      final check = jsonDecode(result.stdout.toString()) as Map;
      if (check['state'] == 'gone') {
        return 'Owned Desktop exited before fresh lease readiness';
      }
      if (check['state'] != 'alive') return 'Owned Desktop liveness is unknown';
    }
    return null;
  }

  void uiRequest(Map<String, String>? params) {
    record('ui-request', {
      'action': params?['action'] ?? 'observe',
      'nodeId': params?['id'],
      if (params?['text'] case final String text)
        'textUtf8Bytes': utf8.encode(text).length,
    });
  }

  Future<void> uiResponse(Map<String, Object?> state) async {
    final native = state['native'] as Map? ?? {};
    record('ui-response', {
      for (final key in [
        'pid',
        'openedDesktopPid',
        'windowVisible',
        'windowKey',
        'appActive',
        'windowOcclusionVisible',
      ])
        key: native[key],
      'framesEnabled': state['framesEnabled'],
      'lifecycleState': state['lifecycleState'],
    });
    if (publishPhases && native['desktopQuitObservation'] is Map) {
      final value = native['desktopQuitObservation'] as Map;
      if (value.isNotEmpty) {
        record('desktop-quit-observation', {
          'pid': _appPid,
          ...desktopQuitFacts(value),
        });
      }
    }
    final pid = native['openedDesktopPid'];
    if (Platform.environment['GITHUB_ACTIONS'] == 'true' &&
        pid is int &&
        pid != _desktopPid) {
      await _desktopCommand('capture', [
        '${root.path}/missing-runtime/desktop/DeepSeek Harness.app',
        '$pid',
      ]);
      _desktopPid = pid;
    }
  }

  Future<Map<String, Object?>> _desktopRequestIdentity(
    String mode, [
    Map<String, Object?>? expected,
  ]) async {
    final child = await Process.start('/usr/bin/python3', [
      '-c',
      desktopRequestIdentityScript,
      File.fromUri(
        Platform.script.resolve(
          '../../../.github/scripts/settings_startup_cycle.py',
        ),
      ).path,
      root.path,
      mode,
      '$pid',
      Platform.resolvedExecutable,
    ]);
    final output = child.stdout.transform(utf8.decoder).join();
    final errors = child.stderr.transform(utf8.decoder).join();
    if (expected != null) child.stdin.write(jsonEncode(expected));
    await child.stdin.close();
    final code = await child.exitCode;
    final text = await output;
    final errorText = await errors;
    record('desktop-request-identity', {'mode': mode, 'code': code});
    if (code != 0) {
      throw StateError(
        'Owned Desktop request identity failed: $code ${safeInspectorOutput(errorText)}',
      );
    }
    final facts = (jsonDecode(text) as Map).cast<String, Object?>();
    record('desktop-request-live-binding', facts);
    return facts;
  }

  Future<void> prepareDesktopTermination() async {
    await _desktopRequestIdentity('prepare');
    final result = await Process.run('/usr/bin/swiftc', [
      File.fromUri(Platform.script.resolve('owned_desktop_cleanup.swift')).path,
      '-o',
      '${root.path}/owned-desktop-request',
    ]);
    record('desktop-request-helper-compiled', {'code': result.exitCode});
    if (result.exitCode != 0) {
      throw StateError(
        'Owned Desktop request helper compilation failed: ${result.exitCode}',
      );
    }
  }

  Future<void> requestDesktopTermination(
    int expectedPid,
    Map<String, Object?> receipt,
  ) async {
    try {
      await _snapshots;
      if (_desktopPid != expectedPid ||
          receipt['pid'] is! int ||
          receipt['lease'] is! String ||
          (receipt['lease'] as String).isEmpty) {
        throw StateError('Current Desktop/Host request identity is unknown');
      }
      await _desktopRequestIdentity('request', {
        'desktopPid': expectedPid,
        'hostPid': receipt['pid'],
        'hostLease': receipt['lease'],
      });
      await _desktopCommand('request-only', ['$expectedPid']);
    } catch (error) {
      _requestFailurePending = true;
      record('desktop-request-primary-error', {
        'mode': 'request-only',
        'errorType': error.runtimeType.toString(),
      });
      rethrow;
    }
  }

  Future<void> _desktopCommand(
    String mode, [
    List<String> arguments = const [],
  ]) async {
    final result = mode == 'request-only'
        ? await Process.run('${root.path}/owned-desktop-request', [
            root.path,
            mode,
            ...arguments,
          ])
        : await Process.run('/usr/bin/swift', [
            File.fromUri(Platform.script.resolve('owned_desktop_cleanup.swift'))
                .path,
            root.path,
            mode,
            ...arguments,
          ]);
    await File('${root.path}/owned-desktop-cleanup.log').writeAsString(
      '${result.stdout}${result.stderr}HELPER_EXIT=${result.exitCode}\n',
      mode: FileMode.append,
    );
    record('owned-desktop-helper', {'mode': mode, 'exit': result.exitCode});
    if (result.exitCode != 0) {
      throw StateError('Owned Desktop $mode failed: ${result.exitCode}');
    }
    if (mode == 'request-only') {
      record('desktop-quit-observation', {
        'pid': _appPid,
        'mode': mode,
        ...desktopQuitFacts(
          jsonDecode(result.stdout.toString().trim().split('\n').last),
        ),
      });
    }
  }

  Future<void> close() async {
    _timer?.cancel();
    await _snapshots;
    await _receipt();
    try {
      if (_desktopPid != null) await _desktopCommand('terminate');
      record('diagnostics-close');
    } catch (error) {
      if (!_requestFailurePending) rethrow;
      record('desktop-cleanup-secondary-error', {
        'mode': 'terminate',
        'errorType': error.runtimeType.toString(),
      });
      stderr.writeln(
        'DESKTOP_CLEANUP_SECONDARY_ERROR: ${safeInspectorOutput(error)}',
      );
    } finally {
      await _sink.close();
    }
  }
}
