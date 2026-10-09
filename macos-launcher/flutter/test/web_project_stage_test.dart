import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('stage uses current candidate project callers and leaves frozen upstream inputs unchanged', () async {
    final root = await Directory.systemTemp.createTemp('project-stage-caller-');
    final upstream = await Directory('${root.path}/upstream').create();
    final workflow = await Directory('${upstream.path}/workflow').create();
    await File('${workflow.path}/package.json')
        .writeAsString('{"name":"old-project-layer","exports":{}}');
    await File('${workflow.path}/dsh-runtime.json')
        .writeAsString(await File('../../dsh-runtime.json').readAsString());
    await Directory('${workflow.path}/previous-module').create();
    final canary = File('${workflow.path}/previous-module/do-not-ship.mjs');
    await canary.writeAsString('old project canary');
    for (final name in ['desktop', 'node_modules', 'bin']) {
      await Directory('${upstream.path}/$name').create();
    }
    final node = await Process.run('node', ['-p', 'process.execPath']);
    expect(node.exitCode, 0);
    await Link('${upstream.path}/node').create(node.stdout.toString().trim());
    final before = await File('${workflow.path}/package.json').readAsString();
    final configuration = jsonDecode(
      await File('.dart_tool/package_config.json').readAsString(),
    ) as Map;
    final dart = Directory.fromUri(
      Uri.parse(configuration['flutterRoot'] as String),
    ).uri.resolve('bin/cache/dart-sdk/bin/dart').toFilePath();
    try {
      final stage = await Process.run(dart, [
        'run',
        'tool/project_stage_probe.dart',
        upstream.path,
        '${root.path}/candidate',
      ]);
      expect(stage.exitCode, 0, reason: stage.stderr.toString());
      final evidence =
          jsonDecode(stage.stdout.toString().trim().split('\n').last) as Map;
      final caller = evidence['stagedCaller'] as Map;
      expect(caller['name'], 'dsh-workflow');
      expect(caller['caller'], 'function');
      expect(
        (caller['exports'] as Map)['./jev-center'],
        './agent-observation-plugin/src/jev-center-plugin.mjs',
      );
      final entries = (caller['entries'] as List).cast<Map>();
      final inserted = entries
          .expand((row) => (row['insert'] as List?) ?? [])
          .cast<Map>();
      expect(
        inserted.singleWhere(
          (row) => row['id'] == 'workflow-jev-center',
        )['name'],
        'dsh-workflow/jev-center',
      );
      expect(
        inserted.singleWhere(
          (row) => row['id'] == 'workflow-agent-monitor',
        )['name'],
        'dsh-workflow/agent-monitor',
      );
      expect(
        (entries.singleWhere((row) => row['id'] == 'web-runtime')['config']
            as Map)['openBrowser'],
        false,
      );
      expect(
        await Directory('${evidence['resources']}/workflow/previous-module')
            .exists(),
        false,
      );
      expect(
        await File('${workflow.path}/package.json').readAsString(),
        before,
      );
      expect(await canary.readAsString(), 'old project canary');
    } finally {
      await root.delete(recursive: true);
    }
  });
}
