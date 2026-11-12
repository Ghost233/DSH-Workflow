import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile, chmod, utimes } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyProjectIntegration, verifyProjectIntegration } from './project-resources.mjs'
import { bundleServiceNotifications } from './service-notifications.mjs'
import { allowAuthenticatedLanSettings } from './runtime/lan-settings-client.mjs'
import { verifyNpmRuntimePin } from './runtime/npm-runtime-pin.mjs'
import { bundleProjectPlugins } from './bundle-plugins.mjs'
import { verifyPluginPayload } from './runtime/plugin-payload.mjs'
import { checkBrowserHarnessUpstream } from '../browser-harness-plugin/build.mjs'
import { pruneKnownDevelopmentFiles } from './production-file-policy.mjs'
import { sourceIdentity } from '../scripts/harness-runtime.mjs'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('macOS builds are ARM64-only')

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--candidate')) throw new Error('Usage: build.mjs [--candidate DIRECTORY]')
const candidate = args[1] && resolve(args[1])
const buildRoot = candidate ?? join(root, '.build')
const runtimeInputs = candidate ?? join(root, 'macos-launcher')
const target = JSON.parse(await readFile(join(candidate ?? root, 'dsh-runtime.json'), 'utf8'))
const fromSource = target.source === 'git' && Boolean(candidate)
const appPackage = JSON.parse(await readFile(join(runtimeInputs, 'package.json'), 'utf8'))
const version = target.version
const appVersion = appPackage.version
const arch = process.arch
const flutterRoot = candidate ? join(candidate, 'flutter') : join(root, 'macos-launcher/flutter')

async function run(command, args, cwd = root) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}

async function verifyInputs() {
  if (fromSource) await sourceIdentity(join(candidate, 'source'), target)
  else {
    const lock = JSON.parse(await readFile(join(runtimeInputs, 'package-lock.json'), 'utf8'))
    verifyNpmRuntimePin({ target, app: appPackage, lock })
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(appVersion)) throw new Error('Invalid macOS app release version')
  if (appPackage.dependencies?.['@deepseek-ai/dsh'] !== version) throw new Error('macOS runtime package does not match pinned DSH')
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22+ is required')
}


