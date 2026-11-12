import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveVersion } from '../scripts/dsh-runtime-versions.mjs'
import { buildGithubRuntime, readJson, run, writeJson } from './github-runtime.mjs'

const [channel, version, ...extra] = process.argv.slice(2)
if (!version || extra.length) throw new Error('Usage: node macos-launcher/build-candidate.mjs npm|github VERSION')
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Station candidates require macOS ARM64')
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 9)) throw new Error('Station candidates require standalone Node 24.9+')

const root = fileURLToPath(new URL('../', import.meta.url))
const target = await resolveVersion(channel, version)
const registryOutput = join(root, '.build/project-registry')
await mkdir(registryOutput, { recursive: true })
const stage = await mkdtemp(join(registryOutput, 'station-'))
console.log(`Candidate directory: ${stage}`)
const app = await readJson(join(root, 'macos-launcher/package.json'))
app.dependencies[target.package] = target.version
delete app.devDependencies
await writeJson(join(stage, 'package.json'), app)
await writeJson(join(stage, 'dsh-runtime.json'), target)

const manifest = await readJson(join(root, 'project-plugins.json'))
const included = []
for (const item of manifest.plugins) {
  if (item.source === 'artifact') {
    const artifacts = await readJson(join(root, item.artifactSet))
    if (artifacts.dsh !== version) {
      console.log(`Candidate omits ${item.package}@${item.version}: artifact targets DSH ${artifacts.dsh}`)
      continue
    }
  }
  included.push(item)
}
await writeJson(join(stage, 'project-plugins.json'), { ...manifest, plugins: included })
const compose = ['--context', 'orbstack', 'compose', '-f', 'tools/registry.compose.yml']
run('docker', [...compose, 'config', '--quiet'], { cwd: root })
run('docker', [...compose, 'run', '--rm', '--no-deps', '-T',
  '-v', `${join(stage, 'dsh-runtime.json')}:/workspace/dsh-runtime.json:ro`,
  '-v', `${join(stage, 'project-plugins.json')}:/workspace/project-plugins.json:ro`,
  'registry', 'node', '/workspace/scripts/refresh-project-plugin-lock.mjs',
  `/output/${basename(stage)}/project-plugins.lock.json`], { cwd: root })

if (channel === 'github') await buildGithubRuntime(stage, target)
else {
  run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry', target.registry, '--cache', join(root, '.build/npm-cache')], { cwd: stage })
}

const flutter = process.env.FLUTTER_BIN || 'flutter'
const flutterSource = join(root, 'macos-launcher/flutter'), flutterTarget = join(stage, 'flutter')
const generated = ['.dart_tool', '.idea', 'build', 'macos/Flutter/ephemeral']
await cp(flutterSource, flutterTarget, { recursive: true, filter: path => !generated.includes(relative(flutterSource, path)) })
const ephemeral = join(flutterTarget, 'macos/Flutter/ephemeral')
await mkdir(ephemeral, { recursive: true })
await writeFile(join(ephemeral, 'DSHArchitecture.xcconfig'), 'EXCLUDED_ARCHS = x86_64\n')
run(flutter, ['pub', 'get', '--enforce-lockfile'], { cwd: flutterTarget })
run(flutter, ['build', 'macos', '--release', '--no-pub', `--build-name=${app.version}`, `--build-number=${app.version}`], { cwd: flutterTarget })
run(process.execPath, [join(root, 'macos-launcher/build.mjs'), '--candidate', stage], { cwd: root })
