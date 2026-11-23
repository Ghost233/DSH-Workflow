import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, relative } from 'node:path'

const exec = promisify(execFile)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const pin = JSON.parse(await readFile(new URL('./desktop-release.json', import.meta.url)))
export const stationDesktopVersion = pin.version
export const desktopPnpmDirectory = 'Contents/Resources/runtime/primary-runtime/dependencies/pnpm'

function replaceDesktopAnchor(source, anchor, replacement, count = 1) {
  if (source.split(anchor).length !== count + 1) throw new Error(`Official Desktop anchor changed: ${anchor}`)
  return source.replaceAll(anchor, replacement)
}

export function adaptDesktopMain(source) {
  if (sha(source) !== pin.mainSha256) throw new Error('Official Desktop main does not match the version pin')
  let main = replaceDesktopAnchor(source, 'new DesktopHostProcess(', 'new StationDesktopConnection(')
  main = replaceDesktopAnchor(main, 'new DesktopProjectManager(', 'new StationReadOnlyProfile(', 2)
  main = replaceDesktopAnchor(main, 'let windowsLanguage = readDesktopLocaleCache(app.getPath("userData"));',
    'if (!process.env.DSH_WORKFLOW_DATA_ROOT) throw new Error("Open Desktop from Ghost DSH Station");\n'
    + 'app.setPath("userData", join(process.env.DSH_WORKFLOW_DATA_ROOT, "desktop-ui"));\n'
    + 'let windowsLanguage = readDesktopLocaleCache(app.getPath("userData"));')
  main = replaceDesktopAnchor(main, 'if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === "1") app.setAsDefaultProtocolClient("dsh");', '')
  return 'import { StationDesktopConnection, StationReadOnlyProfile } from "../../station-desktop/desktop-client.mjs";\n' + main
}

function* archiveFiles(files) {
  for (const entry of Object.values(files)) {
    if (entry.files) yield* archiveFiles(entry.files)
    else yield entry
  }
}

function adaptArchive(input, expectedHeaderHash) {
  const headerSize = input.readUInt32LE(4), jsonSize = input.readUInt32LE(12)
  const payloadStart = 8 + headerSize
  const json = input.subarray(16, 16 + jsonSize)
  if (input.readUInt32LE(0) !== 4 || input.readUInt32LE(8) !== headerSize - 4
    || jsonSize > headerSize - 8 || payloadStart >= input.length || sha(json) !== expectedHeaderHash) {
    throw new Error('Official Desktop ASAR header does not match its signed identity')
  }
  const header = JSON.parse(json)
  const dsh = header.files.dsh
  const packages = dsh.files['node_modules'].files['@deepseek-ai'].files
  const frontend = packages['dsh-web-frontend']
  const manifest = packages.dsh.files['package.json']
  if (!frontend.files.dist?.files?.['index.html'] || manifest.unpacked
    || [...archiveFiles(frontend.files)].some(entry => entry.unpacked || entry.link)) {
    throw new Error('Official Desktop frontend is not self-contained in the archive')
  }
  // Desktop reads its own frontend and version metadata. Station supplies the Host and CLI.
  dsh.files = { 'node_modules': { files: { '@deepseek-ai': { files: {
    dsh: { files: { 'package.json': manifest } },
    'dsh-web-frontend': frontend,
  } } } } }
  const payload = input.subarray(payloadStart)
  const changes = new Map()
  const change = (entry, transform) => {
    const start = Number(entry.offset)
    const original = payload.subarray(start, start + entry.size)
    if (entry.unpacked || original.length !== entry.size || sha(original) !== entry.integrity.hash) {
      throw new Error('Official Desktop ASAR member failed integrity verification')
    }
    const bytes = Buffer.from(transform(original.toString('utf8')))
    entry.size = bytes.length
    entry.integrity.hash = sha(bytes)
    entry.integrity.blocks = []
    for (let start = 0; start < bytes.length; start += entry.integrity.blockSize) {
      entry.integrity.blocks.push(sha(bytes.subarray(start, start + entry.integrity.blockSize)))
    }
    changes.set(entry, bytes)
  }
  change(header.files.lib.files['main.js'], adaptDesktopMain)
  change(header.files['package.json'], original => {
    const app = JSON.parse(original)
    if (app.name !== '@deepseek-ai/dsh-desktop' || app.version !== pin.version) throw new Error('Wrong official Desktop version')
    delete app.dshMandatoryUpdatePolicy
    return JSON.stringify(app)
  })
  let offset = 0
  const packed = []
  for (const entry of archiveFiles(header.files)) {
    if (entry.offset === undefined) continue
    const start = Number(entry.offset)
    const bytes = changes.get(entry) ?? payload.subarray(start, start + entry.size)
    entry.offset = String(offset)
    offset += bytes.length
    packed.push(bytes)
  }
  const content = Buffer.from(JSON.stringify(header))
  const prefix = Buffer.alloc(16 + Math.ceil(content.length / 4) * 4)
  prefix.writeUInt32LE(4, 0)
  prefix.writeUInt32LE(prefix.length - 8, 4)
  prefix.writeUInt32LE(prefix.length - 12, 8)
  prefix.writeUInt32LE(content.length, 12)
  content.copy(prefix, 16)
  return { buffers: [prefix, ...packed], headerHash: sha(content) }
}

