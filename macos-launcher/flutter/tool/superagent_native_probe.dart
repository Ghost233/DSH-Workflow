import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:vm_service/vm_service_io.dart';

Future<void> main(List<String> args) async {
  if (args.length != 7) {
    throw ArgumentError(
      'EXE RESOURCES DATA_ROOT DSH_HOME GH_LOGIN REPOSITORY AX_READY_FILE',
    );
  }
  if (!args[2].startsWith('/private/tmp/dsh-')) {
    throw ArgumentError('Use an isolated preview data directory');
  }
  final root = await Directory('/private/tmp')
      .createTemp('dsh-wizard-native-loop-');
  final p = await Process.start(
    args[0],
    ['--vm-service-port=0'],
    environment: {
      ...Platform.environment,
      'DSH_LAUNCHER_TEST_ROOT': args[2],
      'DSH_LAUNCHER_TEST_RESOURCES': args[1],
      'DSH_LAUNCHER_TEST_HOME': args[3],
      'DSH_LAUNCHER_NATIVE_SEMANTICS':
          Platform.environment['DSH_LAUNCHER_NATIVE_SEMANTICS'] ?? '1',
    },
  );
  final lines = <String>[];
  final uri = Completer<String>();
  String step = 'startup';
  void output(String line) {
    lines.add(line);
    final m = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/').firstMatch(line);
    if (m != null && !uri.isCompleted) uri.complete(m[0]);
  }

  p.stdout
      .transform(utf8.decoder)
      .transform(const LineSplitter())
      .listen(output);
  p.stderr
      .transform(utf8.decoder)
      .transform(const LineSplitter())
      .listen(output);
  int? exited;
  p.exitCode.then((v) => exited = v);
  try {
    final http = await uri.future.timeout(const Duration(seconds: 15));
    final vm = await vmServiceConnectUri(
      '${http.replaceFirst('http:', 'ws:')}ws',
    );
    try {
      final id = (await vm.getVM()).isolates!.single.id!;
      for (var i = 0; i < 100; i++) {
        if ((await vm.getIsolate(id)).extensionRPCs!
            .contains('ext.dshlauncher.application')) {
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
      Future<Map> state([Map<String, String>? input]) async =>
          (await vm.callServiceExtension(
            'ext.dshlauncher.application',
            isolateId: id,
            args: input,
          )).json!;
      Future<Map> node(String label) async {
        for (var i = 0; i < 80; i++) {
          if (lines.any((l) => l.contains('Failed to update ui::AXTree'))) {
            throw StateError('native AX tree corruption');
          }
          final s = await state();
          final rows = (s['nodes'] as List)
              .cast<Map>()
              .where(
                (n) =>
                    (n['label'] as String).contains(label) &&
                    (n['actions'] as List).contains('tap'),
              )
              .toList();
          if (rows.isNotEmpty) return rows.first;
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        final last = await state();
        throw StateError(
          'missing control: $label; labels=${(last['nodes'] as List).map((n) => n['label']).join("|")}; frames=${last['framesEnabled']} lifecycle=${last['lifecycleState']}',
        );
      }

      Future<void> tap(String label) async {
        await state({'action': 'ownEntry'});
        step = label;
        final n = await node(label);
        await state({'action': 'tap', 'id': '${n['id']}'});
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }

      await state({'action': 'ownEntry'});
      stdout.writeln('READY_FOR_AX');
      final gate = args[6];
      {
        for (var i = 0; i < 3000 && !File(gate).existsSync(); i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        if (!File(gate).existsSync()) {
          throw StateError('system AX gate never opened');
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 300));
      await tap('Superagent');
      for (var i = 0; i < 10; i++) {
        await tap('添加项目');
        await tap(args[4]);
        await tap('下一步');
        await tap(args[5]);
        await node('main');
        await tap('main');
        await tap('main');
        await tap('上一步');
        await tap('下一步');
        await node('选择专用存放目录');
        await tap('取消');
        stdout.writeln('cycle=${i + 1}');
      }
      if (lines.any((l) => l.contains('Failed to update ui::AXTree'))) {
        throw StateError('native AX tree corruption');
      }
      await state({'action': 'quit'});
      await p.exitCode.timeout(const Duration(seconds: 10));
      if (exited != 0) throw StateError('preview quit failed: $exited');
      stdout.writeln(
        jsonEncode({'passed': true, 'step': step, 'nativeErrors': 0}),
      );
    } finally {
      await vm.dispose();
    }
  } catch (e) {
    stderr.writeln(
      jsonEncode({
        'passed': false,
        'step': step,
        'exit': exited,
        'error': e.toString(),
        'nativeErrors': lines
            .where((l) => l.contains('Failed to update ui::AXTree'))
            .take(3)
            .toList(),
      }),
    );
    exitCode = 1;
  } finally {
    if (exited == null) {
      p.kill();
      await p.exitCode.timeout(
        const Duration(seconds: 5),
        onTimeout: () {
          p.kill(ProcessSignal.sigkill);
          return -1;
        },
      );
    }
    await File('${root.path}/native.log').writeAsString(
      lines
          .join('\n')
          .replaceAll(
            RegExp(r'http://127\.0\.0\.1:[^\s]+'),
            '[LOCAL_SERVICE_URL]',
          ),
    );
    stdout.writeln('EVIDENCE=${root.path}');
  }
}
