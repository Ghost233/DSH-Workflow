import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/web_startup_wait.dart';

void main() {
  test(
    'a late real owned lease is accepted but the old lease is never accepted',
    () async {
      final root = await Directory.systemTemp.createTemp('t05-reopen-');
      final config = jsonDecode(
        await File('.dart_tool/package_config.json').readAsString(),
      ) as Map;
      final dart = Directory.fromUri(Uri.parse(config['flutterRoot'] as String))
          .uri
          .resolve('bin/cache/dart-sdk/bin/dart')
          .toFilePath();
      final child = await Process.start(dart, [
        'test/fixtures/reopen_lease_child.dart',
        root.path,
      ]);
      final errors = child.stderr.transform(utf8.decoder).join();
      await child.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .first;
      var complete = false;
      try {
        final waiting =
            waitForActualDesktopLease(
              oldLease: 'old',
              receipt: () async => (jsonDecode(
                await File('${root.path}/lease.json').readAsString(),
              ) as Map).cast<String, Object?>(),
              isOwned: (value) async =>
                  value['pid'] == child.pid && value['root'] == root.path,
              ui: () async => {'nodes': []},
              applicationExit: child.exitCode,
              dependencyFailure: () async => null,
            ).then((value) {
              complete = true;
              return value;
            });
        await Future<void>.delayed(const Duration(milliseconds: 220));
        expect(complete, isFalse);
        await File('${root.path}/release').writeAsString('ready');
        final value = await waiting.timeout(const Duration(seconds: 2));
        expect(value['lease'], 'new');
        expect(value['pid'], child.pid);
      } finally {
        await File('${root.path}/release').writeAsString('release');
        await File('${root.path}/stop').writeAsString('stop');
        expect(await child.exitCode, 23, reason: await errors);
        await root.delete(recursive: true);
      }
    },
  );
  test('trusted native startup failure rejects a new but unbound lease', () async {
    await expectLater(
      waitForActualDesktopLease(
        oldLease: 'old',
        receipt: () async => {'lease': 'new', 'pid': 123},
        isOwned: (_) async => false,
        ui: () async => {
          'nodes': [
            {
              'value':
                  'PlatformException(open-failed, owned fixture launch failed)',
            },
          ],
        },
        applicationExit: Completer<int>().future,
        dependencyFailure: () async => null,
      ),
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'trusted failure',
          contains('startup failure'),
        ),
      ),
    );
  });
  test(
    'actual child exit cancels a pending receipt read and no new read follows',
    () async {
      final config = jsonDecode(
        await File('.dart_tool/package_config.json').readAsString(),
      ) as Map;
      final dart = Directory.fromUri(Uri.parse(config['flutterRoot'] as String))
          .uri
          .resolve('bin/cache/dart-sdk/bin/dart')
          .toFilePath();
      final child = await Process.start(dart, [
        'test/fixtures/reopen_lease_child.dart',
        '--exit',
      ]);
      final pending = Completer<Map<String, Object?>?>();
      var reads = 0;
      final waiting = waitForActualDesktopLease(
        oldLease: 'old',
        receipt: () {
          reads++;
          return pending.future;
        },
        isOwned: (_) async => false,
        ui: () async => {'nodes': []},
        applicationExit: child.exitCode,
        dependencyFailure: () async => null,
      );
      await expectLater(
        waiting,
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'actual exit',
            contains('(29)'),
          ),
        ),
      );
      expect(await child.exitCode, 29);
      await child.stdout.drain<void>();
      await child.stderr.drain<void>();
      pending.complete({'lease': 'new', 'pid': child.pid});
      await Future<void>.delayed(Duration.zero);
      expect(reads, 1);
    },
  );
}
