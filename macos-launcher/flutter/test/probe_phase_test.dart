import 'dart:convert';

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
}
