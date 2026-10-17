import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate' as dart_isolate;

import 'package:launcher_core/launcher_core.dart';
import 'package:vm_service/vm_service.dart' show VmService;
import 'package:vm_service/vm_service_io.dart';

import 'application_probe.dart' show require, closeProbeResources;
import 'web_application_scenario.dart' show currentSdkSession;

const _helperId =
    'com.ghostagent.dsh-workflow.service-notifications.authorize-20261017-0643f742-6526-4d12-a03a-89e2a9f7b43c';
const _helperBinaryHash =
    'd6c356d810fcb33b2e625e2791a55bb59d586b3f4345beb070048ccd82851bd2';

Future<void> _wait(String description, Future<bool> Function() check) async {
  final clock = Stopwatch()..start();
  const limit = Duration(seconds: 15);
  while (clock.elapsed < limit) {
    if (await check().timeout(limit - clock.elapsed)) {
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  throw StateError('Timed out: $description');
}

Future<ProcessResult> _run(
  String executable,
  List<String> arguments, {
  String? input,
  Map<String, String>? environment,
}) async {
  final process = await Process.start(
    executable,
    arguments,
    environment: environment,
  );
  final output = process.stdout.transform(utf8.decoder).join();
  final errors = process.stderr.transform(utf8.decoder).join();
  process.stdin.write(input ?? '');
  await process.stdin.close();
  int code;
  try {
    code = await process.exitCode.timeout(const Duration(seconds: 30));
  } on TimeoutException {
    process.kill(ProcessSignal.sigterm);
    await process.exitCode.timeout(
      const Duration(seconds: 3),
      onTimeout: () async {
        process.kill(ProcessSignal.sigkill);
        return process.exitCode;
      },
    );
    throw StateError(
      'Owned command timed out: $executable ${arguments.firstOrNull}; stderr: ${await errors}',
    );
  }
  return ProcessResult(process.pid, code, await output, await errors);
}

Future<String> _hash(String path) async {
  final result = await _run('/usr/bin/shasum', ['-a', '256', path]);
  require(result.exitCode == 0, 'read-only SHA-256: $path');
  return result.stdout.toString().trim().split(RegExp(r'\s+')).first;
}

Future<Map> _plist(String path) async {
  final result = await _run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    path,
  ]);
  require(result.exitCode == 0, 'read-only plist: $path');
  return jsonDecode(result.stdout.toString()) as Map;
}

Future<Map> _helperQuery(
  String resources,
  String command, [
  String? faultId,
]) async {
  require(
    ['status', 'delivered'].contains(command),
    'native scenario never requests authorization or submits directly',
  );
  final module = Uri.file(
    '$resources/workflow/macos-launcher/runtime/service-notification.mjs',
  );
  final result = await _run('$resources/node', [
    '--input-type=module',
    '-e',
    'import { serviceNotification } from ${jsonEncode(module.toString())}; console.log(JSON.stringify(await serviceNotification(process.argv[1], process.argv[2], process.argv[3])));',
    resources,
    command,
    ?faultId,
  ]);
  require(
    result.exitCode == 0,
    'own helper query exits normally: ${result.stderr}',
  );
  return jsonDecode(result.stdout.toString()) as Map;
}

Future<Map> _status(String resources, String data, String home) async {
  final result = await _run('$resources/node', [
    '$resources/workflow/macos-launcher/runtime/service-cli.mjs',
    data,
    resources,
    home,
  ], input: '${jsonEncode({'type': 'status'})}\n');
  require(result.exitCode == 0, 'read-only manager CLI: ${result.stderr}');
  final response = jsonDecode(result.stdout.toString()) as Map;
  require(response['ok'] == true, 'read-only manager response is successful');
  return response['value'] as Map;
}

List<Map> _events(Map status, String prefix) => (status['logs'] as List)
    .cast<Map>()
    .where((row) => (row['text'] as String).startsWith(prefix))
    .map(
      (row) =>
          jsonDecode((row['text'] as String).substring(prefix.length)) as Map,
    )
    .toList();

