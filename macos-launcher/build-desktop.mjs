import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'deepseek-harness')
const appRoot = join(source, 'apps/desktop')
const require = createRequire(join(appRoot, 'package.json'))
const packageInfo = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'))
const output = join(root, '.build', `DeepSeek Harness-${packageInfo.version}-source.app`)
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build on macOS arm64')
if (existsSync(output)) throw new Error(`Desktop build already exists: ${output}`)
for (const file of ['apps/desktop/lib/main.js', 'apps/desktop-host/lib/index.js', 'apps/web/dist/index.html']) {
  if (!existsSync(join(source, file))) throw new Error(`Build the unchanged DSH source first: ${file}`)
}
const electronPackage = JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8'))
const { downloadArtifact } = await import(require.resolve('@electron/get'))
const extractZip = (await import(require.resolve('extract-zip'))).default
const archive = await downloadArtifact({ version: electronPackage.version, platform: 'darwin', arch: 'arm64',
  artifactName: 'electron', cacheRoot: join(root, '.build/desktop-downloads') })
const extracted = join(root, '.build', `electron-${electronPackage.version}-desktop`)
await mkdir(extracted, { recursive: true })
if (!existsSync(join(extracted, 'Electron.app/Contents/MacOS/Electron'))) await extractZip(archive, { dir: extracted })
await exec('/usr/bin/ditto', [join(extracted, 'Electron.app'), output])
const electron = join(output, 'Contents/MacOS/Electron')
const { stdout: nodeVersion } = await exec(electron, ['-p', 'process.versions.node'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
const pnpm = JSON.parse(await readFile(join(appRoot, 'node_modules/pnpm/package.json'), 'utf8'))
const { prepareDevelopmentProject } = await import(fileURLToPath(new URL('../deepseek-harness/apps/desktop/scripts/development-project.ts', import.meta.url)))
const { DESKTOP_HOST_PROTOCOL_VERSION } = await import(fileURLToPath(new URL('../deepseek-harness/apps/desktop/src/host-protocol.ts', import.meta.url)))
const runtimeRoot = join(appRoot, '.desktop-build/development/project')
prepareDevelopmentProject({ projectDir: runtimeRoot, cliDir: join(source, 'apps/cli'),
  hostDir: join(source, 'apps/desktop-host'), dependencyDir: join(source, 'node_modules/.pnpm/node_modules'),
  release: { schemaVersion: 1, version: packageInfo.version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: nodeVersion.trim(), pnpmVersion: pnpm.version }, target: 'mac-arm64' })
const { preparePrimaryRuntime } = await import(fileURLToPath(new URL('../deepseek-harness/apps/desktop/scripts/prepare-primary-runtime.ts', import.meta.url)))
await preparePrimaryRuntime()
const { developmentRuntimeDirectory } = await import(fileURLToPath(new URL('../deepseek-harness/apps/desktop/scripts/desktop-build-paths.mjs', import.meta.url)))
const primaryRuntime = developmentRuntimeDirectory()
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const launcher = join(output, 'Contents/MacOS/DSHDesktopSource')
await writeFile(launcher, '#!/bin/sh\n'
  + `export DSH_HOME=${quote(process.env.DSH_HOME || join(homedir(), '.dsh'))}\n`
  + `export DSH_DESKTOP_PRIMARY_RUNTIME_DIR=${quote(primaryRuntime)}\n`
  + 'export DSH_DESKTOP_DEV_APP=1\nexport DSH_DESKTOP_OPEN_DEVTOOLS=0\n'
  + `cd ${quote(appRoot)}\nexec "$(dirname "$0")/Electron" ${quote(appRoot)} "$@"\n`)
await chmod(launcher, 0o755)
const plist = join(output, 'Contents/Info.plist')
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'com.ghostagent.dsh-source-desktop',
  CFBundleName: 'DeepSeek Harness', CFBundleDisplayName: 'DeepSeek Harness', CFBundleExecutable: 'DSHDesktopSource',
  CFBundleShortVersionString: packageInfo.version })) {
  await exec('/usr/bin/plutil', ['-replace', key, '-string', value, plist])
}
await writeFile(join(output, 'Contents/Resources/dsh-source-runtime.json'), JSON.stringify({
  source, runtimeRoot, primaryRuntime, version: packageInfo.version,
}) + '\n')
await exec('codesign', ['--force', '--deep', '--sign', '-', output])
process.stdout.write(output + '\n')
