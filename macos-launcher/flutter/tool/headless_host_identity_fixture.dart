import 'dart:convert';
import 'dart:io';
import 'dart:async';

import 'probe_diagnostics.dart';

Future<void> main(List<String> arguments) async {
  final root = Directory(arguments.first);
  final runtime = await Directory('${root.path}/missing-runtime').create();
  final python = (await Process.run('/usr/bin/python3', [
    '-c',
    'import importlib.util,os,sys; spec=importlib.util.spec_from_file_location("cycle",sys.argv[1]); cycle=importlib.util.module_from_spec(spec); spec.loader.exec_module(cycle); print(cycle.inspect_host(os.getpid())["executable"])',
    File.fromUri(
      Platform.script.resolve(
        '../../../.github/scripts/settings_startup_cycle.py',
      ),
    ).path,
  ])).stdout.toString().trim();
  await Link('${runtime.path}/node').create(python);
  final owner = await Process.start(python, [
    '-c',
    r'import subprocess,sys; child=subprocess.Popen([sys.executable,"-c","import sys; sys.stdin.buffer.read()"],stdin=subprocess.PIPE); print(child.pid,flush=True); sys.stdin.buffer.read(); child.stdin.close(); child.wait(timeout=5)',
  ]);
  final hostPid = int.parse(
    await owner.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .first,
  );
  final errors = owner.stderr.transform(utf8.decoder).join();
  final receipt = File(
    '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
  );
  await receipt.parent.create(recursive: true);
  final value = <String, Object?>{
    'pid': hostPid,
    'lease': 'owned-headless-lease',
  };
  await receipt.writeAsString(jsonEncode(value));
  final diagnostics = ProbeDiagnostics(root);
  try {
    await diagnostics.start(pid, Platform.resolvedExecutable);
    if (arguments.contains('--bind-owned-owner')) {
      await (diagnostics as dynamic).observeOwnedHeadlessHost(owner.pid);
    }
    if (!await diagnostics.ownsHostReceipt(value)) {
      throw StateError('Real owned headless Host identity was not captured');
    }
    await receipt.writeAsString(
      jsonEncode({...value, 'lease': 'different-lease'}),
    );
    if (await diagnostics.ownsHostReceipt(value)) {
      throw StateError('A superseded physical Host lease was accepted');
    }
    await receipt.writeAsString(jsonEncode(value));
    if (!await diagnostics.ownsHostReceipt(value)) {
      throw StateError('The unchanged physical Host identity was lost');
    }
    stdout.writeln('OWNED_HEADLESS_IDENTITY_AND_EXACT_LEASE_VERIFIED');
  } finally {
    await diagnostics.close();
    await owner.stdin.close();
    if (await owner.exitCode.timeout(const Duration(seconds: 5)) != 0) {
      throw StateError('Owned physical fixture did not exit normally');
    }
    await errors;
  }
}
