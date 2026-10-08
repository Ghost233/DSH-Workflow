import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:launcher_core/launcher_core.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';
import 'package:vm_service/vm_service.dart' hide Error;
import 'package:vm_service/vm_service_io.dart';

import 'application_probe.dart' show require, waitFor;

Future<ProcessResult> command(String executable, List<String> arguments) async {
  final result = await Process.run(executable, arguments);
  if (result.exitCode != 0) {
    throw StateError('$executable exit ${result.exitCode}: ${result.stderr}');
  }
  return result;
}

Future<String> digest(String file) async => (await command('/usr/bin/shasum', [
  '-a',
  '256',
  file,
])).stdout.toString().split(' ').first;

Future<void> main(List<String> arguments) async {
  if (arguments.length != 2 ||
      !{'--local-debug', '--release'}.contains(arguments[0]) ||
      !Platform.isMacOS) {
    throw ArgumentError('--local-debug|--release ACTUAL_APP');
  }
  final local = arguments[0] == '--local-debug';
  if (!local && Platform.environment['DSH_T09_SUPERVISED_DRIVER'] != '1') {
    await runReleaseSupervisor(arguments);
    return;
  }
  final defaultLayout = EndpointLayout.forUser();
  if (!local) {
    // Check before creating a broker: the SDK itself deletes a stale socket.
    final conflicts = <String>[];
    for (final path in [
      defaultLayout.socketPath,
      defaultLayout.lockPath,
      '${defaultLayout.directory}/bindings.json',
      '${Platform.environment['HOME']}/Library/Application Support/DSH Workflow/launcher-instance.lock',
    ]) {
      if (await FileSystemEntity.type(path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        conflicts.add(path);
      }
    }
    if (conflicts.isNotEmpty) {
      stdout.writeln(
        'T09_BLOCKED=${jsonEncode({'defaultEndpointConflicts': conflicts, 'appLaunched': false})}',
      );
      exitCode = 3;
      return;
    }
    require(
      Platform.environment['GITHUB_ACTIONS'] == 'true' &&
          Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] == null,
      'Release default discovery requires a disposable runner',
    );
  }
  final uid = (await command('/usr/bin/id', ['-u'])).stdout.toString().trim();
  final base = local
      ? '/private/tmp/dsh-launcher-local-$uid'
      : await Directory(Platform.environment['RUNNER_TEMP']!)
            .resolveSymbolicLinks();
  if (local) {
    require(
      Platform.environment['GITHUB_ACTIONS'] != 'true' &&
          Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] == base,
      'private Debug has explicit local context',
    );
  }
  require(
    await Directory(base).resolveSymbolicLinks() == base,
    'acceptance base is physical',
  );
  final baseCheck = await command('/usr/bin/python3', [
    '-c',
    'import os,stat,sys; p=sys.argv[1]; s=os.lstat(p); assert not stat.S_ISLNK(s.st_mode) and stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid(); assert sys.argv[2]=="ci" or stat.S_IMODE(s.st_mode)==0o700; print("owned")',
    base,
    local ? 'local' : 'ci',
  ]);
  require(
    baseCheck.stdout.toString().trim() == 'owned',
    'base UID and private local mode confirmed',
  );
  final source = Directory(
    await Directory(arguments[1]).resolveSymbolicLinks(),
  );
  final debugDylib = File(
    '${source.path}/Contents/MacOS/DSH Workflow.debug.dylib',
  );
  require(
    await debugDylib.exists() == local,
    'requested mode matches real compiled producer',
  );
  final root = await Directory(base).createTemp('dsh-t05-t09-');
  await command('/bin/chmod', ['700', root.path]);
  stdout.writeln('T09_ROOT=${root.path}');
  final stage = Directory('${root.path}/staged.app');
  await command('/usr/bin/ditto', [source.path, stage.path]);
  final movedDir = await Directory('${root.path}/moved').create();
  final moved = await stage.rename('${movedDir.path}/DSH Workflow.app');
  if (local) {
    await Directory('${root.path}/data').create();
    await Directory('${root.path}/manager').create();
    // LaunchServices reopens use this private Debug profile; Release has no overlay.
    await command('/usr/bin/plutil', [
      '-replace',
      'DSHLauncherTestRoot',
      '-string',
      '${root.path}/data',
      '${moved.path}/Contents/Info.plist',
    ]);
    await command('/usr/bin/plutil', [
      '-replace',
      'CFBundleIdentifier',
      '-string',
      'com.ghostagent.dsh-workflow.t09.${root.uri.pathSegments.where((s) => s.isNotEmpty).last}',
      '${moved.path}/Contents/Info.plist',
    ]);
    await command('/usr/bin/codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      moved.path,
    ]);
  }
  final manifestPath = '${moved.path}/Contents/Resources/maclauncher.json';
  final manifest = ProjectManifest.parse(
    await File(manifestPath).readAsString(),
  );
  final manifestDir = File(manifestPath).parent.path;
  final entry = manifest.entry!;
  require(
    await Directory(EntryLauncher.resolve(entry.path, manifestDir))
            .resolveSymbolicLinks() ==
        moved.path,
    'official relative entry resolves to the moved app',
  );
  final bindings = await BindingStore.load('${root.path}/bindings.json');
  final binding = await bindings.associate(manifestPath);
  require(
    binding.manifestPath == await File(manifestPath).resolveSymbolicLinks(),
    'official association belongs to this moved manifest',
  );
  final observer = '${root.path}/release-window-observer';
  await command('/usr/bin/swiftc', [
    File.fromUri(Platform.script.resolve('release_window_observer.swift')).path,
    '-o',
    observer,
  ]);
  Future<Map<String, Object?>> observe(String action) async => (jsonDecode(
    (await command(observer, [
      root.path,
      moved.path,
      action,
    ])).stdout.toString(),
  ) as Map).cast<String, Object?>();
  final layout = local
      ? EndpointLayout(directory: '${root.path}/manager')
      : defaultLayout;
  LauncherServer? server;
  Process? debugProcess;
  Process? actorProcess;
  IOSink? actorLog;
  final actorDrained = <Completer<void>>[];
  final actorSubscriptions = <StreamSubscription<String>>[];
  VmService? vm;
  String? debugIsolate;
  IOSink? debugLog;
  final drained = <Completer<void>>[];
  final subscriptions = <StreamSubscription<String>>[];
  var captured = false, normalTerminated = false;
  Object? firstError;
  StackTrace? firstStack;
  int? physicalAppPid;
  Future<void> supervisionReceipt(String stage) async {
    final temporary = File('${root.path}/supervision-live.pending');
    await temporary.writeAsString(
      jsonEncode({
        'stage': stage,
        'root': root.path,
        'app': moved.path,
        'pids': {
          'driver': pid,
          'app': ?physicalAppPid,
          if (actorProcess != null) 'xcode': actorProcess.pid,
        },
      }),
    );
    await temporary.rename('${root.path}/supervision-live.json');
  }

  final evidence = <String, Object?>{
    'mode': local
        ? 'private-Debug-SDK-window-entry'
        : 'Release-default-discovery',
    'defaultReleaseDiscoveryPassed': false,
    'sourceApp': source.path,
    'movedApp': moved.path,
    'sourceManifestSha256': await digest(
      '${source.path}/Contents/Resources/maclauncher.json',
    ),
    'movedManifestSha256': await digest(manifestPath),
    'sourceExecutableSha256': await digest(
      '${source.path}/Contents/MacOS/DSH Workflow',
    ),
    'movedExecutableSha256': await digest(
      '${moved.path}/Contents/MacOS/DSH Workflow',
    ),
    'executableArchitecture': (await command('/usr/bin/file', [
      '${moved.path}/Contents/MacOS/DSH Workflow',
    ])).stdout.toString(),
    'debugOverlayUsed': local,
  };
  try {
    server = await LauncherServer.start(layout: layout, bindings: bindings);
    if (local) {
      final uri = Completer<String>();
      debugLog = File('${root.path}/debug-app.log').openWrite();
      debugProcess = await Process.start(
        '${moved.path}/Contents/MacOS/DSH Workflow',
        ['--vm-service-port=0'],
        environment: {
          ...Platform.environment,
          'DSH_LAUNCHER_TEST_ROOT': '${root.path}/data',
          'DSH_LAUNCHER_TEST_SOCKET': layout.socketPath,
        },
      );
      evidence['debugChildPid'] = debugProcess.pid;
      evidence['coldStartActor'] = 'existing private Debug process probe';
      evidence['entryColdLaunchVerified'] = false;
      for (final stream in [debugProcess.stdout, debugProcess.stderr]) {
        final done = Completer<void>();
        drained.add(done);
        subscriptions.add(
          stream.transform(utf8.decoder).transform(const LineSplitter()).listen(
            (line) {
              final match = RegExp(r'http://127\.0\.0\.1:\d+/[^\s]+/')
                  .firstMatch(line);
              debugLog!.writeln(
                match == null
                    ? line
                    : line.replaceFirst(match.group(0)!, '<private VM URI>'),
              );
              if (match != null && !uri.isCompleted) {
                uri.complete(match.group(0)!);
              }
            },
            onDone: done.complete,
          ),
        );
      }
      final address = await uri.future.timeout(const Duration(seconds: 30));
      vm = await vmServiceConnectUri(
        '${address.replaceFirst('http:', 'ws:')}ws',
      );
      debugIsolate = (await vm.getVM()).isolates!.single.id!;
      await waitFor(
        'existing private application window probe',
        () async =>
            (await vm!.getIsolate(debugIsolate!)).extensionRPCs!
                .contains('ext.dshlauncher.application'),
      );
    }
    if (!local) await supervisionReceipt('before-associated-entry');
    await const EntryLauncher().open(entry, manifestDir: manifestDir);
    await waitFor('physically owned moved app', () async {
      final value = await observe('capture');
      captured = value['known'] == true;
      if (captured) evidence['identity'] = value;
      return captured;
    });
    physicalAppPid = (evidence['identity'] as Map)['pid'] as int;
    if (!local) {
      evidence['entryColdLaunchVerified'] = true;
      await supervisionReceipt('physical-app-pid-observed');
    }
    if (local) {
      require(
        (evidence['identity'] as Map)['pid'] == debugProcess!.pid,
        'physical moved app is the exact current owned Debug process',
      );
    }
    await waitFor(
      'official moved-app SDK session',
      () async => server!.sessionFor(manifest.projectId) != null,
    );
    final project = server.registry.byProject(manifest.projectId)!;
    final services = project.capabilities.services;
    require(
      services.singleWhere((s) => s.id == 'web').methods.toSet().containsAll({
            'start',
            'recycle',
            'status',
            'logs',
          }) &&
          services.singleWhere((s) => s.id == 'desktop').methods.join(',') ==
              'status',
      'real SDK capabilities preserve owned Web and observation-only Desktop',
    );
    evidence['appSessionId'] = project.appSessionId;
    evidence['launcherSessionId'] = project.launcherSessionId;
    evidence['capabilities'] = project.capabilities.toJson();
    Future<void> openWindow() async {
      final reply = await server!
          .sessionFor(manifest.projectId)!
          .sendRequest(kMethodOpenWindow, timeout: const Duration(seconds: 30));
      require(
        reply['error'] == null,
        'official SDK openWindow returns successfully',
      );
      await waitFor('same actual window shown and focused', () async {
        final value = await observe('query');
        evidence['lastWindow'] = value;
        return value['hidden'] == false &&
            (value['onscreenWindows'] as int) > 0 &&
            value['active'] == true &&
            value['frontmostPid'] == (evidence['identity'] as Map)['pid'];
      });
    }

    await openWindow();
    evidence['initialWindowShown'] = true;
    if (local) {
      final state = (await vm!.callServiceExtension(
        'ext.dshlauncher.application',
        isolateId: debugIsolate,
      )).json!;
      require(
        (state['native'] as Map)['pid'] == debugProcess!.pid &&
            (state['native'] as Map)['isolated'] == true &&
            (state['native'] as Map)['dataRoot'] == '${root.path}/data',
        'existing Debug close action belongs to this exact private app',
      );
      await vm.callServiceExtension(
        'ext.dshlauncher.application',
        isolateId: debugIsolate,
        args: {'action': 'close'},
      );
      await waitFor(
        'same physical management window closes with SDK live',
        () async {
          final value = await observe('query');
          evidence['closedManagementWindow'] = value;
          return value['onscreenWindows'] == 0 &&
              server!.sessionFor(manifest.projectId) != null &&
              server.registry.byProject(manifest.projectId)?.appSessionId ==
                  project.appSessionId;
        },
      );
      evidence['closedWindowSdkStatus'] = await server
          .sessionFor(manifest.projectId)!
          .sendRequest(
            'status',
            serviceId: 'web',
            timeout: const Duration(seconds: 30),
          );
      require(
        (evidence['closedWindowSdkStatus'] as Map)['error'] == null &&
            server.registry.byProject(manifest.projectId)?.appSessionId ==
                project.appSessionId,
        'same official SDK session responds while the physical window is closed',
      );
      evidence['publicWindowCloseVerified'] = true;
    } else {
      final variant = '${root.path}/public-close-actor.xctestrun';
      final configureActor = await Process.run('/usr/bin/python3', [
        '-c',
        'import plistlib,sys,pathlib; src=pathlib.Path(sys.argv[1]); v=plistlib.loads(src.read_bytes()); '
            'rewrite=lambda x: {k:rewrite(z) for k,z in x.items()} if isinstance(x,dict) else [rewrite(z) for z in x] if isinstance(x,list) else x.replace("__TESTROOT__",str(src.parent.resolve())) if isinstance(x,str) else x; '
            'v=rewrite(v); t=v["PublicCloseUITests"]; assert t["UseUITargetAppProvidedByTests"] is True and "UITargetAppPath" not in t; '
            't["UITargetAppEnvironmentVariables"]={}; t["TestTimeoutsEnabled"]=True; t["DefaultTestExecutionTimeAllowance"]=120; t["MaximumTestExecutionTimeAllowance"]=130; t["EnvironmentVariables"].update(DSH_T09_ACTOR_ROOT=sys.argv[3],DSH_T09_ACTOR_APP=sys.argv[4],GITHUB_ACTIONS="true",RUNNER_TEMP=sys.argv[5]); '
            'pathlib.Path(sys.argv[2]).write_bytes(plistlib.dumps(v)); print("exact-runner-only-context")',
        Platform.environment['DSH_T09_CLOSE_ACTOR_XCTESTRUN']!,
        variant,
        root.path,
        moved.path,
        base,
      ]);
      require(
        configureActor.exitCode == 0,
        'UI actor variant has no default AUT or AUT DYLD overrides',
      );
      final actorCommand = [
        'test-without-building',
        '-xctestrun',
        variant,
        '-destination',
        'platform=macOS,arch=${(await command('/usr/bin/uname', ['-m'])).stdout.toString().trim()}',
        '-only-testing:PublicCloseUITests/PublicCloseUITests/testCloseExactExistingWindow',
        '-resultBundlePath',
        '${root.path}/public-close-actor.xcresult',
      ];
      evidence['publicCloseActorCommand'] = actorCommand;
      actorLog = File('${root.path}/public-close-actor.log').openWrite();
      await supervisionReceipt('before-owned-xcode-launch');
      actorProcess = await Process.start(
        (await command('/usr/bin/xcrun', [
          '--find',
          'xcodebuild',
        ])).stdout.toString().trim(),
        actorCommand,
      );
      await supervisionReceipt('owned-xcode-pid-observed');
      evidence['publicCloseActorPid'] = actorProcess.pid;
      var actorExited = false;
      unawaited(
        actorProcess.exitCode.then((code) {
          actorExited = true;
          evidence['publicCloseActorExit'] = code;
        }),
      );
      for (final stream in [actorProcess.stdout, actorProcess.stderr]) {
        final done = Completer<void>();
        actorDrained.add(done);
        actorSubscriptions.add(
          stream
              .transform(utf8.decoder)
              .transform(const LineSplitter())
              .listen(actorLog.writeln, onDone: done.complete),
        );
      }
      await waitFor(
        'sanctioned UI actor ready without implicit AUT launch',
        () async {
          if (actorExited) throw StateError('UI actor exited before ready');
          return File('${root.path}/public-close-actor-ready').exists();
        },
      );
      final beforeActor = await observe('query');
      require(
        beforeActor['pid'] == physicalAppPid &&
            beforeActor['onscreenWindows'] == 1,
        'actor startup preserves the exact existing app and current window',
      );
      await File('${root.path}/public-close-request')
          .writeAsString('$physicalAppPid');
      await waitFor(
        'public exact-owned close action acknowledgement',
        () async {
          if (actorExited) {
            throw StateError('UI actor exited before close acknowledgement');
          }
          return File('${root.path}/public-close-ack').exists();
        },
      );
      evidence['publicCloseActorAcknowledged'] = true;
      await waitFor(
        'same physical management window closes with SDK live',
        () async {
          final value = await observe('query');
          evidence['closedManagementWindow'] = value;
          return value['onscreenWindows'] == 0 &&
              server!.sessionFor(manifest.projectId) != null &&
              server.registry.byProject(manifest.projectId)?.appSessionId ==
                  project.appSessionId;
        },
      );
      evidence['closedWindowSdkStatus'] = await server
          .sessionFor(manifest.projectId)!
          .sendRequest(
            'status',
            serviceId: 'web',
            timeout: const Duration(seconds: 30),
          );
      require(
        (evidence['closedWindowSdkStatus'] as Map)['error'] == null &&
            server.registry.byProject(manifest.projectId)?.appSessionId ==
                project.appSessionId,
        'same official SDK session responds while the physical window is closed',
      );
      evidence['publicWindowCloseVerified'] = true;
    }
    await openWindow();
    evidence['sdkWindowRecovery'] = true;
    await const EntryLauncher().open(entry, manifestDir: manifestDir);
    await waitFor(
      'associated reopen preserves same physical app and SDK session',
      () async {
        final value = await observe('query');
        return value['active'] == true &&
            (value['onscreenWindows'] as int) > 0 &&
            server!.registry.byProject(manifest.projectId)?.appSessionId ==
                project.appSessionId;
      },
    );
    evidence['entrySingletonRecovery'] = true;
    if (local) {
      final normal = await Future.wait<Object?>([
        observe('terminate'),
        debugProcess!.exitCode.timeout(const Duration(seconds: 10)),
      ]);
      evidence['normalTermination'] = normal[0];
      evidence['normalDebugChildExit'] = normal[1];
      require(
        normal[1] == 0,
        'owned Debug app exits through original normal stage',
      );
    } else {
      evidence['normalTermination'] = await observe('terminate');
    }
    normalTerminated = true;
    if (!local) {
      await File('${root.path}/public-close-driver-complete')
          .writeAsString('normal driver complete');
      final actorCode = await actorProcess!.exitCode.timeout(
        const Duration(seconds: 30),
      );
      evidence['publicCloseActorExit'] = actorCode;
      require(
        actorCode == 0,
        'public-close actor exits successfully after exact app normal quit',
      );
    }
    evidence['defaultReleaseDiscoveryPassed'] = !local;
  } catch (error, stack) {
    firstError = error;
    firstStack = stack;
    evidence['firstErrorType'] = error.runtimeType.toString();
    evidence['firstError'] = error.toString();
  } finally {
    try {
      await vm?.dispose();
    } catch (error, stack) {
      evidence['independentVmCleanupErrorType'] = error.runtimeType.toString();
      firstError ??= error;
      firstStack ??= stack;
    }
    try {
      if (captured && !normalTerminated) {
        evidence['cleanupTermination'] = await observe('terminate');
      }
    } catch (error) {
      evidence['independentCleanupErrorType'] = error.runtimeType.toString();
    }
    if (actorProcess != null) {
      await File('${root.path}/public-close-driver-complete')
          .writeAsString('driver cleanup complete');
      try {
        evidence['publicCloseActorCleanupExit'] = await actorProcess.exitCode
            .timeout(const Duration(seconds: 30));
        await Future.wait(actorDrained.map((done) => done.future));
      } catch (error, stack) {
        evidence['publicCloseActorCleanupErrorType'] = error.runtimeType
            .toString();
        firstError ??= error;
        firstStack ??= stack;
      }
      for (final subscription in actorSubscriptions) {
        await subscription.cancel();
      }
      await actorLog?.close();
    }
    if (debugProcess != null) {
      var exitKnown = false;
      try {
        if (!captured) debugProcess.kill(ProcessSignal.sigterm);
        evidence['debugChildExit'] = await debugProcess.exitCode.timeout(
          const Duration(seconds: 10),
        );
        exitKnown = true;
      } catch (error, stack) {
        evidence['independentDebugCleanupErrorType'] = error.runtimeType
            .toString();
        firstError ??= error;
        firstStack ??= stack;
      }
      if (exitKnown) await Future.wait(drained.map((done) => done.future));
      evidence['debugOutputComplete'] =
          exitKnown && drained.every((done) => done.isCompleted);
      for (final subscription in subscriptions) {
        await subscription.cancel();
      }
      await debugLog?.close();
    }
    try {
      await server?.close();
      if (server != null) {
        require(
          await FileSystemEntity.type(layout.socketPath, followLinks: false) ==
              FileSystemEntityType.notFound,
          'only the owned SDK endpoint was released',
        );
        evidence['ownedEndpointReleased'] = true;
      }
    } catch (error, stack) {
      firstError ??= error;
      firstStack ??= stack;
    }
    await File('${root.path}/release-distribution-evidence.json')
        .writeAsString(jsonEncode(evidence));
  }
  if (firstError != null) Error.throwWithStackTrace(firstError, firstStack!);
  stdout.writeln('T09 SDK WINDOW ENTRY SCENARIO PASSED (${evidence['mode']})');
}

