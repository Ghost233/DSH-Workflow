import 'package:flutter_test/flutter_test.dart';

import '../tool/application_probe.dart';

void main() {
  const runner = '/Users/runner/work/_temp';
  String parent({
    bool system = false,
    bool keychain = false,
    String? local,
    bool ci = true,
    String? temporary = runner,
  }) => applicationProbeRootParent(
    systemCi: system,
    keychainCi: keychain,
    localAcceptanceRoot: local,
    githubActions: ci,
    runnerTemp: temporary,
  );

  test(
    'T05 legacy Keychain and system-boundary modes keep their runner root',
    () {
      expect(parent(keychain: true), runner);
      expect(parent(system: true), runner);
    },
  );
  test('explicit local acceptance uses its private namespace', () {
    const local = '/private/tmp/dsh-launcher-local-501';
    expect(parent(ci: false, local: local), local);
    expect(() => parent(local: local), throwsArgumentError);
    expect(
      () => parent(ci: false, local: '/private/tmp/unowned'),
      throwsArgumentError,
    );
    expect(
      () => parent(ci: false, local: '/Users/example/.dsh'),
      throwsArgumentError,
    );
    expect(
      () => parent(system: true, ci: false, local: local),
      throwsArgumentError,
    );
  });
  test('headless T06 gate and ordinary profiles keep private/tmp', () {
    expect(parent(), '/private/tmp');
    expect(parent(ci: false), '/private/tmp');
  });
  test('system boundary requires an absolute CI runner root', () {
    expect(() => parent(system: true, ci: false), throwsArgumentError);
    expect(() => parent(system: true, temporary: null), throwsArgumentError);
    expect(
      () => parent(system: true, temporary: 'relative'),
      throwsArgumentError,
    );
  });
}