export async function bundleStationDesktop({ archive, resources, staging, runtimeVersion }) {
  if (runtimeVersion !== pin.version) throw new Error('Official Desktop and DSH Host must use the same pinned version')
  if (!archive) {
    archive = join(staging, 'official-desktop.zip')
    await exec('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3',
      '--connect-timeout', '15', '--max-time', '600', '--output', archive, pin.url])
  }
  if ((await stat(archive)).size !== pin.bytes) throw new Error('Official Desktop archive size mismatch')
  const hash = createHash('sha512')
  for await (const bytes of createReadStream(archive)) hash.update(bytes)
  if (hash.digest('base64') !== pin.sha512) throw new Error('Official Desktop archive SHA-512 mismatch')
  const originals = join(staging, 'official-desktop')
  await exec('/usr/bin/ditto', ['-x', '-k', archive, originals])
  const original = join(originals, 'DeepSeek Harness.app')
  if (!(await lstat(original)).isDirectory()) throw new Error('Official Desktop app is missing')
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', original])
  const { stderr } = await exec('/usr/bin/codesign', ['-dv', '--verbose=2', original])
  if (!stderr.split('\n').includes(`TeamIdentifier=${pin.signingTeam}`)) throw new Error('Official Desktop signing team mismatch')
  const desktop = join(resources, 'DSH Desktop.app')
  await rename(original, desktop)
  const contents = join(desktop, 'Contents'), desktopResources = join(contents, 'Resources')
  const plist = join(contents, 'Info.plist'), asar = join(desktopResources, 'app.asar')
  const { stdout } = await exec('/usr/bin/plutil', ['-extract', 'ElectronAsarIntegrity', 'json', '-o', '-', plist])
  const integrity = JSON.parse(stdout)
  const result = adaptArchive(await readFile(asar), integrity['Resources/app.asar'].hash)
  const file = await open(asar, 'w')
  try { for (const bytes of result.buffers) await file.writeFile(bytes) } finally { await file.close() }
  integrity['Resources/app.asar'].hash = result.headerHash
  await rm(join(desktopResources, 'app.asar.unpacked/dsh'), { recursive: true })
  await exec('/usr/bin/plutil', ['-replace', 'ElectronAsarIntegrity', '-json', JSON.stringify(integrity), plist])
  await exec('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.ghostagent.dsh-workflow-desktop', plist])
  await exec('/usr/bin/plutil', ['-replace', 'CFBundleURLTypes', '-json', '[]', plist])
  await rm(join(desktopResources, 'app-update.yml'))
  await mkdir(join(desktopResources, 'station-desktop'))
  await cp(join(resources, 'workflow/macos-launcher/runtime/desktop-client.mjs'), join(desktopResources, 'station-desktop/desktop-client.mjs'))
  await cp(join(resources, 'workflow/macos-launcher/runtime/service-control.mjs'), join(desktopResources, 'station-desktop/service-control.mjs'))
  await writeFile(join(desktopResources, 'station-desktop/source.json'), JSON.stringify(pin) + '\n', { flag: 'wx' })
  const primaryRuntime = join(desktopResources, 'runtime/primary-runtime')
  const { node: desktopNodeVersion, pnpm: desktopPnpmVersion } = JSON.parse(await readFile(join(primaryRuntime, 'runtime.json'), 'utf8'))
  const pnpm = JSON.parse(await readFile(join(desktop, desktopPnpmDirectory, 'package.json'), 'utf8'))
  if (pnpm.name !== 'pnpm' || !/^\d+\.\d+\.\d+$/.test(desktopPnpmVersion) || pnpm.version !== desktopPnpmVersion) {
    throw new Error('Official Desktop pnpm does not match its runtime manifest')
  }
  const desktopNode = join(primaryRuntime, 'dependencies/node/bin/node')
  const stationNode = join(resources, 'node')
  const version = await exec(desktopNode, ['--version'])
  if (version.stdout.trim() !== `v${desktopNodeVersion}`) throw new Error('Official Desktop Node does not match its runtime manifest')
  await rename(desktopNode, stationNode)
  await writeFile(desktopNode, `#!/bin/sh\nexec "$(dirname -- "$0")/${relative(dirname(desktopNode), stationNode)}" "$@"\n`, { mode: 0o755, flag: 'wx' })
  const cli = join(desktopResources, 'runtime/cli/bin/dsh')
  const stationCli = relative(desktopResources, join(resources, 'workflow/macos-launcher/runtime/desktop-cli.mjs'))
  await writeFile(cli, replaceDesktopAnchor(await readFile(cli, 'utf8'),
    'ELECTRON_RUN_AS_NODE=1 exec "$resources/../MacOS/DeepSeek Harness" --expose-internals "$resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" "$@"',
    `exec "$resources/${relative(desktopResources, stationNode)}" "$resources/${stationCli}" "$@"`))
  await exec('/usr/bin/codesign', ['--deep', '--force', '--sign', '-', desktop])
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', desktop])
  return desktop
}
