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
  List<String> arguments, {
  bool requireAutomaticStart = false,
  bool verifyDeepLink = false,
}) async {
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
  if (verifyDeepLink) {
    require(
      !latin1
          .decode(await kernel.readAsBytes())
          .contains('DSH_WORKFLOW_DESKTOP_NEEDED'),
      'paired URI acceptance requires an application without the old automatic Desktop fallback',
    );
  }
  final root = await Directory(parent)
      .createTemp(requireAutomaticStart ? 'dsh-s06-' : 'dsh-s01-');
  stdout.writeln('${requireAutomaticStart ? 'S06' : 'S01'}_ROOT=${root.path}');
  final evidence = <String, Object?>{
    'root': root.path,
    'userServiceUsed': false,
    'realMacosLoginTestPerformed': false,
    'systemLoginItemOperationsRequested': false,
    'controlledPreferencesRoot': '${root.path}/data',
    'automaticStartRequired': requireAutomaticStart,
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
  final fixtureBundleId =
      'com.ghostagent.dsh-workflow-launcher.acceptance.${root.path.split('/').last}';
  final isolatedIdentity = await Process.run('/usr/bin/plutil', [
    '-replace',
    'CFBundleIdentifier',
    '-string',
    fixtureBundleId,
    '$app/Contents/Info.plist',
  ]);
  require(
    isolatedIdentity.exitCode == 0,
    'only the owned application copy uses a fixture bundle identity',
  );
  final removedUrlTypes = await Process.run('/usr/bin/plutil', [
    '-remove',
    'CFBundleURLTypes',
    '$app/Contents/Info.plist',
  ]);
  require(
    removedUrlTypes.exitCode == 0,
    'owned application copy does not advertise a production URL scheme',
  );
  final isolatedInfo = await Process.run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    '$app/Contents/Info.plist',
  ]);
  final isolatedValues = jsonDecode(isolatedInfo.stdout.toString()) as Map;
  require(
    isolatedInfo.exitCode == 0 &&
        isolatedValues['CFBundleIdentifier'] == fixtureBundleId &&
        !isolatedValues.containsKey('CFBundleURLTypes') &&
        isolatedValues['DSHLauncherTestRoot'] == '${root.path}/data',
    'owned fixture identity, URL registration isolation and native test root are verified before signing',
  );
  evidence['fixtureBundleIdentifier'] = fixtureBundleId;
  evidence['fixtureUrlTypesAbsent'] = true;
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
  late final int webPort;
  if (verifyDeepLink) {
    final data = await Directory('${root.path}/data').create();
    final password = File('${data.path}/lan-password');
    await password.writeAsString('s06-isolated-web-password');
    final protectedData = await Process.run('/bin/chmod', ['700', data.path]);
    final protectedPassword = await Process.run('/bin/chmod', [
      '600',
      password.path,
    ]);
    require(
      protectedData.exitCode == 0 && protectedPassword.exitCode == 0,
      'paired URI acceptance preloads only an owned private Web password',
    );
    final available = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    webPort = available.port;
    await available.close();
    evidence['webPort'] = webPort;
  }
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': resource,
    'DSH_LAUNCHER_TEST_SOCKET': server.layout.socketPath,
    'DSH_HOME': '${root.path}/home',
    'HOME': '${root.path}/os-home',
    'TMPDIR': root.path,
    if (verifyDeepLink) 'DSH_LAUNCHER_TEST_PORT': '$webPort',
  };
  _ServiceApplication? current;
  try {
    current = await _ServiceApplication.start(
      executable,
      environment,
      '${root.path}/first-app.log',
    );
    final first = await currentSdkSession(server);
    if (verifyDeepLink) {
      evidence['beforeFreshUri'] = await first.sendRequest(
        'status',
        serviceId: 'desktop',
        timeout: const Duration(seconds: 5),
      );
      evidence['freshUriTarget'] = await current.openGlobal(app);
    }
    await waitFor(
      requireAutomaticStart
          ? 'opening the actual launcher automatically starts the real Host'
          : 'real UI independent service readiness',
      () async => (await current!.state()).toString().contains('DSH 服务：已就绪'),
    );
    if (!requireAutomaticStart) await current.tap('启动 DSH 服务');
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
    if (verifyDeepLink) {
      await _runLauncherDeepLinkChecks(
        current,
        first,
        receiptFile,
        receipt,
        webPort,
        app,
        evidence,
      );
      evidence['outcome'] = 'passed';
      stdout.writeln('S06 REAL LAUNCHER URI PROBE PASSED');
      return;
    }
    final untouchedWeb = await first.sendRequest(
      'status',
      serviceId: 'web',
      timeout: const Duration(seconds: 5),
    );
    require(
      (untouchedWeb['result'] as Map)['state'] == 'stopped' &&
          (untouchedWeb['result'] as Map)['ready'] != true &&
          native['lastOpenedUrl'] == null,
      'ordinary launcher boot starts the business service without opening Web',
    );
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
    require(
      ((await current.state())['native'] as Map)['openedDesktopPid'] == null,
      'reopening the launcher also leaves the Desktop client closed',
    );
    await current.capture('${root.path}/service-reopened');
    if (requireAutomaticStart) {
      Future<Map> statusOf(ServerSession session) async =>
          (await session.sendRequest(
                'status',
                serviceId: 'desktop',
                timeout: const Duration(seconds: 5),
              ))['result']
              as Map;
      Future<Map> crashHost(ServerSession session, Map host) async {
        require(
          Process.killPid(host['pid'] as int, ProcessSignal.sigkill),
          'the scenario terminates only its owned Host to exercise a real failure',
        );
        late Map stopped;
        await waitFor('official SDK observes the real Host failure', () async {
          stopped = await statusOf(session);
          return stopped['state'] == 'failed' && stopped['ready'] == false;
        });
        return stopped;
      }

      Future<void> staysStopped(
        ServerSession session,
        Map host,
        String label,
      ) async {
        final observations = <Map<String, Object?>>[];
        evidence[label] = observations;
        final elapsed = Stopwatch()..start();
        while (elapsed.elapsed < const Duration(seconds: 8)) {
          final status = await statusOf(session);
          final actual = await receiptFile.exists()
              ? jsonDecode(await receiptFile.readAsString()) as Map
              : null;
          final dead = await Process.run('/bin/kill', ['-0', '${host['pid']}']);
          observations.add({
            'elapsedMs': elapsed.elapsedMilliseconds,
            'status': status,
            'receiptPid': actual?['pid'],
            'receiptInstance': actual?['lease'],
            'originalHostAlive': dead.exitCode == 0,
          });
          require(
            status['state'] == 'failed' &&
                status['ready'] == false &&
                dead.exitCode != 0 &&
                (actual == null ||
                    (actual['pid'] == host['pid'] &&
                        actual['lease'] == host['lease'])),
            '$label keeps the real service stopped without another Host',
          );
          await Future<void>.delayed(const Duration(milliseconds: 500));
        }
        evidence['${label}DurationMs'] = elapsed.elapsedMilliseconds;
      }

      await crashHost(reopened, receipt);
      await staysStopped(reopened, receipt, 'afterHostCrash');
      await current.capture('${root.path}/service-crashed');
      await current.quit();
      current = null;
      await waitFor(
        'crashed-service launcher disconnect',
        () async => server.sessionFor('dsh-workflow') == null,
      );
      current = await _ServiceApplication.start(
        executable,
        environment,
        '${root.path}/after-crash-app.log',
      );
      final recovered = await currentSdkSession(server);
      await waitFor(
        'a fresh launcher boot starts the service after an earlier Host failure',
        () async => (await current!.state()).toString().contains('DSH 服务：已就绪'),
      );
      final recoveredStatus = await statusOf(recovered);
      final recoveredHost = jsonDecode(await receiptFile.readAsString()) as Map;
      require(
        recoveredStatus['ready'] == true &&
            recoveredStatus['instanceId'] == recoveredHost['lease'] &&
            recoveredHost['lease'] != receipt['lease'] &&
            recoveredHost['pid'] != receipt['pid'],
        'a fresh launcher boot recovers a new actual Host without a service-start click',
      );
      evidence['afterCrashReopen'] = recoveredStatus;
      await current.capture('${root.path}/service-after-crash-reopened');
      final crashed = await crashHost(recovered, recoveredHost);
      await current.quit();
      current = null;
      await waitFor(
        'launcher disconnect before isolated startup failure',
        () async => server.sessionFor('dsh-workflow') == null,
      );
      final desktopResource = Link('$resource/desktop');
      final unavailable = await desktopResource.rename(
        '$resource/desktop-disabled',
      );
      ServerSession? failedSession;
      var failureObserved = false;
      try {
        current = await _ServiceApplication.start(
          executable,
          environment,
          '${root.path}/failed-start-app.log',
        );
        failedSession = await currentSdkSession(server);
        late Map startupFailure;
        await waitFor(
          'real launcher reports its failed boot attempt',
          () async {
            startupFailure = await statusOf(failedSession!);
            return startupFailure['state'] == 'failed' &&
                startupFailure['ready'] == false &&
                startupFailure['message'] is String &&
                (startupFailure['message'] as String).isNotEmpty &&
                startupFailure['message'] != crashed['message'];
          },
        );
        await waitFor(
          'startup failure remains visible in the real Launcher',
          () async => (await current!.state()).toString().contains(
            startupFailure['message'] as String,
          ),
        );
        evidence['startupFailure'] = startupFailure;
        await current.capture('${root.path}/service-startup-failed');
        failureObserved = true;
      } finally {
        await closeProbeResources([
          (
            'owned staged Desktop resource',
            () async {
              await unavailable.rename(desktopResource.path);
            },
          ),
        ], preserveFailure: !failureObserved);
      }
      await staysStopped(failedSession, recoveredHost, 'afterStartupFailure');
      await current.tap('启动 DSH 服务');
      await waitFor(
        'manual start recovers after the failed boot without reopening Launcher',
        () async => (await current!.state()).toString().contains('DSH 服务：已就绪'),
      );
      final manual = await statusOf(failedSession);
      final manualHost = jsonDecode(await receiptFile.readAsString()) as Map;
      final finalNative = (await current.state())['native'] as Map;
      require(
        manual['ready'] == true &&
            manual['instanceId'] == manualHost['lease'] &&
            manualHost['lease'] != recoveredHost['lease'] &&
            finalNative['openedDesktopPid'] == null,
        'explicit manual start restores a new actual service and still leaves Desktop closed',
      );
      evidence['manualRecovery'] = manual;
      evidence['finalNative'] = finalNative;
      await current.capture('${root.path}/service-manual-recovered');
    }
    evidence['outcome'] = 'passed';
    stdout.writeln(
      requireAutomaticStart
          ? 'S06 REAL LAUNCHER AUTOSTART PROBE PASSED'
          : 'S01 REAL UI AND OFFICIAL SDK SERVICE PROBE PASSED',
    );
  } catch (error) {
    evidence['outcome'] = 'failed';
    evidence['error'] = error.toString();
    final failedApp = current;
    if (failedApp != null) {
      try {
        evidence['failureUi'] = await failedApp.state();
        final failureSession = server.sessionFor('dsh-workflow');
        if (failureSession != null) {
          evidence['failureServiceStatus'] = await failureSession.sendRequest(
            'status',
            serviceId: 'desktop',
            timeout: const Duration(seconds: 5),
          );
        }
        evidence['failureUiAfterStatus'] = await failedApp.state();
        await failedApp.state({'action': 'ownEntry'});
        await Future<void>.delayed(const Duration(milliseconds: 500));
        evidence['failureUiAfterActivation'] = await failedApp.state();
        await failedApp.capture('${root.path}/service-failure');
      } catch (diagnosticError) {
        evidence['failureDiagnosticError'] = diagnosticError.toString();
      }
    }
    rethrow;
  } finally {
    try {
      await closeProbeResources([
        if (verifyDeepLink)
          (
            'owned Web access fixture',
            () async {
              final session = server.sessionFor('dsh-workflow');
              if (session == null) return;
              final recycled = await session.sendRequest(
                'recycle',
                serviceId: 'web',
                timeout: const Duration(seconds: 10),
              );
              require(
                recycled['error'] == null,
                'owned Web access fixture is recycled',
              );
            },
          ),
        (
          'owned launcher',
          () async {
            await current?.quit();
          },
        ),
        ('official SDK', server.close),
        if (verifyDeepLink)
          (
            'owned Web daemon fixture',
            () => _closeOwnedWebDaemon(root, resource, evidence),
          ),
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
      await File(
        '${root.path}/${verifyDeepLink
            ? 'deeplink'
            : requireAutomaticStart
            ? 'autostart'
            : 'service'}-evidence.json',
      ).writeAsString(jsonEncode(evidence));
    }
  }
}

