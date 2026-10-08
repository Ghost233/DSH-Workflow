import 'package:flutter/services.dart';

class LauncherEnvironment {
  LauncherEnvironment(Map<Object?, Object?> values)
    : resources = _string(values, 'resources'),
      dataRoot = _string(values, 'dataRoot'),
      home = _string(values, 'home'),
      appVersion = _string(values, 'appVersion'),
      fullAccess = values['fullAccess'] as bool? ?? true,
      allowLanSettings = values['allowLanSettings'] as bool? ?? false,
      hideWindowOnStart = values['hideWindowOnStart'] as bool? ?? false,
      password = values['password'] as String?,
      testSocket = values['testSocket'] as String?,
      testReleaseEndpoint = values['testReleaseEndpoint'] as String?,
      loginStatus = _string(values, 'loginStatus');

  static String _string(Map<Object?, Object?> values, String key) {
    final value = values[key];
    if (value is! String || value.isEmpty) {
      throw FormatException('Missing $key');
    }
    return value;
  }

  final String resources, dataRoot, home, appVersion, loginStatus;
  final bool fullAccess, allowLanSettings, hideWindowOnStart;
  final String? password, testSocket, testReleaseEndpoint;
}

class NativeBridge {
  NativeBridge({MethodChannel? channel})
    : channel = channel ?? const MethodChannel('dsh-workflow/native');
  final MethodChannel channel;

  Future<LauncherEnvironment> load() async {
    final values = await channel.invokeMapMethod<Object?, Object?>(
      'environment',
    );
    if (values == null) {
      throw const FormatException('Missing application environment');
    }
    return LauncherEnvironment(values);
  }

  Future<void> showWindow() => channel.invokeMethod<void>('showWindow');
  Future<void> openDesktop(
    String path, {
    required Map<String, String> environment,
    bool hidden = false,
  }) => channel.invokeMethod<void>('openDesktop', {
    'path': path,
    'environment': environment,
    'hidden': hidden,
  });
  Future<bool> desktopRunning(String path) async {
    final running = await channel.invokeMethod<bool>('desktopRunning', path);
    if (running == null) throw StateError('Desktop 运行状态未知');
    return running;
  }

  Future<void> hideDesktop(String path) =>
      channel.invokeMethod<void>('hideDesktop', path);
  Future<void> showDesktop(String path) =>
      channel.invokeMethod<void>('showDesktop', path);
  Future<void> openUrl(String url) =>
      channel.invokeMethod<void>('openUrl', url);
  Future<bool> setEntryManaged(bool managed) async =>
      await channel.invokeMethod<bool>('setEntryManaged', managed) ?? false;
  Future<void> savePreferences(
    bool fullAccess,
    bool allowLanSettings, {
    required bool hideWindowOnStart,
  }) => channel.invokeMethod<void>('savePreferences', {
    'fullAccess': fullAccess,
    'allowLanSettings': allowLanSettings,
    'hideWindowOnStart': hideWindowOnStart,
  });
  Future<void> savePassword(String password) =>
      channel.invokeMethod<void>('savePassword', password);
  Future<String> getLoginStatus() async =>
      await channel.invokeMethod<String>('getLoginStatus') ?? 'unknown';
  Future<String> setLoginEnabled(bool enabled) async =>
      await channel.invokeMethod<String>('setLoginEnabled', enabled) ??
      'unknown';
  Future<void> finishQuit() => channel.invokeMethod<void>('finishQuit');
}
