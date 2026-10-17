import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate' as dart_isolate;

import 'package:launcher_core/launcher_core.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import 'application_probe.dart' show require, waitFor, closeProbeResources;
import 'web_application_scenario.dart' show currentSdkSession;

/// Real Debug UI and the official SDK share the same independent Host.
Future<void> runIndependentServiceApplicationProbe(
  List<String> arguments,
) async {
  final local = Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'];
  final ci = Platform.environment['GITHUB_ACTIONS'] == 'true';
  final parent = ci ? Platform.environment['RUNNER_TEMP'] : local;
  if (parent == null ||
      !parent.startsWith('/') ||
      (!ci &&
          !RegExp(r'^/private/tmp/dsh-launcher-local-[0-9]+$')
              .hasMatch(parent))) {
    throw ArgumentError(
      'Service UI acceptance requires a disposable runner or explicit private local acceptance root',
    );
  }
  if (!ci) {
    final validation = await Process.run('/usr/bin/python3', [
      '-c',
      'import sys; sys.path.insert(0, sys.argv[1]); from settings_startup_cycle import observation_runner; print(observation_runner())',
      File.fromUri(
        Platform.script.resolve(
          '../../../.github/scripts/settings_startup_cycle.py',
        ),
      ).parent.path,
    ]);
    require(
      validation.exitCode == 0 && validation.stdout.toString().trim() == parent,
      'service probe local root is canonical, UID owned and mode 0700',
    );
  }
  final source = File(arguments.first).absolute;
  final sourceApp = source.parent.parent.parent;
  final info = File('${sourceApp.path}/Contents/Info.plist');
  final kernel = File(
    '${sourceApp.path}/Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin',
  );
  if (!await info.exists() || !await kernel.exists()) {
    throw ArgumentError(
      'Only the isolated project Debug candidate is accepted',
    );
  }
  final metadata = await Process.run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    info.path,
  ]);
  final values = jsonDecode(metadata.stdout.toString()) as Map;
  final library = File('${source.path}.debug.dylib');
  final nativeBytes = latin1.decode([
    ...await source.readAsBytes(),
    if (await library.exists()) ...await library.readAsBytes(),
  ]);
  require(
    values['CFBundleIdentifier'] == 'com.ghostagent.dsh-workflow-launcher' &&
        nativeBytes.contains('DSHLauncherTestRoot') &&
        nativeBytes.contains('test-preferences.plist') &&
        latin1
            .decode(await kernel.readAsBytes())
            .contains('ext.dshlauncher.application'),
    'read-only Debug candidate preflight confirms the native isolation and real semantic driver',
  );
  final root = await Directory(parent).createTemp('dsh-s01-');
  stdout.writeln('S01_ROOT=${root.path}');
  final evidence = <String, Object?>{
    'root': root.path,
    'userServiceUsed': false,
    'systemSettingsChanged': false,
  };
  final app = '${root.path}/candidate.app';
  final copied = await Process.run('/usr/bin/ditto', [sourceApp.path, app]);
  require(
    copied.exitCode == 0,
    'service probe owns its Debug application copy',
  );
  final executable = '$app/Contents/MacOS/${source.uri.pathSegments.last}';
  final resource = '${root.path}/resources';
  final artifact = Directory(arguments[2]).absolute.path;
  final package = await dart_isolate.Isolate.resolvePackageUri(
    Uri.parse('package:dsh_workflow_launcher/main.dart'),
  );
  if (package == null) {
    throw StateError('Current project source is unavailable');
  }
  final project = File.fromUri(package).parent.parent.parent.parent.path;
  final staged = await Process.run('$artifact/node', [
    '$project/macos-launcher/flutter/tool/independent_service_resources.mjs',
    artifact,
    resource,
  ]);
  require(
    staged.exitCode == 0,
    'service probe stages the current project layer and frozen Host: ${staged.stderr}',
  );
  final configured = await Process.run('/usr/bin/plutil', [
    '-replace',
    'DSHLauncherTestRoot',
    '-string',
    '${root.path}/data',
    '$app/Contents/Info.plist',
  ]);
  require(
    configured.exitCode == 0,
    'private candidate carries its own isolation root',
  );
  final signed = await Process.run('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    app,
  ]);
  require(
    signed.exitCode == 0,
    'private Debug candidate is signed after isolation metadata',
  );
  final manifestPath = '$app/Contents/Resources/maclauncher.json';
  final manifest = await ProjectManifest.read(manifestPath);
  require(
    manifest.projectId == 'dsh-workflow' &&
        await Directory(
              EntryLauncher.resolve(
                manifest.entry!.path,
                File(manifestPath).parent.path,
              ),
            ).resolveSymbolicLinks() ==
            await Directory(app).resolveSymbolicLinks(),
    'official association resolves to the owned candidate',
  );
  final bindings = await BindingStore.load('${root.path}/bindings.json');
  await bindings.associate(manifestPath);
  final server = await LauncherServer.start(
    layout: EndpointLayout(directory: '${root.path}/sdk'),
    bindings: bindings,
  );
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': resource,
    'DSH_LAUNCHER_TEST_SOCKET': server.layout.socketPath,
    'DSH_HOME': '${root.path}/home',
    'HOME': '${root.path}/os-home',
    'TMPDIR': root.path,
  };
  _ServiceApplication? current;
  try {
    current = await _ServiceApplication.start(
      executable,
      environment,
      '${root.path}/first-app.log',
    );
    final first = await currentSdkSession(server);
    final before = await first.sendRequest(
      'status',
      serviceId: 'desktop',
      timeout: const Duration(seconds: 5),
    );
    require(
      (before['result'] as Map)['ready'] == false,
      'opening the launcher does not start the Host',
    );
    await current.tap('启动 DSH 服务');
    await waitFor(
      'real UI independent service readiness',
      () async => (await current!.state()).toString().contains('DSH 服务：已就绪'),
    );
    final status = await first.sendRequest(
      'status',
      serviceId: 'desktop',
      timeout: const Duration(seconds: 5),
    );
    final running = status['result'] as Map;
    final receiptFile = File(
      '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
    );
    final receipt = jsonDecode(await receiptFile.readAsString()) as Map;
    final managerFile = File(
      '${root.path}/data/global/.dsh-workflow/service/manager.json',
    );
    final manager = jsonDecode(await managerFile.readAsString()) as Map;
    final identity = await Process.run('/bin/ps', [
      '-p',
      '${receipt['pid']}',
      '-o',
      'pid=,ppid=,uid=,command=',
    ]);
    require(
      running['ready'] == true &&
          running['instanceId'] == receipt['lease'] &&
          identity.exitCode == 0 &&
          identity.stdout.toString().contains('${manager['pid']}'),
      'SDK ready identity is the actual Host owned by the independent manager',
    );
    final native = (await current.state())['native'] as Map;
    require(
      native['openedDesktopPid'] == null,
      'native launcher did not open an Electron client',
    );
    evidence.addAll({
      'firstStatus': running,
      'hostPid': receipt['pid'],
      'instanceId': receipt['lease'],
      'managerPid': manager['pid'],
      'processIdentity': identity.stdout.toString(),
      'firstNative': native,
    });
    await current.capture('${root.path}/service-ready');
    final repeat = await first.sendRequest(
      'start',
      serviceId: 'desktop',
      timeout: const Duration(seconds: 10),
    );
    require(
      repeat['error'] == null,
      'official SDK repeated start reuses the running Host',
    );
    final logs = await first.sendRequest(
      'logs',
      serviceId: 'desktop',
      params: {'limit': 100},
      timeout: const Duration(seconds: 5),
    );
    require(
      ((logs['result'] as Map)['entries'] as List).isNotEmpty &&
          !jsonEncode(logs).contains('token='),
      'official SDK exposes real service output without local authentication credentials',
    );
    evidence['logs'] = logs['result'];
    await current.tap('日志');
    await current.tap('刷新服务日志');
    require(
      (await current.state()).toString().contains('DSH 服务日志'),
      'native log page exposes service output',
    );
    await current.capture('${root.path}/service-logs');
    await current.quit();
    current = null;
    await waitFor(
      'official SDK launcher disconnect',
      () async => server.sessionFor('dsh-workflow') == null,
    );
    final live = await Process.run('/bin/kill', ['-0', '${receipt['pid']}']);
    require(
      live.exitCode == 0,
      'the actual Host survives a normal launcher quit',
    );
    current = await _ServiceApplication.start(
      executable,
      environment,
      '${root.path}/reopened-app.log',
    );
    final reopened = await currentSdkSession(server);
    final rediscovered = await reopened.sendRequest(
      'status',
      serviceId: 'desktop',
      timeout: const Duration(seconds: 5),
    );
    final second = rediscovered['result'] as Map;
    require(
      second['ready'] == true &&
          second['instanceId'] == receipt['lease'] &&
          (jsonDecode(await receiptFile.readAsString()) as Map)['pid'] ==
              receipt['pid'],
      'reopened native launcher and SDK discover the same actual Host and instance',
    );
    await waitFor(
      'reopened UI same instance',
      () async => (await current!.state()).toString().contains(
        receipt['lease'] as String,
      ),
    );
    evidence['reopenedStatus'] = second;
    evidence['reopenedNative'] = (await current.state())['native'];
    await current.capture('${root.path}/service-reopened');
    evidence['outcome'] = 'passed';
    stdout.writeln('S01 REAL UI AND OFFICIAL SDK SERVICE PROBE PASSED');
  } catch (error) {
    evidence['outcome'] = 'failed';
    evidence['error'] = error.toString();
    rethrow;
  } finally {
    try {
      await closeProbeResources([
        (
          'owned launcher',
          () async {
            await current?.quit();
          },
        ),
        ('official SDK', server.close),
        (
          'owned service fixture',
          () async {
            final manager = File(
              '${root.path}/data/global/.dsh-workflow/service/manager.json',
            );
            if (await manager.exists()) {
              final pid =
                  (jsonDecode(await manager.readAsString()) as Map)['pid']
                      as int;
              Process.killPid(pid, ProcessSignal.sigterm);
              for (
                var attempt = 0;
                attempt < 400 && await manager.exists();
                attempt++
              ) {
                await Future<void>.delayed(const Duration(milliseconds: 50));
              }
              evidence['ownedManagerReaped'] = !await manager.exists();
              require(
                !await manager.exists(),
                'owned fixture manager and Host finish cleanup',
              );
            }
          },
        ),
      ], preserveFailure: evidence['outcome'] != 'passed');
    } catch (error) {
      evidence['outcome'] = 'failed';
      evidence['cleanupError'] = error.toString();
      rethrow;
    } finally {
      await File('${root.path}/service-evidence.json')
          .writeAsString(jsonEncode(evidence));
    }
  }
}

