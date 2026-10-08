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

bool hostIdentityUnchanged(
  Map<String, Object?> before,
  Map<String, Object?> current,
) => const [
  'pid',
  'parentPid',
  'uid',
  'executable',
  'startUnixSeconds',
].every((key) => before[key] != null && before[key] == current[key]);

Future<void> preserveHostInspectionFailure(
  Directory root,
  int pid,
  String script,
  ProcessResult result, {
  bool headless = false,
}) async {
  final runnerPath = headless && root.parent.path == '/private/tmp'
      ? '/private/tmp'
      : Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] ??
            Platform.environment['RUNNER_TEMP'];
  if ((Platform.environment['GITHUB_ACTIONS'] != 'true' &&
          Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] == null &&
          !headless) ||
      runnerPath == null) {
    throw StateError('Lower observation requires clean CI root');
  }
  final runner = await Directory(runnerPath).resolveSymbolicLinks();
  final actual = await root.resolveSymbolicLinks();
  if (root.absolute.path != actual ||
      Directory(actual).parent.path != runner ||
      !RegExp(
        headless ? r'^dsh-t(?:01|06)-' : r'^dsh-t(?:01|05)-',
      ).hasMatch(root.uri.pathSegments.where((part) => part.isNotEmpty).last)) {
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
    'operation': headless ? '--capture-headless-host' : '--capture-host',
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

const ownProcessIdentityScript = r'''
import importlib.util, json, os, sys
from pathlib import Path
source, root_name, driver_pid, driver_executable = sys.argv[1:]
spec = importlib.util.spec_from_file_location('settings_startup_cycle', source)
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)
runner = cycle.observation_runner()
root = cycle.validate_root(root_name, runner)
if root.parent != runner or not root.name.startswith('dsh-t05-'):
    raise ValueError('Unowned settings probe root')
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
probe['liveProcesses'] = {'launcher':launcher, 'driver':driver}
temporary = probe_file.with_suffix('.json.tmp')
temporary.write_text(json.dumps(probe)+'\n')
temporary.replace(probe_file)
print(json.dumps({'launcher':launcher, 'driver':driver}))
''';

const desktopKernelInspectionScript = r'''
import importlib.util, json, os, sys
from pathlib import Path
source, root_name, pid, headless = sys.argv[1:]
headless = headless == "true"
spec = importlib.util.spec_from_file_location('settings_startup_cycle', source)
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)
cycle.validate_observation_root(root_name, cycle.observation_runner(headless=headless), headless=headless)
print(json.dumps(cycle.inspect_host(int(pid))))
''';

/// External observations and clean-CI normal cleanup for exact owned processes.
class ProbeDiagnostics {
  ProbeDiagnostics(
    this.root, {
    this.publishPhases = false,
    this.observeHostOwnership = false,
    this.captureCIHostOnce = false,
  }) : _sink = File('${root.path}/probe-timeline.jsonl').openWrite() {
    _clock.start();
  }
  final Directory root;
  final bool publishPhases, observeHostOwnership, captureCIHostOnce;
  final IOSink _sink;
  final Stopwatch _clock = Stopwatch();
  Timer? _timer;
  Future<void> _snapshots = Future<void>.value();
  int? _desktopPid, _appPid;
  bool _desktopCaptured = false;
  bool _ciHostCaptureAttempted = false;
  final Map<String, Map<String, Object?>> _hosts = {};
  final Map<String, Map<String, Object?>> _hostIdentities = {};
  Map<String, Object?>? _headlessOwner;

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

  Future<void> start(int appPid, String executable) async {
    _appPid = appPid;
    final facts = {
      'pid': appPid,
      'executable': executable,
      'startedAt': DateTime.now().toUtc().toIso8601String(),
      'driverPid': pid,
      'driverExecutable': Platform.resolvedExecutable,
    };
    await File('${root.path}/probe-process.json')
        .writeAsString(jsonEncode(facts));
    record('application-started', facts);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _snapshots = _snapshots.then((_) async {
        await _receipt();
      });
    });
  }

  Future<bool> _receipt({bool revalidate = false}) async {
    final file = File(
      '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
    );
    try {
      if (!await file.exists()) {
        record('receipt-snapshot', {'present': false});
        return false;
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
      final headless = _headlessOwner != null;
      if ((headless ||
              observeHostOwnership ||
              (captureCIHostOnce &&
                  _desktopCaptured &&
                  !_ciHostCaptureAttempted)) &&
          (Platform.environment['GITHUB_ACTIONS'] == 'true' ||
              Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] !=
                  null ||
              headless) &&
          value['pid'] is int &&
          value['lease'] is String &&
          (headless ||
              await File('${root.path}/owned-desktop-cleanup.log').exists())) {
        if (captureCIHostOnce) _ciHostCaptureAttempted = true;
        final key = '${value['pid']}:${value['lease']}';
        if (revalidate || _hosts[key]?['ownershipKnown'] != true) {
          final result = await Process.run('/usr/bin/python3', [
            File.fromUri(
              Platform.script.resolve(
                '../../../.github/scripts/settings_startup_cycle.py',
              ),
            ).path,
            headless ? '--capture-headless-host' : '--capture-host',
            root.path,
            '${value['pid']}',
            if (headless) '${_headlessOwner!['pid']}',
            if (headless) '$pid',
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
              headless: headless,
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
            final bound = (jsonDecode(result.stdout.toString()) as Map)
                .cast<String, Object?>();
            final inspection = (bound['inspection'] as Map)
                .cast<String, Object?>();
            final first = _hostIdentities[key];
            if ((first != null && !hostIdentityUnchanged(first, inspection)) ||
                (headless &&
                    !hostIdentityUnchanged(
                      _headlessOwner!,
                      (bound['ownerInspection'] as Map).cast<String, Object?>(),
                    ))) {
              bound['ownershipKnown'] = false;
              bound['identityChanged'] = true;
            }
            if (bound['ownershipKnown'] == true) {
              _hostIdentities.putIfAbsent(key, () => inspection);
            }
            _hosts[key] = bound;
            record('host-inspection', {
              'pid': value['pid'],
              'present': _hosts[key]!['ownershipKnown'],
            });
          }
        }
      }
      return true;
    } catch (error) {
      record('receipt-snapshot', {'errorType': error.runtimeType.toString()});
      return false;
    }
  }

  Future<bool> ownsHostReceipt(Map<String, Object?> value) async {
    await _snapshots;
    if (!await _receipt(revalidate: true)) return false;
    final current = jsonDecode(
      await File(
        '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
      ).readAsString(),
    ) as Map;
    if (current['pid'] != value['pid'] || current['lease'] != value['lease']) {
      return false;
    }
    final bound = _hosts['${value['pid']}:${value['lease']}'];
    final ownedParent = _headlessOwner != null
        ? (bound?['ownerType'] == 'headless' &&
              bound?['ownerPid'] == _headlessOwner!['pid'])
        : (_desktopCaptured && bound?['desktopPid'] == _desktopPid);
    return ownedParent &&
        bound?['ownershipKnown'] == true &&
        bound?['pid'] == value['pid'] &&
        bound?['lease'] == value['lease'] &&
        bound?['root'] == root.path;
  }

  Future<void> observeOwnedHeadlessHost(int ownerPid) async {
    final observed = await _desktopKernelInspection(ownerPid, headless: true);
    final inspection = (observed['inspection'] as Map?)
        ?.cast<String, Object?>();
    final node = await File('${root.path}/missing-runtime/node')
        .resolveSymbolicLinks();
    if (observed['state'] != 'observed' ||
        inspection?['parentPid'] != pid ||
        inspection?['executable'] != node ||
        inspection?['query'] is! Map ||
        (inspection!['query'] as Map)['exit'] != 0 ||
        inspection['startUnixSeconds'] is! num) {
      throw StateError(
        'Spawned headless Host owner identity is unknown: ${safeInspectorOutput(observed)}',
      );
    }
    _headlessOwner = inspection;
    record('headless-host-owner', {'pid': ownerPid, 'driverPid': pid});
  }

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
    final target = _desktopPid;
    if (target != null && target != oldDesktop) {
      if (!_desktopCaptured) return 'New Desktop identity is unknown';
      final result = await Process.run('/usr/bin/python3', [
        File.fromUri(
          Platform.script.resolve(
            '../../../.github/scripts/settings_startup_cycle.py',
          ),
        ).path,
        '--check-owned-pid',
        root.path,
        '$target',
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
    if ((Platform.environment['GITHUB_ACTIONS'] == 'true' ||
            Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] !=
                null) &&
        pid is int &&
        pid != _desktopPid) {
      try {
        final kernelIdentity = (observeHostOwnership || captureCIHostOnce)
            ? await _desktopKernelInspection(pid)
            : null;
        await _desktopCommand('capture', [
          '${root.path}/missing-runtime/desktop/DeepSeek Harness.app',
          '$pid',
          if (kernelIdentity != null) jsonEncode(kernelIdentity),
        ]);
        _desktopCaptured =
            !(observeHostOwnership || captureCIHostOnce) ||
            kernelIdentity?['state'] == 'observed';
      } catch (error) {
        _desktopCaptured = false;
        record('ci-desktop-identity-unknown', {
          'pid': pid,
          'errorType': error.runtimeType.toString(),
        });
        stderr.writeln(
          'CI_DESKTOP_IDENTITY_WARNING: ${safeInspectorOutput(error)}',
        );
      }
      _desktopPid = pid;
    }
  }

  Future<Map<String, Object?>> _desktopKernelInspection(
    int targetPid, {
    bool headless = false,
  }) async {
    try {
      final result = await Process.run('/usr/bin/python3', [
        '-c',
        desktopKernelInspectionScript,
        File.fromUri(
          Platform.script.resolve(
            '../../../.github/scripts/settings_startup_cycle.py',
          ),
        ).path,
        root.path,
        '$targetPid',
        '$headless',
      ]);
      final inspection = result.exitCode == 0
          ? jsonDecode(result.stdout.toString()) as Map
          : null;
      return {
        'state':
            inspection?['lookupOk'] == true &&
                inspection?['pid'] == targetPid &&
                inspection?['uid'] == inspection?['probeUid']
            ? 'observed'
            : 'unknown',
        'exit': result.exitCode,
        'stdout': safeInspectorOutput(result.stdout),
        'stderr': safeInspectorOutput(result.stderr),
        'inspection': inspection,
      };
    } catch (error) {
      return {'state': 'unknown', 'warning': safeInspectorOutput(error)};
    }
  }

  Future<void> prepareOwnProcesses() async {
    final result = await Process.run('/usr/bin/python3', [
      '-c',
      ownProcessIdentityScript,
      File.fromUri(
        Platform.script.resolve(
          '../../../.github/scripts/settings_startup_cycle.py',
        ),
      ).path,
      root.path,
      '$pid',
      Platform.resolvedExecutable,
    ]);
    record('own-process-identity', {'code': result.exitCode});
    if (result.exitCode != 0) {
      throw StateError(
        'Owned Launcher/driver identity failed: ${result.exitCode} ${safeInspectorOutput(result.stderr)}',
      );
    }
  }

  Future<void> _desktopCommand(
    String mode, [
    List<String> arguments = const [],
  ]) async {
    final result = await Process.run('/usr/bin/swift', [
      File.fromUri(Platform.script.resolve('owned_desktop_cleanup.swift')).path,
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
  }

  Future<void> close() async {
    _timer?.cancel();
    await _snapshots;
    await _receipt();
    try {
      if (_desktopPid != null && _desktopCaptured) {
        await _desktopCommand('terminate');
      } else if (_desktopPid != null) {
        record('ci-desktop-cleanup-unknown', {'pid': _desktopPid});
        stderr.writeln(
          'CI_DESKTOP_CLEANUP_WARNING: identity unknown; cleanup refused',
        );
      }
    } catch (error) {
      record('ci-desktop-cleanup-error', {
        'mode': 'terminate',
        'errorType': error.runtimeType.toString(),
      });
      stderr.writeln(
        'CI_DESKTOP_CLEANUP_WARNING: ${safeInspectorOutput(error)}',
      );
    } finally {
      record('diagnostics-close');
      await _sink.close();
    }
  }
}
