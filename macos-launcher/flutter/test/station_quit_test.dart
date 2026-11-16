import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';

class ExitNative extends NativeBridge {
  ExitNative(this.root);
  final String root;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': root,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.5.7',
    'loginStatus': 'disabled',
  });
  @override
  Future<void> showWindow() async {}
}

void main() {
  test('requesting quit prevents new DSH service work', () async {
    final directory = await Directory.systemTemp.createTemp('station-quit-ui-');
    final model = LauncherController(ExitNative(directory.path));
    try {
      await model.initialize();
      model.beginQuit();
      expect(model.exiting, true);
      expect(model.exitMessage, contains('正在退出'));
      await expectLater(model.startService(), throwsA(isA<StateError>()));
    } finally {
      await model.close();
      model.dispose();
      await directory.delete(recursive: true);
    }
  });
}
