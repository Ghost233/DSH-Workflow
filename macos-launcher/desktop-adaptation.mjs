import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sha = value => createHash('sha256').update(value).digest('hex')
const frozenMainSha256 = '6f3d1ddd1106371452c2204be6dfb2e5460a8e8259cdd05cdccb5387b3f9a85a'
const root = fileURLToPath(new URL('../', import.meta.url))
const members = { 'workflow-desktop-client.mjs': 'desktop-client.mjs', 'service-control.mjs': 'service-control.mjs',
  'workflow-release.mjs': 'workflow-release.mjs' }

/** Only an owned, physical staging copy may receive the project Desktop adaptation. */
export async function assembleDesktopClient(application) {
  const app = resolve(application), resources = join(app, 'Contents/Resources'), lib = join(resources, 'app/lib')
  for (const directory of [app, resources, lib]) {
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) {
      throw new Error('Desktop adaptation requires a physical owned staging copy')
    }
  }
  const main = join(lib, 'main.js'), info = await lstat(main)
  if (!info.isFile() || info.nlink !== 1 || await realpath(main) !== main) throw new Error('Desktop main is not an owned staging file')
  const target = JSON.parse(await readFile(join(root, 'dsh-runtime.json'), 'utf8'))
  const { version: workflowVersion } = JSON.parse(await readFile(join(root, 'macos-launcher/package.json'), 'utf8'))
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(workflowVersion)) throw new Error('Invalid outer Workflow build version')
  const pkg = JSON.parse(await readFile(join(resources, 'app/package.json'), 'utf8'))
  if (pkg.version !== target.version || 'dshMandatoryUpdatePolicy' in pkg) throw new Error('Desktop does not match the fixed adaptation baseline')
  const inputs = Object.fromEntries(await Promise.all(Object.entries(members).map(async ([name, source]) =>
    [name, await readFile(join(root, 'macos-launcher/runtime', source))])))
  const path = join(resources, 'workflow-desktop-adaptation.json')
  const existing = await readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
  if (existing) {
    const manifest = JSON.parse(existing)
    if (manifest.schema !== 1 || manifest.workflowVersion !== workflowVersion || manifest.runtimeVersion !== target.version || manifest.upstreamCommit !== target.commit || manifest.upstreamMainSha256 !== frozenMainSha256
      || sha(await readFile(main)) !== manifest.mainSha256
      || Object.keys(manifest.members).length !== Object.keys(members).length) throw new Error('Desktop adaptation input has changed; rebuild the candidate')
    for (const [name, bytes] of Object.entries(inputs)) {
      if (manifest.members[name] !== sha(bytes) || sha(await readFile(join(lib, name))) !== sha(bytes)) throw new Error('Desktop adaptation module has changed; rebuild the candidate')
    }
    return manifest
  }
  const original = await readFile(main, 'utf8')
  if (sha(original) !== frozenMainSha256) throw new Error('Desktop main does not match the audited fixed upstream baseline')
  let adapted = original
  const changes = [
    ['new DesktopHostProcess(', 'new WorkflowDesktopConnection(', 1],
    ['new DesktopProjectManager(', 'new WorkflowReadOnlyProfile(', 2],
    ['new DesktopUpdateCoordinator(', 'new WorkflowDesktopUpdates(autoUpdater, ', 1],
    ['const openUpdatePrompt = (manual = false) => {', 'const openUpdatePrompt = (manual = false) => {\n\t\tpromptOperation ??= updates.check(true, { showMessage: options => ordinaryMessageBox(options), openExternal: url => shell.openExternal(url) }).then(() => {}).finally(() => { promptOperation = void 0; });\n\t\treturn promptOperation;', 1],
    ['inspect: () => backend.host?.inspectQuit()', 'inspect: async () => ({ activeTasks: false, scheduledTasks: false })', 1],
  ]
  for (const [before, after, count] of changes) {
    if (adapted.split(before).length !== count + 1) throw new Error('Desktop adaptation anchor differs from the audited baseline')
    adapted = adapted.replaceAll(before, after)
  }
  adapted = 'import { WorkflowDesktopConnection, WorkflowReadOnlyProfile, WorkflowDesktopUpdates } from "./workflow-desktop-client.mjs";\n' + adapted
  for (const [name, bytes] of Object.entries(inputs)) await writeFile(join(lib, name), bytes, { flag: 'wx', mode: 0o644 })
  await writeFile(main, adapted)
  const manifest = { schema: 1, workflowVersion, runtimeVersion: target.version, upstreamCommit: target.commit,
    upstreamMainSha256: frozenMainSha256, mainSha256: sha(adapted),
    members: Object.fromEntries(Object.entries(inputs).map(([name, bytes]) => [name, sha(bytes)])) }
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Pass the owned Desktop staging application')
  process.stdout.write(JSON.stringify(await assembleDesktopClient(process.argv[2])) + '\n')
}
