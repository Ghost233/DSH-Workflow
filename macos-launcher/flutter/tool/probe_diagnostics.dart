import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// External, read-only observations for the owned application/Host boundaries.
class ProbeDiagnostics {
  ProbeDiagnostics(this.root)
    : _sink = File('${root.path}/probe-timeline.jsonl').openWrite() {
    _clock.start();
  }
  final Directory root;
  final IOSink _sink;
  final Stopwatch _clock = Stopwatch();
  Timer? _timer;
  Future<void> _snapshots = Future<void>.value();

  void record(String event, [Map<String, Object?> facts = const {}]) {
    _sink.writeln(
      jsonEncode({
        'at': DateTime.now().toUtc().toIso8601String(),
        'elapsedMs': _clock.elapsedMilliseconds,
        'event': event,
        ...facts,
      }),
    );
  }

  Future<void> start(int pid, String executable) async {
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
    } catch (error) {
      record('receipt-snapshot', {'errorType': error.runtimeType.toString()});
    }
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
  }

  Future<void> close() async {
    _timer?.cancel();
    await _snapshots;
    await _receipt();
    record('diagnostics-close');
    await _sink.close();
  }
}
