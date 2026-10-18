import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'service_task_fixture.dart';

class _WireHttp extends HttpOverrides {}

class ServiceAdmissionFixture extends ServiceTaskFixture {
  ServiceAdmissionFixture(super.root);
  final HttpClient _wireHttp = _WireHttp().createHttpClient(null);
  final List<Map> frames = [];
  WebSocket? socket;
  StreamSubscription? _frames;

  Future<Map> managedConnection(String resources) async {
    final child = await Process.start('$resources/node', [
      '$resources/workflow/macos-launcher/runtime/service-cli.mjs',
      root,
      resources,
      '$root/home',
    ]);
    final output = child.stdout.transform(utf8.decoder).join();
    final errors = child.stderr.transform(utf8.decoder).join();
    child.stdin.writeln(jsonEncode({'type': 'connect-web'}));
    await child.stdin.close();
    final code = await child.exitCode;
    final text = await output;
    final diagnostic = await errors;
    if (code != 0) {
      throw StateError('Managed service discovery failed: $text $diagnostic');
    }
    final reply = jsonDecode(text) as Map;
    if (reply['ok'] != true) {
      throw StateError('Managed service discovery rejected: ${reply['error']}');
    }
    return (reply['value'] as Map)['connection'] as Map;
  }

  Future<void> attachTerminal(Map connection, String sessionId) async {
    await connect(connection);
    final terminal = await rpc('terminal/create', {
      'agentId': sessionId,
      'request': {'id': 's04-terminal', 'cols': 80, 'rows': 24},
    }) as Map;
    if (terminal['state'] != 'running') {
      throw StateError('Actual terminal did not start: $terminal');
    }
    final address = Uri.parse(connection['url'] as String);
    final request = await _wireHttp.getUrl(address);
    request.followRedirects = false;
    final response = await request.close();
    final cookie = response.cookies
        .map((row) => '${row.name}=${row.value}')
        .join('; ');
    await response.drain<void>();
    if (cookie.isEmpty) {
      throw StateError('Actual WebSocket authentication issued no cookie');
    }
    socket = await WebSocket.connect(
      address
          .replace(scheme: 'ws', path: '/api/remote.mux', query: '')
          .toString(),
      headers: {'Cookie': cookie},
      customClient: _wireHttp,
    );
    _frames = socket!.listen((data) {
      final frame = jsonDecode(
        data is String ? data : utf8.decode(data as List<int>),
      ) as Map;
      frames.add(frame);
      if (frames.length > 1000) frames.removeAt(0);
    });
    socket!.add(
      jsonEncode({
        'type': 'open',
        'streamId': 's04-terminal',
        'endpoint': 'terminal/attach',
        'payload': {
          'args': {'agentId': sessionId, 'id': 's04-terminal'},
        },
      }),
    );
    for (var attempt = 0; attempt < 200; attempt++) {
      if (frames.any(
        (row) =>
            row['type'] == 'item' &&
            row['value'] is Map &&
            (row['value'] as Map)['type'] == 'snapshot',
      )) {
        return;
      }
      if (frames.any((row) => row['type'] == 'error')) {
        throw StateError('Actual terminal stream rejected: $frames');
      }
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    throw StateError(
      'Actual terminal stream never supplied its opening snapshot',
    );
  }

  bool acknowledged(int sequence) => frames.any(
    (row) =>
        row['type'] == 'item' &&
        row['value'] is Map &&
        (row['value'] as Map)['type'] == 'ack' &&
        (row['value'] as Map)['sequence'] == sequence,
  );

  void sendOwnedMarker() {
    final path = "'${'$root/ws-input-observed'.replaceAll("'", "'\"'\"'")}'";
    socket!.add(
      jsonEncode({
        'type': 'item',
        'streamId': 's04-terminal',
        'value': {
          'type': 'write',
          'sequence': 1,
          'data': "printf 's04-ws-input\\n' >> $path\n",
        },
      }),
    );
  }

  Future<void> waitForOwnedMarker() async {
    for (var attempt = 0; attempt < 200; attempt++) {
      if (acknowledged(1) && await File('$root/ws-input-observed').exists()) {
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    throw StateError(
      'The same terminal stream did not acknowledge its input after cancellation',
    );
  }

  Future<void> closeTerminal() async {
    await socket?.close();
    await _frames?.cancel();
    _wireHttp.close(force: true);
  }
}
