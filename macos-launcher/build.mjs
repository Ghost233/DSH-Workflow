import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyProjectIntegration } from './project-resources.mjs'
import { allowAuthenticatedLanSettings } from './runtime/lan-settings-client.mjs'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('macOS builds are ARM64-only')

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const harness = join(root, 'deepseek-harness')
const buildRoot = join(root, '.build')
const version = JSON.parse(await readFile(join(harness, 'apps/cli/package.json'), 'utf8')).version
const target = JSON.parse(await readFile(join(root, 'dsh-runtime.json'), 'utf8'))
const appPackage = JSON.parse(await readFile(join(root, 'macos-launcher/package.json'), 'utf8'))
const appVersion = appPackage.version
const arch = process.arch
const desktopApp = process.env.DSH_MACOS_DESKTOP_APP
const flutterRoot = join(root, 'macos-launcher/flutter')

async function run(command, args, cwd = root) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}

async function verifyInputs() {
  const { stdout: commit } = await exec('git', ['-C', harness, 'rev-parse', 'HEAD'])
  const { stdout: changes } = await exec('git', ['-C', harness, 'status', '--porcelain', '--untracked-files=no'])
  if (changes.trim() || commit.trim() !== target.commit || version !== target.version) throw new Error('DSH source does not match dsh-runtime.json')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(appVersion)) throw new Error('Invalid macOS app release version')
  if (appPackage.dependencies?.['@deepseek-ai/dsh'] !== version) throw new Error('macOS runtime package does not match pinned DSH')
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22+ is required')
  if (!desktopApp || !existsSync(join(desktopApp, 'Contents/Info.plist'))) {
    throw new Error('Set DSH_MACOS_DESKTOP_APP to the prepared official Desktop application')
  }
  const deck = join(root, 'matt-skills-panel-plugin/package')
  if (!existsSync(join(deck, 'lib/index.js')) || !existsSync(join(deck, 'lib/client.js'))
    || !existsSync(join(deck, 'lib/bootstrap.js'))
    || existsSync(join(deck, 'bundled-skills'))
    || (await readFile(join(deck, 'lib/bootstrap.js'), 'utf8')).includes('registerProvider')) {
    throw new Error('Build matt-skills-panel-plugin before packaging the app')
  }
}


await verifyInputs()
const buildLabel = process.env.DSH_MACOS_BUILD_LABEL
if (buildLabel !== undefined && !/^[A-Za-z0-9-]{1,32}$/.test(buildLabel)) throw new Error('Invalid DSH_MACOS_BUILD_LABEL')
const destination = join(buildRoot, `DSH Workflow-${appVersion}-dsh${version}-${arch}${buildLabel ? `-${buildLabel}` : ''}.app`)
if (existsSync(destination)) throw new Error(`Build output exists: ${destination}`)
await mkdir(buildRoot, { recursive: true })
await mkdir(join(flutterRoot, 'macos/Flutter/ephemeral'), { recursive: true })
await writeFile(join(flutterRoot, 'macos/Flutter/ephemeral/DSHArchitecture.xcconfig'),
  'EXCLUDED_ARCHS = x86_64\n')
await run(process.env.FLUTTER_BIN || 'flutter', ['build', 'macos', '--release', '--no-pub',
  `--build-name=${appVersion}`, `--build-number=${appVersion}`], flutterRoot)
const staging = await mkdtemp(join(buildRoot, 'launcher-stage-'))
const app = join(staging, 'DSH Workflow.app')
const contents = join(app, 'Contents')
const resources = join(contents, 'Resources')
try {
  await run('/usr/bin/ditto', [join(flutterRoot, 'build/macos/Build/Products/Release/DSH Workflow.app'), app])
  await cp(process.execPath, join(resources, 'node'))
  await chmod(join(resources, 'node'), 0o755)
  await copyProjectIntegration(root, join(resources, 'workflow'))
  await mkdir(join(resources, 'desktop'), { recursive: true })
  await run('/usr/bin/ditto', [desktopApp, join(resources, 'desktop/DeepSeek Harness.app')])
  const association = JSON.parse(await readFile(join(root, 'maclauncher.json'), 'utf8'))
  association.entry.path = '../..'
  await writeFile(join(resources, 'maclauncher.json'), JSON.stringify(association, null, 2) + '\n')
  await cp(join(root, 'macos-launcher/package.json'), join(resources, 'package.json'))
  await cp(join(root, 'macos-launcher/package-lock.json'), join(resources, 'package-lock.json'))
  await run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', join(buildRoot, 'npm-cache')], resources)
  const settingsClient = join(resources, 'node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js')
  await writeFile(settingsClient, allowAuthenticatedLanSettings(await readFile(settingsClient, 'utf8')))
  await mkdir(join(resources, 'bin'), { recursive: true })
  const pnpmShim = join(resources, 'bin', 'pnpm')
  await writeFile(pnpmShim, '#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\nexec "$ROOT/node" "$ROOT/node_modules/pnpm/bin/pnpm.mjs" "$@"\n')
  await chmod(pnpmShim, 0o755)
  const dsh = join(resources, 'node_modules', '@deepseek-ai', 'dsh')
  const packaged = JSON.parse(await readFile(join(dsh, 'package.json'), 'utf8'))
  if (packaged.name !== '@deepseek-ai/dsh' || packaged.version !== version) throw new Error('DSH deploy identity mismatch')
  if (!existsSync(join(dsh, 'lib/bin.js')) || !existsSync(join(resources, 'node_modules/@deepseek-ai/dsh-app-boot/package.json'))
    || !existsSync(join(resources, 'node_modules/pnpm/bin/pnpm.mjs'))) {
    throw new Error('DSH production runtime is incomplete')
  }
  await run(join(resources, 'node'), [join(dsh, 'lib/bin.js'), '--version'], resources)
  await run('codesign', ['--force', '--sign', '-', join(resources, 'node')])
  await run('codesign', ['--deep', '--force', '--sign', '-', app])
  await rename(app, destination)
  process.stdout.write(`${destination}\n`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
