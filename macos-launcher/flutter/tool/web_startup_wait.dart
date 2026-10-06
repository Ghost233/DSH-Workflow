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
