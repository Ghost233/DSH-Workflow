import 'dart:io';
import 'dart:convert';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:dsh_workflow_launcher/model_settings_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class ModelSettingsNative extends NativeBridge {
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': '/fixture',
    'dataRoot': '/fixture',
    'home': '/fixture',
    'appVersion': '0.5.2',
    'loginStatus': 'disabled',
  });
}

void main() {
  test(
    'model settings use the private process input and refresh after saving',
    () async {
      final model = LauncherController(
        ModelSettingsNative(),
        startProcess: (executable, arguments, {workingDirectory, environment}) {
          expect(
            arguments.any((value) => value.contains('fixture-secret')),
            isFalse,
          );
          return Process.start('/usr/bin/python3', [
            '-c',
            r'''
import json, sys
request = json.load(sys.stdin)
if request['type'] == 'save':
  assert request['key'] == 'fixture-secret'
  result = {'saved': True}
else:
  assert request['type'] == 'list'
  result = {'providers': [], 'groups': [], 'writable': True, 'piRevision': 1}
print(json.dumps({'ok': True, 'value': result}))
''',
          ]);
        },
      );
      await model.initialize();
      try {
        await model.refreshModelSettings();
        expect(model.modelSettings?['writable'], isTrue);
        await model.updateModelSettings({
          'type': 'save',
          'key': 'fixture-secret',
        });
        expect(model.modelSettings?['providers'], isEmpty);
        expect(model.loadingModelSettings, isFalse);
      } finally {
        await model.close();
        model.dispose();
      }
    },
  );

  testWidgets('editing a provider saves its model configuration from Station', (
    tester,
  ) async {
    final root = (await tester.runAsync(
      () => Directory.systemTemp.createTemp('station-model-ui-'),
    ))!;
    final receipt = File('${root.path}/request.json');
    final model = LauncherController(
      ModelSettingsNative(),
      startProcess: (executable, arguments, {workingDirectory, environment}) =>
          Process.start('/usr/bin/python3', [
            '-c',
            r'''
import json, sys
request = json.load(sys.stdin)
if request['type'] == 'save':
  with open(sys.argv[1], 'w') as f: json.dump(request, f)
  value = {'saved': True}
else:
  value = {'writable': True, 'providers': [], 'groups': [], 'availableProviders': [], 'piRevision': 4}
print(json.dumps({'ok': True, 'value': value}))
''',
            receipt.path,
          ]),
    );
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'piRevision': 4,
      'groups': [],
      'availableProviders': [],
      'providers': [
        {
          'id': 'sample',
          'displayName': 'Sample',
          'configuredDisplayName': 'Sample',
          'namespace': 'llm-pi-ai',
          'revision': 4,
          'api': 'openai-completions',
          'baseURL': 'https://example.invalid/v1',
          'models': ['model-a'],
          'credentialConfigured': true,
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      expect(find.textContaining('Sample'), findsOneWidget);
      await tester.tap(find.text('编辑'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, '显示名称（可选）'),
        'Updated',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'API Key'),
        'fixture-secret',
      );
      await tester.runAsync(() async {
        await tester.tap(find.text('保存'));
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (!await receipt.exists()) {
          if (DateTime.now().isAfter(deadline)) {
            throw StateError('model settings were not saved');
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.pumpAndSettle();
      final request =
          jsonDecode((await tester.runAsync(receipt.readAsString))!) as Map;
      expect(request['id'], 'sample');
      expect(request['displayName'], 'Updated');
      expect(request['key'], 'fixture-secret');
      expect(request['models'], ['model-a']);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(model.close);
      model.dispose();
      await tester.runAsync(() => root.delete(recursive: true));
    }
  });

  testWidgets('long model names fit the minimum Station window', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(780, 560);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = LauncherController(ModelSettingsNative());
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'piRevision': 1,
      'defaultRevision': 1,
      'defaultModel': {'provider': 'sample', 'model': 'm'},
      'availableProviders': [],
      'providers': [
        {
          'id': 'sample',
          'displayName': 'A very long provider name ' * 8,
          'namespace': 'llm-pi-ai',
          'revision': 1,
          'models': ['m'],
          'credentialConfigured': false,
        },
      ],
      'groups': [
        {
          'id': 'sample',
          'name': 'Long provider ' * 12,
          'models': [
            {'id': 'm', 'name': 'Long model name ' * 12},
          ],
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('设为默认'), findsOneWidget);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await model.close();
      model.dispose();
    }
  });
}
