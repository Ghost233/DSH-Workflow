import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/probe_diagnostics.dart';

void main() {
  test(
    'headless health owns the actual spawned Host and rejects a replaced lease',
    () async {
      final created = await Directory.systemTemp.createTemp(
        'host-identity-runner-',
      );
      final runner = Directory(await created.resolveSymbolicLinks());
      final root = await runner.createTemp('dsh-t06-');
      addTearDown(() => runner.delete(recursive: true));
      final config = jsonDecode(
        await File('.dart_tool/package_config.json').readAsString(),
      ) as Map;
      final dart = Directory.fromUri(Uri.parse(config['flutterRoot'] as String))
          .uri
          .resolve('bin/cache/dart-sdk/bin/dart')
          .toFilePath();
      final result = await Process.run(
        dart,
        [
          'tool/headless_host_identity_fixture.dart',
          root.path,
          '--bind-owned-owner',
        ],
        environment: {
          ...Platform.environment,
          'GITHUB_ACTIONS': 'true',
          'RUNNER_TEMP': runner.path,
        },
      );
      expect(result.exitCode, 0, reason: '${result.stdout}${result.stderr}');
      expect(
        result.stdout,
        contains('OWNED_HEADLESS_IDENTITY_AND_EXACT_LEASE_VERIFIED'),
      );
      final binding =
          (await File('${root.path}/host-ownership.jsonl').readAsLines())
                  .map(jsonDecode)
                  .firstWhere((row) => row['ownershipKnown'] == true)
              as Map;
      expect(binding['ownerType'], 'headless');
      final original = (binding['inspection'] as Map).cast<String, Object?>();
      expect(hostIdentityUnchanged(original, original), true);
      for (final key in [
        'pid',
        'parentPid',
        'uid',
        'executable',
        'startUnixSeconds',
      ]) {
        expect(
          hostIdentityUnchanged(original, {...original, key: null}),
          false,
          reason: key,
        );
      }
      expect(
        hostIdentityUnchanged(original, {
          ...original,
          'startUnixSeconds': (original['startUnixSeconds'] as num) + 1,
        }),
        false,
      );
    },
  );
}
