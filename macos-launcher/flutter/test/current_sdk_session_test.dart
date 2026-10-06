import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import '../tool/application_probe.dart' show waitFor;
import '../tool/web_application_scenario.dart' show currentSdkSession;

void main() {
  test(
    'missing current SDK connection fails at the existing bounded check',
    () async {
      final folder = await Directory.systemTemp.createTemp('dsh-missing-sdk-');
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${folder.path}/manager'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      try {
        await expectLater(
          currentSdkSession(server),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'bounded failure',
              contains('current official SDK connection'),
            ),
          ),
        );
      } finally {
        await server.close();
        await folder.delete(recursive: true);
      }
    },
  );
  test(
    'public nullable session lookup waits for a real SDK reconnect',
    () async {
      final folder = await Directory.systemTemp.createTemp('dsh-current-sdk-');
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${folder.path}/manager'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      MacLauncherSdk connect() => MacLauncherSdk.connect(
        projectId: 'dsh-workflow',
        socketPath: server.layout.socketPath,
        services: {
          'web': ServiceCallbacks(
            name: 'Web',
            onStatus: () async =>
                ServiceStatus(state: ServiceState.running, ready: true),
          ),
        },
      );
      MacLauncherSdk? first, replacement;
      try {
        expect(server.sessionFor('dsh-workflow'), isNull);
        final pending = currentSdkSession(server);
        await Future<void>.delayed(const Duration(milliseconds: 150));
        first = connect();
        final firstSession = await pending;
        final reply = await firstSession.sendRequest(
          'status',
          serviceId: 'web',
          timeout: const Duration(seconds: 3),
        );
        expect((reply['result'] as Map)['ready'], isTrue);
        await first.dispose();
        first = null;
        await waitFor(
          'actual SDK disconnect',
          () async => server.sessionFor('dsh-workflow') == null,
        );
        final reconnect = currentSdkSession(server);
        await Future<void>.delayed(const Duration(milliseconds: 150));
        replacement = connect();
        final current = await reconnect;
        expect(
          current.launcherSessionId,
          isNot(firstSession.launcherSessionId),
        );
        expect(identical(current, server.sessionFor('dsh-workflow')), isTrue);
        final second = await current.sendRequest(
          'status',
          serviceId: 'web',
          timeout: const Duration(seconds: 3),
        );
        expect((second['result'] as Map)['ready'], isTrue);
      } finally {
        await first?.dispose();
        await replacement?.dispose();
        await server.close();
        await folder.delete(recursive: true);
      }
    },
  );
}
