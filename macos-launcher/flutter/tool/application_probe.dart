import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:launcher_core/launcher_core.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

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
  if (arguments.length != 1) {
    throw ArgumentError('Pass the debug Flutter application executable');
  }
  final executable = File(arguments.single).absolute;
  final app = executable.parent.parent.parent;
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
  final root = await Directory('/private/tmp').createTemp('dsh-t01-');
  stdout.writeln('ISOLATED_ROOT=${root.path}');
  final layout = EndpointLayout(directory: '${root.path}/manager');
  final environment = {
    ...Platform.environment,
    'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
    'DSH_LAUNCHER_TEST_HOME': '${root.path}/home',
    'DSH_LAUNCHER_TEST_RESOURCES': '${root.path}/missing-runtime',
    'DSH_LAUNCHER_TEST_SOCKET': layout.socketPath,
    'DSH_HOME': '${root.path}/home',
  };
  await Directory(environment['DSH_LAUNCHER_TEST_RESOURCES']!).create();
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
  final process = await Process.start(executable.path, [
    '--vm-service-port=0',
  ], environment: environment);
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
        'actual minimum window screenshot: $path',
      );
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
      second.stdout.drain<void>(),
      second.stderr.drain<void>(),
    ]);
    final secondExit = await second.exitCode.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        second.kill(ProcessSignal.sigkill);
        throw TimeoutException('Second application stayed alive');
      },
    );
    await streams;
    stdout.writeln('SECOND_APP_EXIT=$secondExit');
    await waitFor(
      'existing window activated on second open',
      () async => native(await state())['windowVisible'] == true,
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
