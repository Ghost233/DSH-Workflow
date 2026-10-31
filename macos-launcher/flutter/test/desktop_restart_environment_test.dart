import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/desktop_window_application_scenario.dart'
    show desktopRestartEnvironment;

void main() {
  test(
    'desktop restart uses only the private home and XDG directories',
    () async {
      final temporary = await Directory.systemTemp.createTemp('restart-home-');
      addTearDown(() => temporary.delete(recursive: true));
      final root = await Directory('${temporary.path}/case').create();
      final outside = await Directory('${temporary.path}/user-home').create();
      final layout = EndpointLayout(directory: '${root.path}/manager');
      final environment = desktopRestartEnvironment(
        root: root,
        layout: layout,
        inherited: {
          'HOME': outside.path,
          'XDG_CONFIG_HOME': '${outside.path}/config',
          'XDG_DATA_HOME': '${outside.path}/data',
          'XDG_STATE_HOME': '${outside.path}/state',
          'XDG_CACHE_HOME': '${outside.path}/cache',
          'TMPDIR': '${outside.path}/tmp',
          'SENTINEL_DATA_DIR': '${outside.path}/sentinel',
          'GHOST_SENTINEL_DATA_DIR': '${outside.path}/sentinel',
        },
      );
      final privateHome = '${root.path}/os-home';
      expect(environment['HOME'], privateHome);
      expect(environment.containsKey('SENTINEL_DATA_DIR'), false);
      expect(environment.containsKey('GHOST_SENTINEL_DATA_DIR'), false);
      for (final name in [
        'XDG_CONFIG_HOME',
        'XDG_DATA_HOME',
        'XDG_STATE_HOME',
        'XDG_CACHE_HOME',
        'TMPDIR',
      ]) {
        expect(environment[name], startsWith('$privateHome/'));
      }
      final child = await Process.run(
        '/usr/bin/python3',
        ['-c', 'import os; print(os.path.expanduser("~"))'],
        environment: environment,
        includeParentEnvironment: false,
      );
      expect(child.exitCode, 0);
      expect(child.stdout.toString().trim(), privateHome);
      expect(
        await Directory('${outside.path}/.ghost-agent-sentinel').exists(),
        false,
      );
    },
  );
}