Future<void> runReleaseSupervisor(List<String> arguments) async {
  require(
    Platform.environment['GITHUB_ACTIONS'] == 'true' &&
        Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] == null,
    'Release actor uses only a disposable runner',
  );
  final base = await Directory(Platform.environment['RUNNER_TEMP']!)
      .resolveSymbolicLinks();
  require(
    base == Platform.environment['RUNNER_TEMP'],
    'runner root input is physical',
  );
  final xctestrun = Platform.environment['DSH_T09_CLOSE_ACTOR_XCTESTRUN'];
  require(
    xctestrun != null && await File(xctestrun).exists(),
    'actual actor build-for-testing input exists',
  );
  final metadata = await command('/usr/bin/python3', [
    '-c',
    'import pathlib,plistlib,sys,json; p=pathlib.Path(sys.argv[1]); assert not p.is_symlink() and str(p)==str(p.resolve()); t=plistlib.loads(p.read_bytes())["PublicCloseUITests"]; assert t["UseUITargetAppProvidedByTests"] is True and "UITargetAppPath" not in t; h=t["TestHostPath"].replace("__TESTROOT__",str(p.parent)); assert h.endswith("PublicCloseUITests-Runner.app"); print(json.dumps({"runnerExecutable":str(pathlib.Path(h,"Contents/MacOS/PublicCloseUITests-Runner").resolve(strict=True)),"isUITestBundle":t["IsUITestBundle"],"defaultAUT":False}))',
    xctestrun!,
  ]);
  final target = (jsonDecode(metadata.stdout.toString()) as Map)
      .cast<String, Object?>();
  require(
    target['isUITestBundle'] == true,
    'only the sanctioned UI runner target is built',
  );
  final xcode = (await command('/usr/bin/xcrun', [
    '--find',
    'xcodebuild',
  ])).stdout.toString().trim();
  final evidence =
      '${Platform.environment['EVIDENCE_DIR']!}/public-close-supervision';
  final configuration = {
    'evidence': evidence,
    'rootParent': base,
    'totalSeconds': 180,
    'cleanupReserveSeconds': 30,
    'termBeforeDeadlineSeconds': 15,
    'forceBeforeDeadlineSeconds': 5,
    'command': [
      Platform.resolvedExecutable,
      Platform.script.toFilePath(),
      ...arguments,
    ],
    'environmentOverrides': {'DSH_T09_SUPERVISED_DRIVER': '1'},
    'requiredRoles': ['driver', 'app', 'xcode', 'uiRunner'],
    'expectedExecutables': {
      'xcode': xcode,
      'uiRunner': target['runnerExecutable'],
    },
    'targetMetadata': target,
    'supervisorSource': outerSupervisorPython,
  };
  await Directory(evidence).create(recursive: true);
  await File('$evidence/actual-configuration.json')
      .writeAsString(jsonEncode(configuration));
  final outer = await Process.start('/usr/bin/python3', [
    '-c',
    outerSupervisorPython,
    jsonEncode(configuration),
  ]);
  await Future.wait([
    stdout.addStream(outer.stdout),
    stderr.addStream(outer.stderr),
  ]);
  exitCode = await outer.exitCode;
}

