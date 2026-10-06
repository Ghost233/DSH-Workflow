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
    'passive sample selects one pending public status and preserves replies',
    () async {
      final root = await Directory('/private/tmp')
          .createTemp('dsh-t05-sample-hook-');
      final actor = await Process.start('/bin/sh', [
        '-c',
        'read -r release; exit 23',
      ]);
      final server = await LauncherServer.start(
        layout: EndpointLayout(directory: '${root.path}/manager'),
        bindings: InMemoryBindingLookup({'dsh-workflow'}),
      );
      final samples = <int>[];
      final events = <String>[];
      final sampled = Completer<void>();
      final trace = T05SdkTrace(
        server,
        applicationPid: actor.pid,
        applicationExit: actor.exitCode,
        record: (event, _) => events.add(event),
        samplePendingStatus: (count) async {
          samples.add(count);
          sampled.complete();
        },
      );
      final releaseSecond = Completer<void>(), releaseThird = Completer<void>();
      final enteredSecond = Completer<void>(), enteredThird = Completer<void>();
      final releaseFourth = Completer<void>(),
          enteredFourth = Completer<void>();
      var calls = 0;
      final sdk = MacLauncherSdk.connect(
        projectId: 'dsh-workflow',
        socketPath: server.layout.socketPath,
        services: {
          'web': ServiceCallbacks(
            name: 'Web',
            onStatus: () async {
              calls++;
              if (calls == 2) {
                enteredSecond.complete();
                await releaseSecond.future;
              }
              if (calls == 3) {
                enteredThird.complete();
                await releaseThird.future;
              }
              if (calls == 4) {
                enteredFourth.complete();
                await releaseFourth.future;
              }
              return ServiceStatus(state: ServiceState.starting, ready: false);
            },
          ),
        },
      );
      try {
        final session = await currentSdkSession(server);
        final fast = await trace.sendRequest(session, 'status');
        expect((fast['result'] as Map)['ready'], false);
        await Future<void>.delayed(const Duration(milliseconds: 2100));
        expect(samples, isEmpty);
        final second = trace.sendRequest(session, 'status');
        await enteredSecond.future;
        await sampled.future;
        expect(samples, [2]);
        releaseSecond.complete();
        expect((await second)['result'], fast['result']);
        final third = trace.sendRequest(session, 'status');
        await enteredThird.future;
        await Future<void>.delayed(const Duration(milliseconds: 2100));
        expect(samples, [2]);
        releaseThird.complete();
        expect((await third)['result'], fast['result']);
        final fourth = trace.sendRequest(session, 'status');
        final lost = expectLater(
          fourth,
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'original error',
              'connection lost',
            ),
          ),
        );
        await enteredFourth.future;
        await trace.close();
        final closedEvents = events.length;
        await sdk.dispose();
        await lost;
        releaseFourth.complete();
        await Future<void>.delayed(Duration.zero);
        expect(events.length, closedEvents);
        expect(samples, [2]);
      } finally {
        if (!releaseSecond.isCompleted) releaseSecond.complete();
        if (!releaseThird.isCompleted) releaseThird.complete();
        if (!releaseFourth.isCompleted) releaseFourth.complete();
        await trace.close();
        await sdk.dispose();
        await server.close();
        actor.stdin.writeln('release');
        await actor.stdin.close();
        expect(await actor.exitCode, 23);
        await root.delete(recursive: true);
      }
    },
  );
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
