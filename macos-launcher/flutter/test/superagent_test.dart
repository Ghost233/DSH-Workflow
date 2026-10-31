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
const [action, root] = process.argv.slice(2);
appendFileSync(root + '/calls', action + '\n');
if (action === 'status' && existsSync(root + '/fail-status')) {
  console.log(JSON.stringify({ ok: false, error: 'fixture failure' }));
  process.exit(1);
}
const file = root + '/state';
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

  testWidgets('launcher exposes a separate Superagent section', (tester) async {
    final fixture = await tester.runAsync(superagentFixture);
    expect(fixture, isNotNull);
    try {
      await tester.pumpWidget(LauncherApp(controller: fixture!.model));
      await tester.scrollUntilVisible(
        find.text('启动 Superagent'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Superagent'), findsOneWidget);
      expect(find.text('启动 Superagent'), findsOneWidget);
      expect(find.text('停止 Superagent'), findsOneWidget);
    } finally {
      await tester.runAsync(() => fixture!.model.close());
      fixture!.model.dispose();
      await tester.runAsync(() => fixture.root.delete(recursive: true));
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
