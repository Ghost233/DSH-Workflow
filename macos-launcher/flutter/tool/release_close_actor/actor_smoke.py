"""Exercise only a new private one-window actor subject, never an existing app."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--xctestrun', required=True)
parser.add_argument('--evidence', required=True)
args = parser.parse_args()
input_file = Path(args.xctestrun).resolve(strict=True)
evidence_dir = Path(args.evidence).resolve(strict=True)
source = Path(__file__).resolve().parent
ci = os.environ.get('GITHUB_ACTIONS') == 'true'
base = Path(os.environ['RUNNER_TEMP']) if ci else Path('/private/tmp/dsh-launcher-local-' + str(os.getuid()))
if not base.exists(): base.mkdir(mode=0o700)
assert not base.is_symlink() and base.resolve() == base and base.stat().st_uid == os.getuid()
assert ci or base.stat().st_mode & 0o777 == 0o700
root = Path(tempfile.mkdtemp(prefix='dsh-t05-actor-', dir=base))
environment = dict(os.environ)
if ci:
    assert 'DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT' not in environment
else:
    environment.pop('GITHUB_ACTIONS', None)
    environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] = str(base)
report = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip(),
          'root': str(root), 'xctestrun': str(input_file), 'xctestrunSha256': hashlib.sha256(input_file.read_bytes()).hexdigest(),
          'startedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'ready': False, 'exactWindowClose': False,
          'commands': [], 'toolchain': subprocess.check_output(['xcodebuild', '-version'], text=True).strip()}
actor = None
subject = None
captured = False
observer = root / 'actor-window-observer'
app = root / 'Actor Subject.app'
exe = app / 'Contents/MacOS/DSH Workflow'
def persist():
    (evidence_dir / 'actor-smoke-evidence.json').write_text(json.dumps(report, indent=2) + '\n')
def command(argv):
    result = subprocess.run(list(map(str, argv)), env=environment, capture_output=True, text=True)
    report['commands'].append({'command': list(map(str, argv)), 'exit': result.returncode,
                              'stdout': result.stdout, 'stderr': result.stderr})
    persist()
    if result.returncode: raise RuntimeError('Owned actor command failed: ' + result.stderr)
    return result
def observe(mode):
    return json.loads(command([observer, root, app, mode]).stdout)
def wait(predicate, name, seconds=30):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate(): return
        time.sleep(.1)
    raise TimeoutError(name)
try:
    exe.parent.mkdir(parents=True)
    info = {'CFBundleIdentifier': 'com.ghostagent.dsh.t09.actor-subject.' + root.name,
            'CFBundleExecutable': exe.name, 'CFBundleName': 'Owned Actor Subject', 'CFBundlePackageType': 'APPL'}
    (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    command(['swiftc', '-target', 'arm64-apple-macos14.0', source / 'ActorSubject.swift', '-o', exe])
    command(['codesign', '--force', '--sign', '-', app])
    command(['swiftc', source.parent / 'release_window_observer.swift', '-o', observer])
    subject_log = (evidence_dir / 'actor-subject.log').open('w')
    subject = subprocess.Popen([str(exe)], env=environment, stdout=subject_log, stderr=subprocess.STDOUT)
    report['ownedSubjectPid'] = subject.pid
    identity = None
    def capture():
        global identity, captured
        value = observe('query' if captured else 'capture')
        if value.get('known'):
            assert value['pid'] == subject.pid
            identity = value; captured = True
        return captured and value.get('onscreenWindows') == 1
    wait(capture, 'Owned AppKit subject startup/window')
    report['initialIdentity'] = identity
    original = plistlib.loads(input_file.read_bytes())
    def rewrite(value):
        if isinstance(value, dict): return {key: rewrite(item) for key, item in value.items()}
        if isinstance(value, list): return [rewrite(item) for item in value]
        return value.replace('__TESTROOT__', str(input_file.parent)) if isinstance(value, str) else value
    variant = rewrite(original)
    target = variant['PublicCloseUITests']
    assert target['UseUITargetAppProvidedByTests'] is True and 'UITargetAppPath' not in target
    target['UITargetAppEnvironmentVariables'] = {}
    target['EnvironmentVariables'].update(DSH_T09_ACTOR_ROOT=str(root), DSH_T09_ACTOR_APP=str(app))
    if ci: target['EnvironmentVariables'].update(GITHUB_ACTIONS='true', RUNNER_TEMP=str(base))
    else:
        target['EnvironmentVariables'].pop('GITHUB_ACTIONS', None)
        target['EnvironmentVariables']['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] = str(base)
    variant_file = root / 'public-close-actor.xctestrun'
    variant_file.write_bytes(plistlib.dumps(variant))
    actor_command = ['xcodebuild', 'test-without-building', '-xctestrun', str(variant_file),
                     '-destination', 'platform=macOS,arch=arm64',
                     '-only-testing:PublicCloseUITests/PublicCloseUITests/testCloseExactExistingWindow',
                     '-resultBundlePath', str(root / 'public-close-actor.xcresult')]
    report['actorCommand'] = actor_command
    with (evidence_dir / 'actor-smoke.log').open('w') as log:
        actor = subprocess.Popen(actor_command, env=environment, stdout=log, stderr=subprocess.STDOUT)
        def marker(name):
            if actor.poll() is not None: raise RuntimeError('Actor exited before ' + name + ': ' + str(actor.returncode))
            return (root / name).is_file()
        wait(lambda: marker('public-close-actor-ready'), 'Actual actor ready')
        report['ready'] = True; persist()
        (root / 'public-close-request').write_text(str(identity['pid']))
        wait(lambda: marker('public-close-ack'), 'Actual public close acknowledgement')
        report['publicCloseAcknowledged'] = True
        report['windowObservations'] = []
        after = None
        def closed():
            global after
            after = observe('query')
            details = json.loads(command([exe, '--owned-windows', str(identity['pid'])]).stdout)
            report['windowObservations'].append({'identity': after, 'windows': details})
            persist()
            assert after['pid'] == identity['pid']
            return after['onscreenWindows'] == 0
        wait(closed, 'Actual same physical subject window gone')
        receipt = 'OWNED_SUBJECT_WINDOW_WILL_CLOSE pid=' + str(identity['pid'])
        assert receipt in (evidence_dir / 'actor-subject.log').read_text()
        report['subjectWindowWillClose'] = {'pid': identity['pid'], 'observed': True}
        report['closedIdentity'] = after; report['exactWindowClose'] = True; persist()
        (root / 'public-close-driver-complete').write_text('owned actor smoke complete')
        report['actorExit'] = actor.wait(timeout=15)
        assert report['actorExit'] == 0
except BaseException as error:
    report['firstErrorType'] = type(error).__name__; report['firstError'] = str(error)
    raise
finally:
    cleanup_errors = []
    if actor is not None:
        try:
            if actor.poll() is None:
                (root / 'public-close-driver-complete').write_text('owned actor smoke cleanup')
                try: report['actorCleanupExit'] = actor.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    actor.terminate(); report['actorCleanupExit'] = actor.wait(timeout=10)
            else: report['actorCleanupExit'] = actor.returncode
        except BaseException as error: cleanup_errors.append(str(error))
    if captured:
        try: report['normalSubjectCleanup'] = observe('terminate')
        except BaseException as error: cleanup_errors.append(str(error))
    if subject is not None:
        try:
            if subject.poll() is None and not captured:
                subject.terminate(); report['subjectForcedCleanup'] = True
            report['subjectExit'] = subject.wait(timeout=10)
            subject_log.close()
        except BaseException as error: cleanup_errors.append(str(error))
    if cleanup_errors: report['cleanupErrors'] = cleanup_errors
    report['endedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat(); persist()
if report.get('cleanupErrors'): raise RuntimeError(str(report['cleanupErrors']))
assert report['subjectExit'] == 0 and report['normalSubjectCleanup']['normalAccepted'] is True
print('OWNED_ACTOR_READY_EXACT_WINDOW_CLOSE_PASSED')