/// Root runs this standalone tool, then uses CUA super+q on the exact UI_READY app.
/// Arguments: Debug executable, frozen Resources, original helper2 app, Debug binding JSON.
Future<void> main(List<String> arguments) async {
  if (arguments.length != 4) {
    throw ArgumentError(
      'Pass Debug executable, frozen Resources, original helper2 app and Debug input-binding JSON',
    );
  }
  final parent = Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'];
  if (parent == null ||
      !RegExp(r'^/private/tmp/dsh-launcher-local-[0-9]+$').hasMatch(parent) ||
      Platform.environment['GITHUB_ACTIONS'] == 'true') {
    throw ArgumentError(
      'This local real-GUI notification scenario requires the existing private local acceptance root',
    );
  }
  final package = await dart_isolate.Isolate.resolvePackageUri(
    Uri.parse('package:dsh_workflow_launcher/main.dart'),
  );
  if (package == null) {
    throw StateError('Current project source is unavailable');
  }
  final project = File.fromUri(package).parent.parent.parent.parent.path;
  final validation = await _run('/usr/bin/python3', [
    '-c',
    'import sys; sys.path.insert(0, sys.argv[1]); from settings_startup_cycle import observation_runner; print(observation_runner())',
    '$project/.github/scripts',
  ]);
  require(
    validation.exitCode == 0 && validation.stdout.toString().trim() == parent,
    'local acceptance parent is canonical, UID-owned and mode0700',
  );
  final source = File(arguments[0]).absolute;
  final sourceApp = source.parent.parent.parent;
  final binding = jsonDecode(await File(arguments[3]).readAsString()) as Map;
  require(
    binding['app'] == sourceApp.path,
    'Debug artifact path is bound to the supplied build evidence',
  );
  for (final entry in (binding['artifactHashes'] as Map).entries) {
    require(
      await _hash('${sourceApp.path}/${entry.key}') == entry.value,
      'current Debug artifact matches binding: ${entry.key}',
    );
  }
  for (final entry in (binding['appInputs'] as Map).entries) {
    require(
      await _hash('$project/${entry.key}') == entry.value,
      'current app input matches Debug build: ${entry.key}',
    );
  }
  final originalInfo = await _plist('${sourceApp.path}/Contents/Info.plist');
  final kernel = File(
    '${sourceApp.path}/Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin',
  );
  final library = File('${source.path}.debug.dylib');
  final nativeBytes = latin1.decode([
    ...await source.readAsBytes(),
    if (await library.exists()) ...await library.readAsBytes(),
  ]);
  require(
    originalInfo['CFBundleIdentifier'] ==
            'com.ghostagent.dsh-workflow-launcher' &&
        nativeBytes.contains('DSHLauncherTestRoot') &&
        nativeBytes.contains('test-preferences.plist') &&
        latin1
            .decode(await kernel.readAsBytes())
            .contains('ext.dshlauncher.application'),
    'actual Debug has native isolation and read-only semantic driver',
  );
  final helperSource = Directory(arguments[2]).absolute;
  require(
    helperSource.path ==
            '$project/.build/independent-dsh-server/preflight/notification-positive-2/DSH Service Notifications.app' &&
        await helperSource.resolveSymbolicLinks() == helperSource.path,
    'helper source is the existing authorized physical test app',
  );
  final helperInfoHash = await _hash(
    '${helperSource.path}/Contents/Info.plist',
  );
  require(
    (await _plist(
              '${helperSource.path}/Contents/Info.plist',
            ))['CFBundleIdentifier'] ==
            _helperId &&
        await _hash(
              '${helperSource.path}/Contents/MacOS/DSH Service Notifications',
            ) ==
            _helperBinaryHash,
    'existing helper identity and executable match component evidence',
  );
  final root = await Directory(parent).createTemp('dsh-s05-native-');
  stdout.writeln('S05_NATIVE_ROOT=${root.path}');
  final data = '${root.path}/data',
      home = '${root.path}/home',
      resources = '${root.path}/resources';
  final app = '${root.path}/candidate.app';
  final executable = '$app/Contents/MacOS/${source.uri.pathSegments.last}';
  final managerFile = File('$data/global/.dsh-workflow/service/manager.json');
  final receiptFile = File(
    '$data/global/.dsh-workflow/desktop/desktop-host.json',
  );
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': data,
    'DSH_LAUNCHER_TEST_HOME': home,
    'DSH_LAUNCHER_TEST_RESOURCES': resources,
    'DSH_HOME': home,
    'HOME': '${root.path}/os-home',
    'ZDOTDIR': '${root.path}/os-home',
    'TMPDIR': root.path,
  };
  final evidence = <String, Object?>{
    'root': root.path,
    'debugBinding': binding,
    'debugBindingPath': arguments[3],
    'resourceArtifact': arguments[1],
    'wholeWrapperQualificationClaimed': false,
    'desktopClientOpened': false,
    'helperBundleIdentifier': _helperId,
    'helperSourceBinarySha256': _helperBinaryHash,
    'helperSourceInfoSha256': helperInfoHash,
    'authorizationRequested': false,
    'helperIdentityChanged': false,
    'newNotificationIdentityCreated': false,
    'systemSettingsChanged': false,
    'userServiceUsed': false,
    'hostFaultSignalCount': 0,
    'phase': 'staging',
  };
  Future<void> save() =>
      File('${root.path}/service-fault-evidence.json')
          .writeAsString(jsonEncode(evidence));
  Process? launcher;
  VmService? vm;
  IOSink? output;
  var launcherExited = false;
  final subscriptions = <StreamSubscription<String>>[];
  LauncherServer? server;
  Object? failure;
  StackTrace? failureStack;
  try {
    require(
      (await _run('/usr/bin/ditto', [sourceApp.path, app])).exitCode == 0,
      'owns a physical Debug app copy',
    );
    require(
      (await _run('${arguments[1]}/node', [
            '$project/macos-launcher/flutter/tool/independent_service_resources.mjs',
            arguments[1],
            resources,
          ], environment: environment)).exitCode ==
          0,
      'stages current project and frozen Node/Host inputs',
    );
    require(
      (await _run('$resources/node', [
            '$project/macos-launcher/flutter/tool/service_task_resources.mjs',
            resources,
            root.path,
          ], environment: environment)).exitCode ==
          0,
      'uses the existing isolated external task-boundary profile',
    );
    final nodeVersion = await _run('$resources/node', ['--version']);
    require(
      nodeVersion.exitCode == 0 &&
          nodeVersion.stdout.toString().trim() == 'v24.12.0',
      'resource controls use fixed Node24.12.0',
    );
    evidence['controlNodeVersion'] = nodeVersion.stdout.toString().trim();
    final helper = '$resources/DSH Service Notifications.app';
    require(
      !await Directory(helper).exists(),
      'unavailable-helper staging whitelist did not copy a production helper',
    );
    require(
      (await _run('/usr/bin/ditto', [helperSource.path, helper])).exitCode ==
              0 &&
          await FileSystemEntity.type(helper, followLinks: false) ==
              FileSystemEntityType.directory,
      'helper2 is physically copied into owned resources',
    );
    require(
      await _hash('$helper/Contents/Info.plist') == helperInfoHash &&
          await _hash('$helper/Contents/MacOS/DSH Service Notifications') ==
              _helperBinaryHash,
      'helper Info and signed binary are unchanged',
    );
    require(
      (await _run('/usr/bin/codesign', [
            '--verify',
            '--strict',
            helper,
          ])).exitCode ==
          0,
      'copied helper retains valid original signature',
    );
    require(
      await _hash(
                '$resources/workflow/macos-launcher/runtime/service-manager.mjs',
              ) ==
              'a3e269bae21409efdcd3b2ec111d34e8f25730ed440729e0700d3d402bdd9a1d' &&
          await _hash(
                '$resources/workflow/macos-launcher/runtime/service-notification.mjs',
              ) ==
              'f6ec582daa49c9331555f724adee5c1e28204e8e4d9be1203593f029feccc39f',
      'staged manager and adapter match frozen S05 source',
    );
    final authorization = await _helperQuery(resources, 'status');
    evidence['helperStatusBefore'] = authorization;
    await save();
    require(
      authorization['available'] == true &&
          authorization['bundleIdentifier'] == _helperId &&
          (authorization['authorization'] as Map?)?['status'] == 'authorized' &&
          await Directory(authorization['bundlePath'] as String)
                  .resolveSymbolicLinks() ==
              await Directory(helper).resolveSymbolicLinks(),
      'copied exact helper is actually authorized before any GUI or Host fault',
    );
    require(
      (await _run('/usr/bin/plutil', [
            '-replace',
            'DSHLauncherTestRoot',
            '-string',
            data,
            '$app/Contents/Info.plist',
          ])).exitCode ==
          0,
      'Debug copy carries its private native root',
    );
    final launcherFixtureId =
        'com.ghostagent.dsh-workflow-launcher.acceptance.${root.path.split('/').last}';
    require(
      (await _run('/usr/bin/plutil', [
                '-replace',
                'CFBundleIdentifier',
                '-string',
                launcherFixtureId,
                '$app/Contents/Info.plist',
              ])).exitCode ==
              0 &&
          (await _run('/usr/bin/plutil', [
                '-remove',
                'CFBundleURLTypes',
                '$app/Contents/Info.plist',
              ])).exitCode ==
              0,
      'only Launcher fixture identity is isolated and production URL registration removed',
    );
    require(
      (await _run('/usr/bin/codesign', [
            '--force',
            '--deep',
            '--sign',
            '-',
            app,
          ])).exitCode ==
          0,
      'signs only the owned Debug copy, never helper2',
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
      'official SDK association resolves to owned Launcher',
    );
    final bindings = await BindingStore.load('${root.path}/bindings.json');
    await bindings.associate(manifestPath);
    final sdk = await LauncherServer.start(
      layout: EndpointLayout(directory: '${root.path}/sdk'),
      bindings: bindings,
    );
    server = sdk;
    environment['DSH_LAUNCHER_TEST_SOCKET'] = sdk.layout.socketPath;
    final process = await Process.start(executable, [
      '--vm-service-port=0',
    ], environment: environment);
    launcher = process;
    final appOutput = File('${root.path}/launcher.log').openWrite();
    output = appOutput;
    final address = Completer<String>();
    void line(String value) {
      appOutput.writeln(value);
      final uri = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
          .firstMatch(value)
          ?.group(0);
      if (uri != null && !address.isCompleted) {
        address.complete(uri);
      }
    }

    for (final stream in [process.stdout, process.stderr]) {
      subscriptions.add(
        stream
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .listen(line),
      );
    }
    unawaited(
      process.exitCode.then((code) {
        launcherExited = true;
        if (!address.isCompleted) {
          address.completeError(
            StateError('Launcher exited before driver: $code'),
          );
        }
      }),
    );
    final uri = await address.future.timeout(const Duration(seconds: 30));
    final service = await vmServiceConnectUri(
      '${uri.replaceFirst('http:', 'ws:')}ws',
    ).timeout(const Duration(seconds: 10));
    vm = service;
    final isolate = (await service.getVM().timeout(const Duration(seconds: 5)))
        .isolates!
        .single
        .id!;
    await _wait(
      'actual Launcher read-only driver',
      () async =>
          (await service.getIsolate(isolate)).extensionRPCs!
              .contains('ext.dshlauncher.application'),
    );
    Future<Map> state() async =>
        (await service
                .callServiceExtension(
                  'ext.dshlauncher.application',
                  isolateId: isolate,
                )
                .timeout(const Duration(seconds: 5)))
            .json!;
    final session = await currentSdkSession(sdk);
    Map? ready;
    await _wait('actual automatic service readiness', () async {
      final response = await session.sendRequest(
        'status',
        serviceId: 'desktop',
        timeout: const Duration(seconds: 5),
      );
      ready = response['result'] as Map?;
      return ready?['ready'] == true;
    });
    final receipt = jsonDecode(await receiptFile.readAsString()) as Map;
    final manager = jsonDecode(await managerFile.readAsString()) as Map;
    final hostPid = receipt['pid'] as int, managerPid = manager['pid'] as int;
    final identity = await _run('/bin/ps', [
      '-ww',
      '-p',
      '$hostPid',
      '-o',
      'pid=,ppid=,uid=,command=',
    ]);
    require(
      identity.exitCode == 0 &&
          identity.stdout.toString().trim().split(RegExp(r'\s+'))[1] ==
              '$managerPid' &&
          ready?['instanceId'] == receipt['lease'],
      'SDK ready is the actual dedicated Host owned by manager',
    );
    final ui = await state();
    final native = ui['native'] as Map;
    require(
      native['pid'] == process.pid &&
          native['isolated'] == true &&
          native['dataRoot'] == data &&
          native['windowVisible'] == true &&
          native['openedDesktopPid'] == null,
      'actual isolated normal Launcher window is visible and no Desktop client opened',
    );
    evidence.addAll({
      'phase': 'ui-ready-awaiting-root-cua-quit',
      'launcherPid': process.pid,
      'launcherApp': app,
      'launcherFixtureId': launcherFixtureId,
      'hostPid': hostPid,
      'lease': receipt['lease'],
      'managerPid': managerPid,
      'nativeBeforeQuit': native,
      'hostProcessIdentity': identity.stdout.toString(),
    });
    await save();
    stdout.writeln(
      'S05_UI_READY=${jsonEncode({'pid': process.pid, 'app': app, 'executable': executable, 'windowNumber': native['windowNumber'], 'root': root.path, 'requiredActor': 'Root CUA super+q on this exact Launcher'})}',
    );
    final launcherCode = await process.exitCode.timeout(
      const Duration(seconds: 60),
    );
    evidence['launcherExitCode'] = launcherCode;
    require(
      launcherCode == 0 &&
          (await _run('/bin/kill', ['-0', '${process.pid}'])).exitCode != 0,
      'Root normal GUI quit exited0 and actual Launcher PID is gone',
    );
    await _wait(
      'actual Launcher SDK disconnect',
      () async => sdk.sessionFor('dsh-workflow') == null,
    );
    final survived = jsonDecode(await receiptFile.readAsString()) as Map;
    final beforeFault = await _status(resources, data, home);
    require(
      survived['pid'] == hostPid &&
          survived['lease'] == receipt['lease'] &&
          (await _run('/bin/kill', ['-0', '$hostPid'])).exitCode == 0 &&
          (await _run('/bin/kill', ['-0', '$managerPid'])).exitCode == 0 &&
          (beforeFault['service'] as Map)['ready'] == true,
      'same Host lease and independent manager survive real Launcher exit',
    );
    require(
      _events(beforeFault, 'DSH 服务故障：').isEmpty &&
          _events(beforeFault, 'DSH 服务故障通知：').isEmpty,
      'startup and normal Launcher quit did not create fault notifications',
    );
    evidence['phase'] = 'launcher-gone-host-alive';
    await save();
    stdout.writeln(
      'S05_ABOUT_TO_FAULT=${jsonEncode({'hostPid': hostPid, 'lease': receipt['lease'], 'root': root.path})}',
    );
    final preSignal = await _run('/bin/ps', [
      '-ww',
      '-p',
      '$hostPid',
      '-o',
      'ppid=,command=',
    ]);
    require(
      preSignal.exitCode == 0 &&
          preSignal.stdout.toString().trim().split(RegExp(r'\s+')).first ==
              '$managerPid' &&
          preSignal.stdout.toString().contains(
            '@deepseek-ai/dsh-desktop-host/lib/index.js',
          ),
      'signal target still belongs to the exact isolated manager',
    );
    evidence['preSignalHostIdentity'] = preSignal.stdout.toString();
    require(
      Process.killPid(hostPid, ProcessSignal.sigkill),
      'signals only the verified dedicated Host once',
    );
    evidence['hostFaultSignalCount'] = 1;
    Map? failed;
    await _wait('independent real fault and one helper result', () async {
      failed = await _status(resources, data, home);
      return (failed!['service'] as Map)['state'] == 'failed' &&
          _events(failed!, 'DSH 服务故障通知：').isNotEmpty;
    });
    final faults = _events(failed!, 'DSH 服务故障：');
    final notifications = _events(failed!, 'DSH 服务故障通知：');
    require(
      faults.length == 1 && notifications.length == 1,
      'manager independently records exactly one real fault and one notification result',
    );
    final fault = faults.single, notification = notifications.single;
    final faultId = fault['faultId'] as String;
    require(
      fault['pid'] == hostPid &&
          fault['instanceId'] == receipt['lease'] &&
          fault['signal'] == 'SIGKILL' &&
          notification['faultId'] == faultId &&
          notification['bundleIdentifier'] == _helperId &&
          (notification['submission'] as Map)['state'] == 'submitted',
      'actual Host fault correlates with one real helper submission',
    );
    final delivered = await _helperQuery(resources, 'delivered', faultId);
    evidence.addAll({
      'fault': fault,
      'managerNotification': notification,
      'delivered': delivered,
      'deliveredQueryCount': 1,
    });
    await save();
    require(
      delivered['faultId'] == faultId &&
          delivered['bundleIdentifier'] == _helperId &&
          (delivered['delivery'] as Map)['state'] == 'observed',
      'same exact fault notification exists in own system delivered list',
    );
    await Future<void>.delayed(const Duration(seconds: 2));
    final unchanged = await _status(resources, data, home);
    require(
      (unchanged['service'] as Map)['state'] == 'failed' &&
          (unchanged['service'] as Map)['instanceId'] == receipt['lease'] &&
          _events(unchanged, 'DSH 服务故障：').length == 1 &&
          _events(unchanged, 'DSH 服务故障通知：').length == 1 &&
          (await _run('/bin/kill', ['-0', '$hostPid'])).exitCode != 0,
      'fault remains stopped without another Host or notification attempt',
    );
    evidence.addAll({
      'phase': 'business-passed',
      'lastStatus': unchanged['service'],
      'humanFaultNotificationObservation': 'Root to collect separately',
      'explicitServiceStopNativeCaseRun': false,
    });
  } catch (error, stack) {
    failure = error;
    failureStack = stack;
    evidence.addAll({
      'phase': 'failed',
      'failure': error.toString(),
      'failureType': error.runtimeType.toString(),
    });
  }
  Object? cleanupFailure;
  StackTrace? cleanupStack;
  try {
    await closeProbeResources([
      (
        'VM',
        () async {
          await vm?.dispose();
        },
      ),
      (
        'Launcher fixture cleanup only',
        () async {
          final process = launcher;
          if (process != null && !launcherExited) {
            evidence['forcedLauncherCleanup'] = true;
            process.kill(ProcessSignal.sigterm);
            await process.exitCode.timeout(
              const Duration(seconds: 3),
              onTimeout: () async {
                process.kill(ProcessSignal.sigkill);
                return process.exitCode;
              },
            );
          }
        },
      ),
      (
        'SDK server',
        () async {
          await server?.close();
        },
      ),
      (
        'manager fixture cleanup only',
        () async {
          if (await managerFile.exists()) {
            final manager = jsonDecode(await managerFile.readAsString()) as Map;
            Process.killPid(manager['pid'] as int, ProcessSignal.sigterm);
            await _wait(
              'owned manager fixture disposal',
              () async => !await managerFile.exists(),
            );
          }
        },
      ),
      (
        'application output',
        () async {
          for (final subscription in subscriptions) {
            await subscription.cancel();
          }
          await output?.close();
        },
      ),
    ], preserveFailure: false);
  } catch (error, stack) {
    cleanupFailure = error;
    cleanupStack = stack;
    evidence['cleanupFailure'] = error.toString();
  }
  evidence['outcome'] = failure == null && cleanupFailure == null
      ? 'passed'
      : 'failed';
  await save();
  stdout.writeln(
    'S05_NATIVE_EVIDENCE=${root.path}/service-fault-evidence.json',
  );
  if (failure != null) {
    Error.throwWithStackTrace(failure, failureStack!);
  }
  if (cleanupFailure != null) {
    Error.throwWithStackTrace(cleanupFailure, cleanupStack!);
  }
}
