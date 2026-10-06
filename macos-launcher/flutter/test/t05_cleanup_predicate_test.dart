import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/application_probe.dart' show waitFor;
import '../tool/web_application_scenario.dart' show desktopExitObserved;
import '../tool/probe_diagnostics.dart' show desktopQuitFacts;

void main() {
  test('unavailable quit facts remain unknown and raw reason is omitted', () {
    final missing = desktopQuitFacts(null);
    expect(missing.values.every((value) => value == null), true);
    final nilLookup = desktopQuitFacts({
      'expectedPid': 42,
      'lookupFound': false,
      'accepted': null,
      'hasTerminated': null,
      'reason': 'private-credential-value',
    });
    expect(nilLookup['lookupFound'], false);
    expect(nilLookup['accepted'], isNull);
    expect(nilLookup['hasTerminated'], isNull);
    expect(nilLookup.containsKey('reason'), false);
    final invalid = desktopQuitFacts({
      'expectedPid': '42',
      'lookupFound': 'false',
      'accepted': 1,
      'hasTerminated': 'true',
    });
    expect(invalid.values.every((value) => value == null), true);
  });
  test('original predicate observes real live and reaped owned child without fake exit', () async {
    final child = await Process.start('/bin/sh', [
      '-c',
      'read -r release; exit 17',
    ]);
    final facts = <Map<String, Object?>>[];
    try {
      expect(await desktopExitObserved(child.pid, observe: facts.add), false);
      expect(facts.last['rawExit'], 0);
      expect(facts.last['predicateGone'], false);
      child.stdin.writeln('release');
      await child.stdin.close();
      expect(await child.exitCode, 17);
      await waitFor(
        'owned child exit',
        () => desktopExitObserved(child.pid, observe: facts.add),
      );
      expect(facts.last['rawExit'], isNot(0));
      expect(facts.last['rawStderr'], contains('No such process'));
      expect(facts.last['predicateGone'], true);
      expect(facts.every((row) => row['pid'] == child.pid), true);
    } finally {
      await child.exitCode;
    }
  });
}