class _ServiceApplication {
  _ServiceApplication(
    this.process,
    this.vm,
    this.isolate,
    this.output,
    this.subscriptions,
  ) {
    unawaited(
      process.exitCode.then((_) {
        exited = true;
      }),
    );
  }
  bool exited = false;
  Future<void>? quitting;
  final Process process;
  final VmService vm;
  final String isolate;
  final IOSink output;
  final List<StreamSubscription<String>> subscriptions;
  static Future<_ServiceApplication> start(
    String executable,
    Map<String, String> environment,
    String log,
  ) async {
    final process = await Process.start(executable, [
      '--vm-service-port=0',
    ], environment: environment);
    final output = File(log).openWrite();
    final address = Completer<String>();
    void line(String value) {
      output.writeln(value);
      final found = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
          .firstMatch(value)
          ?.group(0);
      if (found != null && !address.isCompleted) address.complete(found);
    }

    final subscriptions = [process.stdout, process.stderr]
        .map(
          (stream) => stream
              .transform(utf8.decoder)
              .transform(const LineSplitter())
              .listen(line),
        )
        .toList();
    try {
      unawaited(
        process.exitCode.then((code) {
          if (!address.isCompleted) {
            address.completeError(
              StateError(
                'Native candidate exited before its driver was ready: $code',
              ),
            );
          }
        }),
      );
      final uri = await address.future.timeout(const Duration(seconds: 30));
      final vm = await vmServiceConnectUri(
        '${uri.replaceFirst('http:', 'ws:')}ws',
      );
      final isolate = (await vm.getVM()).isolates!.single.id!;
      await waitFor(
        'service candidate semantic driver',
        () async =>
            (await vm.getIsolate(isolate)).extensionRPCs!
                .contains('ext.dshlauncher.application'),
      );
      return _ServiceApplication(process, vm, isolate, output, subscriptions);
    } catch (_) {
      process.kill(ProcessSignal.sigterm);
      await process.exitCode.timeout(
        const Duration(seconds: 5),
        onTimeout: () async {
          process.kill(ProcessSignal.sigkill);
          return process.exitCode;
        },
      );
      for (final subscription in subscriptions) {
        await subscription.cancel();
      }
      await output.close();
      rethrow;
    }
  }

