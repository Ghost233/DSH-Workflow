import 'dart:io';
import 'dart:convert';

import '../../tool/probe_diagnostics.dart';

Future<void> main(List<String> arguments) async {
  final root = Directory(arguments.first);
  if (arguments.length > 1) {
    try {
      await preserveHostInspectionFailure(
        root,
        pid,
        '/owned/safe/helper.py',
        ProcessResult(pid, 2, '', 'controlled failure'),
      );
    } on StateError {
      stdout.writeln('ROOT_OR_SYMLINK_GUARD_REJECTED');
      return;
    }
    throw StateError('Unsafe root was accepted');
  }
  await Directory('${root.path}/data/global/.dsh-workflow/desktop')
      .create(recursive: true);
  await File('${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json')
      .writeAsString(jsonEncode({'pid': pid, 'lease': 'fixture-owned-lease'}));
  await File('${root.path}/owned-desktop-cleanup.log').writeAsString('{}\n');
  final diagnostics = ProbeDiagnostics(
    root,
    publishPhases: true,
    observeHostOwnership: true,
  );
  await diagnostics.start(pid, Platform.resolvedExecutable);
  await Future<void>.delayed(const Duration(milliseconds: 1200));
  await diagnostics.close();
  final timeline = await File('${root.path}/probe-timeline.jsonl')
      .readAsString();
  final rows = timeline
      .split('\n')
      .where((line) => line.isNotEmpty)
      .map(jsonDecode)
      .where((row) => row['event'] == 'host-inspection-error')
      .toList();
  if (rows.isEmpty) {
    throw StateError('Fixture did not reach real inspector invocation');
  }
  final retained = File('${root.path}/host-inspection-results.jsonl');
  if (!await retained.exists() ||
      !await retained.readAsString().then(
        (value) => value.contains('stderr'),
      )) {
    stderr.writeln(
      'INSPECTOR_STDERR_LOSS_REPRODUCED queryExit=${rows.first['code']} evidence=${root.path}',
    );
    throw StateError('Actual failed inspector invocation discards stderr');
  }
  final observation = jsonDecode((await retained.readAsLines()).first) as Map;
  if (observation['exit'] != 2 ||
      !(observation['stderr'] as String).contains('open file')) {
    throw StateError('Actual failure evidence not preserved');
  }
  stdout.writeln('INSPECTOR_STDERR_DURABLE_REAL_EXIT=2 ROOT=${root.path}');
}
