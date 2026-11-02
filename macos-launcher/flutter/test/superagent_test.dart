import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/main.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

class SuperagentNative extends NativeBridge {
  SuperagentNative(this.root);
  final String root;
  String? opened;

  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': root,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.4.9',
    'loginStatus': 'disabled',
  });

  @override
  Future<void> openUrl(String url) async => opened = url;

  @override
  Future<String?> chooseProjectDirectory() async => '$root/project';

  @override
  Future<Uint8List?> feishuQRCode(String url) async => base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
  );
}

class SuperagentTestController extends LauncherController {
  SuperagentTestController(super.native);

  @override
  Future<Map<String, Object?>> superagentOnboarding(
    String action, [
    Map<String, Object?> input = const {},
  ]) async => switch (action) {
    'repositories' => {
      'user': {'login': 'alice', 'id': 123},
      'repositories': [
        {'name': 'alice/example', 'private': true, 'defaultBranch': 'main'},
      ],
    },
    'branches' => {
      'branches': ['main', 'dev'],
    },
    'inspect-project' => {
      'root': '${environment.dataRoot}/project',
      'matches': true,
    },
    'feishu-bots' => {'available': true, 'bots': []},
    'feishu-chats' => {
      'chats': [
        {'id': 'oc_fixture', 'name': '产品群'},
      ],
    },
    'feishu-members' => {
      'members': [
        {'id': 'ou_fixture', 'name': 'Alice'},
      ],
      'truncated': false,
    },
    _ => throw StateError('Unexpected action: $action'),
  };
}

Future<({Directory root, LauncherController model, SuperagentNative native})>
superagentFixture() async {
  final root = await Directory.systemTemp.createTemp('superagent-ui-');
  final node = (await Process.run('/usr/bin/which', [
    'node',
  ])).stdout.toString().trim();
  await Link('${root.path}/node').create(node);
  final scripts = await Directory(
    '${root.path}/workflow/macos-launcher/runtime',
  ).create(recursive: true);
  await File('${scripts.path}/superagent-service.mjs').writeAsString(r'''
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const [action, root, , , projectId = 'legacy'] = process.argv.slice(2);
appendFileSync(root + '/calls', action + '\n');
const projectsFile = root + '/projects.json';
const projects = existsSync(projectsFile) ? JSON.parse(readFileSync(projectsFile, 'utf8')) : [{ id: 'legacy', name: '原有 Superagent', legacy: true }];
if (action === 'projects') {
  console.log(JSON.stringify({ ok: true, value: { projects } }));
  process.exit(0);
}
if (action === 'accounts') {
  console.log(JSON.stringify({ ok: true, value: { accounts: [{ login: 'alice', directory: root + '/gh-alice' }] } }));
  process.exit(0);
}
if (action === 'create-project' || action === 'update-project') {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const project = { ...JSON.parse(input), id: action === 'create-project' ? 'project-' + projects.length : projectId, revision: 1 };
  const index = projects.findIndex(row => row.id === project.id);
  if (index < 0) projects.push(project); else projects[index] = project;
  writeFileSync(projectsFile, JSON.stringify(projects));
  console.log(JSON.stringify({ ok: true, value: { project } }));
  process.exit(0);
}
if (action === 'status' && existsSync(root + '/fail-status')) {
  console.log(JSON.stringify({ ok: false, error: 'fixture failure' }));
  process.exit(1);
}
const file = root + '/state-' + projectId;
let state = existsSync(file) ? readFileSync(file, 'utf8') : 'stopped';
if (action === 'start') state = 'running';
if (action === 'stop') state = 'stopped';
writeFileSync(file, state);
const service = { state, ready: state === 'running', message: state === 'running' ? 'Configure repository' : null };
console.log(JSON.stringify({ ok: true, value: { service, ...(action === 'open' ? { url: 'http://127.0.0.1:3082/?token=fixture' } : {}) } }));
''');
  await File('${scripts.path}/superagent-onboarding.mjs').writeAsString(r'''
const [action, root] = process.argv.slice(2);
if (action === 'feishu-register') {
  console.log(JSON.stringify({ type: 'qr', url: 'https://open.feishu.cn/page/cli?code=fixture' }));
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log(JSON.stringify({ type: 'ready', bot: { name: '测试机器人', directory: root + '/bot', profile: 'cli_fixture', executable: '@bundled', ready: true } }));
  process.exit(0);
}
let input = ''; for await (const chunk of process.stdin) input += chunk;
const values = {
  repositories: { user: { login: 'alice', id: 123 }, repositories: [{ name: 'alice/example', private: true, defaultBranch: 'main' }] },
  branches: { branches: ['main', 'dev'] },
  'inspect-project': { root: root + '/project', matches: true },
  'feishu-bots': { available: true, bots: [] },
  'feishu-chats': { chats: [{ id: 'oc_fixture', name: '产品群' }] },
  'feishu-members': { members: [{ id: 'ou_fixture', name: 'Alice' }], truncated: false },
};
console.log(JSON.stringify({ ok: true, value: values[action] }));
''');
  final native = SuperagentNative(root.path);
  final model = SuperagentTestController(native);
  await model.initialize();
  return (root: root, model: model, native: native);
}

