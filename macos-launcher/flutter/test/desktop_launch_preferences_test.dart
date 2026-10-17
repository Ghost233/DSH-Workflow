import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import 'independent_desktop_test.dart' show DesktopNative;

class PreferenceNative extends DesktopNative {
  PreferenceNative(super.root, super.resources);
  bool failOpen = false, running = false, hidden = false;
  bool savedHideWindowOnStart = false;

  @override
  Future<bool> desktopRunning(String path) async => running;

  @override
  Future<void> openDesktop(
    String path, {
    required Map<String, String> environment,
    bool hidden = false,
  }) async {
    opens++;
    if (failOpen) throw StateError('Desktop open refused');
    running = true;
    this.hidden = hidden;
  }

  @override
  Future<void> showDesktop(String path) async {
    if (!running) throw StateError('Desktop 未运行');
    hidden = false;
  }

  @override
  Future<void> savePreferences(
    bool fullAccess,
    bool allowLanSettings, {
    required bool hideWindowOnStart,
  }) async {
    savedHideWindowOnStart = hideWindowOnStart;
  }
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  group('desktop launch preferences with an existing independent Host', () {
    late Directory root;
    late String resources;
    late PreferenceNative native;
    late LauncherController model;

    LauncherController controller(PreferenceNative boundary) =>
        LauncherController(
          boundary,
          startProcess:
              (executable, arguments, {workingDirectory, environment}) =>
                  Process.start(
                    executable,
                    arguments,
                    workingDirectory: workingDirectory,
                    environment: {
                      ...?environment,
                      'HOME': '${root.path}/os-home',
                      'ZDOTDIR': '${root.path}/os-home',
                      'TMPDIR': root.path,
                    },
                  ),
        );

    setUpAll(
      () => Future<void>.sync(() async {
        root = await Directory.systemTemp.createTemp(
          'dsh-desktop-preferences-',
        );
        resources = '${root.path}/resources';
        await Directory('${root.path}/os-home').create();
        final staged = await Process.run(
          Platform.environment['DSH_TEST_NODE'] ?? 'node',
          ['tool/independent_service_resources.mjs', artifact!, resources],
        );
        expect(staged.exitCode, 0, reason: '${staged.stdout}${staged.stderr}');
        final bootstrap = controller(PreferenceNative(root.path, resources));
        try {
          await bootstrap.initialize();
          await bootstrap.startService();
          expect((await bootstrap.serviceStatus()).ready, true);
        } finally {
          await bootstrap.close();
          bootstrap.dispose();
        }
      }).timeout(const Duration(seconds: 90)),
    );

    setUp(() async {
      native = PreferenceNative(root.path, resources);
      model = controller(native);
      await model.initialize();
      expect((await model.serviceStatus()).ready, true);
    });
    tearDown(() async {
      await model.close();
      model.dispose();
    });
    tearDownAll(() async {
      final manager = File(
        '${root.path}/global/.dsh-workflow/service/manager.json',
      );
      if (await manager.exists()) {
        Process.killPid(
          (jsonDecode(await manager.readAsString()) as Map)['pid'] as int,
          ProcessSignal.sigterm,
        );
        for (
          var attempt = 0;
          attempt < 400 && await manager.exists();
          attempt++
        ) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        expect(
          await manager.exists(),
          false,
          reason: 'Owned manager cleanup must finish',
        );
      }
      await root.delete(recursive: true);
    });

    test('cold pending retries after the native open failure', () async {
      native.failOpen = true;
      await expectLater(model.startDesktopInBackground(), throwsStateError);
      native.failOpen = false;
      await model.startDesktop();
      expect(native.opens, 2);
      expect(native.running, isTrue);
      expect(native.hidden, isFalse);
    });
    test(
      'cold pending retries a stopped Desktop before any Web READY',
      () async {
        await model.startDesktopInBackground();
        expect(native.hidden, isTrue);
        await model.startDesktop();
        expect(native.opens, 1);
        expect(native.hidden, isTrue);
        native.running = false;
        await model.startDesktop();
        expect(native.opens, 2);
        expect(native.running, isTrue);
        expect(native.hidden, isFalse);
      },
    );
    test('explicit open shows an existing hidden Desktop despite the startup preference', () async {
      native.running = true;
      native.hidden = true;
      await model.savePreferences(true, false, hideWindowOnStart: true);
      await model.openDsh();
      expect(native.running, isTrue);
      expect(native.hidden, isFalse);
      expect(native.opens, 0);
    });
    test(
      'background and automatic startup preserve a running visible Desktop',
      () async {
        native.running = true;
        await model.savePreferences(true, false, hideWindowOnStart: true);
        await model.startDesktopInBackground();
        await model.startDesktop();
        expect(native.running, isTrue);
        expect(native.hidden, isFalse);
        expect(native.opens, 0);
      },
    );
  }, skip: artifact == null ? 'Requires frozen packaged resources' : false);
}
