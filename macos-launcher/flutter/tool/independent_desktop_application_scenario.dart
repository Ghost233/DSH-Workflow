import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate' as dart_isolate;

import 'package:launcher_core/launcher_core.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import 'application_probe.dart' show require, waitFor, closeProbeResources;
import 'probe_diagnostics.dart' show safeInspectorOutput;
import 'desktop_window_application_scenario.dart' show DesktopWindowProbe;
import 'web_application_scenario.dart' show currentSdkSession;
import 'service_task_fixture.dart' show ServiceTaskFixture;

/// The actual launcher opens an actual Electron client against one isolated Host.
Future<void> main(List<String> arguments) async {
  final acceptedTaskCase =
      arguments.length == 3 && arguments[2] == '--accepted-task';
  final nativeFilesCdpCase =
      arguments.length == 3 && arguments[2] == '--native-files-cdp';
  final nativeCapabilitiesCase =
      nativeFilesCdpCase ||
      (arguments.length == 3 && arguments[2] == '--native-capabilities');
  final platformCase = arguments.length == 3 && arguments[2] == '--platform';
  final controlledModelCase =
      acceptedTaskCase || nativeCapabilitiesCase || platformCase;
  if (arguments.length != 2 && !controlledModelCase) {
    throw ArgumentError(
      'Pass Debug executable, frozen resources and optional --accepted-task, --native-capabilities, --native-files-cdp or --platform',
    );
  }
  if (nativeFilesCdpCase) {
    require(
      Platform.environment['DSH_S02_OWNED_FILES_CDP'] == '1',
      'owned file drag requires this explicitly authorized isolated test mode',
    );
  }
  final parent = Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'];
  if (Platform.environment['GITHUB_ACTIONS'] == 'true' || parent == null) {
    throw ArgumentError(
      'Desktop local acceptance requires its explicit private local root',
    );
  }
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
    'desktop probe uses a canonical UID-owned mode-0700 root',
  );
  final source = File(arguments[0]).absolute;
  final sourceApp = source.parent.parent.parent;
  final info = File('${sourceApp.path}/Contents/Info.plist');
  final kernel = File(
    '${sourceApp.path}/Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin',
  );
  require(
    await info.exists() && await kernel.exists(),
    'desktop probe accepts only the project Debug app',
  );
  final metadata = await Process.run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    info.path,
  ]);
  final values = jsonDecode(metadata.stdout.toString()) as Map;
  final library = File('${source.path}.debug.dylib');
  final bytes = latin1.decode([
    ...await source.readAsBytes(),
    if (await library.exists()) ...await library.readAsBytes(),
  ]);
  require(
    values['CFBundleIdentifier'] == 'com.ghostagent.dsh-workflow-launcher' &&
        bytes.contains('DSHLauncherTestRoot') &&
        bytes.contains('test-preferences.plist') &&
        bytes.contains('DSH_LAUNCHER_TEST_DESKTOP_CDP') &&
        latin1
            .decode(await kernel.readAsBytes())
            .contains('ext.dshlauncher.application'),
    'desktop candidate has native isolation and the existing semantic driver',
  );
  final root = await Directory(parent).createTemp('dsh-s02-');
  stdout.writeln('S02_ROOT=${root.path}');
  final evidence = <String, Object?>{
    'root': root.path,
    'userServiceUsed': false,
  };
  final app = '${root.path}/candidate.app';
  require(
    (await Process.run('/usr/bin/ditto', [sourceApp.path, app])).exitCode == 0,
    'desktop probe owns the Debug app copy',
  );
  final resource = '${root.path}/resources';
  final artifact = Directory(arguments[1]).absolute.path;
  final package = await dart_isolate.Isolate.resolvePackageUri(
    Uri.parse('package:dsh_workflow_launcher/main.dart'),
  );
  if (package == null) throw StateError('Current project source unavailable');
  final project = File.fromUri(package).parent.parent.parent.parent.path;
  final staged = await Process.run('$artifact/node', [
    '$project/macos-launcher/flutter/tool/independent_service_resources.mjs',
    artifact,
    resource,
  ]);
  require(
    staged.exitCode == 0,
    'desktop probe stages current project resources: ${staged.stderr}',
  );
  if (controlledModelCase) {
    final taskResources = await Process.run('$artifact/node', [
      '$project/macos-launcher/flutter/tool/service_task_resources.mjs',
      resource,
      root.path,
    ]);
    require(
      taskResources.exitCode == 0,
      'owned external model fixture is installed before the real Host starts',
    );
  }
  await Link('$resource/desktop').delete();
  require(
    (await Process.run('/usr/bin/ditto', [
          '$artifact/desktop',
          '$resource/desktop',
        ])).exitCode ==
        0,
    'desktop probe owns a physical Desktop copy and never edits frozen resources through a symlink',
  );
  final adapted = await Process.run('$artifact/node', [
    '$project/macos-launcher/desktop-adaptation.mjs',
    '$resource/desktop/DeepSeek Harness.app',
  ]);
  require(
    adapted.exitCode == 0,
    'native fixture uses the production staging adapter: ${adapted.stderr}',
  );
  evidence['desktopAdaptation'] = jsonDecode(adapted.stdout.toString());
  final desktopResources =
      '$resource/desktop/DeepSeek Harness.app/Contents/Resources';
  final desktopMain = File('$desktopResources/app/lib/main.js');
  require(
    await desktopMain.resolveSymbolicLinks() == desktopMain.absolute.path,
    'Desktop main belongs to the physical private copy before any test-only write',
  );
  final originalMain = await desktopMain.readAsString();
  const loggingCall = 'app.setAppLogsPath();';
  const protocolCall = 'app.setAsDefaultProtocolClient("dsh")';
  const protocolIsolation =
      'false /* S02 fixture preserves the user protocol mapping */';
  require(
    originalMain.split(loggingCall).length == 2 &&
        originalMain.split(protocolCall).length == 2,
    'fixed Desktop has one logging and one OS protocol registration boundary to isolate',
  );
  final logs = await Directory('${root.path}/desktop-logs').create();
  final loggingIsolation =
      'app.setAppLogsPath(${jsonEncode(logs.path)});\n'
      'if (app.getPath("logs") !== ${jsonEncode(logs.path)}) throw new Error("S02 fixture logs path mismatch");\n'
      'console.info("S02_OWNED_LOGS_ROOT=" + app.getPath("logs"));';
  final originalSha = await Process.run('/usr/bin/shasum', [
    '-a',
    '256',
    desktopMain.path,
  ]);
  require(
    originalSha.exitCode == 0,
    'fixed Desktop main input hash is recorded',
  );
  final isolatedMain = originalMain
      .replaceFirst(loggingCall, loggingIsolation)
      .replaceFirst(protocolCall, protocolIsolation);
  require(
    isolatedMain
            .replaceFirst(loggingIsolation, loggingCall)
            .replaceFirst(protocolIsolation, protocolCall) ==
        originalMain,
    'native fixture changes only the approved logging and OS registration boundaries',
  );
  await desktopMain.writeAsString(isolatedMain);
  final isolatedSha = await Process.run('/usr/bin/shasum', [
    '-a',
    '256',
    desktopMain.path,
  ]);
  require(isolatedSha.exitCode == 0, 'isolated Desktop main hash is recorded');
  final isolatedPlist = await Process.run('/usr/bin/python3', [
    '-c',
    'import sys,plistlib,hashlib,json; p=sys.argv[1]; original=open(p,"rb").read(); value=plistlib.loads(original); '
        'assert "CFBundleURLTypes" in value; old=value["CFBundleIdentifier"]; expected=dict(value); '
        'expected.pop("CFBundleURLTypes"); expected["CFBundleIdentifier"]="com.ghostagent.dsh-workflow.s02-fixture"; '
        'changed=plistlib.dumps(expected,sort_keys=False); open(p,"wb").write(changed); '
        'assert plistlib.loads(open(p,"rb").read())==expected; '
        'print(json.dumps({"originalInfoSha256":hashlib.sha256(original).hexdigest(),"isolatedInfoSha256":hashlib.sha256(changed).hexdigest(),'
        '"originalBundleId":old,"fixtureBundleId":expected["CFBundleIdentifier"],"urlTypesRemoved":True,"changedInfoKeys":["CFBundleIdentifier","CFBundleURLTypes"]}))',
    '$resource/desktop/DeepSeek Harness.app/Contents/Info.plist',
  ]);
  require(
    isolatedPlist.exitCode == 0,
    'owned Desktop metadata changes only fixture BundleID and URL registration',
  );
  evidence['desktopFixture'] = {
    ...jsonDecode(isolatedPlist.stdout.toString()) as Map<String, dynamic>,
    'originalMainSha256': originalSha.stdout.toString().split(' ').first,
    'isolatedMainSha256': isolatedSha.stdout.toString().split(' ').first,
    'logsPath': logs.path,
    'changedBoundaries': [
      'app.setAppLogsPath',
      'app.setAsDefaultProtocolClient',
    ],
    'hostLifecycleChangedByOsIsolation': false,
  };
  if (Platform.environment['DSH_S02_QUIT_TRACE'] == '1') {
    final instrumented = await Process.run('$artifact/node', [
      '$project/macos-launcher/flutter/tool/desktop_quit_trace.mjs',
      root.path,
      isolatedSha.stdout.toString().split(' ').first,
    ]);
    require(
      instrumented.exitCode == 0,
      'owned Desktop Quit stage instrumentation has exact fixed anchors: ${instrumented.stderr}',
    );
    evidence['desktopQuitTracePatch'] = jsonDecode(
      instrumented.stdout.toString(),
    );
  }
  require(
    (await Process.run('/usr/bin/codesign', [
          '--force',
          '--deep',
          '--sign',
          '-',
          '$resource/desktop/DeepSeek Harness.app',
        ])).exitCode ==
        0,
    'physical owned Desktop is signed after test-only OS boundary isolation',
  );

  final desktopManifest = jsonDecode(
    await File('$desktopResources/app/package.json').readAsString(),
  ) as Map;
  require(
    desktopManifest['version'] == '0.2.1-alpha.5' &&
        !desktopManifest.containsKey('dshMandatoryUpdatePolicy') &&
        !await File('$desktopResources/app-update.yml').exists(),
    'fixed Desktop fixture has neither a packaged update source nor mandatory policy',
  );
  final profilePatch = File(
    '${root.path}/home/profiles/desktop/cordis.patch.yml',
  );
  final patches = (jsonDecode(await profilePatch.readAsString()) as List);
  patches.addAll([
    {
      'id': 'ui-settings-account',
      'config': {'step': 'done', 'completion': 'completed'},
    },
    {
      'id': 'ui-settings-models',
      'config': {'credentialOnboarding': false},
    },
  ]);
  await profilePatch.writeAsString(jsonEncode(patches));
  require(
    (await Process.run('/usr/bin/plutil', [
          '-replace',
          'DSHLauncherTestRoot',
          '-string',
          '${root.path}/data',
          '$app/Contents/Info.plist',
        ])).exitCode ==
        0,
    'Debug copy carries its owned isolation root',
  );
  require(
    (await Process.run('/usr/bin/codesign', [
          '--force',
          '--deep',
          '--sign',
          '-',
          app,
        ])).exitCode ==
        0,
    'owned Debug candidate is signed after isolation metadata',
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
    'official association resolves to the owned Debug app',
  );
  final bindings = await BindingStore.load('${root.path}/bindings.json');
  await bindings.associate(manifestPath);
  final server = await LauncherServer.start(
    layout: EndpointLayout(directory: '${root.path}/manager'),
    bindings: bindings,
  );
  await Directory('${root.path}/os-home').create();
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': resource,
    'DSH_LAUNCHER_TEST_SOCKET': server.layout.socketPath,
    'DSH_LAUNCHER_TEST_DESKTOP_CDP': '1',
    'DSH_HOME': '${root.path}/home',
    'DEEPSEEK_API_KEY': 's02-public-fixture-only',
    'HOME': '${root.path}/os-home',
    'ZDOTDIR': '${root.path}/os-home',
    'TMPDIR': root.path,
  };
  final receiptFile = File(
    '${root.path}/data/global/.dsh-workflow/desktop/desktop-host.json',
  );
  _DesktopApplication? launcher;
  _DesktopCdp? client;
  DesktopWindowProbe? windows;
  ServiceTaskFixture? task;
  _DesktopApplication? resumedLauncher;
  Process? platformServer;
  Future<String>? platformOutput, platformErrors;
  String? platformOrigin;
  try {
    if (platformCase) {
      platformServer = await Process.start('$artifact/node', [
        '$project/macos-launcher/flutter/tool/platform_fixture.mjs',
        root.path,
      ], environment: environment);
      platformOutput = platformServer.stdout.transform(utf8.decoder).join();
      platformErrors = platformServer.stderr.transform(utf8.decoder).join();
      final address = File('${root.path}/platform-fixture.json');
      await waitFor('owned loopback external Platform fixture', address.exists);
      platformOrigin =
          (jsonDecode(await address.readAsString()) as Map)['origin'] as String;
      patches.add({
        'id': 'deepseek-account',
        'config': {
          'platformOrigin': platformOrigin,
          'inferenceOrigin': platformOrigin,
          'allowLoopbackHttp': true,
          'rewriteBrowserOrigin': true,
          'desktopPlatform': 'darwin',
        },
      });
      await profilePatch.writeAsString(jsonEncode(patches));
    }
    windows = await DesktopWindowProbe.start(root);
    final windowObserver = windows;
    launcher = await _DesktopApplication.start(
      '$app/Contents/MacOS/${source.uri.pathSegments.last}',
      environment,
      '${root.path}/launcher.log',
    );
    final initialNative = (await launcher.state())['native'] as Map;
    require(
      initialNative['isolated'] == true &&
          initialNative['ownQuitTraceEnabled'] == true,
      'actual Debug candidate confirms the strict owned-root Desktop test gate before OS launch',
    );
    final sdk = await currentSdkSession(server);
    final started = await sdk.sendRequest(
      'start',
      serviceId: 'desktop',
      timeout: const Duration(seconds: 45),
    );
    require(
      started['error'] == null,
      'official SDK starts or reuses the real independent Host',
    );
    final before = jsonDecode(await receiptFile.readAsString()) as Map;
    final workspace = await Directory('${root.path}/S02-existing-workspace')
        .create();
    final picked = '${root.path}/S02-picked-directory';
    if (nativeCapabilitiesCase) {
      if (!nativeFilesCdpCase) {
        await Directory(picked).create();
      }
      await File('${workspace.path}/S02-native-drop.txt')
          .writeAsString('S02 native drag reference 42\n');
      final office = await Process.run('/usr/bin/python3', [
        '-I',
        '-B',
        '$project/macos-launcher/flutter/tool/native_office_input.py',
        workspace.path,
      ]);
      require(
        office.exitCode == 0,
        'owned standard Office fixture is created without installing dependencies',
      );
    }
    final connection = await officialDesktopConnection(
      resource,
      root,
      environment,
    );
    require(
      connection['instanceId'] == before['lease'] &&
          connection['pid'] == before['pid'],
      'formal client connection belongs to the original actual Host',
    );
    final rpc = _HostRpc(connection['url'] as String);
    try {
      await rpc.authenticate();
      final created = await rpc.invoke('workspace/create', {
        'request': {'path': workspace.path},
      }) as Map;
      final workspaceId = ((created['workspace'] as Map)['workspaceId']);
      final session = await rpc.invoke('session/create', {
        'request': {'workspaceId': workspaceId},
      }) as Map;
      await rpc.invoke('session/rename', {
        'request': {
          'sessionId': session['sessionId'],
          'title': 'S02 existing session',
        },
      });
      if (controlledModelCase) {
        final tasks = ServiceTaskFixture(root.path);
        task = tasks;
        await tasks.connect({'url': connection['url']});
        await tasks.rpc('session/selectModel', {
          'request': {
            'sessionId': session['sessionId'],
            'provider': 'service-task-fixture',
            'model': 'held-task',
          },
        });
        final accepted = await tasks.rpc('session/prompt', {
          'request': {
            'requestId': 's02-task-${DateTime.now().microsecondsSinceEpoch}',
            'sessionId': session['sessionId'],
            'mode': 'queue',
            'content': [
              {
                'type': 'text',
                'text': acceptedTaskCase
                    ? 'S02 task continues after both clients quit'
                    : 'S02 native capability controlled session',
              },
            ],
          },
        }) as Map;
        require(
          accepted['accepted'] == true,
          'actual Host accepts the desktop continuity task',
        );
        await tasks.waitForModelRequest(1);
        if (nativeCapabilitiesCase || platformCase) {
          await tasks.releaseModel(1);
          await tasks.waitForResult(session['sessionId'] as String, 1);
          await tasks.releaseModel(2);
        }
        evidence['acceptedTask'] = {
          'sessionId': session['sessionId'],
          'accepted': true,
          'externalModelRequested': true,
        };
      }
      if (platformCase) {
        final origin = Uri.parse(platformOrigin!);
        final provider = await rpc.invoke('account/getState', {}) as Map;
        final links = provider['links'] as Map;
        require(
          origin.scheme == 'http' &&
              origin.host == '127.0.0.1' &&
              origin.port > 0 &&
              origin.userInfo.isEmpty &&
              origin.toString() == origin.origin &&
              links['usageUrl'] == '${origin.origin}/usage' &&
              links['topUpUrl'] == '${origin.origin}/top_up',
          'actual account provider is bound to the owned loopback Platform before sign-in',
        );
        evidence['platformLoopbackProviderVerified'] = true;
        final metadata = {
          'version': '0.2.1-alpha.5',
          'locale': 'zh-CN',
          'timezoneOffsetSeconds': DateTime.now().timeZoneOffset.inSeconds,
        };
        await rpc.invoke('account/startSignIn', {
          'client': metadata,
          'callbackOrigin': Uri.parse(connection['url'] as String).origin,
          'loginSource': 'desktop',
        });
        await waitFor(
          'actual Host waits for the controlled browser callback',
          () async {
            final state = await rpc.invoke('account/getState', {}) as Map;
            return (state['attempt'] as Map?)?['phase'] == 'waiting-browser';
          },
        );
        final callback = jsonDecode(
          await File('${root.path}/platform-login-callback.json')
              .readAsString(),
        ) as Map;
        final callbackUri = Uri.parse(callback['redirectUri'] as String)
            .replace(
              queryParameters: {
                'state': callback['state'] as String,
                'code': 's02-controlled-code',
              },
            );
        final browser = HttpClient();
        try {
          final request = await browser.getUrl(callbackUri);
          request.followRedirects = false;
          final response = await request.close();
          await response.drain<void>();
          require(
            response.statusCode == 302 || response.statusCode == 303,
            'fresh browser callback succeeds without an existing Host cookie',
          );
        } finally {
          browser.close(force: true);
        }
        await waitFor(
          'real Host commits the controlled Platform grant',
          () async {
            final state = await rpc.invoke('account/getState', {}) as Map;
            return state['status'] == 'credential-stored' &&
                (state['attempt'] as Map?)?['phase'] == 'succeeded';
          },
        );
        final profile =
            await rpc.invoke('account/getProfile', {'client': metadata}) as Map;
        final balance =
            await rpc.invoke('account/getBalance', {'client': metadata}) as Map;
        require(
          profile['status'] == 'ready' &&
              (profile['value'] as Map)['name'] == 'S02 isolated Platform' &&
              balance['status'] == 'ready',
          'real account profile and balance use the controlled private grant',
        );
        evidence['platformLogin'] = {
          'pkceCompleted': true,
          'freshBrowserCallback': true,
          'profileReady': true,
          'balanceReady': true,
        };
      }
      evidence.addAll({
        'hostPid': before['pid'],
        'instanceId': before['lease'],
        'workspaceId': workspaceId,
        'sessionId': session['sessionId'],
      });
      await launcher.tap('打开桌面版');
      client = await _DesktopCdp.connect('${root.path}/data/desktop-user-data');
      Map? boot;
      await waitFor('actual Electron completes its native boot', () async {
        try {
          boot = await client!.evaluate('window.dshDesktopBoot.ready()') as Map;
          return true;
        } catch (_) {
          return false;
        }
      });
      require(
        boot!['streamBaseUrl'] == Uri.parse(connection['url'] as String).origin,
        'actual Electron boot uses the existing independent Host endpoint',
      );
      final after = jsonDecode(await receiptFile.readAsString()) as Map;
      require(
        after['pid'] == before['pid'] && after['lease'] == before['lease'],
        'opening actual Electron preserves the independent Host identity',
      );
      final processes = await Process.run('/bin/ps', [
        '-axo',
        'pid=,ppid=,command=',
      ]);
      final hosts = processes.stdout
          .toString()
          .split('\n')
          .where(
            (line) =>
                line.contains('$resource/desktop/') &&
                line.contains('dsh-desktop-host/lib/index.js'),
          )
          .toList();
      require(
        processes.exitCode == 0 && hosts.length == 1,
        'actual Electron does not create a second business Host',
      );
      await waitFor(
        'existing workspace and session in the actual Electron document',
        () async {
          final text =
              await client!.evaluate('document.body.innerText') as String;
          final title = await client!.evaluate('document.title') as String;
          return text.contains('S02-existing-workspace') &&
              (platformCase ||
                  (nativeCapabilitiesCase
                      ? text.contains('S02 existing session')
                      : title.contains('S02 existing session')));
        },
      );
      evidence[nativeCapabilitiesCase || platformCase
          ? 'initialDesktopDocumentTitle'
          : 'existingSessionDocumentTitle'] = await client.evaluate(
        'document.title',
      );
      await client.screenshot('${root.path}/desktop-existing-session.png');
      final state = await launcher.state();
      final desktopPid = ((state['native'] as Map)['openedDesktopPid']) as int;
      evidence['firstDesktopPid'] = desktopPid;
      await waitFor(
        'owned Desktop has an actual visible OS window',
        () async =>
            windowObserver.current['ownershipKnown'] == true &&
            windowObserver.current['pid'] == desktopPid &&
            (windowObserver.current['onscreenWindowCount'] as int) > 0,
      );
      if (platformCase) {
        final boundary = await client.evaluate(
          '({hasPlatformBridge: typeof globalThis.dshPlatform?.open === "function", hasBusinessTokenGetter: typeof globalThis.dsh?.getAuthToken === "function"})',
        ) as Map;
        require(
          boundary['hasPlatformBridge'] == true &&
              boundary['hasBusinessTokenGetter'] == false,
          'business renderer has the original Platform command bridge without a token getter',
        );
        evidence['businessPlatformBoundary'] = boundary;
        final ready = {
          'fixtureRoot': root.path,
          'desktopBundle': '$resource/desktop/DeepSeek Harness.app',
          'desktopBundleId': 'com.ghostagent.dsh-workflow.s02-fixture',
          'desktopPid': desktopPid,
          'controlledPlatformOrigin': platformOrigin,
          'accountName': 'S02 isolated Platform',
          'completeCheckpoint': '${root.path}/platform-ui-complete',
          'abortCheckpoint': '${root.path}/native-ui-abort.json',
          'safeEvents': '${root.path}/platform-safe-events.json',
          'actor': 'Root CUA only: open Usage and Top-up in the native embedded view; fixture has no payment action',
        };
        await File('${root.path}/platform-ui-ready.json')
            .writeAsString(jsonEncode(ready));
        stdout.writeln('S02_PLATFORM_UI_READY=${jsonEncode(ready)}');
        await waitForNativeActor(File('${root.path}/platform-ui-complete'));
        Map? authentication;
        await waitFor('original embedded Usage and Top-up authenticate with the private local session', () async {
          authentication = jsonDecode(
            await File('${root.path}/platform-safe-events.json').readAsString(),
          ) as Map;
          return authentication!['pkceValidated'] == true &&
              authentication!['profileAuthenticated'] == true &&
              authentication!['balanceAuthenticated'] == true &&
              authentication!['usageAuthenticated'] == true &&
              authentication!['topUpAuthenticated'] == true &&
              authentication!['invalidAuthentication'] == false;
        });
        evidence['platformAuthentication'] = authentication;
        final account = await rpc.invoke('account/getState', {}) as Map;
        require(
          account['status'] == 'credential-stored',
          'the independent Host retains the controlled account grant after both embedded pages',
        );
        final current = jsonDecode(await receiptFile.readAsString()) as Map;
        require(
          current['pid'] == before['pid'] &&
              current['lease'] == before['lease'],
          'private Platform views retain the same independent Host',
        );
        await client.screenshot(
          '${root.path}/desktop-platform-business-boundary.png',
        );
        evidence['outcome'] = 'passed';
        return;
      }
      if (nativeCapabilitiesCase) {
        final ready = {
          'fixtureRoot': root.path,
          'desktopBundle': '$resource/desktop/DeepSeek Harness.app',
          'desktopBundleId': 'com.ghostagent.dsh-workflow.s02-fixture',
          'desktopPid': desktopPid,
          'originalWorkspace': workspace.path,
          'sessionTitle': 'S02 existing session',
          if (!nativeFilesCdpCase) 'pickedDirectory': picked,
          if (nativeFilesCdpCase)
            'sessionSelectedCheckpoint': '${root.path}/native-session-selected',
          'dropFile': '${workspace.path}/S02-native-drop.txt',
          'officeFile': '${workspace.path}/S02-native-office.docx',
          'filesDroppedCheckpoint': '${root.path}/native-files-dropped',
          'dropObservedCheckpoint': '${root.path}/native-drop-observed',
          'uiCompleteCheckpoint': '${root.path}/native-ui-complete',
          'abortCheckpoint': '${root.path}/native-ui-abort.json',
          'actor': nativeFilesCdpCase
              ? 'Root CUA selects the existing session and writes sessionSelectedCheckpoint; authorized owned-file CDP drag runs once; after dropObservedCheckpoint Root CUA sends and opens Office'
              : 'Root CUA only; OpenPanel then Finder drag then Send and Office reference',
        };
        await File('${root.path}/native-ui-ready.json')
            .writeAsString(jsonEncode(ready));
        stdout.writeln('S02_NATIVE_UI_READY=${jsonEncode(ready)}');
        if (nativeFilesCdpCase) {
          await waitForNativeActor(
            File('${root.path}/native-session-selected'),
          );
          evidence['ownedFilesCdpDispatch'] = await _dispatchOwnedNativeFiles(
            root,
            workspace,
            client,
            windowObserver,
            desktopPid,
          );
          await waitFor(
            'native file parsing creates both owned reference chips',
            () async {
              final references = await client!.evaluate(
                'Array.from(document.querySelectorAll("[data-composer-chip=reference]")).map(node => node.textContent).join("\\n")',
              ) as String;
              return references.contains('S02-native-drop.txt') &&
                  references.contains('S02-native-office.docx');
            },
          );
        } else {
          await waitForNativeActor(File('${root.path}/native-files-dropped'));
        }
        final chips = await client.evaluate(
          'Array.from(document.querySelectorAll("[data-composer-chip=reference]")).map(node => node.textContent)',
        ) as List;
        require(
          chips.any(
                (value) => value.toString().contains('S02-native-drop.txt'),
              ) &&
              chips.any(
                (value) => value.toString().contains('S02-native-office.docx'),
              ),
          'real native file drops create owned path reference chips',
        );
        require(
          (await client.evaluate('document.title') as String).contains(
            'S02 existing session',
          ),
          'native actor returned to the controlled model session before Send',
        );
        evidence['nativeDropReferenceChips'] = chips;
        await File('${root.path}/native-drop-observed').writeAsString(
          'Observed actual file references; Root may Send and open Office.',
        );
        await waitForNativeActor(File('${root.path}/native-ui-complete'));
        if (!nativeFilesCdpCase) {
          final registry = jsonDecode(
            await File('${root.path}/home/storages/workspace.json')
                .readAsString(),
          ) as Map;
          final workspaces = ((registry['tables'] as Map)['workspaces'] as Map)
              .values
              .cast<Map>();
          var pickedRegistered = false;
          for (final row in workspaces) {
            final path = row['path'] as String;
            if (path.endsWith('/S02-picked-directory') &&
                await Directory(path).resolveSymbolicLinks() ==
                    await Directory(picked).resolveSymbolicLinks()) {
              pickedRegistered = true;
            }
          }
          require(
            pickedRegistered,
            'actual native OpenPanel selection is registered by the real Host',
          );
          evidence['nativePickedDirectoryRegistered'] = true;
        }
        final history = await task!.waitForResult(
          session['sessionId'] as String,
          2,
        );
        final userMessages = (history['records'] as List)
            .cast<Map>()
            .where(
              (record) => (record['event'] as Map?)?['type'] == 'user/message',
            )
            .map((record) => jsonEncode((record['event'] as Map)['data']))
            .join('\n');
        require(
          userMessages.contains('@S02-native-drop.txt') &&
              userMessages.contains('@S02-native-office.docx'),
          'real Host persists both dragged files as path references in the sent user message',
        );
        await File('${root.path}/native-sent-file-references.json')
            .writeAsString(jsonEncode(history));
        Map? office;
        await waitFor(
          'actual Office preview renders owned DOCX as PDF',
          () async {
            office = await client!.evaluate(
              '({pages: document.querySelectorAll("[data-pdf-preview] canvas").length, text: Array.from(document.querySelectorAll("[data-pdf-text]")).map(node => node.textContent).join("\\n"), failures: document.querySelectorAll("[data-textpreview-failed]").length})',
            ) as Map;
            return (office!['pages'] as int) > 0 &&
                office!['failures'] == 0 &&
                office!['text'].toString().contains('S02 Office preview 42');
          },
        );
        evidence['nativeOfficePdf'] = office;
        final current = jsonDecode(await receiptFile.readAsString()) as Map;
        require(
          current['pid'] == before['pid'] &&
              current['lease'] == before['lease'],
          'native file capabilities retain the same independent Host',
        );
        await client.screenshot('${root.path}/desktop-native-capabilities.png');
        evidence['outcome'] = 'passed';
        return;
      }
      evidence['desktopTargetsBeforeClose'] = await _DesktopCdp.targets(
        '${root.path}/data/desktop-user-data',
      );
      await client.evaluate('window.close(); true');
      await waitFor(
        'actual Desktop window closes while the same process survives',
        () async =>
            windowObserver.current['ownershipKnown'] == true &&
            windowObserver.current['pid'] == desktopPid &&
            windowObserver.current['running'] == true &&
            windowObserver.current['windowLookupKnown'] == true &&
            windowObserver.current['onscreenWindowCount'] == 0,
      );
      evidence['desktopWindowClosed'] = Map<String, Object?>.from(
        windowObserver.current,
      );
      evidence['hiddenDesktopCdpTransport'] = client.transport;
      evidence['desktopTargetsAfterClose'] = await _DesktopCdp.targets(
        '${root.path}/data/desktop-user-data',
      );
      require(
        (await sdk.sendRequest(
              'status',
              serviceId: 'desktop',
              timeout: const Duration(seconds: 5),
            ))['result']
            is Map,
        'official SDK still observes the independent Host after window close',
      );
      await launcher.tap('打开桌面版');
      final reopenState = await launcher.state();
      evidence['desktopReopenNative'] = reopenState['native'];
      evidence['desktopReopenErrors'] = reopenState['errors'];
      evidence['desktopTargetsAfterReopen'] = await _DesktopCdp.targets(
        '${root.path}/data/desktop-user-data',
      );
      if (Platform.environment['DSH_S02_REOPEN_EVENT_PROBE'] == '1') {
        require(
          windowObserver.current['onscreenWindowCount'] == 0,
          'diagnostic reproduction: public reopen has no visible Desktop window',
        );
        evidence['reopenEventProbe'] = await probeDesktopReopenEvent(
          root,
          windowObserver.current,
        );
        await Future<void>.delayed(const Duration(seconds: 1));
        evidence['reopenEventProbeOsWindow'] = windowObserver.current;
        evidence['reopenEventProbeTargets'] = await _DesktopCdp.targets(
          '${root.path}/data/desktop-user-data',
        );
        throw StateError(
          'Diagnostic URL event probe preserves original public reopen failure',
        );
      }
      await waitFor(
        'same Desktop process has an actual reopened OS window',
        () async =>
            windowObserver.current['ownershipKnown'] == true &&
            windowObserver.current['pid'] == desktopPid &&
            (windowObserver.current['onscreenWindowCount'] as int) > 0,
      );
      evidence['desktopWindowReopened'] = Map<String, Object?>.from(
        windowObserver.current,
      );
      if (client.socket.readyState != WebSocket.open) {
        await client.close();
        client = await _DesktopCdp.connect(
          '${root.path}/data/desktop-user-data',
        );
      }
      await waitFor('reopened visible Desktop resumes the same workspace and session document', () async {
        final document = await client!.evaluate(
          '({title: document.title, text: document.body.innerText})',
        ) as Map;
        return document['title'].toString().contains('S02 existing session') &&
            document['text'].toString().contains('S02-existing-workspace');
      });
      evidence['visibleReopenedSessionDocumentTitle'] = await client.evaluate(
        'document.title',
      );
      final liveEvent = await probeDesktopReopenEvent(
        root,
        windowObserver.current,
      );
      evidence['livePidEvent'] = liveEvent;
      require(
        liveEvent['actualExit'] == 0,
        'verified live PID accepts the fixed URL event',
      );
      final quitState = await launcher.state({'action': 'quitDesktop'});
      evidence['desktopQuitRequestNative'] = quitState['native'];
      if (Platform.environment['DSH_S02_QUIT_FEEDBACK'] == '1') {
        final samples = <Map<String, Object?>>[];
        for (var index = 0; index < 3; index++) {
          if (index > 0) await Future<void>.delayed(const Duration(seconds: 1));
          final process = await Process.run('/bin/ps', [
            '-p',
            '$desktopPid',
            '-o',
            'pid=,ppid=,uid=,stat=,comm=',
          ]);
          samples.add({
            'at': DateTime.now().toUtc().toIso8601String(),
            'actualExit': process.exitCode,
            'process': safeInspectorOutput(process.stdout),
            'osWindow': Map<String, Object?>.from(windowObserver.current),
            'targets': await _DesktopCdp.targets(
              '${root.path}/data/desktop-user-data',
            ),
          });
        }
        evidence['desktopQuitFeedback'] = samples;
        throw StateError(
          'Diagnostic Quit feedback preserves the original process-exit requirement',
        );
      }
      await waitFor(
        'actual Electron process quits normally',
        () async =>
            (await Process.run('/bin/kill', ['-0', '$desktopPid'])).exitCode !=
            0,
      );
      await windowObserver.close();
      windows = null;
      await client.close();
      client = null;
      final afterQuitWindows = await DesktopWindowProbe.start(
        root,
        logName: 'desktop-window-after-quit-observations.jsonl',
      );
      windows = afterQuitWindows;
      await waitFor(
        'no owned Desktop remains after normal quit',
        () async =>
            afterQuitWindows.current['ownershipKnown'] == true &&
            afterQuitWindows.current['running'] == false,
      );
      await launcher.tap('仅显示已运行窗口');
      await waitFor(
        'window-only request explicitly refuses the missing Desktop',
        () async =>
            ((await launcher!.state())['nodes'] as List).cast<Map>().any(
              (row) =>
                  '${row['label']} ${row['value']}'.contains('Desktop 未运行'),
            ),
      );
      final expiredEvent = await probeDesktopReopenEvent(
        root,
        evidence['desktopWindowReopened'] as Map,
        expired: true,
      );
      evidence['expiredPidEvent'] = expiredEvent;
      final expiredResult = jsonDecode(expiredEvent['stdout'] as String) as Map;
      require(
        expiredEvent['actualExit'] == 1 &&
            expiredResult['sent'] == false &&
            expiredResult['expiredTarget'] == true &&
            expiredResult['errorCode'] is int,
        'expired PID URL event returns an actual OS error without relaunch',
      );
      require(
        afterQuitWindows.current['ownershipKnown'] == true &&
            afterQuitWindows.current['running'] == false,
        'window-only request and expired PID event do not launch a missing client',
      );
      evidence['desktopMissingClientOsWindow'] = afterQuitWindows.current;
      final observed =
          (await sdk.sendRequest(
                'status',
                serviceId: 'desktop',
                timeout: const Duration(seconds: 5),
              ))['result']
              as Map;
      require(
        observed['instanceId'] == before['lease'] && observed['ready'] == true,
        'normal Electron quit leaves the same independent Host ready',
      );
      if (acceptedTaskCase) {
        final launcherPid = launcher.process.pid;
        await launcher.quit();
        require(
          (await Process.run('/bin/kill', ['-0', '$launcherPid'])).exitCode !=
                  0 &&
              (await Process.run('/bin/kill', [
                    '-0',
                    '$desktopPid',
                  ])).exitCode !=
                  0,
          'both actual Electron and Launcher have exited before model release',
        );
        require(
          (await Process.run('/bin/kill', [
                '-0',
                '${before['pid']}',
              ])).exitCode ==
              0,
          'same independent Host survives both actual client exits',
        );
        final still = jsonDecode(await receiptFile.readAsString()) as Map;
        require(
          still['pid'] == before['pid'] && still['lease'] == before['lease'],
          'independent Host lease stays unchanged while both clients are absent',
        );
        require(
          !await File('${root.path}/model-canceled-1').exists(),
          'client exits do not cancel the accepted model request',
        );
        final tasks = task!;
        await tasks.releaseModel(1);
        final history = await tasks.waitForResult(
          session['sessionId'] as String,
          1,
        );
        await File('${root.path}/accepted-task-result.json')
            .writeAsString(jsonEncode(history));
        evidence['taskCompletedWithoutClients'] = {
          'sessionId': session['sessionId'],
          'resultFound': true,
          'hostPid': still['pid'],
          'instanceId': still['lease'],
          'launcherPidGone': launcherPid,
          'desktopPidGone': desktopPid,
        };
        resumedLauncher = await _DesktopApplication.start(
          '$app/Contents/MacOS/${source.uri.pathSegments.last}',
          environment,
          '${root.path}/launcher-reopened.log',
        );
        final resumedSdk = await currentSdkSession(server);
        final reconnected =
            (await resumedSdk.sendRequest(
                  'status',
                  serviceId: 'desktop',
                  timeout: const Duration(seconds: 5),
                ))['result']
                as Map;
        require(
          reconnected['ready'] == true &&
              reconnected['instanceId'] == before['lease'],
          'reopened actual Launcher observes the same service lease',
        );
      }
      final activeLauncher = resumedLauncher ?? launcher;
      await activeLauncher.tap('打开桌面版');
      client = await _DesktopCdp.connect('${root.path}/data/desktop-user-data');
      await waitFor(
        'reopened actual Electron sees the same session',
        () async => (await client!.evaluate('document.title') as String)
            .contains('S02 existing session'),
      );
      evidence['reopenedSessionDocumentTitle'] = await client.evaluate(
        'document.title',
      );
      final reopened = jsonDecode(await receiptFile.readAsString()) as Map;
      require(
        reopened['lease'] == before['lease'] &&
            reopened['pid'] == before['pid'],
        'reopening the client reuses the original Host',
      );
      if (acceptedTaskCase) {
        await waitFor(
          'actual reopened Electron renders the completed accepted task',
          () async =>
              (await client!.evaluate('document.body.innerText') as String)
                  .contains('S04 persisted task result 1'),
        );
        evidence['taskResultRenderedAfterReopen'] = true;
      }
      await client.screenshot('${root.path}/desktop-reopened-session.png');
      evidence['outcome'] = 'passed';
    } finally {
      rpc.close();
    }
  } catch (error) {
    evidence['outcome'] = 'failed';
    evidence['error'] = safeInspectorOutput(error);
    final quitTrace = File('${root.path}/desktop-quit-trace.log');
    if (await quitTrace.exists()) {
      evidence['desktopQuitTraceAtFailure'] = await quitTrace.readAsLines();
    }
    evidence['desktopFailureOsWindow'] = windows?.current;
    if (evidence['firstDesktopPid'] is int) {
      final process = await Process.run('/bin/ps', [
        '-p',
        '${evidence['firstDesktopPid']}',
        '-o',
        'pid=,ppid=,uid=,stat=,comm=',
      ]);
      evidence['desktopFailureProcess'] = {
        'actualExit': process.exitCode,
        'process': safeInspectorOutput(process.stdout),
      };
    }
    evidence['desktopFailureTargets'] = await _DesktopCdp.targets(
      '${root.path}/data/desktop-user-data',
    );
    if (client != null) {
      evidence['desktopFailureTransport'] = client.transport;
      try {
        if (client.socket.readyState != WebSocket.open) {
          throw StateError('Renderer debugger transport is already closed');
        }
        evidence['desktopFailureSnapshot'] = await client.snapshot();
        await client.screenshot('${root.path}/desktop-failure.png');
      } catch (observation) {
        evidence['desktopFailureObservationError'] = safeInspectorOutput(
          observation,
        );
      }
    }
    rethrow;
  } finally {
    await closeProbeResources([
      (
        'owned OS window observer',
        () async {
          await windows?.close();
        },
      ),
      (
        'Desktop renderer CDP',
        () async {
          await client?.close();
        },
      ),
      (
        'owned Desktop',
        () async {
          final active = resumedLauncher ?? launcher;
          if (active != null && !active.exited) {
            await active.state({'action': 'quitDesktop'});
          }
        },
      ),
      (
        'owned Debug app',
        () async {
          await resumedLauncher?.quit();
          await launcher?.quit();
        },
      ),
      (
        'actual task API client',
        () {
          task?.close();
        },
      ),
      ('official SDK', server.close),
      (
        'owned manager and Host',
        () async {
          final file = File(
            '${root.path}/data/global/.dsh-workflow/service/manager.json',
          );
          if (await file.exists()) {
            Process.killPid(
              (jsonDecode(await file.readAsString()) as Map)['pid'] as int,
              ProcessSignal.sigterm,
            );
            for (
              var attempt = 0;
              attempt < 400 && await file.exists();
              attempt++
            ) {
              await Future<void>.delayed(const Duration(milliseconds: 50));
            }
            require(
              !await file.exists(),
              'owned fixture manager and Host finish cleanup',
            );
          }
        },
      ),
      (
        'owned external Platform fixture',
        () async {
          final child = platformServer;
          if (child != null) {
            child.kill(ProcessSignal.sigterm);
            final code = await child.exitCode.timeout(
              const Duration(seconds: 10),
              onTimeout: () async {
                child.kill(ProcessSignal.sigkill);
                return child.exitCode;
              },
            );
            await File(
              '${root.path}/platform-fixture.log',
            ).writeAsString('${await platformOutput}${await platformErrors}');
            require(code == 0, 'owned external Platform fixture exits cleanly');
          }
        },
      ),
    ], preserveFailure: evidence['outcome'] != 'passed');
    await File('${root.path}/desktop-evidence.json')
        .writeAsString(jsonEncode(evidence));
  }
}

