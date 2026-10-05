import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'maclauncher_integration.dart';
import 'native_bridge.dart';
import 'update_policy.dart';

Map<String, Object?> objectValue(Object? value) {
  if (value is! Map || value.keys.any((key) => key is! String)) {
    throw const FormatException('Expected a JSON object');
  }
  return value.cast<String, Object?>();
}

class PluginRow {
  PluginRow(Map<String, Object?> value)
    : name = value['name'] as String,
      source = value['source'] as String,
      current = value['current'] as String?,
      latest = value['latest'] as String?,
      supportedDsh = value['supportedDsh'] as String?,
      latestSupportedDsh = value['latestSupportedDsh'] as String?,
      status = value['status'] as String,
      note = value['note'] as String?,
      updatable = value['updatable'] as bool? ?? false;
  final String name, source, status;
  final String? current, latest, supportedDsh, latestSupportedDsh, note;
  final bool updatable;
}

class LauncherController extends ChangeNotifier implements LauncherActions {
  LauncherController(this.native, {ProcessStarter? startProcess})
    : _startProcess = startProcess ?? Process.start;
  final NativeBridge native;
  final ProcessStarter _startProcess;
  late LauncherEnvironment environment;
  bool initialized = false, fullAccess = true, allowLanSettings = false;
  String? _password;
  String loginStatus = 'unknown', error = '', updateMessage = '尚未检查更新';
  String pluginMessage = '尚未检查插件版本', pluginUpdateMessage = '';
  String sdkMessage = '等待 MacLauncher';
  bool checkingUpdates = false,
      checkingPlugins = false,
      updatingPlugins = false;
  bool pluginsNeedReload = false;
  List<PluginRow> plugins = [];
  AppUpdate? update;
  Uri? webUrl;
  List<String> lanUrls = [];
  ServiceStatus _web = ServiceStatus(state: ServiceState.stopped);
  Process? _child;
  Completer<void>? _ready;
  Timer? _observer;
  int _requestId = 0;
  Future<void> _inputQueue = Future<void>.value();
  final Map<int, Completer<Map<String, Object?>>> _requests = {};
  final List<LogEntry> logs = [];
  String? _logInstanceId;
  bool _logsDropped = false;
  bool _closed = false, _stopping = false;
  Future<void>? _mutation, _closeFuture;
  Future<void>? _desktopOpen;
  ServiceStatus get snapshot => _web;
  String? get logInstanceId => _logInstanceId;
  bool get logsTruncated => _logsDropped;
  bool get isActive => _child != null || _mutation != null;
  bool get hasPassword => _password?.isNotEmpty == true;
  String get node => '${environment.resources}/node';
  String script(String name) =>
      '${environment.resources}/workflow/macos-launcher/runtime/$name';
  String get desktop => '${environment.resources}/desktop/DeepSeek Harness.app';

  Future<void> initialize() async {
    environment = await native.load();
    fullAccess = environment.fullAccess;
    allowLanSettings = environment.allowLanSettings;
    _password = environment.password;
    loginStatus = environment.loginStatus;
    initialized = true;
    notifyListeners();
  }

  Map<String, String> get processEnvironment => {
    ...Platform.environment,
    'DSH_HOME': environment.home,
    'DSH_PERMISSION_MODE': fullAccess
        ? 'danger-full-access'
        : 'workspace-write',
    'DSH_ALLOW_LAN_SETTINGS': allowLanSettings ? '1' : '0',
    'DSH_LAUNCH_PASSWORD': ?_password,
  };

  void reportError(Object failure) {
    error = failure.toString().replaceAll(
      RegExp(r'token=[^&\s]+'),
      'token=<REDACTED>',
    );
    notifyListeners();
  }

  void setSdkMessage(String message) {
    sdkMessage = message;
    notifyListeners();
  }

  @override
  Future<void> startWeb() => _mutate(_startWeb);

  Future<void> _mutate(Future<void> Function() action) async {
    if (_closed) throw StateError('启动器正在退出');
    if (_mutation != null) {
      throw ProtocolError(ProtocolError.busy, 'Web 服务正在启动或回收');
    }
    final completed = Completer<void>();
    _mutation = completed.future;
    try {
      await action();
    } finally {
      _mutation = null;
      completed.complete();
      notifyListeners();
    }
  }

