import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/web_application_scenario.dart'
    show runWebApplicationScenario, WebProbeOptions, ownedReceiptAbsent;
import '../tool/probe_diagnostics.dart' show desktopQuitFacts;

void main() {
  test(
    'owned receipt absence requires ENOENT and exact private paths',
    () async {
      final temporary = await Directory.systemTemp.createTemp(
        'dsh-receipt-absence-',
      );
      final root = Directory(await temporary.resolveSymbolicLinks());
      final parent = await Directory('${root.path}/desktop').create();
      final receipt = File('${parent.path}/desktop-host.json');
      final sibling = await Directory('${root.path}/other').create();
      final target = await File('${sibling.path}/receipt.json')
          .writeAsString('private-canary');
      try {
        expect(await ownedReceiptAbsent(receipt), true);
        await receipt.writeAsString('{}');
        expect(await ownedReceiptAbsent(receipt), false);
        await receipt.delete();
        final leaf = await Link(receipt.path).create(target.path);
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await leaf.delete();
        final dangling = await Link(receipt.path)
            .create('${sibling.path}/missing.json');
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await dangling.delete();
        await parent.delete();
        final parentLink = await Link(parent.path).create(sibling.path);
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await parentLink.delete();
        await expectLater(
          ownedReceiptAbsent(receipt),
          throwsA(isA<FileSystemException>()),
        );
        await parent.create();
        await Directory(receipt.path).create();
        await expectLater(
          ownedReceiptAbsent(receipt),
          throwsA(isA<FileSystemException>()),
        );
      } finally {
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'body failure survives owned cleanup error and closes resources',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-cleanup-error-');
      final listener = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final client = HttpClient();
      final hostLog = File('${root.path}/host.log').openWrite();
      var bodyStarted = false;
      final actions = <String?>[];
      final host = await Process.start('/bin/sh', [
        '-c',
        'read -r shutdown; exit 17',
      ]);
      try {
        await expectLater(
          HttpOverrides.runZoned(
            () => runWebApplicationScenario(
              options: WebProbeOptions(root.path, 'desktop', listener.port),
              root: root,
              layout: EndpointLayout(directory: '${root.path}/manager'),
              manifestPath: '${root.path}/unused-manifest.json',
              port: listener.port,
              state: ([parameters]) async {
                actions.add(parameters?['action']);
                if (!bodyStarted) {
                  bodyStarted = true;
                  throw StateError('original-body-failure');
                }
                return {'native': <String, Object?>{}};
              },
              applicationExit: Future.value(0),
              ownsHostReceipt: (_) async => false,
              startupFailure: (_) async => null,
              tap: (_) async {},
              capture: (_) async {},
              settingsOwnedWebCleanup: true,
              prestartedHost: host,
              prestartedHostLog: hostLog,
            ),
            createHttpClient: (_) => client,
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'first failure',
              contains('original-body-failure'),
            ),
          ),
        );
        expect(actions, isNot(contains('quitDesktop')));
        expect(await host.exitCode, 17);
        await expectLater(
          () => client.getUrl(Uri.parse('http://127.0.0.1:${listener.port}/')),
          throwsStateError,
        );
        expect(() => hostLog.write('after cleanup'), throwsStateError);
      } finally {
        client.close(force: true);
        await host.exitCode;
        await hostLog.close();
        await listener.close(force: true);
        await root.delete(recursive: true);
      }
    },
  );
  test('unavailable quit facts remain unknown and raw reason is omitted', () {
    final missing = desktopQuitFacts(null);
    expect(missing.values.every((value) => value == null), true);
    final nilLookup = desktopQuitFacts({
      'expectedPid': 42,
      'lookupFound': false,
      'accepted': null,
      'hasTerminated': null,
      'reason': 'private-credential-value',
    });
    expect(nilLookup['lookupFound'], false);
    expect(nilLookup['accepted'], isNull);
    expect(nilLookup['hasTerminated'], isNull);
    expect(nilLookup.containsKey('reason'), false);
    final invalid = desktopQuitFacts({
      'expectedPid': '42',
      'lookupFound': 'false',
      'accepted': 1,
      'hasTerminated': 'true',
    });
    expect(invalid.values.every((value) => value == null), true);
  });
}