Future<void> waitForNativeActor(File checkpoint) async {
  final abort = File('${checkpoint.parent.path}/native-ui-abort.json');
  final deadline = DateTime.now().add(const Duration(minutes: 5));
  while (DateTime.now().isBefore(deadline)) {
    if (await abort.exists()) {
      throw StateError(
        'Native UI actor canceled by its owned abort checkpoint',
      );
    }
    if (await checkpoint.exists()) return;
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
  throw StateError(
    'Native CUA actor checkpoint timed out: ${checkpoint.uri.pathSegments.last}',
  );
}

// The human authorized exactly these two owned files for this isolated test run.
// All other UI actions remain with the Root CUA actor.
Future<Map<String, Object?>> _dispatchOwnedNativeFiles(
  Directory root,
  Directory workspace,
  _DesktopCdp client,
  DesktopWindowProbe observer,
  int desktopPid,
) async {
  final userData = '${root.path}/data/desktop-user-data';
  final files = [
    '${workspace.path}/S02-native-drop.txt',
    '${workspace.path}/S02-native-office.docx',
  ];
  final physical = await Process.run('/usr/bin/python3', [
    '-I',
    '-B',
    '-c',
    'import os,stat,sys; root,workspace,user_data,*files=sys.argv[1:]; '
        'parent="/private/tmp/dsh-launcher-local-"+str(os.getuid()); '
        'assert os.environ.get("GITHUB_ACTIONS")!="true"; '
        'assert os.environ.get("DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT")==parent; '
        'assert os.path.dirname(root)==parent and os.path.basename(root).startswith("dsh-s02-"); '
        'assert os.path.realpath(root)==root and os.stat(root).st_uid==os.getuid() and stat.S_IMODE(os.stat(root).st_mode)==0o700; '
        'assert workspace==root+"/S02-existing-workspace" and user_data==root+"/data/desktop-user-data"; '
        'assert files==[workspace+"/S02-native-drop.txt",workspace+"/S02-native-office.docx"]; '
        'assert all(os.path.realpath(p)==p and os.stat(p).st_uid==os.getuid() for p in [workspace,user_data,*files]); '
        'assert all(stat.S_ISREG(os.stat(p).st_mode) for p in files)',
    root.path,
    workspace.path,
    userData,
    ...files,
  ]);
  require(
    physical.exitCode == 0 &&
        Platform.environment['DSH_S02_OWNED_FILES_CDP'] == '1',
    'authorized native file drag is limited to canonical UID-owned private fixture inputs',
  );
  final bound = Map<String, Object?>.from(observer.current);
  final bundle = '${root.path}/resources/desktop/DeepSeek Harness.app';
  void requireOwnedDesktop() {
    final row = observer.current;
    require(
      row['ownershipKnown'] == true &&
          row['running'] == true &&
          row['pid'] == desktopPid &&
          row['bundle'] == bundle &&
          row['executable'] == '$bundle/Contents/MacOS/DeepSeek Harness' &&
          row['kernelStartSeconds'] == bound['kernelStartSeconds'] &&
          row['kernelStartMicroseconds'] == bound['kernelStartMicroseconds'] &&
          row['windowLookupKnown'] == true &&
          (row['onscreenWindowCount'] as int) > 0,
      'file drag targets only the same kernel-bound visible owned Desktop PID',
    );
  }

  requireOwnedDesktop();
  final port = int.parse(
    (await File('$userData/DevToolsActivePort').readAsLines()).first,
  );
  final address = client.debuggerAddress;
  require(
    address.scheme == 'ws' &&
        address.host == '127.0.0.1' &&
        address.port == port &&
        port > 0 &&
        port <= 65535 &&
        address.userInfo.isEmpty &&
        address.query.isEmpty &&
        address.fragment.isEmpty &&
        address.path.startsWith('/devtools/page/') &&
        client.socket.readyState == WebSocket.open,
    'file drag uses only this owned profile loopback renderer CDP endpoint',
  );
  final listener = await Process.run('/usr/sbin/lsof', [
    '-nP',
    '-a',
    '-p',
    '$desktopPid',
    '-iTCP:$port',
    '-sTCP:LISTEN',
    '-Fpn',
  ]).timeout(const Duration(seconds: 5));
  final rows = const LineSplitter().convert(listener.stdout.toString());
  require(
    listener.exitCode == 0 &&
        rows.contains('p$desktopPid') &&
        rows.where((row) => row.startsWith('n')).toSet().length == 1 &&
        rows.contains('n127.0.0.1:$port'),
    'the verified owned Desktop PID exclusively owns its loopback CDP listener',
  );
  final targets = await _DesktopCdp.targets(userData);
  require(
    targets is List &&
        targets.cast<Map>().any((row) {
          final page = Uri.parse(row['url'] as String);
          return row['id'] == address.pathSegments.last &&
              row['type'] == 'page' &&
              page.scheme == 'dsh-app' &&
              page.host == 'app' &&
              page.path == '/';
        }),
    'authorized drag stays bound to the actual owned business renderer target',
  );
  final target = await client.evaluate(
    '(() => { if (location.protocol !== "dsh-app:" || location.host !== "app" || !document.title.includes("S02 existing session")) return null; const node = document.querySelector("[data-composer-input]"); if (!node) return null; const r = node.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return {x, y, visible: r.width > 0 && r.height > 0 && x > 0 && y > 0 && x < innerWidth && y < innerHeight}; })()',
  ) as Map?;
  require(
    target?['visible'] == true,
    'the selected existing session has an actual visible native drop target',
  );
  for (final phase in ['dragEnter', 'dragOver', 'drop']) {
    requireOwnedDesktop();
    await client.call('Input.dispatchDragEvent', {
      'type': phase,
      'x': target!['x'],
      'y': target['y'],
      'data': {'items': [], 'files': files, 'dragOperationsMask': 1},
    });
  }
  requireOwnedDesktop();
  return {
    'pid': desktopPid,
    'port': port,
    'files': files,
    'sameOwnedKernelIdentity': true,
    'dispatched': true,
  };
}

Future<Map> officialDesktopConnection(
  String resources,
  Directory root,
  Map<String, String> environment,
) async {
  final child = await Process.start('$resources/node', [
    '$resources/workflow/macos-launcher/runtime/service-cli.mjs',
    '${root.path}/data',
    resources,
    '${root.path}/home',
  ], environment: environment);
  final output = child.stdout.transform(utf8.decoder).join();
  final diagnostics = child.stderr.transform(utf8.decoder).join();
  child.stdin.writeln(jsonEncode({'type': 'connect-web'}));
  await child.stdin.close();
  final code = await child.exitCode;
  final text = await output;
  final stderr = await diagnostics;
  require(
    code == 0,
    'formal client connection succeeds: ${safeInspectorOutput(stderr)}',
  );
  final reply = jsonDecode(text) as Map;
  require(reply['ok'] == true, 'formal client connection is accepted');
  final value = reply['value'] as Map;
  require(
    !value.containsKey('platformSession'),
    'generic client connection has no platform credential',
  );
  return value['connection'] as Map;
}

class _HostRpc {
  _HostRpc(String address) : address = Uri.parse(address);
  final Uri address;
  final HttpClient client = HttpClient();
  List<Cookie> cookies = [];
  Future<void> authenticate() async {
    final request = await client.getUrl(address);
    request.followRedirects = false;
    final response = await request.close();
    cookies = response.cookies;
    await response.drain<void>();
    require(
      cookies.isNotEmpty,
      'official Host issues an authenticated session cookie',
    );
  }

  Future<Object?> invoke(String method, Map<String, Object?> args) async {
    final request = await client.postUrl(
      address.replace(path: '/api/$method', query: ''),
    );
    request.headers.contentType = ContentType.json;
    request.cookies.addAll(cookies);
    request.write(
      jsonEncode({
        'type': 'client-request',
        'rpcId': 's02-${DateTime.now().microsecondsSinceEpoch}',
        'method': method,
        'payload': {'args': args},
      }),
    );
    final response = await request.close();
    final envelope =
        jsonDecode(await response.transform(utf8.decoder).join()) as Map;
    require(
      response.statusCode == 200 && (envelope['result'] as Map)['ok'] == true,
      'official Host accepts $method',
    );
    return (envelope['result'] as Map)['value'];
  }

  void close() => client.close(force: true);
}

Future<Map<String, Object?>> probeDesktopReopenEvent(
  Directory root,
  Map observed, {
  bool expired = false,
}) async {
  final executable = '${root.path}/desktop-reopen-event-probe';
  if (!await File(executable).exists()) {
    final compile = await Process.run('/usr/bin/xcrun', [
      'swiftc',
      File.fromUri(Platform.script.resolve('desktop_reopen_event_probe.swift'))
          .path,
      '-o',
      executable,
    ]);
    await File('$executable-compile.log')
        .writeAsString('${compile.stdout}${compile.stderr}');
    require(compile.exitCode == 0, 'owned PID URL event probe compiles');
    final sign = await Process.run('/usr/bin/codesign', [
      '--force',
      '--options',
      'runtime',
      '--entitlements',
      File.fromUri(
        Platform.script.resolve('../macos/Runner/Release.entitlements'),
      ).path,
      '--sign',
      '-',
      executable,
    ]);
    await File('$executable-sign.log')
        .writeAsString('${sign.stdout}${sign.stderr}');
    require(
      sign.exitCode == 0,
      'PID URL probe signs with hardened runtime and unchanged Release entitlements',
    );
    final verify = await Process.run('/usr/bin/codesign', [
      '--verify',
      '--strict',
      executable,
    ]);
    require(
      verify.exitCode == 0,
      'hardened PID URL event probe signature verifies',
    );
    final signature = await Process.run('/usr/bin/codesign', [
      '-dvvv',
      '--entitlements',
      ':-',
      executable,
    ]);
    require(
      signature.exitCode == 0 &&
          signature.stderr.toString().contains('runtime'),
      'PID URL probe reports the hardened runtime flag',
    );
    await File('$executable-signature.log')
        .writeAsString('${signature.stdout}${signature.stderr}');
  }
  final result = await Process.run(executable, [
    root.path,
    '${observed['pid']}',
    '${observed['kernelStartSeconds']}',
    '${observed['kernelStartMicroseconds']}',
    if (expired) '--expired',
  ]).timeout(const Duration(seconds: 5));
  return {
    'actualExit': result.exitCode,
    'stdout': safeInspectorOutput(result.stdout),
    'stderr': safeInspectorOutput(result.stderr),
    'hardenedSignature': await File('$executable-signature.log').readAsString(),
  };
}

class _DesktopCdp {
  _DesktopCdp(this.socket, this.debuggerAddress) {
    subscription = socket.listen((data) {
      final value = jsonDecode(data as String) as Map;
      if (value['id'] is int) {
        pending.remove(value['id'])?.complete(value);
      } else {
        record(value);
      }
    });
  }
  final WebSocket socket;
  final Uri debuggerAddress;
  late final StreamSubscription<dynamic> subscription;
  int sequence = 0;
  final pending = <int, Completer<Map>>{};
  final events = <Map<String, Object?>>[];
  final requests = <String, String>{};
  Map<String, Object?> get transport => {
    'readyState': socket.readyState,
    'closeCode': socket.closeCode,
    'closeReason': safeInspectorOutput(socket.closeReason),
    'pendingCommands': pending.length,
    'events': events.toList(),
  };
  String address(Object? value) {
    try {
      return Uri.parse(value.toString())
          .replace(userInfo: '', query: '', fragment: '')
          .toString();
    } catch (_) {
      return safeInspectorOutput(value);
    }
  }

  void record(Map value) {
    final method = value['method'];
    final params = value['params'] as Map? ?? {};
    final requestId = params['requestId']?.toString();
    if (method == 'Network.requestWillBeSent') {
      requests[requestId!] = address((params['request'] as Map)['url']);
      if (requests.length > 200) requests.remove(requests.keys.first);
      return;
    }
    Map<String, Object?>? details;
    if (method == 'Network.loadingFailed' ||
        method == 'Network.webSocketFrameError') {
      details = {
        'url': requests[requestId],
        'error': safeInspectorOutput(
          params['errorText'] ?? params['errorMessage'],
        ),
      };
    } else if (method == 'Network.responseReceived') {
      final response = params['response'] as Map;
      if ((response['status'] as num) >= 400) {
        details = {
          'url': address(response['url']),
          'status': response['status'],
        };
      }
    } else if (method == 'Network.webSocketCreated') {
      requests[requestId!] = address(params['url']);
      details = {'url': requests[requestId]};
    } else if (method == 'Network.webSocketHandshakeResponseReceived') {
      details = {
        'url': requests[requestId],
        'status': (params['response'] as Map)['status'],
      };
    } else if (method == 'Runtime.consoleAPICalled') {
      details = {
        'type': params['type'],
        'text': safeInspectorOutput(
          (params['args'] as List)
              .cast<Map>()
              .map((row) => row['value'] ?? row['description'])
              .join(' '),
        ),
      };
    } else if (method == 'Runtime.exceptionThrown') {
      final exception = params['exceptionDetails'] as Map;
      details = {
        'text': safeInspectorOutput(
          '${exception['text']} ${(exception['exception'] as Map?)?['description'] ?? ''}',
        ),
      };
    } else if (method == 'Log.entryAdded') {
      final entry = params['entry'] as Map;
      details = {
        'type': entry['level'],
        'text': safeInspectorOutput(entry['text']),
        'url': address(entry['url'] ?? ''),
      };
    }
    if (details == null) return;
    events.add({
      'at': DateTime.now().toUtc().toIso8601String(),
      'method': method,
      ...details,
    });
    if (events.length > 100) events.removeAt(0);
  }

  Future<Map<String, Object?>> snapshot() async {
    final dom = await evaluate(
      '({url: location.href, title: document.title, ready: document.readyState, visible: document.visibilityState, text: document.body.innerText, resources: performance.getEntriesByType("resource").slice(-40).map(row => ({url: row.name, status: row.responseStatus, kind: row.initiatorType, duration: row.duration}))})',
    ) as Map;
    return {
      'url': address(dom['url']),
      'title': dom['title'],
      'ready': dom['ready'],
      'visible': dom['visible'],
      'text': safeInspectorOutput(dom['text']),
      'resources': (dom['resources'] as List)
          .cast<Map>()
          .map(
            (row) => {
              'url': address(row['url']),
              'status': row['status'],
              'kind': row['kind'],
              'duration': row['duration'],
            },
          )
          .toList(),
      'events': events.toList(),
    };
  }

  // HTTP target inventory does not ask a hidden renderer to execute JavaScript.
  static Future<Object> targets(String userData) async {
    final http = HttpClient()..connectionTimeout = const Duration(seconds: 2);
    try {
      final port = int.parse(
        (await File('$userData/DevToolsActivePort').readAsLines()).first,
      );
      final request = await http.getUrl(
        Uri.parse('http://127.0.0.1:$port/json/list'),
      );
      final response = await request.close().timeout(
        const Duration(seconds: 2),
      );
      final rows = jsonDecode(
        await response
            .transform(utf8.decoder)
            .join()
            .timeout(const Duration(seconds: 2)),
      ) as List;
      return rows
          .take(10)
          .cast<Map>()
          .map(
            (row) => {
              'id': row['id'],
              'type': row['type'],
              'title': safeInspectorOutput(row['title']),
              'url': Uri.parse(row['url'] as String)
                  .replace(userInfo: '', query: '', fragment: '')
                  .toString(),
            },
          )
          .toList();
    } catch (error) {
      return {'error': safeInspectorOutput(error)};
    } finally {
      http.close(force: true);
    }
  }

  static Future<_DesktopCdp> connect(String userData) async {
    Map? target;
    final client = HttpClient();
    try {
      await waitFor(
        'private Electron renderer debugger and actual application document',
        () async {
          try {
            final port = int.parse(
              (await File('$userData/DevToolsActivePort').readAsLines()).first,
            );
            final request = await client.getUrl(
              Uri.parse('http://127.0.0.1:$port/json/list'),
            );
            final response = await request.close();
            final targets = jsonDecode(
              await response.transform(utf8.decoder).join(),
            ) as List;
            final matches = targets.cast<Map>().where(
              (row) =>
                  row['type'] == 'page' &&
                  row['url'].toString().startsWith('dsh-app://app/'),
            );
            if (matches.isEmpty) return false;
            target = matches.first;
            return true;
          } catch (_) {
            return false;
          }
        },
      );
      final address = Uri.parse(target!['webSocketDebuggerUrl'] as String);
      require(
        address.host == '127.0.0.1',
        'renderer debugger is loopback only',
      );
      final cdp = _DesktopCdp(
        await WebSocket.connect(address.toString()),
        address,
      );
      await cdp.call('Runtime.enable');
      await cdp.call('Network.enable');
      await cdp.call('Log.enable');
      return cdp;
    } finally {
      client.close(force: true);
    }
  }

  Future<Map> call(String method, [Map<String, Object?>? params]) async {
    final id = ++sequence, answer = Completer<Map>();
    pending[id] = answer;
    socket.add(
      jsonEncode({'id': id, 'method': method, 'params': params ?? {}}),
    );
    final result = await answer.future.timeout(const Duration(seconds: 10));
    if (result['error'] != null) throw StateError('Desktop CDP $method failed');
    return result['result'] as Map;
  }

  Future<Object?> evaluate(String expression) async {
    final value = await call('Runtime.evaluate', {
      'expression': expression,
      'awaitPromise': true,
      'returnByValue': true,
    });
    if (value['exceptionDetails'] != null) {
      throw StateError('Actual Desktop document expression failed');
    }
    return (value['result'] as Map)['value'];
  }

  Future<void> screenshot(String path) async {
    final image = await call('Page.captureScreenshot', {'format': 'png'});
    await File(path).writeAsBytes(base64Decode(image['data'] as String));
  }

  Future<void> close() async {
    await socket.close();
    await subscription.cancel();
  }
}

class _DesktopApplication {
  _DesktopApplication(
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
  static Future<_DesktopApplication> start(
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
      output.writeln(safeInspectorOutput(value));
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
      return _DesktopApplication(process, vm, isolate, output, subscriptions);
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