const outerSupervisorPython = r'''
import ctypes, pathlib, os, sys, json, subprocess, selectors, time, signal, re, errno
config=json.loads(sys.argv[1]); evidence=pathlib.Path(config['evidence']); evidence.mkdir(parents=True,exist_ok=True)
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
class BsdInfo(ctypes.Structure):
    _fields_=[(n,ctypes.c_uint32) for n in ['flags','status','xstatus','pid','ppid','uid','gid','ruid','rgid','svuid','svgid','rfu']]+[('comm',ctypes.c_char*16),('name',ctypes.c_char*32)]+[(n,ctypes.c_uint32) for n in ['nfiles','pgid','pjobc','tdev','tpgid']]+[('nice',ctypes.c_int32),('sec',ctypes.c_uint64),('usec',ctypes.c_uint64)]
def identity(pid):
    info=BsdInfo(); ctypes.set_errno(0); size=lib.proc_pidinfo(pid,3,0,ctypes.byref(info),ctypes.sizeof(info)); err=ctypes.get_errno()
    if size!=ctypes.sizeof(info): return {'pid':pid,'known':False,'kernelBytes':size,'errno':err}
    buf=ctypes.create_string_buffer(4096); count=lib.proc_pidpath(pid,buf,len(buf))
    return {'pid':pid,'known':count>0,'uid':info.uid,'parentPid':info.ppid,'kernelSeconds':info.sec,'kernelMicroseconds':info.usec,'executable':os.path.realpath(buf.value.decode()) if count>0 else None}
start=time.monotonic(); total=float(config['totalSeconds']); cleanup=float(config['cleanupReserveSeconds']); deadline=start+total; stop_work=deadline-cleanup; term_at=deadline-float(config.get('termBeforeDeadlineSeconds',15)); force_at=deadline-float(config.get('forceBeforeDeadlineSeconds',5))
state={'startMonotonic':start,'stopWorkMonotonic':stop_work,'overallDeadlineMonotonic':deadline,'overallSeconds':total,'plannedCommand':config['command'],'configuration':config,'supervisorSourceSha256':__import__('hashlib').sha256(config.get('supervisorSource','').encode()).hexdigest(),'covers':'driver plus external xcode/UI host calls','timedOut':False,'cancelled':False,'signals':[],'identities':{},'driverExit':None,'forced':False}
def persist():
    state['observedMonotonic']=time.monotonic(); (evidence/'overall-supervision.json').write_text(json.dumps(state,indent=2)+'\n')
def cancelled(signum,frame):
    global stop_work,deadline,term_at,force_at
    state['cancelled']=True; state['cancelSignal']=signum; stop_work=time.monotonic(); deadline=min(deadline,stop_work+cleanup);term_at=min(term_at,deadline-15);force_at=min(force_at,deadline-5);state['overallDeadlineMonotonic']=deadline;persist()
signal.signal(signal.SIGINT,cancelled);signal.signal(signal.SIGTERM,cancelled)
persist(); childenv=os.environ.copy();childenv.update(config.get('environmentOverrides',{}));child=subprocess.Popen(config['command'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=childenv)
expected={'driver':os.path.realpath(config['command'][0])}; expected.update(config.get('expectedExecutables',{})); ids={}
def bind(role,pid):
    fact=identity(pid)
    if fact.get('known') and fact.get('uid')==os.getuid() and fact.get('executable')==expected.get(role) and (role!='host' or 'desktop' in ids and fact.get('parentPid')==ids['desktop']['pid']):
        ids[role]=fact; state['identities'][role]=fact;persist()
    else: state.setdefault('identityWarnings',[]).append({'role':role,'observation':fact});persist()
bind('driver',child.pid); selector=selectors.DefaultSelector(); selector.register(child.stdout,selectors.EVENT_READ); buffer=b''; root=None; phase=0
with (evidence/'overall-command.log').open('wb') as output:
    while True:
        now=time.monotonic()
        if 'driver' not in ids: bind('driver',child.pid)
        if root:
            live=root/'supervision-live.json'
            if live.is_file() and not live.is_symlink():
                value=json.loads(live.read_text())
                app=root/config.get('appRelativePath','moved/DSH Workflow.app')/'Contents/MacOS/DSH Workflow'; expected['app']=os.path.realpath(app)
                if config.get('desktopSdkCold'): expected['desktop']=expected['host']=os.path.realpath(root/'missing-runtime/desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness')
                for role,pid in value.get('pids',{}).items():
                    if role not in ids: bind(role,int(pid))
            actor=root/'public-close-actor.log'
            if actor.is_file() and not actor.is_symlink():
                rows=re.findall(r'PublicCloseUITests-Runner\[([0-9]+):',actor.read_text())
                if rows and 'uiRunner' not in ids: bind('uiRunner',int(rows[-1]))
        if now>=stop_work and phase==0:
            state['timedOut']=True;phase=1;persist()
            if root:
                (root/'public-close-driver-complete').write_text('supervisor timeout FAIL')
                (root/'supervision-cancel-request').write_text('overall deadline stop-work')
                old=ids.get('app')
                if old and identity(old['pid'])==old:
                    helper=root/'release-window-observer'
                    normal=subprocess.Popen([str(helper),str(root),str(root/config.get('appRelativePath','moved/DSH Workflow.app')),'terminate'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
                    state['normalAppCleanupHelperIdentity']=identity(normal.pid);persist()
                    try:
                        text,_=normal.communicate(timeout=max(.1,min(10,deadline-time.monotonic())))
                        state['normalAppCleanup']={'actualExit':normal.returncode,'output':text.decode(errors='replace')}
                    except subprocess.TimeoutExpired:
                        state['normalAppCleanup']={'actualExit':None,'timedOut':True}
                        helperOld=state['normalAppCleanupHelperIdentity']
                        if helperOld.get('known') and identity(normal.pid)==helperOld:
                            normal.terminate();state['signals'].append({'role':'normalCleanupHelper','signal':'SIGTERM','identity':helperOld,'monotonic':time.monotonic()})
                    persist()
        if now>=term_at and phase==1:
            phase=2
            for role in config.get('cleanupRoles',['uiRunner','xcode','app','driver']):
                old=ids.get(role)
                if old and identity(old['pid'])==old:
                    try:
                        os.kill(old['pid'],signal.SIGTERM);state['signals'].append({'role':role,'signal':'SIGTERM','monotonic':time.monotonic(),'identity':old})
                    except OSError as error: state.setdefault('signalErrors',[]).append({'role':role,'signal':'SIGTERM','errno':error.errno})
            persist()
        if now>=force_at and phase==2:
            phase=3
            for role in config.get('cleanupRoles',['uiRunner','xcode','app','driver']):
                old=ids.get(role)
                if old and identity(old['pid'])==old:
                    try:
                        os.kill(old['pid'],signal.SIGKILL);state['forced']=True;state['signals'].append({'role':role,'signal':'SIGKILL','monotonic':time.monotonic(),'identity':old})
                    except OSError as error: state.setdefault('signalErrors',[]).append({'role':role,'signal':'SIGKILL','errno':error.errno})
            persist()
        if now>=deadline:
            state['timedOut']=True;state['unsettled']={role:identity(v['pid']) for role,v in ids.items()};state['driverExit']=child.poll();persist();break
        for key,mask in selector.select(timeout=min(.1,max(0,deadline-now))):
            data=os.read(key.fd,65536)
            if data:
                output.write(data);output.flush();buffer+=data
                while b'\n' in buffer:
                    line,buffer=buffer.split(b'\n',1)
                    if line.startswith((b'T09_ROOT=',b'ISOLATED_ROOT=')):
                        sys.stdout.buffer.write(line+b'\n');sys.stdout.buffer.flush()
                        candidate=pathlib.Path(line.split(b'=',1)[1].decode()); st=candidate.lstat()
                        if not candidate.is_symlink() and str(candidate)==os.path.realpath(candidate) and candidate.parent==pathlib.Path(config['rootParent']) and candidate.name.startswith('dsh-t05-') and st.st_uid==os.getuid() and st.st_mode&0o777==0o700: root=candidate
            else: selector.unregister(key.fileobj)
        if child.poll() is not None and not selector.get_map():
            state['driverExit']=child.returncode;state['finalIdentities']={role:identity(v['pid']) for role,v in ids.items()};persist()
            if all(not value.get('known') and value.get('errno')==errno.ESRCH for value in state['finalIdentities'].values()): break
            state['timedOut']=True;stop_work=min(stop_work,time.monotonic())
selector.close();child.stdout.close(); state['endMonotonic']=time.monotonic();persist()
state['missingRequiredIdentities']=sorted(set(config.get('requiredRoles',['driver']))-set(ids));persist()
code=124 if state['timedOut'] or state['cancelled'] or state['forced'] else state['driverExit'] if state['driverExit'] not in (None,0) else 1 if state['missingRequiredIdentities'] or state.get('signalErrors') else state['driverExit'];sys.exit(code if code is not None and code>=0 else 1)
''';
