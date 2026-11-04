import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:dsh_workflow_launcher/main.dart';
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

Future<({Directory root, ExitNative native, LauncherController model})>
fixture() async {
  final root = await Directory.systemTemp.createTemp('station-quit-ui-');
  final node = (await Process.run('/usr/bin/which', [
    'node',
  ])).stdout.toString().trim();
  await Link('${root.path}/node').create(node);
  final scripts = await Directory(
    '${root.path}/workflow/macos-launcher/runtime',
  ).create(recursive: true);
  await File('${scripts.path}/station-shutdown.mjs').writeAsString(r'''
import{createInterface}from'node:readline';import{writeFileSync,existsSync}from'node:fs';
const root=process.argv[2];
if(existsSync(root+'/fail')){console.log(JSON.stringify({type:'error',message:'Fixture cleanup failed'}));process.exit(1)}
console.log(JSON.stringify({type:'inspection',value:{needsConfirmation:!existsSync(root+'/idle'),work:['unfinished task']}}));
const reader=createInterface({input:process.stdin});let handled=false;
reader.on('line',line=>{handled=true;const confirmed=JSON.parse(line).confirmed;writeFileSync(root+'/decision',String(confirmed));console.log(JSON.stringify({type:'result',stopped:confirmed}));reader.close();process.stdin.destroy()});
reader.on('close',()=>{if(!handled)writeFileSync(root+'/cancelled','true')});
''');
  final native = ExitNative(root.path), model = LauncherController(native);
  await model.initialize();
  return (root: root, native: native, model: model);
}

void main() {
  testWidgets(
    'unfinished work is shown in the actual quit dialog and cancel keeps Station open',
    (tester) async {
      final f = (await tester.runAsync(fixture))!;
      Future<bool>? pending;
      try {
        await tester.pumpWidget(LauncherApp(controller: f.model));
        await tester.runAsync(() async {
          pending = f.model.shutdownForQuit();
          await Future<void>.delayed(const Duration(milliseconds: 300));
        });
        await tester.pumpAndSettle();
        expect(find.text('退出 Station 并停止全部服务'), findsOneWidget);
        expect(find.text('• unfinished task'), findsOneWidget);
        await tester.tap(find.text('取消'));
        expect(await tester.runAsync(() => pending!), false);
        expect(f.model.exiting, false);
      } finally {
        await tester.runAsync(() => f.model.close());
        f.model.dispose();
        await tester.runAsync(() => f.root.delete(recursive: true));
      }
    },
  );

  test(
    'cancel quit keeps the client open and allows a later confirmed quit',
    () async {
      final f = await fixture();
      try {
        f.model.confirmStationQuit = (_) async => false;
        expect(await f.model.shutdownForQuit(), false);
        expect(f.model.exiting, false);
        expect(await File('${f.root.path}/decision').readAsString(), 'false');
        f.model.confirmStationQuit = (_) async => true;
        expect(await f.model.shutdownForQuit(), true);
        expect(f.model.exiting, true);
      } finally {
        await f.model.close();
        f.model.dispose();
        await f.root.delete(recursive: true);
      }
    },
  );
  test(
    'idle quit needs no confirmation and does not open a desktop client',
    () async {
      final f = await fixture();
      try {
        await File('${f.root.path}/idle').writeAsString('true');
        f.model.confirmStationQuit = (_) async =>
            throw StateError('must not prompt when idle');
        expect(await f.model.shutdownForQuit(), true);
      } finally {
        await f.model.close();
        f.model.dispose();
        await f.root.delete(recursive: true);
      }
    },
  );
  test('cleanup failure leaves Station retryable', () async {
    final f = await fixture();
    try {
      await File('${f.root.path}/fail').writeAsString('true');
      await expectLater(f.model.shutdownForQuit(), throwsA(isA<StateError>()));
      expect(f.model.exiting, false);
      await File('${f.root.path}/fail').delete();
      f.model.confirmStationQuit = (_) async => true;
      expect(await f.model.shutdownForQuit(), true);
    } finally {
      await f.model.close();
      f.model.dispose();
      await f.root.delete(recursive: true);
    }
  });
}
