import 'dart:convert';
import 'dart:io';

import 'web_application_scenario.dart';

Future<void> main(List<String> arguments) async {
  final root = await Directory(arguments[1]).create(recursive: true);
  await WebProbeOptions(arguments[0], 'headless', 0).stage(root);
  final resources = '${root.path}/missing-runtime';
  final check = await Process.run('$resources/node', [
    '--input-type=module',
    '-e',
    r'''import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.argv[1] + '/workflow';
const { prepareDesktopProfile } = await import(pathToFileURL(root + '/macos-launcher/runtime/desktop-profile.mjs'));
const { composeDshLaunch } = await import(pathToFileURL(root + '/scripts/dsh-launch-composition.mjs'));
const pkg = JSON.parse(await readFile(root + '/package.json'));
const entries = composeDshLaunch([{id:'web-runtime',name:'@deepseek-ai/dsh-web-app',config:{openBrowser:false}}], {projectRoot:root,catalogRoot:'/stage-catalog'});
console.log(JSON.stringify({name:pkg.name, exports:pkg.exports, entries, caller:typeof prepareDesktopProfile}));
''',
    resources,
  ]);
  if (check.exitCode != 0) {
    throw StateError('Staged project caller failed: ${check.stderr}');
  }
  stdout.writeln(
    jsonEncode({
      'stagedCaller': jsonDecode(check.stdout.toString()),
      'resources': resources,
    }),
  );
}