await verifyInputs()
console.log(JSON.stringify({ browserHarnessSkillCheck: await checkBrowserHarnessUpstream(root) }))
const buildLabel = process.env.DSH_MACOS_BUILD_LABEL
if (buildLabel !== undefined && !/^[A-Za-z0-9-]{1,32}$/.test(buildLabel)) throw new Error('Invalid DSH_MACOS_BUILD_LABEL')
const destination = join(buildRoot, `Ghost DSH Station-${appVersion}-dsh${version}-${arch}${buildLabel ? `-${buildLabel}` : ''}.app`)
if (existsSync(destination)) throw new Error(`Build output exists: ${destination}`)
await mkdir(buildRoot, { recursive: true })
if (!candidate) {
  await mkdir(join(flutterRoot, 'macos/Flutter/ephemeral'), { recursive: true })
  await writeFile(join(flutterRoot, 'macos/Flutter/ephemeral/DSHArchitecture.xcconfig'), 'EXCLUDED_ARCHS = x86_64\n')
  await run(process.env.FLUTTER_BIN || 'flutter', ['build', 'macos', '--release', '--no-pub',
    `--build-name=${appVersion}`, `--build-number=${appVersion}`], flutterRoot)
}
const staging = await mkdtemp(join(buildRoot, 'launcher-stage-'))
const app = join(staging, 'Ghost DSH Station.app')
const contents = join(app, 'Contents')
const resources = join(contents, 'Resources')
try {
  await run('/usr/bin/ditto', [join(flutterRoot, 'build/macos/Build/Products/Release/Ghost DSH Station.app'), app])
  await cp(process.execPath, join(resources, 'node'))
  await chmod(join(resources, 'node'), 0o755)
  await copyProjectIntegration(root, join(resources, 'workflow'), candidate)
  await bundleProjectPlugins({ resourcesRoot: resources, sourceRoot: root, npmCache: join(root, '.build/npm-cache') })
  await bundleServiceNotifications(root, resources)
  const { stdout: outerVersion } = await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(contents, 'Info.plist')])
  if (outerVersion.trim() !== appVersion) throw new Error('Station app and release metadata versions differ')
  const association = JSON.parse(await readFile(join(root, 'maclauncher.json'), 'utf8'))
  association.entry.path = '../..'
  await writeFile(join(resources, 'maclauncher.json'), JSON.stringify(association, null, 2) + '\n')
  if (fromSource) {
    const deployed = join(candidate, 'runtime')
    await run('/usr/bin/ditto', [join(deployed, 'node_modules'), join(resources, 'node_modules')])
    await cp(join(candidate, 'source/pnpm-lock.yaml'), join(resources, 'pnpm-lock.yaml'))
    const identity = await sourceIdentity(join(candidate, 'source'), target)
    await writeFile(join(resources, 'dsh-source.json'), JSON.stringify({ ...target, ...identity }, null, 2) + '\n')
    await cp(join(candidate, 'toolchain/node_modules/pnpm'), join(resources, 'node_modules/pnpm'), { recursive: true })
    for (const name of Object.keys(appPackage.dependencies)) {
      const pkg = JSON.parse(await readFile(join(resources, 'node_modules', name, 'package.json'), 'utf8'))
      if (pkg.name !== name) throw new Error(`DSH deploy dependency identity mismatch: ${name}`)
      appPackage.dependencies[name] = pkg.version
    }
    await writeFile(join(resources, 'package.json'), JSON.stringify(appPackage, null, 2) + '\n')
  } else {
    await cp(join(runtimeInputs, 'package.json'), join(resources, 'package.json'))
    await cp(join(runtimeInputs, 'package-lock.json'), join(resources, 'package-lock.json'))
    await run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
      '--cache', join(root, '.build/npm-cache')], resources)
  }
  await pruneKnownDevelopmentFiles(join(resources, 'node_modules'))
  // This app targets macOS ARM64; node-pty's Windows binaries cannot run here.
  for (const name of ['win32-arm64', 'win32-x64']) {
    await rm(join(resources, 'node_modules/node-pty/prebuilds', name), { recursive: true, force: true })
  }
  const settingsClient = join(resources, 'node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js')
  const settingsSource = await readFile(settingsClient, 'utf8')
  if (allowAuthenticatedLanSettings(settingsSource) !== settingsSource) throw new Error('DSH settings requires an unsupported upstream change')
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
  if (fromSource) {
    const anchor = join(dsh, 'package.json')
    const require = createRequire(anchor)
    const frontend = require.resolve('@deepseek-ai/dsh-web-frontend/package.json')
    await readFile(new URL('./dist/index.html', pathToFileURL(frontend)))
    await run(join(resources, 'node'), ['--input-type=module', '-e',
      'import { createRequire } from "node:module"; const boot = createRequire(process.argv[1])("@deepseek-ai/dsh-app-boot"); if (typeof boot.boot !== "function") throw new Error("DSH Host boot entry is missing")',
      anchor], resources)
  }
  if (!candidate) await run(join(resources, 'node'), [join(dsh, 'lib/bin.js'), '--version'], resources)
  await run('codesign', ['--force', '--sign', '-', join(resources, 'node')])
  await run('codesign', ['--deep', '--force', '--sign', '-', app])
  await verifyPluginPayload(resources, candidate ?? root)
  await verifyProjectIntegration(root, join(resources, 'workflow'), candidate)
  await run('codesign', ['--verify', '--deep', '--strict', app])
  await rename(app, destination)
  // The no-argument launcher selects the newest completed bundle by directory mtime.
  await utimes(destination, new Date(), new Date())
  process.stdout.write(`${destination}\n`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