void main() {
  test(
    'Superagent controls operate independently and open the returned panel',
    () async {
      final fixture = await superagentFixture();
      try {
        await fixture.model.startSuperagent();
        expect(fixture.model.superagentSnapshot.state, ServiceState.running);
        expect(
          fixture.model.superagentSnapshot.message,
          'Configure repository',
        );
        await fixture.model.openSuperagent();
        expect(fixture.native.opened, 'http://127.0.0.1:3082/?token=fixture');
        await fixture.model.stopSuperagent();
        expect(fixture.model.superagentSnapshot.state, ServiceState.stopped);
        expect(await File('${fixture.root.path}/calls').readAsLines(), [
          'projects',
          'accounts',
          'status',
          'start',
          'open',
          'stop',
        ]);
      } finally {
        await fixture.model.close();
        fixture.model.dispose();
        await fixture.root.delete(recursive: true);
      }
    },
  );

  testWidgets('Superagent has its own sidebar page separate from management', (
    tester,
  ) async {
    final fixture = await tester.runAsync(superagentFixture);
    expect(fixture, isNotNull);
    try {
      await tester.pumpWidget(LauncherApp(controller: fixture!.model));
      final navigation = find.descendant(
        of: find.byType(NavigationRail),
        matching: find.text('Superagent'),
      );
      expect(navigation, findsOneWidget);
      expect(find.text('启动 Superagent'), findsNothing);
      await tester.tap(navigation);
      await tester.pumpAndSettle();
      expect(find.text('Superagent 项目'), findsOneWidget);
      expect(find.text('启动 Superagent'), findsOneWidget);
      expect(find.text('停止 Superagent'), findsOneWidget);
      await tester.ensureVisible(find.text('添加项目'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('添加项目'));
      await tester.pumpAndSettle();
      expect(find.text('添加 Superagent 项目'), findsOneWidget);
      expect(find.textContaining('选择 GitHub 账号'), findsOneWidget);
      expect(find.text('alice'), findsOneWidget);
      expect(find.text('GitHub 仓库（owner/name）'), findsNothing);
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('管理'));
      await tester.pumpAndSettle();
      expect(find.text('DSH 服务'), findsOneWidget);
      expect(find.text('启动 Superagent'), findsNothing);
    } finally {
      await tester.runAsync(() => fixture!.model.close());
      fixture!.model.dispose();
      await tester.runAsync(() => fixture.root.delete(recursive: true));
    }
  });

  testWidgets(
    'project wizard selects account, repository and QR bot without manual identifiers',
    (tester) async {
      final fixture = await tester.runAsync(superagentFixture);
      expect(fixture, isNotNull);
      Future<void> waitFor(String label) async {
        for (var attempt = 0; attempt < 150; attempt++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 40)),
          );
          await tester.pump(const Duration(milliseconds: 40));
          if (find.text(label).evaluate().isNotEmpty) return;
        }
        fail(
          'Timed out waiting for $label; visible text: ${tester.widgetList<Text>(find.byType(Text)).map((w) => w.data).whereType<String>().join(' | ')}',
        );
      }

      Future<void> waitUntilIdle() async {
        for (var attempt = 0; attempt < 150; attempt++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 40)),
          );
          await tester.pump();
          if (find.byType(LinearProgressIndicator).evaluate().isEmpty) return;
        }
        fail('Timed out waiting for the wizard to finish loading');
      }

      try {
        await tester.pumpWidget(LauncherApp(controller: fixture!.model));
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationRail),
            matching: find.text('Superagent'),
          ),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('添加项目'));
        await tester.tap(find.text('添加项目'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('alice'));
        await tester.pump();
        await tester.runAsync(() => tester.tap(find.text('下一步')));
        await waitFor('alice/example');
        await tester.runAsync(() => tester.tap(find.text('alice/example')));
        await waitFor('main');
        await tester.runAsync(() => tester.tap(find.text('选择专用存放目录（可选）')));
        await waitFor('${fixture.root.path}/project');
        expect(find.textContaining('专用仓库和任务与日常工作区分开'), findsOneWidget);
        await tester.runAsync(() => tester.tap(find.text('下一步')));
        await waitFor('扫码添加飞书机器人');
        await waitUntilIdle();
        await tester.runAsync(() => tester.tap(find.text('扫码添加飞书机器人')));
        await waitFor('在浏览器打开授权页面');
        expect(find.byType(Image), findsWidgets);
        await waitFor('测试机器人');
        await waitFor('选择飞书群');
        await tester.ensureVisible(find.text('选择飞书群'));
        await tester.tap(find.text('选择飞书群'));
        await tester.pumpAndSettle();
        await tester.runAsync(() => tester.tap(find.text('产品群').last));
        await waitFor('允许发起任务的人');
        await waitUntilIdle();
        await tester.ensureVisible(find.text('允许发起任务的人'));
        await tester.tap(find.text('允许发起任务的人'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Alice').last);
        await tester.pump();
        await tester.ensureVisible(find.text('仅 @ 机器人').last);
        await tester.tap(find.text('仅 @ 机器人').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('接收群内全部消息').last);
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('仅观察').last);
        await tester.tap(find.text('仅观察').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('自动接单').last);
        await tester.pumpAndSettle();
        await tester.runAsync(() => tester.tap(find.text('完成')));
        for (
          var attempt = 0;
          attempt < 150 && find.text('添加 Superagent 项目').evaluate().isNotEmpty;
          attempt++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 40)),
          );
          await tester.pump(const Duration(milliseconds: 40));
        }
        expect(
          find.text('添加 Superagent 项目'),
          findsNothing,
          reason: tester
              .widgetList<Text>(find.byType(Text))
              .map((w) => w.data)
              .whereType<String>()
              .join(' | '),
        );
        final projects = jsonDecode(
          await tester.runAsync(
            () => File('${fixture.root.path}/projects.json').readAsString(),
          ) as String,
        ) as List;
        final project = projects.last as Map<String, dynamic>;
        expect(project['guided'], true);
        expect(project['dedicated'], true);
        expect(project['policyManaged'], true);
        expect(project['feishuListen'], 'all');
        expect(project['acceptMode'], 'auto');
        expect(project['repository'], 'alice/example');
        expect(project['baseBranch'], 'main');
        expect(project['githubLogin'], 'alice');
        expect(project['authorEmail'], '123+alice@users.noreply.github.com');
        expect(project['feishuChatId'], 'oc_fixture');
        expect(project['feishuAllowedId'], 'ou_fixture');
        expect(project['feishuProfile'], 'cli_fixture');
      } finally {
        await tester.runAsync(() => fixture!.model.close());
        fixture!.model.dispose();
        await tester.runAsync(() => fixture.root.delete(recursive: true));
      }
    },
  );

  test('project selection controls only the chosen Superagent', () async {
    final fixture = await superagentFixture();
    try {
      await fixture.model.saveSuperagentProject({'name': 'Project A'});
      final first = fixture.model.selectedSuperagentProjectId!;
      await fixture.model.saveSuperagentProject({'name': 'Project B'});
      final second = fixture.model.selectedSuperagentProjectId!;
      expect(first, isNot(second));
      expect(fixture.model.superagentSnapshot.state, ServiceState.stopped);
      await fixture.model.selectSuperagentProject(first);
      await fixture.model.startSuperagent();
      expect(fixture.model.superagentSnapshot.state, ServiceState.running);
      await fixture.model.selectSuperagentProject(second);
      expect(fixture.model.superagentSnapshot.state, ServiceState.stopped);
      await fixture.model.startSuperagent();
      await fixture.model.selectSuperagentProject(first);
      await fixture.model.stopSuperagent();
      await fixture.model.selectSuperagentProject(second);
      expect(fixture.model.superagentSnapshot.state, ServiceState.running);
      await fixture.model.stopSuperagent();
    } finally {
      await fixture.model.close();
      fixture.model.dispose();
      await fixture.root.delete(recursive: true);
    }
  });

  test(
    'a failed Superagent status check does not prevent launcher initialization',
    () async {
      final fixture = await superagentFixture();
      final reopened = LauncherController(fixture.native);
      try {
        await File('${fixture.root.path}/fail-status').writeAsString('fail');
        await reopened.initialize();
        expect(reopened.initialized, isTrue);
        expect(reopened.superagentSnapshot.state, ServiceState.failed);
        expect(
          reopened.superagentSnapshot.message,
          contains('fixture failure'),
        );
      } finally {
        await reopened.close();
        reopened.dispose();
        await fixture.model.close();
        fixture.model.dispose();
        await fixture.root.delete(recursive: true);
      }
    },
  );
}
