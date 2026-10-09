import 'dart:convert';
import 'dart:io';

import '../../tool/probe_diagnostics.dart';

Future<void> main(List<String> arguments) async {
  if (arguments.single == '--emitter') {
    stdout.writeln('FORWARDING_ACTIVE');
    await Future<void>.delayed(const Duration(milliseconds: 400));
    stdout.writeln('FORWARDING_DONE');
    exit(17);
  }
  final diagnostics = ProbeDiagnostics(
    Directory(arguments.single),
    publishPhases: true,
  );
  final child = await Process.start(Platform.resolvedExecutable, [
    Platform.script.toFilePath(),
    '--emitter',
  ]);
  await for (final line
      in child.stdout.transform(utf8.decoder).transform(const LineSplitter())) {
    stdout.writeln('FORWARDED=$line');
    if (line == 'FORWARDING_ACTIVE') {
      diagnostics.record('resources-stage-end');
      diagnostics.record('settings-fixture-start', {
        'token': 'synthetic-private-token',
        'payload': {'password': 'synthetic-private-password'},
      });
    }
  }
  final code = await child.exitCode;
  await diagnostics.close();
  exit(code);
}
