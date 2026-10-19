import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

class _Native extends NativeBridge {
  _Native(this.root);
  final String root;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': root,
    'dataRoot': root,
    'home': root,
    'appVersion': '0.3.3',
    'loginStatus': 'disabled',
  });
}

// Substitute only the external CLI transport; the real application and
// controller handle lifecycle changes, snapshots and notification streams.
class _Query extends Fake implements Process {
  _Query(List<Map> requests) {
    stdin = IOSink(_input.sink);
    final bytes = <int>[];
    _input.stream.listen(
      bytes.addAll,
      onDone: () {
        requests.add(jsonDecode(utf8.decode(bytes)) as Map);
        _output.add(
          utf8.encode(
            jsonEncode({
              'ok': true,
              'value': {
                'service': {
                  'state': 'running',
                  'ready': true,
                  'instanceId': 'live',
                },
                'web': {
                  'state': 'running',
                  'ready': true,
                  'instanceId': 'live',
                },
                'logs': [],
              },
            }),
          ),
        );
        unawaited(_output.close());
        _exit.complete(0);
      },
    );
  }
  final _input = StreamController<List<int>>();
  final _output = StreamController<List<int>>();
  final _exit = Completer<int>();
  @override
  late final IOSink stdin;
  @override
  Stream<List<int>> get stdout => _output.stream;
  @override
  Stream<List<int>> get stderr => const Stream.empty();
  @override
  Future<int> get exitCode => _exit.future;
}

class _EventInput extends Fake implements IOSink {
  _EventInput(this.events);
  final _Events events;
  @override
  void writeln([Object? object = '']) {
    if (object == 'refresh') events.refreshes++;
  }

  @override
  Future<void> close() async {
    unawaited(events._output.close());
    if (!events._exit.isCompleted) events._exit.complete(0);
  }
}

class _Events extends Fake implements Process {
  _Events() {
    stdin = _EventInput(this);
  }
  int refreshes = 0;
  final _output = StreamController<List<int>>();
  final _exit = Completer<int>();
  void emit(String source, Map value) => _output.add(
    utf8.encode('${jsonEncode({'source': source, 'value': value})}\n'),
  );
  void missing(String source) => _output.add(
    utf8.encode(
      '${jsonEncode({'source': source, 'missing': true, 'error': 'gone'})}\n',
    ),
  );
  @override
  late final IOSink stdin;
  @override
  Stream<List<int>> get stdout => _output.stream;
  @override
  Stream<List<int>> get stderr => const Stream.empty();
  @override
  Future<int> get exitCode => _exit.future;
}

Future<Directory> _resources({bool events = false}) async {
  final root = await Directory('/private/tmp').createTemp('dsh-notifications-');
  final runtime = await Directory(
    '${root.path}/workflow/macos-launcher/runtime',
  ).create(recursive: true);
  for (final name in [
    'service-cli.mjs',
    'web-cli.mjs',
    if (events) 'launcher-events.mjs',
  ]) {
    await File('${runtime.path}/$name').writeAsString('');
  }
  return root;
}

void main() {
  testWidgets(
    'visible and hidden launcher never poll; opening its window reads status once',
    (tester) async {
      final root = (await tester.runAsync(() => _resources()))!;
      final requests = <Map>[];
      final model = LauncherController(
        _Native(root.path),
        startProcess: (
          executable,
          arguments, {
          workingDirectory,
          environment,
        }) async => _Query(requests),
      );
      addTearDown(() async {
        await model.close();
        model.dispose();
        await root.delete(recursive: true);
      });
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await model.initialize();
      await tester.pumpWidget(LauncherApp(controller: model));
      expect(requests.length, 2);
      await tester.pump(const Duration(minutes: 5));
      await tester.pump();
      expect(requests.length, 2, reason: 'visible launchers must not poll');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump(const Duration(minutes: 5));
      await tester.pump();
      expect(requests.length, 2, reason: 'unfocused windows must not poll');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      await tester.pump(const Duration(minutes: 5));
      await tester.pump();
      expect(requests.length, 2, reason: 'hidden launchers must not poll');
      await model.serviceStatus();
      await model.webStatus();
      expect(
        requests.length,
        4,
        reason: 'explicit SDK reads remain available while hidden',
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(
        requests.length,
        6,
        reason: 'showing a window refreshes both snapshots',
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(minutes: 5));
      await tester.pump();
      expect(requests.length, 6);
      await tester.pumpWidget(const SizedBox());
    },
  );

  test('pushed snapshots update hidden launchers, reconnect on window open and close without task commands', () async {
    final root = await _resources(events: true);
    final requests = <Map>[];
    final subscriptions = <_Events>[];
    final model = LauncherController(
      _Native(root.path),
      startProcess:
          (executable, arguments, {workingDirectory, environment}) async {
            if (arguments.first.endsWith('launcher-events.mjs')) {
              final events = _Events();
              subscriptions.add(events);
              return events;
            }
            return _Query(requests);
          },
    );
    Future<void> settled() => Future<void>.delayed(Duration.zero);
    Map<String, Object?> service(String id) => {
      'service': {'state': 'running', 'ready': true, 'instanceId': id},
      'logs': [
        {'text': 'service changed'},
      ],
    };
    Map<String, Object?> web(String id) => {
      'web': {
        'state': 'running',
        'ready': true,
        'instanceId': id,
        'url': 'http://127.0.0.1:33080/',
      },
      'logs': [
        {'text': 'web changed'},
      ],
    };
    try {
      await model.initialize();
      expect(subscriptions.length, 1);
      expect(requests.length, 2);
      final events = subscriptions.single;
      events.emit('service', service('pushed'));
      events.emit('web', web('pushed-web'));
      await settled();
      expect(model.serviceSnapshot.instanceId, 'pushed');
      expect(model.snapshot.instanceId, 'pushed-web');
      expect(model.serviceLogEntries.single.text, 'service changed');
      expect(model.logs.single.text, 'web changed');
      expect(model.webUrl, isNotNull);
      events.missing('web');
      await settled();
      expect(model.snapshot.state, ServiceState.stopped);
      expect(model.webUrl, isNull);
      expect(requests.length, 2, reason: 'pushes must not start CLI queries');
      model.setWindowVisible(false);
      events.emit('service', service('background'));
      await settled();
      expect(model.serviceSnapshot.instanceId, 'background');
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(requests.length, 2);
      await events.stdin.close();
      await settled();
      expect(model.serviceSnapshot.state, ServiceState.unknown);
      expect(model.snapshot.state, ServiceState.unknown);
      await Future.wait([
        model.refreshWindowStatus(),
        model.refreshWindowStatus(),
      ]);
      expect(subscriptions.length, 2);
      expect(requests.length, 4);
      subscriptions.last.emit('service', service('reconnected'));
      await settled();
      expect(model.serviceSnapshot.instanceId, 'reconnected');
      expect(model.error, isEmpty);
      expect(requests.every((request) => request['type'] == 'status'), isTrue);
      await model.close();
      expect(subscriptions.last._exit.isCompleted, isTrue);
    } finally {
      await model.close();
      model.dispose();
      await root.delete(recursive: true);
    }
  });
}
