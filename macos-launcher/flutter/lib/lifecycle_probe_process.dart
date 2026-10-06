import 'dart:convert';
import 'dart:io';

/// A Debug-only external I/O boundary around a real Process.start result.
/// The real child runs before its handle is released to the controller.
Future<Process> startLifecycleProbeProcess(
  String executable,
  List<String> arguments, {
  String? workingDirectory,
  Map<String, String>? environment,
  required bool isolated,
  required String dataRoot,
}) async {
  final gatePath = Platform.environment['DSH_LAUNCHER_TEST_START_GATE'];
  final child = await Process.start(
    executable,
    arguments,
    workingDirectory: workingDirectory,
    environment: environment,
  );
  if (!isolated || gatePath == null) return child;
  await File('$dataRoot/owned-web-child.json')
      .writeAsString('${jsonEncode({'pid': child.pid})}\n');
  if (!await File('$gatePath.arm').exists()) return child;
  Socket? gate;
  try {
    gate = await Socket.connect(
      InternetAddress(gatePath, type: InternetAddressType.unix),
      0,
    );
    gate.writeln(jsonEncode({'pid': child.pid}));
    await gate.flush();
    final release = await utf8.decoder
        .bind(gate)
        .transform(const LineSplitter())
        .first;
    if (release != 'release') throw StateError('Invalid process gate release');
    return child;
  } catch (_) {
    child.kill(ProcessSignal.sigkill);
    await child.exitCode;
    rethrow;
  } finally {
    gate?.destroy();
  }
}
