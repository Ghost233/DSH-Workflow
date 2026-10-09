import 'dart:async';

/// Only evidence tied to the current Web/desktop startup is terminal.
String? webStartupFailure(
  Map<String, Object?> status,
  Map<String, Object?> ui, {
  required bool sawStarting,
}) {
  if (status['state'] == 'failed') return 'Web startup reported failed';
  if (sawStarting && status['state'] == 'stopped') {
    return 'Web process stopped before readiness';
  }
  for (final node in (ui['nodes'] as List? ?? const []).cast<Map>()) {
    for (final field in ['label', 'value']) {
      final text = node[field]?.toString().trim() ?? '';
      if (text.startsWith('PlatformException(open-failed,') ||
          text.startsWith('Bad state: 插件装配失败（') ||
          text.startsWith('ProcessException:') ||
          text.startsWith('Bad state: Web 启动未完成') ||
          text.startsWith('Bad state: Web 服务已退出')) {
        return 'Actual management UI reported a startup failure';
      }
    }
  }
  return null;
}

/// Startup has no short deadline; the CI job budget remains the outer bound.
Future<void> waitForActualWebStartup({
  required Future<Map<String, Object?>> Function() status,
  required Future<Map<String, Object?>> Function() ui,
  required Future<int> applicationExit,
}) async {
  var done = false, sawStarting = false;
  Future<void> ready() async {
    while (!done) {
      final snapshot = await ui();
      if (done) return;
      final uiError = webStartupFailure(const {}, snapshot, sawStarting: false);
      if (uiError != null) throw StateError(uiError);
      final value = await status();
      if (done) return;
      final failure = webStartupFailure(
        value,
        const {},
        sawStarting: sawStarting,
      );
      if (failure != null) throw StateError(failure);
      if (value['ready'] == true) return;
      sawStarting |= value['state'] == 'starting';
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
  }

  try {
    await Future.any<void>([
      ready(),
      applicationExit.then<void>(
        (code) =>
            throw StateError('Application exited ($code) before Web readiness'),
      ),
    ]);
  } finally {
    done = true;
  }
}

/// The second Desktop launch waits for a fresh, physically bound Host lease.
Future<Map<String, Object?>> waitForActualDesktopLease({
  required String oldLease,
  required Future<Map<String, Object?>?> Function() receipt,
  required Future<bool> Function(Map<String, Object?>) isOwned,
  required Future<Map<String, Object?>> Function() ui,
  required Future<int> applicationExit,
  required Future<String?> Function() dependencyFailure,
}) async {
  var done = false;
  Future<Map<String, Object?>> ready() async {
    while (!done) {
      final snapshot = await ui();
      if (done) break;
      final failure = webStartupFailure(const {}, snapshot, sawStarting: false);
      if (failure != null) throw StateError(failure);
      final exited = await dependencyFailure();
      if (done) break;
      if (exited != null) throw StateError(exited);
      final value = await receipt();
      if (done) break;
      if (value != null &&
          value['lease'] is String &&
          value['lease'] != oldLease &&
          await isOwned(value)) {
        if (!done) return value;
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    throw StateError('Desktop startup observation was cancelled');
  }

  try {
    return await Future.any<Map<String, Object?>>([
      ready(),
      applicationExit.then<Map<String, Object?>>(
        (code) => throw StateError(
          'Application exited ($code) before fresh Desktop lease',
        ),
      ),
    ]);
  } finally {
    done = true;
  }
}
