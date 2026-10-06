import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import '../tool/web_application_scenario.dart'
    show currentSdkSession, T05SdkTrace;

void main() {
  test(
    'real pending transport failure is traced without retry or invented exit',
    () async {
      final root = await Directory('/private/tmp').createTemp('dsh-t05-trace-');
      final actor = await Process.start('/bin/sh', [
        '-c',
        'read -r release; exit 23',
      ]);
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/manager'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final events = <Map<String, Object?>>[];
      final trace = T05SdkTrace(
        server,
        applicationPid: actor.pid,
        applicationExit: actor.exitCode,
        record: (event, facts) => events.add({'event': event, ...facts}),
      );
      final entered = Completer<void>(), release = Completer<ServiceStatus>();
      var calls = 0;
      final sdk = MacLauncherSdk.connect(
        projectId: 'dsh-workflow',
        socketPath: server.layout.socketPath,
        services: {
          'web': ServiceCallbacks(
            name: 'Web',
            onStatus: () {
              calls++;
              entered.complete();
              return release.future;
            },
          ),
        },
      );
      MacLauncherSdk? replacement;
      try {
        final old = await currentSdkSession(server);
        final request = trace.sendRequest(
          old,
          'status',
          params: {'password': 'synthetic-private-trace-secret'},
        );
        final failed = expectLater(
          request,
          throwsA(
            isA<StateError>().having(
              (e) => e.message,
              'real lost',
              'connection lost',
            ),
          ),
        );
        await entered.future;
        await sdk.dispose();
        await failed;
        await old.done;
        await Future<void>.delayed(Duration.zero);
        expect(calls, 1);
        final error = events.singleWhere(
          (e) => e['event'] == 'sdk-request-error',
        );
        expect(error['appExitKnown'], false);
        expect(error['appExit'], isNull);
        expect(error['connectionCategory'], 'connection-lost');
        expect(
          events.indexOf(error),
          greaterThan(
            events.indexWhere((e) => e['event'] == 'sdk-request-start'),
          ),
        );
        expect(events.any((e) => e['event'] == 'sdk-session-done'), true);
        expect(
          events.any(
            (e) =>
                e['event'] == 'sdk-registry-change' &&
                e['registryRelation'] == 'null',
          ),
          true,
        );
        actor.stdin.writeln('release');
        await actor.stdin.flush();
        expect(await actor.exitCode, 23);
        await Future<void>.delayed(Duration.zero);
        replacement = MacLauncherSdk.connect(
          projectId: 'dsh-workflow',
          socketPath: server.layout.socketPath,
          services: {
            'web': ServiceCallbacks(
              name: 'Web',
              onStatus: () async =>
                  ServiceStatus(state: ServiceState.starting, ready: false),
            ),
          },
        );
        final current = await currentSdkSession(server);
        expect(current.launcherSessionId, isNot(old.launcherSessionId));
        final reply = await trace.sendRequest(current, 'status');
        expect((reply['result'] as Map)['ready'], false);
        final end = events.singleWhere((e) => e['event'] == 'sdk-request-end');
        expect(end['appExitKnown'], true);
        expect(end['appExit'], 23);
        expect(end['requestCount'], 2);
        expect(end['pid'], actor.pid);
        expect(
          jsonEncode(events),
          isNot(contains('synthetic-private-trace-secret')),
        );
      } finally {
        if (!release.isCompleted) {
          release.complete(
            ServiceStatus(state: ServiceState.stopped, ready: false),
          );
        }
        actor.stdin.writeln('release');
        await actor.stdin.close();
        await actor.exitCode;
        await trace.close();
        final count = events.length;
        await sdk.dispose();
        await replacement?.dispose();
        await server.close();
        await Future<void>.delayed(Duration.zero);
        expect(events.length, count);
        await root.delete(recursive: true);
      }
    },
  );
}