Future<void> _runLauncherDeepLinkChecks(
  _ServiceApplication app,
  ServerSession session,
  File receiptFile,
  Map host,
  int port,
  String appPath,
  Map<String, Object?> evidence,
) async {
  Future<Map> status(String service) async {
    final reply = await session.sendRequest(
      'status',
      serviceId: service,
      timeout: const Duration(seconds: 5),
    );
    if (reply['error'] != null) {
      throw StateError('URI service status failed: $reply');
    }
    return reply['result'] as Map;
  }

  final startupStates = <Map>[];
  evidence['webStartupStates'] = startupStates;
  final startup = Stopwatch()..start();
  while (true) {
    final web = await status('web');
    startupStates.add(web);
    if (web['state'] == 'running' && web['ready'] == true) break;
    if ((web['state'] == 'failed' || web['state'] == 'unknown') &&
        web['message'] is String &&
        (web['message'] as String).isNotEmpty) {
      throw StateError('Launcher URI Web startup failed: ${web['message']}');
    }
    if (startup.elapsed >= const Duration(seconds: 15)) {
      throw StateError('Launcher URI Web startup did not become ready: $web');
    }
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  final url = Uri.parse('http://127.0.0.1:$port/');
  try {
    final login = await client.postUrl(url.resolve('login'));
    login.followRedirects = false;
    login.headers.contentType = ContentType(
      'application',
      'x-www-form-urlencoded',
    );
    login.write('password=s06-isolated-web-password');
    final authenticated = await login.close().timeout(
      const Duration(seconds: 10),
    );
    final cookies = authenticated.cookies;
    await authenticated.drain<void>();
    evidence['webLoginStatus'] = authenticated.statusCode;
    evidence['webLoginIssuedCookie'] = cookies.isNotEmpty;
    require(
      authenticated.statusCode == 303 && cookies.isNotEmpty,
      'fresh Launcher URI authenticates against its actual owned Web gateway',
    );
    Future<({int code, String body})> plugins() async {
      final request = await client.postUrl(
        url.resolve('api/pluginManager/listPlugins'),
      );
      request.followRedirects = false;
      request.headers.contentType = ContentType.json;
      request.cookies.addAll(cookies);
      request.write(
        jsonEncode({
          'type': 'client-request',
          'rpcId': 's06-uri-plugins',
          'method': 'pluginManager/listPlugins',
          'payload': {'args': {}},
        }),
      );
      final reply = await request.close().timeout(const Duration(seconds: 10));
      return (
        code: reply.statusCode,
        body: await reply.transform(utf8.decoder).join(),
      );
    }

    final first = await plugins();
    evidence['freshWebRpcStatus'] = first.code;
    require(
      first.code == 200,
      'fresh Launcher URI reaches the actual authenticated Host RPC',
    );
    final active =
        ((jsonDecode(first.body) as Map)['result'] as Map)['value'] as List;
    require(
      ['dsh-workflow/jev-center', 'dsh-workflow/agent-monitor'].every(
        (name) => active.cast<Map>().any(
          (row) => row['moduleName'] == name && row['fiberPhase'] == 'active',
        ),
      ),
      'URI Web access observes the real Host project plugins',
    );
    evidence['freshWebStatus'] = await status('web');
    await app.capture('${Directory(appPath).parent.path}/uri-web-ready');
    require(
      Process.killPid(host['pid'] as int, ProcessSignal.sigkill),
      'URI failure scenario terminates only its verified owned Host',
    );
    await waitFor('URI scenario observes the actual stopped Host', () async {
      final service = await status('desktop');
      return service['state'] == 'failed' && service['ready'] == false;
    });
    await waitFor(
      'retained Web access remains running after the Host exits',
      () async {
        final web = await status('web');
        return web['state'] == 'running';
      },
    );
    require(
      (await plugins()).code == 503,
      'retained authenticated Web access reports the stopped Host',
    );
    evidence['stoppedHostUriTarget'] = await app.openGlobal(appPath);
    final observations = <Map<String, Object?>>[];
    evidence['afterStoppedHostUri'] = observations;
    final elapsed = Stopwatch()..start();
    while (elapsed.elapsed < const Duration(seconds: 8)) {
      final service = await status('desktop');
      final web = await status('web');
      final actual = await receiptFile.exists()
          ? jsonDecode(await receiptFile.readAsString()) as Map
          : null;
      final native = (await app.state())['native'] as Map;
      final dead = await Process.run('/bin/kill', ['-0', '${host['pid']}']);
      observations.add({
        'elapsedMs': elapsed.elapsedMilliseconds,
        'service': service,
        'web': web,
        'receiptPid': actual?['pid'],
        'receiptInstance': actual?['lease'],
        'openedDesktopPid': native['openedDesktopPid'],
      });
      require(
        service['state'] == 'failed' &&
            service['ready'] == false &&
            web['state'] == 'running' &&
            dead.exitCode != 0 &&
            native['openedDesktopPid'] == null &&
            (actual == null ||
                (actual['pid'] == host['pid'] &&
                    actual['lease'] == host['lease'])),
        'a later URI in the same Launcher does not restart the stopped Host or open Desktop',
      );
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    evidence['afterStoppedHostUriDurationMs'] = elapsed.elapsedMilliseconds;
    final unavailable = await plugins();
    require(
      unavailable.code == 503,
      'URI access continues reporting actual business unavailability',
    );
    evidence['stoppedWebStatus'] = await status('web');
    evidence['stoppedWebRpcStatus'] = unavailable.code;
    await app.capture(
      '${Directory(appPath).parent.path}/uri-service-unavailable',
    );
  } finally {
    client.close(force: true);
  }
}

Future<void> _closeOwnedWebDaemon(
  Directory root,
  String resources,
  Map<String, Object?> evidence,
) async {
  final record = File(
    '${root.path}/data/global/.dsh-workflow/web/manager.json',
  );
  if (!await record.exists()) return;
  final uid = await Process.run('/usr/bin/id', ['-u']);
  final ownership = await Process.run('/usr/bin/stat', [
    '-f',
    '%u %l',
    record.path,
  ]);
  require(
    await FileSystemEntity.type(record.path, followLinks: false) ==
            FileSystemEntityType.file &&
        await record.resolveSymbolicLinks() == record.absolute.path &&
        ((await record.stat()).mode & 0x1ff) == 0x180 &&
        uid.exitCode == 0 &&
        ownership.exitCode == 0 &&
        ownership.stdout.toString().trim() ==
            '${uid.stdout.toString().trim()} 1',
    'Web cleanup accepts only a private UID-owned canonical fixture record',
  );
  final value = jsonDecode(await record.readAsString()) as Map;
  require(
    value['protocol'] == 1 && value['pid'] is int && (value['pid'] as int) > 1,
    'owned Web fixture record provides its actual daemon identity',
  );
  final pid = value['pid'] as int;
  final identity = await Process.run('/bin/ps', [
    '-ww',
    '-p',
    '$pid',
    '-o',
    'uid=,command=',
  ]);
  final command = identity.stdout.toString().trim();
  require(
    identity.exitCode == 0 &&
        command.split(RegExp(r'\s+')).first == uid.stdout.toString().trim() &&
        command.contains(
          '$resources/workflow/macos-launcher/runtime/global-supervisor.mjs',
        ) &&
        RegExp('(?:^|\\s)${RegExp.escape('${root.path}/data')}(?:\\s|\$)')
            .hasMatch(command),
    'Web cleanup verifies the actual UID, script and complete owned data root before signalling',
  );
  evidence['ownedWebDaemonPid'] = pid;
  require(
    Process.killPid(pid, ProcessSignal.sigterm),
    'owned Web daemon receives fixture cleanup',
  );
  await waitFor('owned Web daemon releases its record and exits', () async {
    final live = await Process.run('/bin/kill', ['-0', '$pid']);
    return !await record.exists() && live.exitCode != 0;
  });
  evidence['ownedWebDaemonReaped'] = true;
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

  Future<Map<String, Object?>> openGlobal(String app) async {
    final native = (await state())['native'] as Map;
    final identity = await Process.run('/bin/ps', [
      '-ww',
      '-p',
      '${process.pid}',
      '-o',
      'command=',
    ]);
    final actualApp = await Directory(app).resolveSymbolicLinks();
    require(
      native['pid'] == process.pid &&
          native['isolated'] == true &&
          native['dataRoot'] == '${Directory(app).parent.path}/data' &&
          actualApp == Directory(app).absolute.path &&
          identity.exitCode == 0 &&
          identity.stdout.toString().contains('$app/Contents/MacOS/'),
      'the URI target is the exact owned application path and live native PID',
    );
    final opened = await Process.run('/usr/bin/open', [
      '-a',
      actualApp,
      'dsh-workflow://open-global',
    ]);
    require(
      opened.exitCode == 0,
      'macOS delivers the URI directly to the verified owned application (${opened.exitCode}): ${opened.stderr}',
    );
    require(
      ((await state())['native'] as Map)['pid'] == process.pid,
      'URI dispatch reuses the same actual Launcher process',
    );
    return {
      'pid': process.pid,
      'application': actualApp,
      'openExit': opened.exitCode,
    };
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
