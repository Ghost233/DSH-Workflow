import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:launcher_core/launcher_core.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import 'web_application_scenario.dart';
import 'update_application_scenarios.dart';
import 'log_application_scenario.dart';
import 'lifecycle_application_scenario.dart';
import 'settings_application_scenario.dart';

Future<void> waitFor(String description, Future<bool> Function() check) async {
  for (var attempt = 0; attempt < 150; attempt++) {
    if (await check()) return;
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  throw StateError('Timed out: $description');
}

void require(bool condition, String description) {
  if (!condition) throw StateError(description);
  stdout.writeln('PASS: $description');
}

Future<void> main(List<String> arguments) async {
  final instanceStartup =
      arguments.length == 3 && arguments[1] == '--instance-startup';
  final logFixture = arguments.length == 3 && arguments[1] == '--logs-fixture';
  final logsScenario =
      arguments.length == 3 && arguments[1] == '--logs-runtime';
  final lifecycle = LifecycleProbeOptions.parse(arguments);
  final settingsScenario =
      arguments.length >= 2 && arguments[1] == '--settings-runtime';
  final keychainCi =
      settingsScenario && arguments.last == '--legacy-keychain-ci';
  final webArgs = settingsScenario
      ? [
          arguments.first,
          '--web-runtime',
          ...arguments
              .skip(2)
              .take(arguments.length - 2 - (keychainCi ? 1 : 0)),
        ]
      : arguments;
  final webScenario = logsScenario
      ? WebProbeOptions(Directory(arguments[2]).absolute.path, 'headless', 0)
      : WebProbeOptions.parse(webArgs) ?? lifecycle?.web;
  final systemCi =
      arguments.length == 3 &&
      arguments[1] == '--updates' &&
      arguments[2] == '--system-ci';
  final updates =
      systemCi || (arguments.length == 2 && arguments[1] == '--updates');
  final runnerTemp = Platform.environment['RUNNER_TEMP'];
  if ((systemCi || keychainCi) &&
      (Platform.environment['GITHUB_ACTIONS'] != 'true' ||
          runnerTemp == null ||
          !runnerTemp.startsWith('/'))) {
    throw ArgumentError(
      'System login and browser boundaries run only in a disposable GitHub macOS runner',
    );
  }
  if (arguments.length != 1 &&
      !instanceStartup &&
      !updates &&
      webScenario == null &&
      !logFixture) {
    throw ArgumentError(
      'Pass the debug executable, optionally --instance-startup and an independent Node executable',
    );
  }
  final sourceExecutable = File(arguments.first).absolute;
  final sourceApp = sourceExecutable.parent.parent.parent;
  final info = File('${sourceApp.path}/Contents/Info.plist');
  final kernel = File(
    '${sourceApp.path}/Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin',
  );
  if (!await info.exists() || !await kernel.exists()) {
    throw ArgumentError(
      'Only this project Debug candidate with kernel_blob.bin is accepted; Release/unknown apps are never launched or changed',
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
  final debugLibrary = File('${sourceExecutable.path}.debug.dylib');
  // Xcode may place the Runner implementation in the adjacent Debug dylib.
  final nativeBinary = latin1.decode([
    ...await sourceExecutable.readAsBytes(),
    if (await debugLibrary.exists()) ...await debugLibrary.readAsBytes(),
  ]);
  final dartKernel = latin1.decode(await kernel.readAsBytes());
  if (values['CFBundleIdentifier'] != 'com.ghostagent.dsh-workflow-launcher' ||
      !nativeBinary.contains('DSHLauncherTestRoot') ||
      !nativeBinary.contains('test-preferences.plist') ||
      !nativeBinary.contains('debugWindow') ||
      !dartKernel.contains('ext.dshlauncher.application')) {
    throw ArgumentError(
      'Unknown or non-isolated Debug candidate; it is never launched or changed',
    );
  }
  require(
    true,
    'read-only candidate preflight confirms this project Debug isolation bridge and driver',
  );
  final root =
      await Directory(systemCi || keychainCi ? runnerTemp! : '/private/tmp')
          .createTemp(
            settingsScenario
                ? 'dsh-t05-'
                : updates
                ? 'dsh-t07-'
                : 'dsh-t01-',
          );
  final releaseFixture = updates ? await ReleaseFixture.start() : null;
  final app = Directory('${root.path}/candidate.app');
  final copy = await Process.run('/usr/bin/ditto', [sourceApp.path, app.path]);
  require(copy.exitCode == 0, 'probe owns a private Debug application copy');
  final executable = File(
    '${app.path}/Contents/MacOS/${sourceExecutable.uri.pathSegments.last}',
  );
  final manifestPath = '${app.path}/Contents/Resources/maclauncher.json';
  final manifest = await ProjectManifest.read(manifestPath);
  require(
    manifest.projectId == 'dsh-workflow' &&
        manifest.services.map((service) => service.id).toSet().containsAll({
          'web',
          'desktop',
        }),
    'packaged association declares dsh-workflow, web and desktop',
  );
  final entryPath = EntryLauncher.resolve(
    manifest.entry!.path,
    File(manifestPath).parent.path,
  );
  require(
    await Directory(entryPath).resolveSymbolicLinks() ==
        await app.resolveSymbolicLinks(),
    'packaged relative association resolves to this candidate app',
  );
  stdout.writeln('ISOLATED_ROOT=${root.path}');
  final layout = EndpointLayout(directory: '${root.path}/manager');
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': '${root.path}/missing-runtime',
    'DSH_LAUNCHER_TEST_SOCKET': layout.socketPath,
    'DSH_HOME': '${root.path}/home',
    if (lifecycle != null)
      'DSH_LAUNCHER_TEST_START_GATE': '${root.path}/data/start-gate.sock',
    if (systemCi) 'DSH_LAUNCHER_SYSTEM_BOUNDARY_CI': '1',
    if (releaseFixture != null)
      'DSH_LAUNCHER_TEST_RELEASE_ENDPOINT': releaseFixture.endpoint,
  };
  await Directory(environment['DSH_LAUNCHER_TEST_RESOURCES']!).create();
  final webPort = await webScenario?.stage(root);
  if (webPort != null) environment['DSH_LAUNCHER_TEST_PORT'] = '$webPort';
  final settings = settingsScenario
      ? SettingsFixture(root, webScenario!, keychainCi)
      : null;
  await settings?.prepare();
  if (keychainCi) {
    environment['DSH_LAUNCHER_LEGACY_KEYCHAIN_CI'] = '1';
    environment['DSH_LAUNCHER_TEST_LEGACY_KEYCHAIN'] = settings!.keychain;
  }
  if (logFixture) await stageControlledLogs(root, arguments[2]);
  final starts = File('${root.path}/resource-starts.log');
  if (instanceStartup) {
    final runtime = Directory(
      '${root.path}/missing-runtime/workflow/macos-launcher/runtime',
    );
    await runtime.create(recursive: true);
    await Directory('${root.path}/data').create();
    await File('${root.path}/data/lan-password')
        .writeAsString('isolated-startup-probe-password');
    await Link('${root.path}/missing-runtime/node')
        .create(File(arguments[2]).absolute.path);
    final trace = jsonEncode(starts.path);
    await File('${runtime.path}/global-supervisor.mjs').writeAsString(
      "import { appendFileSync } from 'node:fs'; appendFileSync($trace, 'web-start\\n'); process.exit(17);\n",
    );
    await File('${runtime.path}/plugin-versions.mjs').writeAsString(
      "import { appendFileSync } from 'node:fs'; appendFileSync($trace, 'plugin-check\\n'); console.log(JSON.stringify({rows:[]}));\n",
    );
  }
  // LaunchServices does not inherit the process environment. The private
  // Debug candidate carries the same isolation root for associated reopens.
  final configure = await Process.run('/usr/bin/plutil', [
    '-replace',
    'DSHLauncherTestRoot',
    '-string',
    environment['DSH_LAUNCHER_TEST_ROOT']!,
    '${app.path}/Contents/Info.plist',
  ]);
  require(
    configure.exitCode == 0,
    'private Debug candidate has LaunchServices isolation',
  );
  if (updates) {
    final version = await Process.run('/usr/bin/plutil', [
      '-replace',
      'CFBundleShortVersionString',
      '-string',
      '1.9.0',
      '${app.path}/Contents/Info.plist',
    ]);
    require(
      version.exitCode == 0,
      'private update candidate freezes installed version 1.9.0',
    );
  }
  final sign = await Process.run('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    app.path,
  ]);
  require(
    sign.exitCode == 0,
    'private Debug candidate is signed after isolation metadata',
  );
  late final Process process;
  try {
    await settings?.prepareKeychain(executable.path);
    await settings?.startHeadless();
    process = await Process.start(executable.path, [
      '--vm-service-port=0',
    ], environment: environment);
  } catch (_) {
    await settings?.close();
    rethrow;
  }
  var exited = false;
  unawaited(
    process.exitCode.then((code) {
      exited = true;
      stdout.writeln('APP_EXIT=$code');
    }),
  );
  final vmUri = Completer<String>();
  final outputFile = File('${root.path}/app.log').openWrite();
  void output(String line) {
    outputFile.writeln(line);
    final uri = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
        .firstMatch(line)
        ?.group(0);
    if (uri != null && !vmUri.isCompleted) vmUri.complete(uri);
  }

  final subscriptions = [
    process.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(output),
    process.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(output),
  ];
  VmService? vm;
  LauncherServer? server;
  try {
    final http = await vmUri.future.timeout(const Duration(seconds: 30));
    vm = await vmServiceConnectUri('${http.replaceFirst('http:', 'ws:')}ws');
    final isolate = (await vm.getVM()).isolates!.single.id!;
    await waitFor(
      'application extension',
      () async =>
          (await vm!.getIsolate(isolate)).extensionRPCs!
              .contains('ext.dshlauncher.application'),
    );
    Future<Map<String, Object?>> state([Map<String, String>? params]) async =>
        (await vm!.callServiceExtension(
          'ext.dshlauncher.application',
          isolateId: isolate,
          args: params,
        )).json!.cast<String, Object?>();
    Map<String, Object?> native(Map<String, Object?> snapshot) =>
        (snapshot['native']! as Map).cast<String, Object?>();
    List<Map<String, Object?>> nodes(Map<String, Object?> snapshot) =>
        (snapshot['nodes']! as List)
            .map((node) => (node as Map).cast<String, Object?>())
            .toList();
    bool text(Map<String, Object?> snapshot, String value) => nodes(snapshot)
        .any(
          (node) =>
              node['label'].toString().contains(value) ||
              node['value'].toString().contains(value),
        );
    Future<void> tap(String label) async {
      final snapshot = await state();
      final node = nodes(snapshot).singleWhere(
        (node) =>
            node['label'].toString().split('\n').first == label &&
            (node['actions']! as List).contains('tap'),
      );
      await state({'action': 'tap', 'id': '${node['id']}'});
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }

    Future<void> capture(String page) async {
      final snapshot = await state();
      await File('${root.path}/$page.json').writeAsString(jsonEncode(snapshot));
      final window = native(snapshot)['windowNumber'].toString();
      final path = '${root.path}/$page.png';
      final result = await Process.run('/usr/sbin/screencapture', [
        '-x',
        '-l',
        window,
        path,
      ]);
      require(
        result.exitCode == 0 && await File(path).exists(),
        'actual native window screenshot: $path',
      );
    }

    if (logFixture) {
      await runControlledLogs(root, layout, manifestPath, state, tap, capture);
      await state({'action': 'quit'});
      require(
        await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
        'controlled log transport app quits normally',
      );
      return;
    }

    if (webScenario != null) {
      await runWebApplicationScenario(
        options: webScenario,
        root: root,
        layout: layout,
        manifestPath: manifestPath,
        port: webPort!,
        state: state,
        tap: tap,
        capture: capture,
        onConnected: settingsScenario
            ? runSettingsApplicationScenario
            : lifecycle != null
            ? (actual) =>
                  runLifecycleScenario(actual, process, lifecycle.scenario)
            : logsScenario
            ? runLogApplicationScenario
            : null,
        prestartedHost: settings?.host,
        prestartedHostLog: settings?.hostLog,
        passwordPreloaded: settingsScenario,
      );
      if (lifecycle == null) await state({'action': 'quit'});
      require(
        await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
        'real launcher remains manageable and quits after Web resources are released',
      );
      return;
    }

    if (updates) {
      await runUpdateScenarios(
        fixture: releaseFixture!,
        systemCi: systemCi,
        state: state,
        text: text,
        tap: tap,
        capture: capture,
        waitFor: waitFor,
        require: require,
      );
      await state({'action': 'quit'});
      require(
        await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
        'update scenario application quits normally',
      );
      return;
    }

    if (instanceStartup) {
      final bindings = await BindingStore.load('${root.path}/bindings.json');
      await bindings.associate(manifestPath);
      server = await LauncherServer.start(layout: layout, bindings: bindings);
      await waitFor(
        'controlled first application startup',
        () async =>
            await starts.exists() &&
            (await starts.readAsString()).contains('web-start') &&
            (await starts.readAsString()).contains('plugin-check') &&
            server!.registry.byProject('dsh-workflow') != null,
      );
      require(
        native(await state())['isolated'] == true,
        'preseeded-password scenario uses the real isolated application',
      );
      final firstSession = server.registry
          .byProject('dsh-workflow')!
          .appSessionId;
      final firstStarts = await starts.readAsString();
      await state({'action': 'close'});
      final second = await Process.start(
        executable.path,
        [],
        environment: environment,
      );
      final secondOutput = Future.wait([
        second.stdout.transform(utf8.decoder).join(),
        second.stderr.transform(utf8.decoder).join(),
      ]);
      final secondExit = await second.exitCode.timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          second.kill(ProcessSignal.sigkill);
          throw TimeoutException('Second preseeded application stayed alive');
        },
      );
      final output = (await secondOutput).join('\n');
      await File('${root.path}/second-app.log').writeAsString(output);
      stdout.writeln('SECOND_APP_EXIT=$secondExit');
      require(
        secondExit == 0 && !exited,
        'preseeded second application is rejected while the first remains alive',
      );
      require(
        !output.contains('The Dart VM service is listening') &&
            !output.contains('Using the Impeller rendering backend'),
        'second instance is rejected before Flutter engine and Dart startup',
      );
      require(
        await starts.readAsString() == firstStarts &&
            server.registry.byProject('dsh-workflow')!.appSessionId ==
                firstSession,
        'second instance starts no controlled runtime and creates no new accepted SDK session',
      );
      await waitFor(
        'preseeded first window activation',
        () async =>
            native(await state())['windowVisible'] == true &&
            native(await state())['windowKey'] == true,
      );
      require(
        native(await state())['pid'] == process.pid,
        'preseeded duplicate reopens the existing native process',
      );
      await state({'action': 'quit'});
      require(
        await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
        'preseeded application quits normally',
      );
      stdout.writeln('T01 INSTANCE STARTUP PROBE PASSED');
      return;
    }

    await waitFor('management UI', () async => text(await state(), '启动 Web'));
    var snapshot = await state();
    require(
      native(snapshot)['isolated'] == true &&
          native(snapshot)['dataRoot'] == environment['DSH_LAUNCHER_TEST_ROOT'],
      'actual native application reports the isolated data root',
    );
    require(
      native(snapshot)['windowVisible'] == true &&
          native(snapshot)['entryVisible'] == true &&
          !exited,
      'without manager the actual application owns a visible window and menu',
    );
    await waitFor(
      'connection failure visible',
      () async => text(await state(), 'disconnected'),
    );
    require(true, 'management UI exposes disconnected SDK state');
    await state({'action': 'minimum'});
    await Future<void>.delayed(const Duration(milliseconds: 250));
    snapshot = await state();
    require(
      native(snapshot)['windowWidth'] == 780 &&
          native(snapshot)['windowHeight'] == 560,
      'actual native window reaches the supported 780 × 560 minimum frame',
    );
    await tap('启动 Web');
    await waitFor(
      'management operation error rendered',
      () async => text(await state(), '请先设置内网访问密码'),
    );
    snapshot = await state();
    require(
      text(snapshot, '请先设置内网访问密码'),
      'actual management operation failure is visible',
    );
    await capture('management');
    await tap('插件');
    require(
      text(await state(), '插件检查失败'),
      'plugin page and actual missing runtime failure are visible',
    );
    await capture('plugins');
    await tap('日志');
    require(
      text(await state(), 'Web 业务进程日志'),
      'log page is usable at the native minimum size',
    );
    await capture('logs');
    await tap('管理');
    require(
      (await state())['errors'] is List &&
          ((await state())['errors']! as List).isEmpty,
      'all three actual pages render without Flutter layout errors',
    );
    await state({'action': 'close'});
    require(
      native(await state())['windowVisible'] == false && !exited,
      'closing the real native window keeps the application alive',
    );
    await state({'action': 'ownEntry'});
    require(
      native(await state())['windowVisible'] == true,
      'the application own management entry reopens the real native window',
    );

    final bindings = await BindingStore.load('${root.path}/bindings.json');
    await bindings.associate(manifestPath);
    server = await LauncherServer.start(layout: layout, bindings: bindings);
    await waitFor(
      'official manager discovers application',
      () async => server!.registry.byProject('dsh-workflow') != null,
    );
    final project = server.registry.byProject('dsh-workflow')!;
    final capabilities = project.capabilities;
    final web = capabilities.services.singleWhere(
      (service) => service.id == 'web',
    );
    require(
      web.methods.toSet().containsAll({
        kMethodStart,
        kMethodRecycle,
        kMethodStatus,
        kMethodLogs,
      }),
      'official SDK declares Web start, recycle, status and logs',
    );
    require(
      capabilities.services.map((service) => service.id).toSet().containsAll({
            'web',
            'desktop',
          }) &&
          capabilities.services
                  .singleWhere((service) => service.id == 'desktop')
                  .methods
                  .length ==
              1 &&
          capabilities.services
              .singleWhere((service) => service.id == 'desktop')
              .supports(kMethodStatus),
      'official manager discovers web controls and observation-only desktop through the official SDK',
    );
    final session = server.sessionFor('dsh-workflow')!;
    Future<void> request(String method) async {
      final reply = await session.sendRequest(
        method,
        timeout: const Duration(seconds: 5),
      );
      require(
        reply['error'] == null,
        'official SDK $method acknowledges actual native action',
      );
    }

    await state({'action': 'close'});
    await request(kMethodOpenWindow);
    await waitFor('SDK native window activation', () async {
      final actual = native(await state());
      return actual['windowVisible'] == true && actual['windowKey'] == true;
    });
    require(
      native(await state())['windowVisible'] == true &&
          native(await state())['windowKey'] == true,
      'SDK openWindow reopens and activates the actual native window',
    );
    await state({'action': 'close'});
    final second = await Process.start(
      executable.path,
      [],
      environment: environment,
    );
    final streams = Future.wait([
      second.stdout.transform(utf8.decoder).join(),
      second.stderr.transform(utf8.decoder).join(),
    ]);
    final secondExit = await second.exitCode.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        second.kill(ProcessSignal.sigkill);
        throw TimeoutException('Second application stayed alive');
      },
    );
    await File('${root.path}/second-app.log')
        .writeAsString((await streams).join('\n'));
    stdout.writeln('SECOND_APP_EXIT=$secondExit');
    await waitFor(
      'existing window activated on second open',
      () async =>
          native(await state())['windowVisible'] == true &&
          native(await state())['windowKey'] == true,
    );
    require(
      secondExit == 0 &&
          !exited &&
          native(await state())['pid'] == process.pid &&
          server.registry.byProject('dsh-workflow')!.appSessionId ==
              project.appSessionId,
      'second application invocation exits and activates the same process and SDK session',
    );
    await state({'action': 'close'});
    await const EntryLauncher().open(
      manifest.entry!,
      manifestDir: File(manifestPath).parent.path,
    );
    await waitFor(
      'associated app activation',
      () async =>
          native(await state())['windowVisible'] == true &&
          native(await state())['windowKey'] == true,
    );
    require(
      !exited && native(await state())['pid'] == process.pid,
      'official association opens and activates this same real application',
    );
    await server.close();
    server = null;
    await waitFor(
      'disconnection UI remains usable',
      () async => text(await state(), 'disconnected'),
    );
    await state({'action': 'close'});
    await state({'action': 'ownEntry'});
    require(
      native(await state())['windowVisible'] == true &&
          native(await state())['entryVisible'] == true &&
          !exited,
      'after manager disconnect the original window and own menu remain available',
    );
    await state({'action': 'quit'});
    require(
      await process.exitCode.timeout(const Duration(seconds: 10)) == 0,
      'application performs normal quit cleanup',
    );
    stdout.writeln('T01 APPLICATION PROBE PASSED');
  } finally {
    await server?.close();
    await releaseFixture?.close();
    await settings?.close();
    await vm?.dispose();
    if (!exited) {
      process.kill(ProcessSignal.sigterm);
      try {
        await process.exitCode.timeout(const Duration(seconds: 3));
      } on TimeoutException {
        process.kill(ProcessSignal.sigkill);
        await process.exitCode;
      }
    }
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
    await outputFile.close();
    stdout.writeln('APP_LOG=${root.path}/app.log');
  }
}
