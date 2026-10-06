#!/usr/bin/env python3
"""Engineering-only Debug app artifact boundary; never caches probe state."""
import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import sys
import subprocess
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

APP = 'DSH Workflow.app'
COMMAND = ['flutter', 'build', 'macos', '--debug', '--no-pub']


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')


def identity():
    result = {key: os.environ.get(env, '') for key, env in (
        ('sourceCommit', 'GITHUB_SHA'), ('repository', 'GITHUB_REPOSITORY'),
        ('runId', 'GITHUB_RUN_ID'), ('runAttempt', 'GITHUB_RUN_ATTEMPT'),
        ('workflow', 'GITHUB_WORKFLOW'), ('job', 'GITHUB_JOB'))}
    result['sourceCommit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if any(not value for value in result.values()):
        raise ValueError('Missing actual producer or consumer provenance')
    return result


def actual_toolchain():
    def output(*command):
        return subprocess.check_output(command, text=True).strip()
    flutter = json.loads(output('flutter', '--version', '--machine'))
    return {'arch': platform.machine(), 'flutter': {key: flutter[key] for key in
        ('frameworkVersion', 'frameworkRevision', 'engineRevision', 'dartSdkVersion')},
        'xcode': output('xcodebuild', '-version'), 'sdkVersion': output('xcrun', '--sdk', 'macosx', '--show-sdk-version'),
        'sdkBuild': output('xcrun', '--sdk', 'macosx', '--show-sdk-build-version'),
        'macos': output('sw_vers', '-productVersion')}


def inputs(args):
    prefix = 'macos-launcher/flutter/'
    names = subprocess.check_output(['git', '-C', str(args.root), 'ls-files', '-z', prefix]).decode().split('\0')
    files = {}
    for name in sorted(filter(None, names)):
        relative = name[len(prefix):]
        if relative.split('/')[0] in ('test', 'tool', 'docs', '.github') or relative in ('check.sh', 'README.md', 'analysis_options.yaml') or relative.endswith(('.gitignore', '.md')):
            continue
        files[name] = sha(args.root / name)
    for required in ('lib/main.dart', 'pubspec.yaml', 'pubspec.lock', 'macos/Runner/Info.plist'):
        if prefix + required not in files:
            raise ValueError('Missing actual build input: ' + required)
    toolchain = json.loads(args.toolchain.read_text()) if args.toolchain else actual_toolchain()
    if any(not toolchain.get(key) for key in ('arch', 'flutter', 'xcode', 'sdkVersion', 'sdkBuild', 'macos')) or any(not toolchain['flutter'].get(key) for key in ('frameworkRevision', 'engineRevision', 'dartSdkVersion')):
        raise ValueError('Incomplete actual toolchain identity')
    material = {'schema': 1, 'command': COMMAND, 'toolchain': toolchain, 'files': files}
    key = 'flutter-debug-v1-' + hashlib.sha256(json.dumps(material, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    write(args.output, dict(material, key=key))
    print(key)



def build(args):
    expected = json.loads(args.inputs.read_text())
    if expected['command'] != COMMAND:
        raise ValueError('Build command does not match bound inputs')
    log = args.evidence / 'build.log'
    with log.open('w') as stream:
        result = subprocess.run(COMMAND, cwd=args.root / 'macos-launcher/flutter', stdout=stream, stderr=subprocess.STDOUT)
    code = result.returncode if result.returncode >= 0 else 128 - result.returncode
    (args.evidence / 'build.exit').write_text(str(code) + '\n')
    print(log.read_text(), end='')
    return code


def payload(app):
    required = ('Contents/MacOS/DSH Workflow', 'Contents/Info.plist',
                'Contents/Frameworks/App.framework/Resources/flutter_assets/kernel_blob.bin')
    if any(not (app / name).is_file() for name in required) or not os.access(app / required[0], os.X_OK):
        raise ValueError('Missing executable Debug app bytes')
    files = {}
    for path in sorted(app.rglob('*')):
        mode = path.lstat().st_mode
        item = {'mode': stat.S_IMODE(mode)}
        if path.is_symlink():
            item['link'] = os.readlink(path)
            if not path.resolve().is_relative_to(app.resolve()):
                raise ValueError('App symlink escapes bundle')
        elif path.is_file():
            item['sha256'] = sha(path)
        elif not path.is_dir():
            raise ValueError('Unsupported app member')
        files[path.relative_to(app).as_posix()] = item
    return files


def pack(args):
    build_exit = int(args.build_exit.read_text().strip())
    if build_exit != 0:
        raise ValueError('Cannot seal app without successful producer build exit')
    expected = json.loads(args.inputs.read_text())
    files = payload(args.app)
    args.bundle.mkdir(parents=True, exist_ok=True)
    archive = args.bundle / 'app.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(args.app, arcname=APP)
    producer = identity()
    archive_hash = sha(archive)
    write(args.bundle / 'manifest.json', {'schema': 1, 'inputs': expected, 'producer': producer,
          'buildExit': build_exit, 'archiveSha256': archive_hash, 'payload': files})
    if args.receipt:
        write(args.receipt, {'schema': 1, 'mode': 'produced-current-checkout', 'key': expected['key'],
              'archiveSha256': archive_hash, 'producer': producer, 'consumer': producer})


def restore(args):
    expected = json.loads(args.inputs.read_text())
    manifest = json.loads((args.bundle / 'manifest.json').read_text())
    archive = args.bundle / 'app.tar.gz'
    consumer = identity()
    producer = manifest.get('producer', {})
    if any(not producer.get(key) for key in consumer) or producer['repository'] != consumer['repository']:
        raise ValueError('Missing or foreign producer provenance')
    if manifest.get('schema') != 1 or manifest.get('buildExit') != 0 or manifest['inputs'] != expected:
        raise ValueError('Artifact build inputs do not match current candidate')
    if sha(archive) != manifest['archiveSha256']:
        raise ValueError('Artifact bytes do not match manifest')
    if args.destination.exists():
        raise ValueError('Refusing to overwrite existing app')
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.destination.parent) as directory:
        target = Path(directory)
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or path.parts[0] != APP or not (member.isfile() or member.isdir() or member.issym()):
                    raise ValueError('Unsafe artifact member')
                if member.issym() and not (target / member.name).parent.joinpath(member.linkname).resolve().is_relative_to((target / APP).resolve()):
                    raise ValueError('Unsafe artifact symlink')
            tar.extractall(target)
        app = target / APP
        if payload(app) != manifest['payload']:
            raise ValueError('Extracted app bytes do not match producer payload')
        shutil.move(str(app), str(args.destination))
    write(args.receipt, {'schema': 1, 'mode': 'reused-actual-bytes', 'key': expected['key'],
          'archiveSha256': manifest['archiveSha256'], 'producer': manifest['producer'], 'consumer': consumer})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    key = commands.add_parser('inputs')
    key.add_argument('--root', type=Path, required=True)
    key.add_argument('--toolchain', type=Path)
    key.add_argument('--output', type=Path, required=True)
    builder = commands.add_parser('build')
    builder.add_argument('--root', type=Path, required=True)
    builder.add_argument('--inputs', type=Path, required=True)
    builder.add_argument('--evidence', type=Path, required=True)
    for name in ('pack', 'restore'):
        command = commands.add_parser(name)
        command.add_argument('--inputs', type=Path, required=True)
        command.add_argument('--bundle', type=Path, required=True)
        if name == 'pack':
            command.add_argument('--app', type=Path, required=True)
            command.add_argument('--receipt', type=Path)
            command.add_argument('--build-exit', type=Path, required=True)
        else:
            command.add_argument('--destination', type=Path, required=True)
            command.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    return {'inputs': inputs, 'build': build, 'pack': pack, 'restore': restore}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
