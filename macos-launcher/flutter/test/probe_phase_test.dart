import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/probe_diagnostics.dart';

void main() {
  test('published phases keep metadata and omit payloads and credentials', () {
    final phase = publicProbePhase({
      'event': 'ui-request',
      'at': '2026-10-06T10:00:00Z',
      'elapsedMs': 37,
      'action': 'setText',
      'method': 'queryWebState',
      'pid': 42,
      'textUtf8Bytes': 1025,
      'text': 'private-typed-password',
      'password': 'private-password',
      'token': 'private-token',
      'authorization': 'private-auth',
      'uri': 'http://127.0.0.1:1234/private-vm=/',
      'payload': {'apiKey': 'private-api'},
    });
    expect(phase['event'], 'ui-request');
    expect(phase['method'], 'queryWebState');
    expect(phase['pid'], 42);
    expect(phase['textUtf8Bytes'], 1025);
    expect(jsonEncode(phase), isNot(contains('private-')));
  });

  test('safe phases stay live while child output is forwarded', () async {
    final root = await Directory.systemTemp.createTemp('t05-phase-stdio-');
    addTearDown(() => root.delete(recursive: true));
    final configuration = jsonDecode(
      await File('.dart_tool/package_config.json').readAsString(),
    ) as Map;
    final dart = Directory.fromUri(
      Uri.parse(configuration['flutterRoot'] as String),
    ).uri.resolve('bin/cache/dart-sdk/bin/dart').toFilePath();
    final child = await Process.start(dart, [
      'test/fixtures/probe_phase_stdio.dart',
      root.path,
    ]);
    final output = StringBuffer();
    final outputDone = Completer<void>();
    var exited = false;
    var phaseBeforeExit = false;
    child.stdout
        .transform(utf8.decoder)
        .listen(
          (text) {
            output.write(text);
            if (!phaseBeforeExit &&
                output.toString().contains('settings-fixture-start')) {
              phaseBeforeExit = !exited;
            }
          },
          onDone: outputDone.complete,
          onError: outputDone.completeError,
        );
    final errors = child.stderr.transform(utf8.decoder).join();
    final code = await child.exitCode;
    exited = true;
    await outputDone.future;
    final errorText = await errors;
    expect(code, 17, reason: errorText);
    expect(phaseBeforeExit, isTrue);
    final text = output.toString();
    expect(
      text.indexOf('settings-fixture-start'),
      lessThan(text.indexOf('FORWARDED=FORWARDING_DONE')),
    );
    expect(text, isNot(contains('synthetic-private-')));
    expect(errorText, isNot(contains('StreamSink is bound to a stream')));
  });
}
