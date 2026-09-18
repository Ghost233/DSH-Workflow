import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile, chmod, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const harness = join(root, 'deepseek-harness')
const buildRoot = join(root, '.build')
const version = JSON.parse(await readFile(join(harness, 'apps/cli/package.json'), 'utf8')).version
const target = JSON.parse(await readFile(join(root, 'dsh-runtime.json'), 'utf8'))
const appPackage = JSON.parse(await readFile(join(root, 'macos-launcher/package.json'), 'utf8'))
const appVersion = appPackage.version
const arch = process.arch

async function run(command, args, cwd = root) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}

async function verifyInputs() {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) throw new Error('Build on the target macOS architecture')
  const { stdout: commit } = await exec('git', ['-C', harness, 'rev-parse', 'HEAD'])
  const { stdout: changes } = await exec('git', ['-C', harness, 'status', '--porcelain', '--untracked-files=no'])
  if (changes.trim() || commit.trim() !== target.commit || version !== target.version) throw new Error('DSH source does not match dsh-runtime.json')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(appVersion)) throw new Error('Invalid macOS app release version')
  if (appPackage.dependencies?.['@deepseek-ai/dsh'] !== version) throw new Error('macOS runtime package does not match pinned DSH')
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22+ is required')
  if (!existsSync(join(root, 'owner-workflow-plugin/node_modules/fs-ext/build/Release/fs_ext.node'))) {
    throw new Error('Build owner-workflow-plugin/fs-ext for the selected Node first')
  }
}

async function copyOwned(workflow) {
  for (const name of ['package.json', 'dsh-runtime.json']) await cp(join(root, name), join(workflow, name))
  for (const name of ['project-plugins.json', 'project-plugins.lock.json']) {
    if (existsSync(join(root, name))) await cp(join(root, name), join(workflow, name))
  }
  for (const name of ['owner-workflow-plugin', 'sol-efficiency-plugin', 'approve-for-me-workflow-plugin']) {
    await cp(join(root, name), join(workflow, name), { recursive: true, filter: path => {
      const relative = path.slice(join(root, name).length).replaceAll('\\', '/')
      if (!relative) return true
      const top = relative.split('/')[1]
      return !['test', 'tests', '.git', 'node_modules'].includes(top)
    } })
  }
  await cp(join(root, 'owner-workflow-plugin/node_modules/fs-ext'), join(workflow, 'owner-workflow-plugin/node_modules/fs-ext'), { recursive: true })
  for (const name of ['project-plugins.mjs', 'project-plugin-resolver.mjs', 'harness-runtime.mjs',
    'kernel-launch-composition.mjs', 'web-host-lifecycle.mjs']) {
    await cp(join(root, 'scripts', name), join(workflow, 'scripts', name))
  }
  await cp(join(root, 'macos-launcher/runtime/web-launch.mjs'), join(workflow, 'macos-launcher/runtime/web-launch.mjs'))
  await cp(join(root, 'macos-launcher/runtime/lan-gateway.mjs'), join(workflow, 'macos-launcher/runtime/lan-gateway.mjs'))
  await cp(join(root, 'macos-launcher/runtime/catalog-supervisor.mjs'), join(workflow, 'macos-launcher/runtime/catalog-supervisor.mjs'))
  await cp(join(root, 'macos-launcher/runtime/plugin-versions.mjs'), join(workflow, 'macos-launcher/runtime/plugin-versions.mjs'))
  await cp(join(root, 'macos-launcher/runtime/plugin-update.mjs'), join(workflow, 'macos-launcher/runtime/plugin-update.mjs'))
  await cp(join(root, 'macos-launcher/runtime/run-dsh.mjs'), join(workflow, 'macos-launcher/runtime/run-dsh.mjs'))
}

function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.ghostagent.dsh-workflow-launcher</string>
<key>CFBundleName</key><string>DSH Workflow</string>
<key>CFBundleDisplayName</key><string>DSH Workflow</string>
<key>CFBundleExecutable</key><string>DSHWorkflowLauncher</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${appVersion}</string>
<key>CFBundleVersion</key><string>${appVersion}</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
`
}

await verifyInputs()
await mkdir(buildRoot, { recursive: true })
const buildLabel = process.env.DSH_MACOS_BUILD_LABEL
if (buildLabel !== undefined && !/^[A-Za-z0-9-]{1,32}$/.test(buildLabel)) throw new Error('Invalid DSH_MACOS_BUILD_LABEL')
const destination = join(buildRoot, `DSH Workflow-${appVersion}-dsh${version}-${arch}${buildLabel ? `-${buildLabel}` : ''}.app`)
if (existsSync(destination)) throw new Error(`Build output exists: ${destination}`)
const staging = await mkdtemp(join(buildRoot, 'launcher-stage-'))
const app = join(staging, 'DSH Workflow.app')
const contents = join(app, 'Contents')
const resources = join(contents, 'Resources')
try {
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await mkdir(join(resources, 'workflow', 'scripts'), { recursive: true })
  await mkdir(join(resources, 'workflow', 'macos-launcher', 'runtime'), { recursive: true })
  await writeFile(join(contents, 'Info.plist'), plist())
  await cp(process.execPath, join(resources, 'node'))
  await chmod(join(resources, 'node'), 0o755)
  await run('swiftc', ['-O', '-parse-as-library', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx14.0`,
    '-module-cache-path', join(buildRoot, 'swift-module-cache'),
    join(root, 'macos-launcher/Sources/DSHWorkflowLauncher.swift'),
    join(root, 'macos-launcher/Sources/UpdatePolicy.swift'),
    '-o', join(contents, 'MacOS', 'DSHWorkflowLauncher')])
  await copyOwned(join(resources, 'workflow'))
  await cp(join(root, 'macos-launcher/package.json'), join(resources, 'package.json'))
  await cp(join(root, 'macos-launcher/package-lock.json'), join(resources, 'package-lock.json'))
  await run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', join(buildRoot, 'npm-cache')], resources)
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
  await run(join(resources, 'node'), ['-e', "require(process.argv[1])", join(resources, 'workflow/owner-workflow-plugin/node_modules/fs-ext')], resources)
  const native = await stat(join(resources, 'workflow/owner-workflow-plugin/node_modules/fs-ext/build/Release/fs_ext.node'))
  if (!native.isFile()) throw new Error('Packaged fs-ext binary is missing')
  await run('codesign', ['--force', '--sign', '-', join(resources, 'node')])
  await run('codesign', ['--force', '--sign', '-', join(resources, 'workflow/owner-workflow-plugin/node_modules/fs-ext/build/Release/fs_ext.node')])
  await run('codesign', ['--deep', '--force', '--sign', '-', app])
  await rename(app, destination)
  process.stdout.write(`${destination}\n`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
