import 'package:flutter_test/flutter_test.dart';

import '../tool/application_probe.dart';
import '../tool/web_application_scenario.dart';

void main() {
  const runner = '/Users/runner/work/_temp';
  String parent({
    bool system = false,
    bool keychain = false,
    bool plugin = false,
    String? backend,
    bool ci = true,
    String? temporary = runner,
  }) => applicationProbeRootParent(
    systemCi: system,
    keychainCi: keychain,
    pluginUpdateCi: plugin,
    webScenario: backend == null
        ? null
        : WebProbeOptions(
            'readonly-runtime',
            backend,
            backend == 'desktop' ? 33080 : 0,
          ),
    githubActions: ci,
    runnerTemp: temporary,
  );

  test('T02 and restored T08 Desktop modes own their clean CI runner root', () {
    expect(parent(backend: 'desktop'), runner);
    expect(parent(plugin: true, backend: 'desktop'), runner);
    expect(
      () => parent(plugin: true, backend: 'desktop', ci: false),
      throwsArgumentError,
    );
  });
  test(
    'T05 legacy Keychain and system-boundary modes keep their runner root',
    () {
      expect(parent(keychain: true, backend: 'desktop'), runner);
      expect(parent(system: true), runner);
    },
  );
  test('T08 headless plugin updates require an isolated CI runner root', () {
    expect(parent(plugin: true, backend: 'headless'), runner);
    expect(
      () => parent(plugin: true, backend: 'headless', ci: false),
      throwsArgumentError,
    );
    expect(
      () => parent(plugin: true, backend: 'headless', temporary: null),
      throwsArgumentError,
    );
    expect(
      () => parent(plugin: true, backend: 'headless', temporary: 'relative'),
      throwsArgumentError,
    );
  });
  test('headless T06 gate and ordinary profiles keep private/tmp', () {
    expect(parent(backend: 'headless'), '/private/tmp');
    expect(parent(ci: false), '/private/tmp');
  });
  test('official Desktop cannot select a local or missing CI root', () {
    expect(() => parent(backend: 'desktop', ci: false), throwsArgumentError);
    expect(
      () => parent(backend: 'desktop', temporary: null),
      throwsArgumentError,
    );
    expect(
      () => parent(backend: 'desktop', temporary: 'relative'),
      throwsArgumentError,
    );
  });
}
