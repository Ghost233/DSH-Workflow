import 'dart:io';

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
  final native = SuperagentNative(root.path);
  final model = LauncherController(native);
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
      expect(find.text('GitHub 登录账号'), findsOneWidget);
      expect(find.text('飞书机器人配置目录（留空则禁用飞书）'), findsOneWidget);
      expect(find.text('本地项目目录（只读保护）'), findsOneWidget);
      expect(
        find.text('准备命令可用 WORKFLOW_PROJECT_DIR 引用选中的本地项目。'),
        findsOneWidget,
      );
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
