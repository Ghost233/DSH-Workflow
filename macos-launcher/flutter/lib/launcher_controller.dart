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
  bool initialized = false,
      fullAccess = true,
      allowLanSettings = false,
      hideWindowOnStart = false;
  String? _password;
  bool _coldDesktopBackground = false;
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
  ServiceStatus _service = ServiceStatus(
    state: ServiceState.stopped,
    ready: false,
  );
  Timer? _observer, _serviceObserver;
  bool _observingWeb = false, _observingService = false;
  List<LogEntry> serviceLogEntries = [];
  final List<LogEntry> logs = [];
  String? _logInstanceId;
  bool _logsDropped = false;
  bool _closed = false;
  Future<void>? _mutation, _closeFuture;
  Future<void>? _desktopOpen;
  ServiceStatus get snapshot => _web;
  ServiceStatus get serviceSnapshot => _service;
  String? get logInstanceId => _logInstanceId;
  bool get logsTruncated => _logsDropped;
  bool get isActive =>
      _web.state == ServiceState.running ||
      _web.state == ServiceState.starting ||
      _mutation != null;
  bool get hasPassword => _password?.isNotEmpty == true;
  String get node => '${environment.resources}/node';
  String script(String name) =>
      '${environment.resources}/workflow/macos-launcher/runtime/$name';
  String get desktop => '${environment.resources}/desktop/DeepSeek Harness.app';

  Future<void> initialize() async {
    environment = await native.load();
    fullAccess = environment.fullAccess;
    allowLanSettings = environment.allowLanSettings;
    hideWindowOnStart = environment.hideWindowOnStart;
    _password = environment.password;
    loginStatus = environment.loginStatus;
    initialized = true;
    if (File(script('service-cli.mjs')).existsSync()) {
      await _observeService();
      _serviceObserver = Timer.periodic(const Duration(seconds: 2), (_) {
        unawaited(_observeService());
      });
    }
    if (File(script('web-cli.mjs')).existsSync()) {
      await _observeWeb();
      _observer = Timer.periodic(const Duration(seconds: 2), (_) {
        unawaited(_observeWeb());
      });
    }
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

  void clearError() {
    if (error.isEmpty) return;
    error = '';
    notifyListeners();
  }

  void setSdkMessage(String message) {
    sdkMessage = message;
    notifyListeners();
  }

  Future<Map<String, Object?>> _serviceCommand(String type) async {
    final child = await _startProcess(node, [
      script('service-cli.mjs'),
      environment.dataRoot,
      environment.resources,
      environment.home,
    ], environment: processEnvironment);
    final output = child.stdout.transform(utf8.decoder).join();
    final diagnostics = child.stderr.transform(utf8.decoder).join();
    child.stdin.writeln(jsonEncode({'type': type}));
    await child.stdin.close();
    final code = await child.exitCode;
    final text = await output;
    final stderr = await diagnostics;
    if (text.trim().isEmpty) {
      throw StateError('服务管理入口退出 $code：$stderr');
    }
    final reply = objectValue(jsonDecode(text));
    if (code != 0 || reply['ok'] != true) {
      throw StateError(reply['error'] as String? ?? '服务管理入口退出 $code：$stderr');
    }
    final value = objectValue(reply['value']);
    _service = ServiceStatus.fromJson(objectValue(value['service']));
    serviceLogEntries = (value['logs'] as List)
        .cast<Map>()
        .map((row) => LogEntry(text: row['text'] as String))
        .toList();
    if (!_closed) notifyListeners();
    return value;
  }

  @override
  Future<void> startService() async {
    if (_closed) throw StateError('启动器正在退出');
    _service = ServiceStatus(state: ServiceState.starting, ready: false);
    notifyListeners();
    try {
      await _serviceCommand('start-service');
    } catch (failure) {
      _service = ServiceStatus(
        state: ServiceState.failed,
        ready: false,
        message: failure.toString(),
        observedAt: DateTime.now().toUtc(),
      );
      notifyListeners();
      rethrow;
    }
  }

  Future<void> _observeService() async {
    if (_closed || _observingService) return;
    _observingService = true;
    try {
      await serviceStatus();
    } catch (failure) {
      _service = ServiceStatus(
        state: ServiceState.unknown,
        ready: false,
        message: failure.toString(),
        observedAt: DateTime.now().toUtc(),
      );
      if (!_closed) notifyListeners();
    } finally {
      _observingService = false;
    }
  }

  Future<ServiceStatus> serviceStatus() async {
    await _serviceCommand('status');
    return _service;
  }

  @override
  Future<LogBatch> serviceLogs(LogQuery query) async {
    final value = await _serviceCommand('logs');
    final rows = (value['logs'] as List).cast<Map>();
    return LogBatch(
      entries: rows
          .skip(rows.length > query.limit ? rows.length - query.limit : 0)
          .map((row) => LogEntry(text: row['text'] as String))
          .toList(),
      instanceId: _service.instanceId,
      truncated: rows.length > query.limit,
      observedAt: DateTime.now().toUtc(),
    );
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

  Future<Map<String, Object?>> _webCommand(String type) async {
    final child = await _startProcess(node, [
      script('web-cli.mjs'),
      environment.dataRoot,
      environment.resources,
    ], environment: processEnvironment);
    final output = child.stdout.transform(utf8.decoder).join();
    final diagnostics = child.stderr.transform(utf8.decoder).join();
    child.stdin.writeln(
      jsonEncode({
        'type': type,
        if (type == 'start-web' &&
            kDebugMode &&
            environment.testSocket != null &&
            Platform.environment['DSH_LAUNCHER_TEST_PORT'] != null)
          'port': int.parse(Platform.environment['DSH_LAUNCHER_TEST_PORT']!),
      }),
    );
    await child.stdin.close();
    final code = await child.exitCode;
    final text = await output;
    final stderr = await diagnostics;
    if (text.trim().isEmpty) throw StateError('Web 管理入口退出 $code：$stderr');
    final reply = objectValue(jsonDecode(text));
    if (code != 0 || reply['ok'] != true) {
      throw StateError(reply['error'] as String? ?? 'Web 服务请求失败');
    }
    final value = objectValue(reply['value']);
    _setSnapshot(objectValue(value['web']));
    logs.clear();
    logs.addAll(
      (value['logs'] as List).cast<Map>().map(
        (row) => LogEntry(text: row['text'] as String),
      ),
    );
    if (!_closed) notifyListeners();
    return value;
  }

  Future<void> _observeWeb() async {
    if (_closed || _observingWeb) return;
    _observingWeb = true;
    try {
      await _webCommand('status');
    } catch (failure) {
      _web = ServiceStatus(
        state: ServiceState.failed,
        message: failure.toString(),
        observedAt: DateTime.now().toUtc(),
      );
      if (!_closed) notifyListeners();
    } finally {
      _observingWeb = false;
    }
  }

  Future<void> _startWeb() async {
    if (!hasPassword) throw StateError('请先设置内网访问密码');
    error = '';
    _web = ServiceStatus(
      state: ServiceState.starting,
      ready: false,
      observedAt: DateTime.now().toUtc(),
    );
    notifyListeners();
    try {
      await _webCommand('start-web');
    } catch (failure) {
      _web = ServiceStatus(
        state: ServiceState.failed,
        message: failure.toString(),
        observedAt: DateTime.now().toUtc(),
      );
      rethrow;
    }
  }

  void _setSnapshot(Map<String, Object?> value) {
    final state = ServiceState.fromJson(value['state'] as String? ?? 'unknown');
    final instance = value['instanceId'] as String?;
    if (instance != null && instance != _logInstanceId) {
      logs.clear();
      _logsDropped = false;
      _logInstanceId = instance;
    }
    if (state == ServiceState.running && value['url'] is String) {
      webUrl = Uri.parse(value['url'] as String);
      lanUrls = (value['lanUrls'] as List? ?? []).cast<String>();
    } else if (state == ServiceState.stopped) {
      webUrl = null;
      lanUrls = [];
    }
    _web = ServiceStatus(
      state: state,
      instanceId: value['instanceId'] as String?,
      ready: state == ServiceState.running && value['ready'] == true,
      message: value['error'] as String?,
      observedAt: switch (value['observedAt']) {
        final String s => DateTime.tryParse(s)?.toUtc(),
        _ => null,
      },
    );
  }

  @override
  Future<void> stopWeb() => _mutate(_stopWeb);

  Future<void> _stopWeb() async {
    await _webCommand('recycle-web');
  }

  Future<void> restartWeb() => _mutate(() async {
    await _stopWeb();
    await _startWeb();
  });

  Future<void> hideDesktop() async {
    await native.showWindow();
    await native.hideDesktop(desktop);
  }

  Future<void> showExistingDesktop() => native.showDesktop(desktop);
  Future<void> startDesktop() async {
    if (_coldDesktopBackground) {
      if (_desktopOpen != null) {
        await _desktopOpen;
        return;
      }
      if (await native.desktopRunning(desktop)) return;
      _coldDesktopBackground = false;
    }
    await _startDesktop(hidden: hideWindowOnStart);
  }

  Future<void> startDesktopInBackground() => _startDesktop(hidden: true);
  Future<void> openDsh() async {
    await _startDesktop(hidden: false);
    await native.showDesktop(desktop);
  }

  Future<void> _startDesktop({required bool hidden}) =>
      _desktopOpen ??= _openDesktop(hidden: hidden)
          .whenComplete(() => _desktopOpen = null);

  Future<void> _openDesktop({required bool hidden}) async {
    if (await native.desktopRunning(desktop)) return;
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
    _coldDesktopBackground = hidden;
    try {
      await native.openDesktop(
        desktop,
        hidden: hidden,
        environment: {
          'DSH_HOME': environment.home,
          'DSH_PERMISSION_MODE': processEnvironment['DSH_PERMISSION_MODE']!,
        },
      );
    } catch (_) {
      _coldDesktopBackground = false;
      rethrow;
    }
  }

  @override
  Future<ServiceStatus> webStatus() async {
    await _webCommand('status');
    return _web;
  }

  @override
  Future<ServiceStatus> desktopStatus() => serviceStatus();

  @override
  Future<LogBatch> recentLogs(LogQuery query) async {
    await _webCommand('logs');
    return LogBatch(
      entries: logs
          .skip(logs.length > query.limit ? logs.length - query.limit : 0)
          .toList(),
      instanceId: _logInstanceId,
      truncated: logs.length > query.limit || _logsDropped,
      observedAt: DateTime.now().toUtc(),
    );
  }

  @override
  Future<void> showWindow() => native.showWindow();
  @override
  Future<bool> setEntryManaged(bool managed) => native.setEntryManaged(managed);

  Future<void> savePreferences(
    bool access,
    bool lan, {
    bool? hideWindowOnStart,
  }) async {
    final hide = hideWindowOnStart ?? this.hideWindowOnStart;
    await native.savePreferences(access, lan, hideWindowOnStart: hide);
    fullAccess = access;
    allowLanSettings = lan;
    this.hideWindowOnStart = hide;
    notifyListeners();
  }

  Future<void> savePassword(String value) async {
    if (value.isEmpty || utf8.encode(value).length > 1024) {
      throw StateError('密码须为 1–1024 字节');
    }
    await native.savePassword(value);
    _password = value;
    if (isActive) await _webCommand('set-password');
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
      pluginsNeedReload = pluginsNeedReload || updated.isNotEmpty;
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
    if (kDebugMode &&
        environment.testSocket != null &&
        Platform.environment['DSH_LAUNCHER_TEST_START_GATE'] != null) {
      await File('${environment.dataRoot}/lifecycle-close-started')
          .writeAsString('close-started');
    }
    _observer?.cancel();
    _serviceObserver?.cancel();
    await _mutation;
  }
}

typedef ProcessStarter = Future<Process> Function(
  String executable,
  List<String> arguments, {
  String? workingDirectory,
  Map<String, String>? environment,
});