  Future<void> _startWeb() async {
    if (_child != null) {
      await _query({'type': 'status'});
      if (_web.state != ServiceState.running) {
        await _query({'type': 'open-global'});
      }
      return;
    }
    if (!hasPassword) throw StateError('请先设置内网访问密码');
    error = '';
    _stopping = false;
    final ready = Completer<void>();
    _ready = ready;
    logs.clear();
    _logInstanceId = null;
    _logsDropped = false;
    unawaited(ready.future.catchError((Object _) {}));
    try {
      final child = await _startProcess(
        node,
        [
          script('global-supervisor.mjs'),
          environment.dataRoot,
          if (kDebugMode &&
              environment.testSocket != null &&
              Platform.environment['DSH_LAUNCHER_TEST_PORT'] != null) ...[
            '--port',
            Platform.environment['DSH_LAUNCHER_TEST_PORT']!,
          ],
        ],
        workingDirectory: environment.resources,
        environment: processEnvironment,
      );
      if (_closed) {
        child.kill();
        await child.exitCode;
        throw StateError('启动器正在退出');
      }
      _child = child;
      _web = ServiceStatus(
        state: ServiceState.starting,
        ready: false,
        observedAt: DateTime.now().toUtc(),
      );
      notifyListeners();
      unawaited(_consume(child, child.stdout, LogStream.stdout));
      unawaited(_consume(child, child.stderr, LogStream.stderr));
      unawaited(
        child.exitCode.then((code) {
          if (!identical(_child, child)) return;
          _child = null;
          _observer?.cancel();
          webUrl = null;
          lanUrls = [];
          _web = ServiceStatus(
            state: _stopping || code == 0
                ? ServiceState.stopped
                : ServiceState.failed,
            message: code == 0 ? null : '业务进程退出（$code）',
            observedAt: DateTime.now().toUtc(),
          );
          if (!ready.isCompleted) {
            ready.completeError(
              StateError(error.isEmpty ? 'Web 启动未完成' : error),
            );
          }
          for (final pending in _requests.values) {
            pending.completeError(StateError('Web 服务已退出'));
          }
          _requests.clear();
          notifyListeners();
        }),
      );
      _observer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!ready.isCompleted) return;
        unawaited(
          _query({'type': 'status'}).catchError((Object failure) {
            reportError(failure);
            return <String, Object?>{};
          }),
        );
      });
      await ready.future;
    } catch (failure) {
      if (!ready.isCompleted) ready.completeError(failure);
      if (_child == null) {
        _web = ServiceStatus(
          state: ServiceState.failed,
          message: failure.toString(),
          observedAt: DateTime.now().toUtc(),
        );
      }
      reportError(failure);
      rethrow;
    }
  }

  Future<void> _consume(
    Process child,
    Stream<List<int>> stream,
    LogStream kind,
  ) async {
    try {
      await for (final line
          in stream.transform(utf8.decoder).transform(const LineSplitter())) {
        if (!identical(_child, child)) return;
        final separator = line.indexOf('\t');
        if (separator > 0 && line.startsWith('DSH_WORKFLOW_')) {
          final name = line.substring(0, separator);
          final payload = objectValue(
            jsonDecode(line.substring(separator + 1)),
          );
          if (name == 'DSH_WORKFLOW_DESKTOP_NEEDED') {
            unawaited(openDsh().catchError(reportError));
          } else if (name == 'DSH_WORKFLOW_READY') {
            webUrl = Uri.parse(payload['url'] as String);
            lanUrls = (payload['lanUrls'] as List? ?? []).cast<String>();
            if (_ready?.isCompleted == false) _ready!.complete();
            unawaited(
              _query({'type': 'status'}).catchError((Object failure) {
                reportError(failure);
                return <String, Object?>{};
              }),
            );
          } else if (name == 'DSH_WORKFLOW_STATE') {
            _setSnapshot(objectValue(payload['global']));
          } else if (name == 'DSH_WORKFLOW_LOG') {
            if (payload['instanceId'] != _logInstanceId) continue;
            logs.add(LogEntry.fromJson(objectValue(payload['entry'])));
            if (logs.length > 500) {
              logs.removeAt(0);
              _logsDropped = true;
            }
          } else if (name == 'DSH_WORKFLOW_REPLY') {
            if (payload['global'] != null) {
              _setSnapshot(objectValue(payload['global']));
            }
            final pending = _requests.remove(payload['requestId']);
            if (pending != null) {
              if (payload['ok'] == true) {
                pending.complete(payload);
              } else {
                pending.completeError(
                  StateError(payload['error'] as String? ?? '管理请求失败'),
                );
              }
            }
          }
        } else {
          logs.add(LogEntry(text: line, stream: kind));
          if (logs.length > 500) {
            logs.removeAt(0);
            _logsDropped = true;
          }
        }
        notifyListeners();
      }
    } catch (failure) {
      reportError(failure);
    }
  }

  void _setSnapshot(Map<String, Object?> value) {
    final state = ServiceState.fromJson(value['state'] as String? ?? 'unknown');
    final instance = value['instanceId'] as String?;
    if (instance != null && instance != _logInstanceId) {
      if (_logInstanceId != null) {
        logs.clear();
        _logsDropped = false;
      }
      _logInstanceId = instance;
    }
    if (state == ServiceState.running && value['url'] is String) {
      webUrl = Uri.parse(value['url'] as String);
    } else if (state == ServiceState.stopped) {
      webUrl = null;
      lanUrls = [];
    }
    _web = ServiceStatus(
      state: state,
      instanceId: value['instanceId'] as String?,
      ready: state == ServiceState.running,
      message: value['error'] as String?,
      observedAt: switch (value['observedAt']) {
        final String s => DateTime.tryParse(s)?.toUtc(),
        _ => null,
      },
    );
  }

  Future<Map<String, Object?>> _query(Map<String, Object?> command) async {
    final child = _child;
    if (child == null) throw StateError('Web 服务未运行');
    final id = ++_requestId;
    final pending = Completer<Map<String, Object?>>();
    unawaited(pending.future.catchError((Object _) => <String, Object?>{}));
    _requests[id] = pending;
    try {
      await _writeCommand(child, {...command, 'requestId': id});
      return await pending.future.timeout(const Duration(seconds: 10));
    } finally {
      _requests.remove(id);
    }
  }

  Future<void> _writeCommand(Process child, Map<String, Object?> command) {
    final write = _inputQueue.then((_) async {
      if (!identical(_child, child)) throw StateError('Web 服务已退出');
      child.stdin.writeln(jsonEncode(command));
      await child.stdin.flush();
    });
    _inputQueue = write.catchError((Object _) {});
    return write;
  }

  @override
  Future<void> stopWeb() => _mutate(_stopWeb);

  Future<void> _stopWeb() async {
    final child = _child;
    if (child == null) return;
    _stopping = true;
    child.kill(ProcessSignal.sigterm);
    try {
      await child.exitCode.timeout(const Duration(seconds: 3));
    } on TimeoutException {
      child.kill(ProcessSignal.sigkill);
      await child.exitCode;
    }
  }

  Future<void> restartWeb() => _mutate(() async {
    await _stopWeb();
    await _startWeb();
  });

  Future<void> openDsh() =>
      _desktopOpen ??= _openDesktop().whenComplete(() => _desktopOpen = null);

  Future<void> _openDesktop() async {
    final resources = '$desktop/Contents/Resources';
    final source = File('$resources/dsh-source-runtime.json');
    final runtime = await source.exists()
        ? objectValue(jsonDecode(await source.readAsString()))['runtimeRoot']
              as String
        : '$resources/app/dsh';
    final electron = File('$desktop/Contents/MacOS/Electron');
    final executable = await electron.exists()
        ? electron.path
        : '$desktop/Contents/MacOS/DeepSeek Harness';
    final result = await Process.run(
      executable,
      [
        script('prepare-desktop.mjs'),
        environment.resources,
        '${environment.dataRoot}/global',
        runtime,
      ],
      environment: {...processEnvironment, 'ELECTRON_RUN_AS_NODE': '1'},
    );
    if (result.exitCode != 0) {
      throw StateError('插件装配失败（${result.exitCode}）：${result.stderr}');
    }
    await native.openDesktop(
      desktop,
      environment: {
        'DSH_HOME': environment.home,
        'DSH_PERMISSION_MODE': processEnvironment['DSH_PERMISSION_MODE']!,
      },
    );
  }

  @override
  Future<ServiceStatus> webStatus() async {
    if (_child != null && _ready?.isCompleted == true) {
      await _query({'type': 'status'});
    }
    return _child == null
        ? ServiceStatus(
            state: _web.state,
            message: _web.message,
            observedAt: DateTime.now().toUtc(),
          )
        : _web;
  }

  @override
  Future<ServiceStatus> desktopStatus() async {
    final result = await Process.run(node, [
      script('desktop-status.mjs'),
      '${environment.dataRoot}/global',
    ], environment: processEnvironment);
    if (result.exitCode != 0) throw StateError(result.stderr.toString());
    return ServiceStatus.fromJson(
      objectValue(jsonDecode(result.stdout.toString())),
    );
  }

  @override
  Future<LogBatch> recentLogs(LogQuery query) async => LogBatch(
    entries: logs
        .skip(logs.length > query.limit ? logs.length - query.limit : 0)
        .toList(),
    instanceId: _logInstanceId,
    truncated: logs.length > query.limit || _logsDropped,
    observedAt: DateTime.now().toUtc(),
  );

  @override
  Future<void> showWindow() => native.showWindow();
  @override
  Future<bool> setEntryManaged(bool managed) => native.setEntryManaged(managed);

  Future<void> savePreferences(bool access, bool lan) async {
    await native.savePreferences(access, lan);
    fullAccess = access;
    allowLanSettings = lan;
    notifyListeners();
  }

  Future<void> savePassword(String value) async {
    if (value.isEmpty || utf8.encode(value).length > 1024) {
      throw StateError('密码须为 1–1024 字节');
    }
    await native.savePassword(value);
    _password = value;
    final child = _child;
    if (child != null) {
      await _writeCommand(child, {'type': 'set-password', 'password': value});
    }
    notifyListeners();
  }

  Future<void> refreshLoginStatus() async {
    loginStatus = await native.getLoginStatus();
    notifyListeners();
  }

  Future<void> setLoginEnabled(bool enabled) async {
    try {
      loginStatus = await native.setLoginEnabled(enabled);
    } catch (_) {
      loginStatus = await native.getLoginStatus();
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  Future<void> checkUpdates() async {
    if (checkingUpdates) return;
    checkingUpdates = true;
    update = null;
    updateMessage = '正在检查更新…';
    notifyListeners();
    final http = HttpClient()..connectionTimeout = const Duration(seconds: 10);
    try {
      final body = await (() async {
        final request = await http.getUrl(
          Uri.parse(
            kDebugMode && environment.testSocket != null
                ? environment.testReleaseEndpoint ?? 'https://api.github.com/repos/Ghost233/DSH-Workflow/releases?per_page=100'
                : 'https://api.github.com/repos/Ghost233/DSH-Workflow/releases?per_page=100',
          ),
        );
        request.headers.set('Accept', 'application/vnd.github+json');
        request.headers.set('User-Agent', 'DSH-Workflow-macOS');
        final response = await request.close();
        if (response.statusCode != 200) {
          throw HttpException('GitHub 发布接口 ${response.statusCode}');
        }
        return response.transform(utf8.decoder).join();
      })().timeout(const Duration(seconds: 10));
      update = newerRelease(body, environment.appVersion);
      updateMessage = update == null ? '暂无新版本' : '发现新版本 ${update!.version}';
    } catch (failure) {
      updateMessage = '检查更新失败：$failure';
    } finally {
      http.close(force: true);
      checkingUpdates = false;
      notifyListeners();
    }
  }

  Future<void> checkPlugins() async {
    if (checkingPlugins || updatingPlugins) return;
    checkingPlugins = true;
    pluginMessage = '正在检查插件版本…';
    notifyListeners();
    try {
      final report = await _runReport('plugin-versions.mjs', [
        environment.resources,
      ]);
      final rows = report['rows'];
      if (rows is! List) throw const FormatException('Missing plugin rows');
      plugins = rows.map((row) => PluginRow(objectValue(row))).toList();
      pluginMessage =
          '${plugins.where((p) => p.status == 'newer').length} 个新版本；共 ${plugins.length} 项';
    } catch (failure) {
      pluginMessage = '插件检查失败：$failure';
    } finally {
      checkingPlugins = false;
      notifyListeners();
    }
  }

  Future<Map<String, Object?>> _runReport(
    String file,
    List<String> arguments,
  ) async {
    final result = await Process.run(node, [
      script(file),
      ...arguments,
    ], environment: processEnvironment);
    if (result.exitCode != 0) {
      throw StateError('检查器退出 ${result.exitCode}：${result.stderr}');
    }
    return objectValue(jsonDecode(result.stdout.toString()));
  }

  Future<void> updatePlugins(List<String> names) async {
    if (updatingPlugins || checkingPlugins) return;
    updatingPlugins = true;
    pluginUpdateMessage = '正在更新插件…';
    notifyListeners();
    try {
      final report = await _runReport('plugin-update.mjs', [
        environment.resources,
        if (names.isNotEmpty) ...['--only', names.join(',')],
      ]);
      final updated = report['updated'];
      if (updated is! List) {
        throw const FormatException('Missing update results');
      }
      pluginsNeedReload = updated.isNotEmpty;
      pluginUpdateMessage =
          '已更新 ${updated.length} 个插件${report['error'] == null ? '' : '；${report['error']}'}';
    } catch (failure) {
      pluginUpdateMessage = '插件更新失败：$failure';
    } finally {
      updatingPlugins = false;
      notifyListeners();
    }
    await checkPlugins();
  }

  Future<void> close() => _closeFuture ??= _close();

  Future<void> _close() async {
    _closed = true;
    _observer?.cancel();
    final pending = _mutation;
    await _stopWeb();
    await pending;
    await _stopWeb();
  }
}

typedef ProcessStarter = Future<Process> Function(
  String executable,
  List<String> arguments, {
  String? workingDirectory,
  Map<String, String>? environment,
});
