import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';

class DesktopNative extends NativeBridge {
  DesktopNative(this.root, this.resources);
  final String root, resources;
  int opens = 0;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
  });
  @override
  Future<bool> desktopRunning(String path) async => false;
  @override
  Future<void> openDesktop(
    String path, {
    required Map<String, String> environment,
    bool hidden = false,
  }) async {
    opens++;
  }
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test('opening desktop with no service reports unavailable and leaves the service stopped', () async {
    final root = await Directory.systemTemp.createTemp('dsh-desktop-stopped-');
    final resources = '${root.path}/resources';
    final staged = await Process.run(
      Platform.environment['DSH_TEST_NODE'] ?? 'node',
      ['tool/independent_service_resources.mjs', artifact!, resources],
    );
    expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
    final native = DesktopNative(root.path, resources);
    final model = LauncherController(native);
    try {
      await model.initialize();
      await expectLater(
        model.startDesktop(),
        throwsA(
          isA<StateError>().having(
            (failure) => failure.message,
            'explicit service error',
            contains('DSH 服务未启动'),
          ),
        ),
      );
      expect(native.opens, 0);
      expect(
        await File('${root.path}/global/.dsh-workflow/service/manager.json')
            .exists(),
        false,
      );
      expect(
        await File(
          '${root.path}/global/.dsh-workflow/desktop-bundle/integration.json',
        ).exists(),
        false,
        reason: 'Opening a client must not prepare or rewrite the running service profile',
      );
    } finally {
      await model.close();
      model.dispose();
      await root.delete(recursive: true);
    }
  }, skip: artifact == null ? 'Requires frozen packaged resources' : false);
}
