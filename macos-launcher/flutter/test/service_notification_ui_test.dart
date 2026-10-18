import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _NotificationNative extends NativeBridge {
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': '/fixture-notification-ui',
    'dataRoot': '/fixture-notification-ui',
    'home': '/fixture-notification-ui',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
  });
}

// Only the external management-process response is substituted in this widget test.
// Real missing-helper handling is covered by service-notification-management.test.mjs.
class _ManagementReply implements Process {
  _ManagementReply(List<Map> requests) {
    stdin = IOSink(_input.sink);
    final bytes = <int>[];
    _input.stream.listen(
      bytes.addAll,
      onDone: () {
        final request = jsonDecode(utf8.decode(bytes)) as Map;
        requests.add(request);
        _output.add(
          utf8.encode(
            jsonEncode({
              'ok': true,
              'value': {
                'service': {'state': 'stopped', 'ready': false},
                'logs': [],
                'notificationAuthorization': {
                  'available': false,
                  'command': request['type'] == 'notification-status'
                      ? 'status'
                      : 'authorize',
                  'message': 'macOS 通知助手不可用，请查看服务日志。',
                  'submission': {'state': 'not-attempted'},
                  'delivery': {'state': 'unknown'},
                },
              },
            }),
          ),
        );
        unawaited(_output.close());
        unawaited(_errors.close());
        _exit.complete(0);
      },
    );
  }
  final _input = StreamController<List<int>>();
  final _output = StreamController<List<int>>();
  final _errors = StreamController<List<int>>();
  final _exit = Completer<int>();
  @override
  late final IOSink stdin;
  @override
  Stream<List<int>> get stdout => _output.stream;
  @override
  Stream<List<int>> get stderr => _errors.stream;
  @override
  Future<int> get exitCode => _exit.future;
  @override
  int get pid => 0;
  @override
  bool kill([ProcessSignal signal = ProcessSignal.sigterm]) => false;
}

void main() {
  testWidgets(
    'Launcher notification controls show management failure without starting a Host',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final requests = <Map>[];
      final model = LauncherController(
        _NotificationNative(),
        startProcess: (
          executable,
          arguments, {
          workingDirectory,
          environment,
        }) async => _ManagementReply(requests),
      );
      await model.initialize();
      addTearDown(() async {
        await model.close();
        model.dispose();
      });
      await tester.pumpWidget(LauncherApp(controller: model));
      expect(find.text('启用故障通知'), findsOneWidget);
      expect(requests, isEmpty);
      await tester.tap(find.text('启用故障通知'));
      await tester.pumpAndSettle();
      expect(requests.map((row) => row['type']), ['authorize-notifications']);
      expect(find.text('macOS 通知助手不可用，请查看服务日志。'), findsOneWidget);
      expect(find.text('DSH 服务：已停止'), findsOneWidget);
      await tester.tap(find.text('刷新通知状态'));
      await tester.pumpAndSettle();
      expect(requests.map((row) => row['type']), [
        'authorize-notifications',
        'notification-status',
      ]);
      expect(find.text('DSH 服务：已停止'), findsOneWidget);
      tester.view.physicalSize = const Size(780, 560);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final notifications = find.ancestor(
        of: find.text('启用故障通知'),
        matching: find.byType(Wrap),
      );
      final serviceControls = find.ancestor(
        of: find.text('启动 DSH 服务'),
        matching: find.byType(Wrap),
      );
      final webControls = find.ancestor(
        of: find.text('启动 Web'),
        matching: find.byType(Wrap),
      );
      expect(notifications, findsOneWidget);
      expect(
        find.descendant(of: notifications, matching: find.text('刷新通知状态')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: notifications, matching: find.text('启动 DSH 服务')),
        findsNothing,
      );
      expect(
        find.descendant(of: serviceControls, matching: find.text('启用故障通知')),
        findsNothing,
      );
      expect(
        find.descendant(of: webControls, matching: find.text('启用故障通知')),
        findsNothing,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
