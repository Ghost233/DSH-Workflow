import 'dart:convert';
import 'dart:io';

class _HostHttp extends HttpOverrides {}

/// Owns only a real Host's external model boundary and authenticated public API client.
class ServiceTaskFixture {
  ServiceTaskFixture(this.root);
  final String root;
  // Call the public base implementation directly: widget bindings replace HttpClient() with a 400 stub.
  final HttpClient _http = _HostHttp().createHttpClient(null);
  int authenticationStatus = 0;
  List<Cookie> _cookies = [];
  Uri? _address;
  int _requestId = 0;

  Future<void> connect(Map receipt) async {
    _address = Uri.parse(receipt['url'] as String);
    final request = await _http.getUrl(_address!);
    request.followRedirects = false;
    final response = await request.close();
    authenticationStatus = response.statusCode;
    _cookies = response.cookies;
    await response.drain<void>();
    if (_cookies.isEmpty) {
      throw StateError(
        'Real Host authentication returned HTTP $authenticationStatus without a cookie',
      );
    }
  }

  Future<Object?> rpc(String method, Map<String, Object?> args) async {
    final request = await _http.postUrl(
      _address!.replace(path: '/api/$method', query: ''),
    );
    request.cookies.addAll(_cookies);
    request.headers.contentType = ContentType.json;
    request.write(
      jsonEncode({
        'type': 'client-request',
        'rpcId': 'service-task-${++_requestId}',
        'method': method,
        'payload': {'args': args},
      }),
    );
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    if (response.statusCode != 200) {
      throw StateError('$method returned HTTP ${response.statusCode}: $text');
    }
    final result = (jsonDecode(text) as Map)['result'] as Map;
    if (result['ok'] != true) throw StateError('$method rejected: $result');
    return result['value'];
  }

  Future<String> acceptTask(String prompt) async {
    final created = await rpc('session/create', {
      'request': {'cwd': root},
    }) as Map;
    final id = created['sessionId'] as String;
    await rpc('session/selectModel', {
      'request': {
        'sessionId': id,
        'provider': 'service-task-fixture',
        'model': 'held-task',
      },
    });
    final accepted = await rpc('session/prompt', {
      'request': {
        'requestId': 'service-task-${DateTime.now().microsecondsSinceEpoch}',
        'sessionId': id,
        'mode': 'queue',
        'content': [
          {'type': 'text', 'text': prompt},
        ],
      },
    }) as Map;
    if (accepted['accepted'] != true) {
      throw StateError('Real Host did not accept the task');
    }
    return id;
  }

  Future<void> waitForModelRequest(int call) async {
    for (var attempt = 0; attempt < 400; attempt++) {
      if (await File('$root/model-request-$call.json').exists()) return;
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    throw StateError(
      'Actual Host never dispatched external model request $call',
    );
  }

  Future<void> releaseModel(int call) =>
      File('$root/release-model-$call').writeAsString('release');

  Future<Map> page(String sessionId) async {
    final projection = await rpc('session/projections', {
      'request': {'sessionId': sessionId},
    }) as Map;
    return await rpc('session/page', {
      'request': {
        'address': {'kind': 'session', 'sessionId': sessionId},
        'throughSeq': projection['asOfSeq'],
        'maxMessages': 20,
      },
    }) as Map;
  }

  Future<Map> waitForResult(String sessionId, int call) async {
    for (var attempt = 0; attempt < 200; attempt++) {
      final history = await page(sessionId);
      if (jsonEncode(history).contains('S04 persisted task result $call')) {
        return history;
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    throw StateError(
      'Real Host task result $call never appeared in session/page',
    );
  }

  void close() => _http.close(force: true);
}
