import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';
import 'package:dsh_workflow_launcher/maclauncher_integration.dart';

class Business implements LauncherActions {
  bool running = true, managed = false;
  int starts = 0, recycles = 0, windows = 0;
  Completer<void>? delayedStart, delayedHandoff;
  final enteredHandoff = Completer<void>();
  var restored = Completer<void>();
  @override
  Future<void> startWeb() async {
    starts++;
    await delayedStart?.future;
    running = true;
  }

  @override
  Future<void> stopWeb() async {
    recycles++;
    running = false;
  }

  @override
  Future<ServiceStatus> webStatus() async => ServiceStatus(
    state: running ? ServiceState.running : ServiceState.stopped,
    instanceId: 'real-business-run',
    ready: running,
    observedAt: DateTime.utc(2026, 10, 5),
  );
  @override
  Future<ServiceStatus> desktopStatus() async => ServiceStatus(
    state: ServiceState.running,
    instanceId: 'desktop-run',
    ready: true,
    observedAt: DateTime.utc(2026, 10, 5),
  );
  @override
  Future<LogBatch> recentLogs(LogQuery query) async => LogBatch(
    entries: [LogEntry(text: 'original output')],
    instanceId: 'real-business-run',
    observedAt: DateTime.utc(2026, 10, 5),
  );
  @override
  Future<void> showWindow() async {
    windows++;
  }

  @override
  Future<bool> setEntryManaged(bool value) async {
    if (value) {
      restored = Completer<void>();
      if (!enteredHandoff.isCompleted) enteredHandoff.complete();
      await delayedHandoff?.future;
    }
    managed = value;
    if (!value && !restored.isCompleted) restored.complete();
    return true;
  }
}

class Peer {
  Peer(this.socket) {
    subscription = decodeMessages(socket).listen((message) {
      if (message['type'] == 'hello') hello.complete(message);
      if (message['type'] == 'response') {
        replies.remove(message['id'])?.complete(message);
      }
      if (message['type'] == 'ping') writeMessage(socket, {'type': 'pong'});
    });
  }
  final Socket socket;
  late final StreamSubscription<Map<String, Object?>> subscription;
  final hello = Completer<Map<String, Object?>>();
  final Map<String, Completer<Map<String, Object?>>> replies = {};
  int sequence = 0;
  Future<Map<String, Object?>> request(
    String method, {
    String? service,
    Map<String, Object?>? params,
  }) {
    final id = '${++sequence}';
    final result = Completer<Map<String, Object?>>();
    replies[id] = result;
    writeMessage(socket, {
      'type': 'request',
      'id': id,
      'method': method,
      'serviceId': ?service,
      'params': ?params,
    });
    return result.future.timeout(const Duration(seconds: 3));
  }

  Future<void> close() async {
    socket.destroy();
    await subscription.cancel();
  }
}

Future<({MacLauncherIntegration integration, Peer peer, Business business})>
connected(Business business) async {
  final folder = await Directory.systemTemp.createTemp('dsh-sdk-');
  final path = '${folder.path}/sdk.sock';
  final server = await ServerSocket.bind(
    InternetAddress(path, type: InternetAddressType.unix),
    0,
  );
  final accepted = server.first;
  final integration = MacLauncherIntegration(business, socketPath: path);
  final ready = integration.sdk.states.firstWhere(
    (event) => event.state == SdkConnectionState.connected,
  );
  final peer = Peer(await accepted);
  await peer.hello.future;
  writeMessage(peer.socket, {
    'type': 'welcome',
    'accepted': true,
    'launcherSessionId': 'fixture-session',
  });
  await ready;
  addTearDown(() async {
    await integration.close();
    await peer.close();
    await server.close();
    await folder.delete(recursive: true);
  });
  return (integration: integration, peer: peer, business: business);
}

void main() {
  test('official SDK declares exact service ownership and returns original status and logs', () async {
    final fixture = await connected(Business());
    final hello = await fixture.peer.hello.future;
    expect(hello['projectId'], 'dsh-workflow');
    final capabilities = hello['capabilities']! as Map;
    final services = capabilities['services']! as List;
    final desktop = services.cast<Map>().singleWhere(
      (row) => row['id'] == 'desktop',
    );
    expect(desktop['methods'], ['status']);
    final response = await fixture.peer.request('status', service: 'web');
    expect((response['result']! as Map)['instanceId'], 'real-business-run');
    final logs = await fixture.peer.request(
      'logs',
      service: 'web',
      params: {'limit': 1},
    );
    final entry =
        (((logs['result']! as Map)['entries']! as List).single as Map);
    expect(entry['timestamp'], isNull);
    expect(entry['stream'], 'unknown');
    expect(entry['text'], 'original output');
    await fixture.peer.request('openWindow');
    expect(fixture.business.windows, 1);
    await fixture.peer.request('recycle', service: 'web');
    expect(fixture.business.running, isFalse);
    final denied = await fixture.peer.request('recycle', service: 'desktop');
    expect((denied['error']! as Map)['code'], 'unsupported');
  });

  test(
    'management disconnect restores the menu without recycling business',
    () async {
      final fixture = await connected(Business());
      await fixture.peer.request('setEntryManaged', params: {'managed': true});
      expect(fixture.business.managed, isTrue);
      fixture.peer.socket.destroy();
      await fixture.business.restored.future.timeout(
        const Duration(seconds: 3),
      );
      expect(fixture.business.managed, isFalse);
      expect(fixture.business.running, isTrue);
      expect(fixture.business.recycles, 0);
    },
  );

  test(
    'a handoff finishing after disconnect cannot hide the menu again',
    () async {
      final business = Business()..delayedHandoff = Completer<void>();
      final fixture = await connected(business);
      unawaited(
        fixture.peer
            .request('setEntryManaged', params: {'managed': true})
            .catchError((Object _) => <String, Object?>{}),
      );
      await business.enteredHandoff.future;
      final disconnected = fixture.integration.sdk.states.firstWhere(
        (event) => event.state == SdkConnectionState.disconnected,
      );
      fixture.peer.socket.destroy();
      await disconnected;
      business.delayedHandoff!.complete();
      await business.restored.future.timeout(const Duration(seconds: 3));
      expect(business.managed, isFalse);
      expect(business.running, isTrue);
    },
  );
}
