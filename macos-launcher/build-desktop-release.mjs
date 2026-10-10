import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, open, symlink } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, delimiter, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { desktopTargetBuildPaths } from '../deepseek-harness/apps/desktop/scripts/desktop-build-paths.mjs'
import { createRuntimeProjectMetadata } from '../deepseek-harness/apps/desktop/src/project-manager.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../deepseek-harness/apps/desktop/src/host-protocol.ts'
import { readDesktopCorePackageSet, verifyDesktopCoreLockfile } from '../deepseek-harness/apps/desktop/src/core-package-set.ts'
import { desktopNodeEnvironment } from '../deepseek-harness/apps/desktop/src/node-environment.ts'
import { desktopRuntimeFileExclusion } from '../deepseek-harness/apps/desktop/scripts/runtime-file-policy.ts'
import { selectOfficeEngine } from '../deepseek-harness/scripts/libreoffice-packages.mjs'
import { inventoryDesktopRuntime, writeDesktopRuntime } from '../deepseek-harness/apps/desktop/src/runtime-tree.ts'
import { resolvePrimaryRuntime } from '../deepseek-harness/packages/skill/tool-workspace-dependencies/src/index.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const appRoot = join(root, 'deepseek-harness/apps/desktop')
const requireDesktop = createRequire(join(appRoot, 'package.json'))
const { build, Platform, Arch } = requireDesktop('electron-builder')
const arch = process.arch
if (process.platform !== 'darwin' || arch !== 'arm64') throw new Error('macOS builds are ARM64-only')
const paths = desktopTargetBuildPaths(`mac-${arch}`)
const output = process.argv[2] ? resolve(process.argv[2]) : join(root, '.build', `desktop-${arch}`)
if (existsSync(output)) throw new Error(`Desktop build output exists: ${output}`)
const version = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version
const runtimeVersions = JSON.parse(await readFile(join(paths.runtime, 'versions.json'), 'utf8'))
const release = { schemaVersion: 1, version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  nodeVersion: runtimeVersions.node, pnpmVersion: runtimeVersions.pnpm }
const electron = join(paths.electron, 'Electron.app/Contents/MacOS/Electron')
const { pnpm } = await resolvePrimaryRuntime(join(paths.runtime, 'primary-runtime'))
if (!pnpm) throw new Error('Prepared Desktop primary runtime has no pnpm entry')
await mkdir(join(root, '.build'), { recursive: true })
const staging = await mkdtemp(join(root, '.build', `desktop-runtime-${arch}-`))
const dsh = join(staging, 'dsh')

async function run(command, args, cwd, env = process.env) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}

try {
  await cp(join(paths.packageSet, 'desktop-packages.json'), join(staging, 'desktop-packages.json'))
  await cp(join(paths.packageSet, 'desktop-packages'), join(staging, 'desktop-packages'), { recursive: true })
  createRuntimeProjectMetadata(staging, release)
  const npmrc = join(staging, '.npmrc')
  await writeFile(npmrc, '')
  const environment = desktopNodeEnvironment(electron, join(paths.runtime, 'bin'), {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_OPTIONS' && name !== 'NODE_PATH'
      && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name))),
    PATH: `${join(paths.runtime, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
  })
  const install = args => run(electron, ['--expose-internals', pnpm, '--config.registry=https://registry.npmjs.org/',
    `--config.store-dir=${join(staging, 'store')}`, `--config.userconfig=${npmrc}`,
    '--config.enable-global-virtual-store=false', 'install', ...args], staging, environment)
  await install(['--lockfile-only'])
  const packageSet = readDesktopCorePackageSet(staging, version)
  verifyDesktopCoreLockfile(readFileSync(join(staging, 'pnpm-lock.yaml'), 'utf8'), packageSet)
  await install(['--prod', '--frozen-lockfile', '--trust-lockfile'])
  const modules = join(staging, 'node_modules')
  const target = { platform: 'darwin', arch }
  const office = selectOfficeEngine(JSON.parse(await readFile(join(modules, '@deepseek-ai/libreoffice-kit/package.json'), 'utf8')), target)
  await mkdir(dsh)
  await cp(modules, join(dsh, 'node_modules'), { recursive: true, dereference: true,
    filter: source => desktopRuntimeFileExclusion(relative(modules, source), target, office) === undefined })
  await writeFile(join(dsh, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-desktop-runtime',
    private: true, version, type: 'module', dependencies: Object.fromEntries(packageSet.packages.map(row => [row.name, row.version])) }) + '\n')
  await build({ projectDir: appRoot, targets: Platform.MAC.createTarget('dir', Arch[arch]), config: {
    extends: null, appId: 'com.ghostagent.dsh-workflow-desktop', productName: 'DeepSeek Harness',
    extraMetadata: { dshDesktopAppId: 'com.ghostagent.dsh-workflow-desktop' },
    protocols: [{ name: 'DeepSeek Harness', schemes: ['dsh'] }],
    directories: { output }, electronDist: paths.electron, electronFuses: { runAsNode: true },
    asar: false, npmRebuild: false, publish: null,
    files: ['lib/main.js', 'lib/welcome/**/*', 'lib/preload-*.cjs', 'renderer/**/*', 'package.json',
      { from: dsh, to: 'dsh', filter: ['**/*'] },
      { from: join(dsh, 'node_modules'), to: 'dsh/node_modules', filter: ['**/*'] }],
    extraResources: [{ from: paths.runtime, to: 'runtime' },
      { from: join(appRoot, 'resources/icon-windows.png'), to: 'icon.png' }],
    mac: { identity: null, notarize: false, hardenedRuntime: false,
      icon: join(appRoot, 'resources/icon-macos.png'), category: 'public.app-category.developer-tools',
      extendInfo: { CFBundleLocalizations: ['en', 'zh_CN'],
        NSMicrophoneUsageDescription: 'DeepSeek Harness uses your microphone to transcribe speech into message drafts.' } },
  } })
  const app = join(output, 'mac-arm64', 'DeepSeek Harness.app')
  const resources = join(app, 'Contents/Resources')
  // The unpacked CLI resolves app/runtime beside dsh. Share the bundled payload through a relative path.
  await symlink('../runtime', join(resources, 'app/runtime'))
  const packagedDsh = join(resources, 'app/dsh')
  const magics = new Set(['cafebabe', 'cafebabf', 'cefaedfe', 'cffaedfe', 'feedface', 'feedfacf', 'bebafeca', 'bfbafeca'])
  for (const directory of [packagedDsh, join(resources, 'runtime/primary-runtime')]) {
    for (const entry of inventoryDesktopRuntime(directory)) {
      const file = join(directory, entry.path)
      const descriptor = await open(file, 'r')
      const header = Buffer.alloc(4)
      try { await descriptor.read(header, 0, 4, 0) } finally { await descriptor.close() }
      if (magics.has(header.toString('hex'))) await run('codesign', ['--force', '--sign', '-', file], root)
    }
  }
  await run('codesign', ['--deep', '--force', '--sign', '-', app], root)
  // Seal the final packaged bytes after native signing and electron-builder's manifest cleanup.
  writeDesktopRuntime(packagedDsh, release, packageSet.packages.map(row => row.name), target)
  await run('codesign', ['--force', '--sign', '-', app], root)
  await run('codesign', ['--verify', '--deep', '--strict', app], root)
  process.stdout.write(`Desktop production application: ${app}\n`)
} finally {
  await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
