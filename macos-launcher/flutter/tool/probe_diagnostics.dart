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
    'requestCount',
    'requestElapsedMs',
    'appExitKnown',
    'appExit',
    'sessionRelation',
    'registryRelation',
    'connectionCategory',
    'closeReasonKnown',
    'sdkState',
    'reasonPresent',
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
  int? _desktopPid;
  int? _appPid, _appExit;
  var _uiCount = 0;
  final _uiRequests = <int, int>{};
  final Map<String, Map<String, Object?>> _hosts = {};

  void record(String event, [Map<String, Object?> facts = const {}]) {
    if (event == 'application-exit' && facts['code'] is int) {
      _appExit = facts['code'] as int;
    }
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

  Future<void> start(int applicationPid, String executable) async {
    _appPid = applicationPid;
    final facts = {
      'pid': applicationPid,
      if (publishPhases) 'parentPid': pid,
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

  Future<void> samplePendingStatus(int requestCount) async {
    final pid = _appPid;
    if (!publishPhases || pid == null) return;
    final result = await Process.run('/usr/bin/python3', [
      File.fromUri(
        Platform.script.resolve(
          '../../../.github/scripts/settings_startup_cycle.py',
        ),
      ).path,
      '--sample-owned-application',
      root.path,
      '$pid',
      '$requestCount',
    ]);
    final value = result.exitCode == 0
        ? (jsonDecode(result.stdout.toString()) as Map)
        : const <String, Object?>{};
    record('owned-app-sample', {
      'pid': pid,
      'requestCount': requestCount,
      'present': value['state'] == 'observed',
      'rawExit': result.exitCode,
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

  int uiRequest(Map<String, String>? params) {
    final count = ++_uiCount;
    if (publishPhases) _uiRequests[count] = _clock.elapsedMilliseconds;
    record('ui-request', {
      'action': params?['action'] ?? 'observe',
      if (publishPhases) ...{
        'method': 'ext.dshlauncher.application',
        'requestCount': count,
        'pid': _appPid,
        'appExitKnown': _appExit != null,
        'appExit': _appExit,
      },
      'nodeId': params?['id'],
      if (params?['text'] case final String text)
        'textUtf8Bytes': utf8.encode(text).length,
    });
    return count;
  }

  void vmResponse(int? request) {
    if (!publishPhases || request == null) return;
    record('vm-request-response', {
      'method': 'ext.dshlauncher.application',
      'requestCount': request,
      'pid': _appPid,
      'appExitKnown': _appExit != null,
      'appExit': _appExit,
    });
  }

  void vmComplete(int? request, {Object? error}) {
    if (!publishPhases || request == null) return;
    final started = _uiRequests.remove(request);
    record(error == null ? 'vm-request-end' : 'vm-request-error', {
      'method': 'ext.dshlauncher.application',
      'requestCount': request,
      'pid': _appPid,
      'appExitKnown': _appExit != null,
      'appExit': _appExit,
      if (started != null)
        'requestElapsedMs': _clock.elapsedMilliseconds - started,
      if (error != null) 'errorType': error.runtimeType.toString(),
    });
  }

  Future<void> uiResponse(Map<String, Object?> state) async {
    if (publishPhases) {
      final labels = (state['nodes'] as List? ?? const []).cast<Map>().map(
        (node) => node['label']?.toString() ?? '',
      );
      final found = labels.where((label) => label.startsWith('MacLauncher：'));
      final text = found.isEmpty
          ? ''
          : found.first.substring('MacLauncher：'.length);
      final category = text.split('：').first;
      record('sdk-app-state', {
        'pid': _appPid,
        'sdkState':
            const [
              'connected',
              'connecting',
              'disconnected',
              'rejected',
            ].contains(category)
            ? category
            : 'unknown',
        'reasonPresent': text.contains('：'),
        'appExitKnown': _appExit != null,
        'appExit': _appExit,
      });
    }
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
      if (_desktopPid != null) await _desktopCommand('terminate');
      record('diagnostics-close');
    } finally {
      await _sink.close();
    }
  }
}
