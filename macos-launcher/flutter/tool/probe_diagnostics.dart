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
  ProcessResult result,
) async {
  final runnerPath = root.parent.path == '/private/tmp'
      ? '/private/tmp'
      : Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] ??
            Platform.environment['RUNNER_TEMP'];
  if (runnerPath == null) {
    throw StateError('Lower observation requires a private root');
  }
  final runner = await Directory(runnerPath).resolveSymbolicLinks();
  final actual = await root.resolveSymbolicLinks();
  if (root.absolute.path != actual ||
      Directory(actual).parent.path != runner ||
      !RegExp(
        r'^dsh-t(?:01|05|06)-',
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
    'operation': '--capture-headless-host',
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

const hostKernelInspectionScript = r'''
import importlib.util, json, sys
source, root_name, pid = sys.argv[1:]
spec = importlib.util.spec_from_file_location('settings_startup_cycle', source)
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)
cycle.validate_observation_root(root_name, cycle.observation_runner(headless=True))
print(json.dumps(cycle.inspect_host(int(pid))))
''';

/// Record the Web probe and verify ownership of its standalone Host.
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
      if (_headlessOwner != null &&
          value['pid'] is int &&
          value['lease'] is String) {
        final key = '${value['pid']}:${value['lease']}';
        if (revalidate || _hosts[key]?['ownershipKnown'] != true) {
          final result = await Process.run('/usr/bin/python3', [
            File.fromUri(
              Platform.script.resolve(
                '../../../.github/scripts/settings_startup_cycle.py',
              ),
            ).path,
            '--capture-headless-host',
            root.path,
            '${value['pid']}',
            '${_headlessOwner!['pid']}',
            '$pid',
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
            final bound = (jsonDecode(result.stdout.toString()) as Map)
                .cast<String, Object?>();
            final inspection = (bound['inspection'] as Map)
                .cast<String, Object?>();
            final first = _hostIdentities[key];
            if ((first != null && !hostIdentityUnchanged(first, inspection)) ||
                !hostIdentityUnchanged(
                  _headlessOwner!,
                  (bound['ownerInspection'] as Map).cast<String, Object?>(),
                )) {
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
    return bound?['ownerType'] == 'headless' &&
        bound?['ownerPid'] == _headlessOwner?['pid'] &&
        bound?['ownershipKnown'] == true &&
        bound?['pid'] == value['pid'] &&
        bound?['lease'] == value['lease'] &&
        bound?['root'] == root.path;
  }

  Future<void> observeOwnedHeadlessHost(int ownerPid) async {
    final observed = await _hostKernelInspection(ownerPid);
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

  void uiRequest(Map<String, String>? params) {
    record('ui-request', {
      'action': params?['action'] ?? 'observe',
      'nodeId': params?['id'],
      if (params?['text'] case final String text)
        'textUtf8Bytes': utf8.encode(text).length,
    });
  }

  void uiResponse(Map<String, Object?> state) {
    final native = state['native'] as Map? ?? {};
    record('ui-response', {
      for (final key in [
        'pid',
        'windowVisible',
        'windowKey',
        'appActive',
        'windowOcclusionVisible',
      ])
        key: native[key],
      'framesEnabled': state['framesEnabled'],
      'lifecycleState': state['lifecycleState'],
    });
  }

  Future<Map<String, Object?>> _hostKernelInspection(int targetPid) async {
    try {
      final result = await Process.run('/usr/bin/python3', [
        '-c',
        hostKernelInspectionScript,
        File.fromUri(
          Platform.script.resolve(
            '../../../.github/scripts/settings_startup_cycle.py',
          ),
        ).path,
        root.path,
        '$targetPid',
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

  Future<void> close() async {
    _timer?.cancel();
    await _snapshots;
    await _receipt();
    record('diagnostics-close');
    await _sink.close();
  }
}
