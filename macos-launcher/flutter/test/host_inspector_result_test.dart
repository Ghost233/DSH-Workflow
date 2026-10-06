import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/probe_diagnostics.dart';

Future<ProcessResult> runFixture(
  Directory root,
  Directory runner, {
  bool reject = false,
}) async {
  final config = jsonDecode(
    await File('.dart_tool/package_config.json').readAsString(),
  ) as Map;
  final dart = Directory.fromUri(Uri.parse(config['flutterRoot'] as String)).uri
      .resolve('bin/cache/dart-sdk/bin/dart')
      .toFilePath();
  return Process.run(
    dart,
    [
      'test/fixtures/host_inspector_failure.dart',
      root.path,
      if (reject) '--guard',
    ],
    environment: {
      ...Platform.environment,
      'GITHUB_ACTIONS': 'true',
      'RUNNER_TEMP': runner.path,
    },
  );
}

void main() {
  test(
    'the real failed inspector call preserves capped safe stderr and exit',
    () async {
      final created = await Directory.systemTemp.createTemp(
        'inspector-result-runner-',
      );
      final runner = Directory(await created.resolveSymbolicLinks());
      final root = await Directory('${runner.path}/dsh-t05-owned').create();
      addTearDown(() => runner.delete(recursive: true));
      final result = await runFixture(root, runner);
      expect(result.exitCode, 0, reason: '${result.stdout}${result.stderr}');
      final rows = (await File(
        '${root.path}/host-inspection-results.jsonl',
      ).readAsLines()).map(jsonDecode).toList();
      expect(rows, isNotEmpty);
      expect(rows.first['exit'], 2);
      expect(rows.first['state'], 'unknown');
      expect(rows.first['stderr'], contains('open file'));
      expect(rows.first['interpreter'], '/usr/bin/python3');
      expect(
        utf8.encode(rows.first['stderr'] as String).length,
        lessThanOrEqualTo(16384),
      );
    },
  );
  test('continuation secrets and VM tokens are dropped before the byte cap', () {
    final safe = safeInspectorOutput(
      'useful failure\npassword=\nsynthetic-cross-line-secret\n${'x' * 20000}',
    );
    expect(safe, contains('useful failure'));
    expect(safe, contains('<REDACTED>'));
    expect(safe, isNot(contains('synthetic-')));
    expect(
      utf8.encode(safeInspectorOutput('界' * 10000)).length,
      lessThanOrEqualTo(16384),
    );
    expect(
      safeInspectorOutput('http://127.0.0.1:1234/private-vm=/'),
      isNot(contains('private-vm')),
    );
  });
  test('IPv6 loopback VM capability is redacted by the new output entry', () {
    const capability = 'ws://[::1]:1234/kGEdxJOiq_Y=/ws';
    expect(safeInspectorOutput(capability), '<REDACTED_VM_URI>');
  });
  test(
    'unowned roots and symlink outputs never persist lower observation',
    () async {
      final created = await Directory.systemTemp.createTemp(
        'inspector-guard-runner-',
      );
      final runner = Directory(await created.resolveSymbolicLinks());
      addTearDown(() => runner.delete(recursive: true));
      final wrong = await Directory('${runner.path}/other').create();
      final rejected = await runFixture(wrong, runner, reject: true);
      expect(
        rejected.exitCode,
        0,
        reason: '${rejected.stdout}${rejected.stderr}',
      );
      expect(
        await File('${wrong.path}/host-inspection-results.jsonl').exists(),
        isFalse,
      );
      final root = await Directory('${runner.path}/dsh-t05-owned').create();
      final outside = File('${runner.path}/untouched');
      await outside.writeAsString('original');
      await Link('${root.path}/host-inspection-results.jsonl')
          .create(outside.path);
      final symlink = await runFixture(root, runner, reject: true);
      expect(symlink.exitCode, 0, reason: '${symlink.stdout}${symlink.stderr}');
      expect(await outside.readAsString(), 'original');
    },
  );
}
