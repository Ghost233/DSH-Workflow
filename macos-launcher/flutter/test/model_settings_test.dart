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

class CodexSettingsNative extends ModelSettingsNative {
  final urls = <String>[];
  String? authFile;

  @override
  Future<void> openUrl(String url) async => urls.add(url);

  @override
  Future<String?> chooseCodexAuthFile() async => authFile;
}

class CodexSettingsController extends LauncherController {
  CodexSettingsController(super.native, {super.startProcess});

  int refreshCount = 0;

  @override
  Future<void> refreshModelSettings() async {
    refreshCount++;
    modelSettings = {
      'writable': true,
      'groups': [],
      'providers': [
        {
          'id': 'openai-codex',
          'displayName': 'Codex',
          'oauth': {'available': true, 'configured': true},
          'models': [],
        },
      ],
    };
    notifyListeners();
  }
}

class CodexImportController extends LauncherController {
  CodexImportController(super.native);
  Map<String, Object?>? request;

  @override
  Future<void> updateModelSettings(Map<String, Object?> value) async {
    request = value;
  }
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

  testWidgets('Codex login opens the browser and refreshes its saved status', (
    tester,
  ) async {
    final root = (await tester.runAsync(
      () => Directory.systemTemp.createTemp('station-codex-ui-'),
    ))!;
    final receipt = File('${root.path}/received');
    final native = CodexSettingsNative();
    final model = CodexSettingsController(
      native,
      startProcess: (executable, arguments, {workingDirectory, environment}) {
        if (arguments.any(
          (value) => value.endsWith('model-authorization.mjs'),
        )) {
          return Process.start('/usr/bin/python3', [
            '-u',
            '-c',
            r'''
import json, sys
print(json.dumps({'type': 'open', 'url': 'https://auth.openai.com/oauth/authorize?state=fixture'}), flush=True)
print(json.dumps({'type': 'prompt'}), flush=True)
message = json.loads(sys.stdin.readline())
assert message == {'type': 'answer', 'value': 'http://localhost:1455/auth/callback?code=fixture&state=fixture'}
with open(sys.argv[1], 'w') as f: f.write('received')
print(json.dumps({'type': 'authorized'}), flush=True)
''',
            receipt.path,
          ]);
        }
        throw StateError('unexpected helper');
      },
    );
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'groups': [],
      'providers': [
        {
          'id': 'openai-codex',
          'displayName': 'Codex',
          'oauth': {'available': true, 'configured': false},
          'models': [],
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      expect(find.textContaining('ChatGPT 未授权'), findsOneWidget);
      await tester.tap(find.text('添加认证'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('浏览器登录'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (native.urls.isEmpty) {
          if (DateTime.now().isAfter(deadline)) {
            throw StateError('browser was not opened');
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.pumpAndSettle();
      expect(
        native.urls.single,
        startsWith('https://auth.openai.com/oauth/authorize'),
      );
      await tester.enterText(
        find.widgetWithText(TextField, '回调地址'),
        'http://localhost:1455/auth/callback?code=fixture&state=fixture',
      );
      await tester.tap(find.text('提交地址'));
      for (var attempt = 0; attempt < 100; attempt++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
        final providers = model.modelSettings?['providers'] as List? ?? [];
        final oauth = providers.isEmpty
            ? null
            : (providers.first as Map)['oauth'] as Map?;
        if (oauth?['configured'] == true &&
            find.text('ChatGPT 授权已保存。').evaluate().isNotEmpty) {
          break;
        }
      }
      expect(await tester.runAsync(receipt.exists), isTrue);
      final providers = model.modelSettings?['providers'] as List? ?? [];
      expect(((providers.first as Map)['oauth'] as Map)['configured'], isTrue);
      expect(model.refreshCount, 1);
      expect(find.text('ChatGPT 授权已保存。'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(model.close);
      model.dispose();
      await tester.runAsync(() => root.delete(recursive: true));
    }
  });

  testWidgets(
    'Codex device login displays the code and opens its verification page',
    (tester) async {
      final native = CodexSettingsNative();
      final model = LauncherController(
        native,
        startProcess: (executable, arguments, {workingDirectory, environment}) {
          expect(arguments, contains('device'));
          return Process.start('/usr/bin/python3', [
            '-u',
            '-c',
            r'''
import json, sys
print(json.dumps({'type': 'device', 'url': 'https://auth.openai.com/codex/device', 'code': 'ABCD-1234'}), flush=True)
sys.stdin.read()
''',
          ]);
        },
      );
      await model.initialize();
      model.modelSettings = {
        'writable': true,
        'groups': [],
        'providers': [
          {
            'id': 'openai-codex',
            'displayName': 'Codex',
            'oauth': {'available': true, 'configured': false},
            'models': [],
          },
        ],
      };
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: ModelSettingsPage(model: model)),
          ),
        );
        await tester.tap(find.text('添加认证'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('设备码登录'));
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          final deadline = DateTime.now().add(const Duration(seconds: 5));
          while (native.urls.isEmpty) {
            if (DateTime.now().isAfter(deadline)) {
              throw StateError('device URL was not opened');
            }
            await Future<void>.delayed(const Duration(milliseconds: 20));
          }
        });
        await tester.pumpAndSettle();
        expect(native.urls.single, 'https://auth.openai.com/codex/device');
        expect(find.text('ABCD-1234'), findsOneWidget);
        expect(find.text('复制设备码'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(model.close);
        model.dispose();
      }
    },
  );

  testWidgets(
    'Codex import sends only the chosen path and name to the private helper',
    (tester) async {
      final native = CodexSettingsNative()..authFile = '/selected/auth.json';
      final model = CodexImportController(native);
      await model.initialize();
      model.modelSettings = {
        'writable': true,
        'groups': [],
        'providers': [
          {
            'id': 'openai-codex',
            'displayName': 'Codex',
            'oauth': {'available': true, 'configured': false},
            'models': [],
          },
        ],
      };
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: ModelSettingsPage(model: model)),
          ),
        );
        await tester.tap(find.text('导入本地认证'));
        await tester.pumpAndSettle();
        expect(find.textContaining('另一边可能需要重新登录'), findsOneWidget);
        await tester.enterText(
          find.widgetWithText(TextField, '认证名称'),
          '我的 CLI',
        );
        await tester.tap(find.text('选择文件'));
        await tester.pumpAndSettle();
        expect(model.request, {
          'type': 'codex-import',
          'path': '/selected/auth.json',
          'name': '我的 CLI',
        });
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(model.close);
        model.dispose();
      }
    },
  );

  testWidgets('Codex accounts show the active profile and switch explicitly', (
    tester,
  ) async {
    final model = CodexImportController(CodexSettingsNative());
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'groups': [],
      'providers': [
        {
          'id': 'openai-codex',
          'displayName': 'Codex',
          'models': [],
          'oauth': {
            'available': true,
            'configured': true,
            'accounts': [
              {'id': 'existing', 'name': '日常账号', 'active': true},
              {
                'id': 'p-0123456789abcdef0123456789abcdef',
                'name': '项目账号',
                'active': false,
              },
            ],
          },
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      expect(find.text('日常账号'), findsOneWidget);
      expect(find.text('项目账号'), findsOneWidget);
      expect(find.text('当前使用'), findsOneWidget);
      await tester.tap(find.text('使用'));
      await tester.pump();
      expect(model.request, {
        'type': 'codex-select',
        'id': 'p-0123456789abcdef0123456789abcdef',
      });
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(model.close);
      model.dispose();
    }
  });

  testWidgets('Codex login reports failures without claiming authorization', (
    tester,
  ) async {
    final root = (await tester.runAsync(
      () => Directory.systemTemp.createTemp('station-codex-failure-'),
    ))!;
    final receipt = File('${root.path}/done');
    final model = LauncherController(
      CodexSettingsNative(),
      startProcess: (executable, arguments, {workingDirectory, environment}) =>
          Process.start('/usr/bin/python3', [
            '-u',
            '-c',
            r'''
import json, sys
print(json.dumps({'type':'error'}), flush=True)
with open(sys.argv[1], 'w') as f: f.write('done')
sys.exit(1)
''',
            receipt.path,
          ]),
    );
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'groups': [],
      'providers': [
        {
          'id': 'openai-codex',
          'displayName': 'Codex',
          'oauth': {'available': true, 'configured': false},
          'models': [],
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      await tester.tap(find.text('添加认证'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('浏览器登录'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (!await receipt.exists()) {
          if (DateTime.now().isAfter(deadline)) {
            throw StateError('failure was not emitted');
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.pumpAndSettle();
      expect(find.text('Codex 登录失败，请检查网络和授权后重试。'), findsOneWidget);
      expect(find.text('ChatGPT 授权已保存。'), findsNothing);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(model.close);
      model.dispose();
      await tester.runAsync(() => root.delete(recursive: true));
    }
  });

  testWidgets('closing the Codex login cancels its helper', (tester) async {
    final root = (await tester.runAsync(
      () => Directory.systemTemp.createTemp('station-codex-cancel-ui-'),
    ))!;
    final ready = File('${root.path}/ready'),
        cancelled = File('${root.path}/cancelled');
    final model = LauncherController(
      CodexSettingsNative(),
      startProcess: (executable, arguments, {workingDirectory, environment}) =>
          Process.start('/usr/bin/python3', [
            '-u',
            '-c',
            r'''
import sys
with open(sys.argv[1], 'w') as f: f.write('ready')
sys.stdin.read()
with open(sys.argv[2], 'w') as f: f.write('cancelled')
''',
            ready.path,
            cancelled.path,
          ]),
    );
    await model.initialize();
    model.modelSettings = {
      'writable': true,
      'groups': [],
      'providers': [
        {
          'id': 'openai-codex',
          'displayName': 'Codex',
          'oauth': {'available': true, 'configured': false},
          'models': [],
        },
      ],
    };
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelSettingsPage(model: model)),
        ),
      );
      await tester.tap(find.text('添加认证'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('浏览器登录'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (!await ready.exists()) {
          if (DateTime.now().isAfter(deadline)) {
            throw StateError('helper did not start');
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (!await cancelled.exists()) {
          if (DateTime.now().isAfter(deadline)) {
            throw StateError('helper was not cancelled');
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
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
