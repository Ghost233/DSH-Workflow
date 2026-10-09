"""Conservatively classify only the owned actor validation delta."""
import argparse
import json
from pathlib import Path
import subprocess

VERIFIED_PRODUCT_SHA = 'e2477054c5f84f59ccee52bf26be4a80919b5926'
VALIDATION_FILES = {'.github/scripts/actor_validation_inputs.py', '.github/scripts/actor_validation_inputs_test.py',
                    '.github/scripts/flutter_debug_artifact_test.py', '.github/workflows/macos-app.yml',
                    '.github/workflows/flutter-launcher-acceptance.yml', '.github/workflows/flutter-launcher-diagnostics.yml',
                    '.github/scripts/macos_arm64_ci_test.py',
                    # Excluded by the project resource inventory's test-directory filter.
                    'agent-observation-plugin/test/agent-monitor.test.mjs',
                    '.github/scripts/desktop_window_fixture_test.py',
                    'macos-launcher/flutter/tool/application_probe.dart'}
def validation_path(name):
    return name.startswith('macos-launcher/flutter/tool/release_close_actor/') or name in VALIDATION_FILES
def parsed(text):
    result = subprocess.run(['/usr/bin/ruby', '-rpsych', '-rjson', '-e',
                             'puts JSON.generate(Psych.safe_load(STDIN.read, aliases: true))'],
                            input=text, text=True, capture_output=True)
    if result.returncode: raise ValueError('Workflow YAML cannot establish unchanged product inputs')
    return json.loads(result.stdout)
def unchanged_job(old, new, name):
    for key in ['env', 'defaults', 'permissions', 'concurrency']:
        if old.get(key) != new.get(key): return False
    before = dict(old['jobs'][name]); after = dict(new['jobs'][name])
    for key in ['if', 'needs']: before.pop(key, None); after.pop(key, None)
    return before == after
def classify(root, base, head='HEAD'):
    root = Path(root)
    result = {'helperOnly': False, 'materialInputsEqual': False, 'nativeInputsEqual': False, 'base': base, 'head': head}
    try:
        command = ['git', 'diff', '--name-only', base] if head == 'WORKTREE' else ['git', 'diff', '--name-only', base, head]
        changed = subprocess.check_output(command, cwd=root, text=True).splitlines()
        if head == 'WORKTREE':
            changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
        result['changedFiles'] = sorted(set(changed))
        if not changed or not all(validation_path(name) for name in changed): return result
        for file, jobs in [('.github/workflows/macos-app.yml', ['build']),
                           ('.github/workflows/flutter-launcher-acceptance.yml', ['t07', 't02', 't05', 't06', 't08'])]:
            before = parsed(subprocess.check_output(['git', 'show', base + ':' + file], cwd=root, text=True))
            text = (root / file).read_text() if head == 'WORKTREE' else subprocess.check_output(['git', 'show', head + ':' + file], cwd=root, text=True)
            after = parsed(text)
            if not all(unchanged_job(before, after, job) for job in jobs): return result
        result.update(helperOnly=True, materialInputsEqual=True,
                      nativeInputsEqual='macos-launcher/flutter/tool/application_probe.dart' not in changed)
    except (subprocess.CalledProcessError, ValueError, KeyError, TypeError, OSError) as error:
        result['unknownReason'] = type(error).__name__
    return result
def actor_signature(entitlements, architectures):
    return (entitlements.get('com.apple.security.app-sandbox') is False
            and entitlements.get('com.apple.application-identifier') == 'com.ghostagent.dsh.t09.PublicCloseUITests.xctrunner'
            and len(architectures) == 2 and all(value == 'arm64' for value in architectures.values()))
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--output')
    args = parser.parse_args(); result = classify(args.root, args.base, args.head)
    text = json.dumps(result, indent=2) + '\n'
    if args.output: Path(args.output).write_text(text)
    print(text, end='')
