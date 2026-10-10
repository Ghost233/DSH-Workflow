import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class UiNative extends NativeBridge {
  UiNative({this.loginStatus = 'disabled'});
  String loginStatus;
  bool running = false, hidden = false, hideWindowOnStart = false;
  @override
  Future<void> showWindow() async {}
  @override
  Future<bool> desktopRunning(String path) async => running;
  @override
  Future<void> hideDesktop(String path) async {
    if (!running) throw StateError('Desktop 未运行，请先启动');
    hidden = true;
  }

  @override
  Future<void> showDesktop(String path) async {
    if (!running) throw StateError('Desktop 未运行，请先启动');
    hidden = false;
  }

  @override
  Future<void> savePreferences(
    bool fullAccess,
    bool allowLanSettings, {
    required bool hideWindowOnStart,
  }) async {
    this.hideWindowOnStart = hideWindowOnStart;
  }

  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': '/fixture',
    'dataRoot': '/fixture',
    'home': '/fixture',
    'appVersion': '0.2.3',
    'loginStatus': loginStatus,
    'hideWindowOnStart': hideWindowOnStart,
  });

  @override
  Future<String> setLoginEnabled(bool enabled) async {
    if (enabled) throw StateError('This fixture only accepts unregistration');
    loginStatus = 'notRegistered';
    return loginStatus;
  }
}

void main() {
  testWidgets(
    'Desktop window controls retain missing state, reuse and startup preference',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final native = UiNative();
      final model = LauncherController(native);
      await model.initialize();
      await tester.pumpWidget(LauncherApp(controller: model));
      for (final label in ['后台启动', '启动后显示', '隐藏窗口', '仅显示已运行窗口']) {
        expect(find.text(label), findsOneWidget);
      }
      await tester.tap(find.text('仅显示已运行窗口'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Desktop 未运行'), findsOneWidget);
      expect(native.running, isFalse);
      native.running = true;
      await tester.tap(find.text('后台启动'));
      await tester.pumpAndSettle();
      expect(native.hidden, isFalse);
      expect(find.textContaining('Desktop 未运行'), findsNothing);
      await tester.tap(find.text('隐藏窗口'));
      await tester.pumpAndSettle();
      expect(native.hidden, isTrue);
      await tester.tap(find.text('启动后显示'));
      await tester.pumpAndSettle();
      expect(native.hidden, isFalse);
      final preference = find.ancestor(
        of: find.text('启动时隐藏窗口'),
        matching: find.byType(SwitchListTile),
      );
      expect(tester.widget<SwitchListTile>(preference).value, isFalse);
      await tester.ensureVisible(preference);
      await tester.tap(preference);
      await tester.pumpAndSettle();
      expect(native.hideWindowOnStart, isTrue);
      await model.initialize();
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(preference).value, isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await model.close();
      model.dispose();
    },
  );
  testWidgets('pending system approval is shown and can be cancelled', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = LauncherController(UiNative(loginStatus: 'requiresApproval'));
    await model.initialize();
    await tester.pumpWidget(LauncherApp(controller: model));
    final choice = find.ancestor(
      of: find.text('登录后启动应用'),
      matching: find.byType(SwitchListTile),
    );
    expect(find.text('登录启动：需要系统批准。请在系统设置的登录项中允许启动。'), findsOneWidget);
    expect(tester.widget<SwitchListTile>(choice).value, isTrue);
    await tester.tap(choice.hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('登录启动：未注册'), findsOneWidget);
    expect(tester.widget<SwitchListTile>(choice).value, isFalse);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await model.close();
    model.dispose();
  });

  testWidgets(
    'management, plugin and log pages fit the minimum native window',
    (tester) async {
      tester.view.physicalSize = const Size(780, 560);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = LauncherController(UiNative());
      await model.initialize();
      model.setSdkMessage('disconnected: ${'connection details ' * 30}');
      model.plugins = [
        PluginRow({
          'name': 'a-project-maintained-plugin',
          'source': 'project',
          'status': 'current',
        }),
      ];
      await tester.pumpWidget(LauncherApp(controller: model));
      expect(find.text('启动 Web'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('插件'));
      await tester.pumpAndSettle();
      expect(find.text('a-project-maintained-plugin'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('日志'));
      await tester.pumpAndSettle();
      expect(find.text('Web 业务进程日志'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await model.close();
      model.dispose();
    },
  );
}