  Future<Map<String, Object?>> state([Map<String, String>? arguments]) async =>
      (await vm.callServiceExtension(
        'ext.dshlauncher.application',
        isolateId: isolate,
        args: arguments,
      )).json!.cast<String, Object?>();
  Future<void> tap(String label) async {
    final node = ((await state())['nodes'] as List).cast<Map>().singleWhere(
      (row) =>
          row['label'].toString().split('\n').first == label &&
          (row['actions'] as List).contains('tap'),
    );
    await state({'action': 'tap', 'id': '${node['id']}'});
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }

  Future<void> capture(String path) async {
    final snapshot = await state();
    await File('$path.json').writeAsString(jsonEncode(snapshot));
    final capture = await Process.run('/usr/sbin/screencapture', [
      '-x',
      '-l',
      '${(snapshot['native'] as Map)['windowNumber']}',
      '$path.png',
    ]);
    require(
      capture.exitCode == 0 && await File('$path.png').exists(),
      'actual native service window screenshot: $path.png',
    );
  }

  Future<void> quit() => quitting ??= _quit();
  Future<void> _quit() async {
    var failed = false;
    try {
      if (!exited) await state({'action': 'quit'});
      require(
        await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
        'native service launcher quits normally',
      );
    } catch (_) {
      failed = true;
      rethrow;
    } finally {
      await closeProbeResources([
        (
          'owned candidate process',
          () async {
            if (!exited) {
              process.kill(ProcessSignal.sigterm);
              await process.exitCode.timeout(
                const Duration(seconds: 5),
                onTimeout: () async {
                  process.kill(ProcessSignal.sigkill);
                  return process.exitCode;
                },
              );
            }
          },
        ),
        ('candidate VM', vm.dispose),
        (
          'candidate output',
          () async {
            for (final subscription in subscriptions) {
              await subscription.cancel();
            }
            await output.close();
          },
        ),
      ], preserveFailure: failed);
    }
  }
}
