import 'dart:convert';
import 'dart:io';

import 'package:dsh_workflow_launcher/launcher_controller.dart';
import 'package:dsh_workflow_launcher/native_bridge.dart';
import 'package:flutter_test/flutter_test.dart';

import '../tool/service_task_fixture.dart';

class _UpdateNative extends NativeBridge {
  _UpdateNative(this.root, this.resources, this.endpoint);
  final String root, resources, endpoint;
  @override
  Future<LauncherEnvironment> load() async => LauncherEnvironment({
    'resources': resources,
    'dataRoot': root,
    'home': '$root/home',
    'appVersion': '0.3.0',
    'loginStatus': 'disabled',
    'testSocket': '$root/isolated-test.sock',
    'testReleaseEndpoint': endpoint,
  });
}

void main() {
  final artifact = Platform.environment['DSH_SERVICE_TEST_RESOURCES'];
  test(
    'metadata checks and Launcher exit preserve the same Host and accepted task',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'dsh-update-continuity-',
      );
      final resources = '${root.path}/resources';
      final node = Platform.environment['DSH_TEST_NODE']!;
      final releases = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final requests = <String>[];
      releases.listen((request) async {
        requests.add(request.uri.toString());
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode([
            {
              'tag_name': 'macos-v1.0.0',
              'draft': false,
              'prerelease': false,
              'assets': [
                {
                  'name': 'DSH-Workflow-macOS-1.0.0-arm64.dmg',
                  'size': 1024,
                  'browser_download_url': 'https://github.com/Ghost233/DSH-Workflow/releases/download/macos-v1.0.0/DSH-Workflow-macOS-1.0.0-arm64.dmg',
                },
              ],
            },
          ]),
        );
        await request.response.close();
      });
      LauncherController? model, reopened;
      final task = ServiceTaskFixture(root.path);
      try {
        for (final args in [
          ['tool/independent_service_resources.mjs', artifact!, resources],
          ['tool/service_task_resources.mjs', resources, root.path],
        ]) {
          final staged = await Process.run(node, args);
          expect(
            staged.exitCode,
            0,
            reason: '${staged.stdout}${staged.stderr}',
          );
        }
        LauncherController controller() => LauncherController(
          _UpdateNative(
            root.path,
            resources,
            'http://127.0.0.1:${releases.port}/releases',
          ),
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
        model = controller();
        await model.initialize();
        await model.startService();
        final receiptFile = File(
          '${root.path}/global/.dsh-workflow/desktop/desktop-host.json',
        );
        final before = jsonDecode(await receiptFile.readAsString()) as Map;
        final connection = await Process.start(model.node, [
          model.script('service-cli.mjs'),
          root.path,
          resources,
          '${root.path}/home',
        ], environment: model.processEnvironment);
        final output = connection.stdout.transform(utf8.decoder).join();
        final diagnostics = connection.stderr.transform(utf8.decoder).join();
        connection.stdin.writeln(jsonEncode({'type': 'connect-web'}));
        await connection.stdin.close();
        expect(await connection.exitCode, 0, reason: await diagnostics);
        final value = (jsonDecode(await output) as Map)['value'] as Map;
        final effective = value['connection'] as Map;
        expect(effective['instanceId'], before['lease']);
        await task.connect({...before, 'url': effective['url']});
        final sessionId = await task.acceptTask(
          'Continue this accepted task while the user checks the project DMG and exits Launcher.',
        );
        await task.waitForModelRequest(1);
        await model.checkUpdates();
        expect(model.update?.version.toString(), '1.0.0');
        expect(
          model.update?.page.toString(),
          'https://github.com/Ghost233/DSH-Workflow/releases/tag/macos-v1.0.0',
        );
        expect(
          requests,
          ['/releases'],
          reason: 'controlled fixture metadata only; this is not production GitHub observation',
        );
        await model.checkPlugins();
        expect(model.plugins, isNotEmpty, reason: model.pluginMessage);
        expect(model.plugins.every((row) => !row.updatable), true);
        final report = await task.rpc('workflowDelivery/list', {}) as Map;
        expect(report['actualScope'], 'runtime-resolution');
        expect(report['rows'], isNotEmpty);
        expect(await File('${root.path}/model-canceled-1').exists(), false);
        await model.close();
        reopened = controller();
        await reopened.initialize();
        expect(reopened.serviceSnapshot.instanceId, before['lease']);
        expect(reopened.serviceSnapshot.ready, true);
        final after = jsonDecode(await receiptFile.readAsString()) as Map;
        expect(after['pid'], before['pid']);
        expect(after['lease'], before['lease']);
        await task.releaseModel(1);
        final page = await task.waitForResult(sessionId, 1);
        expect(jsonEncode(page), contains('S04 persisted task result 1'));
        stdout.writeln(
          'S07_UPDATE_CONTINUITY=${jsonEncode({'fixture': root.path, 'sessionId': sessionId, 'pid': before['pid'], 'lease': before['lease'], 'metadataRequests': requests, 'resultFound': true, 'recordCount': (page['records'] as List).length})}',
        );
      } finally {
        task.close();
        await model?.close();
        await reopened?.close();
        await releases.close(force: true);
        final manager = File(
          '${root.path}/global/.dsh-workflow/service/manager.json',
        );
        if (await manager.exists()) {
          final pid =
              (jsonDecode(await manager.readAsString()) as Map)['pid'] as int;
          Process.killPid(pid, ProcessSignal.sigterm);
          for (var i = 0; i < 400 && await manager.exists(); i++) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
          expect(
            await manager.exists(),
            false,
            reason: 'owned fixture cleanup: ${root.path}',
          );
        }
      }
    },
    timeout: const Timeout(Duration(seconds: 100)),
    skip: artifact == null
        ? 'Requires existing packaged SDK resources for real Host acceptance'
        : false,
  );
}
