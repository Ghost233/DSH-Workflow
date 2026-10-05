import 'dart:async';

import 'package:maclauncher_sdk/maclauncher_sdk.dart';

abstract interface class LauncherActions {
  Future<void> startWeb();
  Future<void> stopWeb();
  Future<ServiceStatus> webStatus();
  Future<ServiceStatus> desktopStatus();
  Future<LogBatch> recentLogs(LogQuery query);
  Future<void> showWindow();
  Future<bool> setEntryManaged(bool managed);
}

class MacLauncherIntegration {
  MacLauncherIntegration(this.actions, {String? socketPath}) {
    sdk = MacLauncherSdk.connect(
      projectId: 'dsh-workflow',
      socketPath: socketPath,
      services: {
        'web': ServiceCallbacks(
          name: 'Web 访问',
          onStart: actions.startWeb,
          onRecycle: actions.stopWeb,
          onStatus: actions.webStatus,
          onLogs: actions.recentLogs,
        ),
        'desktop': ServiceCallbacks(
          name: 'DSH Desktop 后端',
          onStatus: actions.desktopStatus,
        ),
      },
      app: AppCallbacks(
        onOpenWindow: actions.showWindow,
        onSetEntryManaged: _setManaged,
      ),
    );
    _states = sdk.states.listen((status) {
      connected = status.state == SdkConnectionState.connected;
      onConnectionChanged?.call(status);
      if (!connected) unawaited(_restoreEntry());
    });
  }

  final LauncherActions actions;
  late final MacLauncherSdk sdk;
  late final StreamSubscription<SdkConnectionStatus> _states;
  void Function(SdkConnectionStatus)? onConnectionChanged;
  bool connected = false;
  bool _disposed = false;
  Future<void>? _closeFuture;
  Future<void> _entryQueue = Future<void>.value();

  Future<bool> _setManaged(bool managed) {
    final result = Completer<bool>();
    _entryQueue = _entryQueue.then((_) async {
      try {
        if (managed && (!connected || _disposed)) {
          result.complete(false);
          return;
        }
        final confirmed = await actions.setEntryManaged(managed);
        // A callback may finish after its connection dies. Never leave the entry hidden.
        if (managed && (!connected || _disposed)) {
          await actions.setEntryManaged(false);
          result.complete(false);
        } else {
          result.complete(confirmed);
        }
      } catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }

  Future<void> _restoreEntry() async {
    try {
      await _setManaged(false);
    } catch (_) {
      /* Retry on the next connection transition. */
    }
  }

  Future<void> close() => _closeFuture ??= _close();

  Future<void> _close() async {
    _disposed = true;
    connected = false;
    await sdk.dispose();
    await _states.cancel();
    await _restoreEntry();
  }
}
