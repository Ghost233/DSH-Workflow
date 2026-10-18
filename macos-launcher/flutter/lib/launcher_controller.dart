import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'maclauncher_integration.dart';
import 'service_stop.dart';
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
      expected = value['expected'] as String?,
      supportedDsh = value['supportedDsh'] as String?,
      latestSupportedDsh = value['latestSupportedDsh'] as String?,
      status = value['status'] as String,
      note = value['note'] as String?,
      updatable = value['updatable'] as bool? ?? false;
  final String name, source, status;
  final String? current, expected, supportedDsh, latestSupportedDsh, note;
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
  String pluginMessage = '尚未检查插件版本';
  String sdkMessage = '等待 MacLauncher';
  String notificationMessage = '故障通知：尚未查询授权状态。';
  bool requestingNotificationAuthorization = false;
  bool checkingUpdates = false, checkingPlugins = false;
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

  Future<Map<String, Object?>> _serviceCommand(
    String type, {
    Map<String, Object?> fields = const {},
  }) async {
    final child = await _startProcess(node, [
      script('service-cli.mjs'),
      environment.dataRoot,
      environment.resources,
      environment.home,
    ], environment: processEnvironment);
    final output = child.stdout.transform(utf8.decoder).join();
    final diagnostics = child.stderr.transform(utf8.decoder).join();
    child.stdin.writeln(jsonEncode({'type': type, ...fields}));
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
    final notification = value['notificationAuthorization'];
    if (notification is Map) {
      final settings = notification['authorization'];
      final request = notification['authorizationRequest'];
      final failure = request is Map ? request['error'] : null;
      requestingNotificationAuthorization =
          value['notificationAuthorizationPending'] == true ||
          request is Map && request['state'] == 'requesting';
      notificationMessage =
          notification['message'] as String? ??
          (failure is Map
              ? 'macOS 通知授权失败：${failure['message'] ?? failure['code']}'
              : null) ??
          (requestingNotificationAuthorization
              ? '正在等待 macOS 通知授权。'
              : switch (settings is Map ? settings['status'] : null) {
                  'authorized' => 'macOS 已授权故障通知。',
                  'provisional' => 'macOS 已允许静默故障通知。',
                  'denied' => 'macOS 已拒绝故障通知授权。',
                  'notDetermined' => '故障通知尚未获得 macOS 授权。',
                  _ => '故障通知授权状态未知，请查看服务日志。',
                });
    } else {
      notificationMessage = '故障通知：尚未查询授权状态。';
      requestingNotificationAuthorization = false;
    }
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

  @override
  Future<void> stopService() => _changeService('stop');

  Future<bool> Function(ServiceStopInspection)? confirmServiceStop;
  bool _changingService = false;
  bool _serviceCommitStarted = false;
  String? _pendingServiceStop;
  Future<void> restartService() => _changeService('restart');

  Future<void> _changeService(String action) async {
    if (_closed) throw StateError('启动器正在退出');
    if (_changingService) throw StateError('DSH 服务已有停止或重启操作正在进行');
    _changingService = true;
    String? pending;
    try {
      var value = await _serviceCommand(
        'inspect-stop',
        fields: {'action': action},
      );
      while (true) {
        final inspection = ServiceStopInspection(objectValue(value['stop']));
        if (inspection.stopped) {
          if (action == 'restart') await startService();
          return;
        }
        pending = inspection.operationId;
        if (pending == null) throw StateError('DSH 停止检查缺少操作标识');
        _pendingServiceStop = pending;
        if (_closed) throw StateError('启动器正在退出，已取消 DSH 停止操作');
        var confirmed = false;
        if (inspection.needsConfirmation) {
          final confirm = confirmServiceStop;
          if (confirm == null) {
            throw StateError(
              '需要在 DSH 启动器中明确确认${action == 'restart' ? '重启' : '停止'}：${inspection.message ?? inspection.work.map((row) => row['label']).join('；')}',
            );
          }
          confirmed = await confirm(inspection);
          if (!confirmed || _closed) {
            throw StateError('已取消${action == 'restart' ? '重启' : '停止'} DSH 服务');
          }
        }
        _serviceCommitStarted = true;
        try {
          value = await _serviceCommand(
            action == 'restart' ? 'restart-service' : 'stop-service',
            fields: {'operationId': pending, 'confirmed': confirmed},
          );
        } finally {
          _serviceCommitStarted = false;
        }
        pending = null;
        _pendingServiceStop = null;
        if (value['stop'] == null) return;
      }
    } finally {
      try {
        if (pending != null) {
          await _serviceCommand(
            'cancel-stop',
            fields: {'operationId': pending},
          );
        }
      } finally {
        _pendingServiceStop = null;
        _changingService = false;
      }
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

  Future<void> authorizeServiceNotifications() async {
    if (_closed) throw StateError('启动器正在退出');
    if (requestingNotificationAuthorization) return;
    requestingNotificationAuthorization = true;
    notificationMessage = '正在等待 macOS 通知授权。';
    notifyListeners();
    try {
      await _serviceCommand('authorize-notifications');
    } catch (_) {
      requestingNotificationAuthorization = false;
      notificationMessage = '故障通知授权结果未知，请查看服务日志。';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> refreshServiceNotificationStatus() async {
    if (_closed) throw StateError('启动器正在退出');
    await _serviceCommand('notification-status');
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
    await _serviceCommand('connect-web');
    if (_service.ready != true) {
      throw StateError('DSH 服务未启动或暂不可用，请先启动 DSH 服务。');
    }
    if (await native.desktopRunning(desktop)) return;
    _coldDesktopBackground = hidden;
    try {
      await native.openDesktop(
        desktop,
        hidden: hidden,
        environment: {
          'DSH_HOME': environment.home,
          'DSH_WORKFLOW_DATA_ROOT': environment.dataRoot,
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
    if (checkingPlugins) return;
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
          '共 ${plugins.length} 项；${plugins.where((p) => p.status == 'drift').length} 项版本偏差。此处检查安装文件，运行解析请在 DSH 设置 → 插件查看。';
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
    if (_pendingServiceStop != null && !_serviceCommitStarted) {
      await _serviceCommand(
        'cancel-stop',
        fields: {'operationId': _pendingServiceStop},
      );
      _pendingServiceStop = null;
    }
    await _mutation;
  }
}

typedef ProcessStarter = Future<Process> Function(
  String executable,
  List<String> arguments, {
  String? workingDirectory,
  Map<String, String>? environment,
});
