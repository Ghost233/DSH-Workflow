import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/native_probe.dart';

void main() {
  test(
    'native probe forced process exit fails the gate and retains actual exit',
    () async {
      final child = await Process.start('/usr/bin/python3', [
        '-u',
        '-c',
        'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print("ready",flush=True); time.sleep(60)',
      ]);
      final errors = child.stderr.drain<void>();
      await child.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .first;
      addTearDown(() async {
        child.kill(ProcessSignal.sigkill);
        await child.exitCode;
        await errors;
      });
      await expectLater(
        stopNativeProbeProcess(child),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'actual exit',
            contains('-9'),
          ),
        ),
      );
      expect(await child.exitCode, -9);
    },
  );
}
