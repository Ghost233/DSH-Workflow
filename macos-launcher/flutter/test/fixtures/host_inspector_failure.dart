import 'dart:io';

import '../../tool/probe_diagnostics.dart';

Future<void> main(List<String> arguments) async {
  final root = Directory(arguments.first);
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
