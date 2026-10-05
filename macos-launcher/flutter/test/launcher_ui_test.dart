import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class UiNative extends NativeBridge {
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': '/fixture',
    'dataRoot': '/fixture',
    'home': '/fixture',
    'appVersion': '0.2.3',
    'loginStatus': 'disabled',
  });
}

void main() {
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
