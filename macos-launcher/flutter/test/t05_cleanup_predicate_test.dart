import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/web_application_scenario.dart'
    show runWebApplicationScenario, WebProbeOptions;
import '../tool/probe_diagnostics.dart' show desktopQuitFacts;

void main() {
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
