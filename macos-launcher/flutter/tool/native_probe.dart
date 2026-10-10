import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:maclauncher_sdk/maclauncher_sdk.dart';
import 'package:vm_service/vm_service_io.dart';

import 'application_probe.dart' show closeProbeResources;

Future<void> main(List<String> arguments) async {
  if (arguments.length != 1) {
    throw ArgumentError('Pass the debug Flutter executable');
  }
  final root = await Directory.systemTemp.createTemp('dsh-native-probe-');
  final socketPath = '${root.path}/sdk.sock';
  final server = await ServerSocket.bind(
    InternetAddress(socketPath, type: InternetAddressType.unix),
    0,
  );
  final accepted = server.first;
  final process = await Process.start(
    arguments.single,
    ['--vm-service-port=0'],
    environment: {
      ...Platform.environment,
      'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
      'DSH_LAUNCHER_TEST_SOCKET': socketPath,
    },
  );
  stdout.writeln('NATIVE_PROBE_PROCESS_PID=${process.pid}');
  final serviceUri = Completer<String>();
  void output(String line) {
    final uri = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
        .firstMatch(line)
        ?.group(0);
    if (uri != null && !serviceUri.isCompleted) serviceUri.complete(uri);
  }

  final stdoutSubscription = process.stdout
      .transform(utf8.decoder)
      .transform(const LineSplitter())
      .listen(output);
  final stderrSubscription = process.stderr
      .transform(utf8.decoder)
      .transform(const LineSplitter())
      .listen(output);
  Socket? socket;
  var failed = false;
  try {
    socket = await accepted.timeout(const Duration(seconds: 30));
    final replies = <String, Completer<Map<String, Object?>>>{};
    final hello = Completer<void>();
    final subscription = decodeMessages(socket).listen((message) {
      if (message['type'] == 'hello' && !hello.isCompleted) hello.complete();
      if (message['type'] == 'response') {
        replies.remove(message['id'])?.complete(message);
      }
      if (message['type'] == 'ping') writeMessage(socket!, {'type': 'pong'});
    });
    await hello.future;
    writeMessage(socket, {
      'type': 'welcome',
      'accepted': true,
      'launcherSessionId': 'native-probe',
    });
    final http = await serviceUri.future.timeout(const Duration(seconds: 20));
    final vm = await vmServiceConnectUri(
      '${http.replaceFirst('http:', 'ws:')}ws',
    );
    var nativeFailed = false;
    try {
      final isolate = (await vm.getVM()).isolates!.single.id!;
      Future<Map<String, Object?>> nativeState() async =>
          (await vm.callServiceExtension(
            'ext.dshlauncher.nativeState',
            isolateId: isolate,
          )).json!;
      Future<void> request(
        String id,
        String method, [
        Map<String, Object?>? params,
      ]) async {
        final response = Completer<Map<String, Object?>>();
        replies[id] = response;
        writeMessage(socket!, {
          'type': 'request',
          'id': id,
          'method': method,
          'params': ?params,
        });
        final result = await response.future.timeout(
          const Duration(seconds: 5),
        );
        if (result['error'] != null) {
          throw StateError(result['error'].toString());
        }
      }

      await request('open', 'openWindow');
      var visible = await nativeState();
      for (
        var attempt = 0;
        attempt < 50 &&
            (visible['appActive'] != true || visible['windowKey'] != true);
        attempt++
      ) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        visible = await nativeState();
      }
      if (visible['windowVisible'] != true ||
          visible['entryVisible'] != true ||
          visible['windowKey'] != true ||
          visible['appActive'] != true) {
        throw StateError(
          'Native management window cannot receive input: $visible',
        );
      }
      await request('managed', 'setEntryManaged', {'managed': true});
      if ((await nativeState())['entryVisible'] != false) {
        throw StateError('Managed entry stayed visible');
      }
      socket.destroy();
      var restored = false;
      for (var attempt = 0; attempt < 60; attempt++) {
        restored = (await nativeState())['entryVisible'] == true;
        if (restored) break;
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      if (!restored) throw StateError('Native entry was not restored');
      stdout.writeln(
        'Native window, menu handoff and disconnect restoration passed',
      );
    } catch (_) {
      nativeFailed = true;
      rethrow;
    } finally {
      await closeProbeResources([
        ('native vm', vm.dispose),
        ('native messages', subscription.cancel),
      ], preserveFailure: nativeFailed);
    }
  } catch (_) {
    failed = true;
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'native socket',
        () {
          socket?.destroy();
        },
      ),
      ('native process', () => stopNativeProbeProcess(process)),
      ('native stdout', stdoutSubscription.cancel),
      ('native stderr', stderrSubscription.cancel),
      ('native server', server.close),
      (
        'native root',
        () async {
          await root.delete(recursive: true);
        },
      ),
    ], preserveFailure: failed);
  }
}

Future<void> stopNativeProbeProcess(Process process) async {
  process.kill(ProcessSignal.sigterm);
  var forced = false;
  int code;
  try {
    code = await process.exitCode.timeout(const Duration(seconds: 3));
  } on TimeoutException {
    forced = true;
    process.kill(ProcessSignal.sigkill);
    code = await process.exitCode;
  }
  stdout.writeln('NATIVE_PROBE_PROCESS_EXIT=$code FORCED=$forced');
  if (forced) {
    throw StateError(
      'Native probe cleanup required SIGKILL; actual exit $code',
    );
  }
}
