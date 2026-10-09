import { cp, mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const ignored = path => path.split('/').some(part => ['test', 'tests', '.git', 'node_modules'].includes(part))
const scripts = ['project-plugins.mjs', 'project-plugin-resolver.mjs', 'harness-runtime.mjs', 'dsh-launch-composition.mjs',
  'dsh-readiness.mjs', 'observation-profile.mjs', 'web-host-lifecycle.mjs']

async function sources(root) {
  const files = ['package.json', 'dsh-runtime.json', 'project-plugins.json', 'project-plugins.lock.json', 'project-mcp.json',
    'vendor/mattpocock-skills-zh.upstream.json', 'matt-skills-panel-plugin/upstream.json',
    'matt-skills-panel-plugin/LICENSE', 'matt-skills-panel-plugin/THIRD_PARTY_NOTICES.md',
    ...scripts.map(name => `scripts/${name}`)]
  for (const directory of ['agent-observation-plugin', 'vendor/mattpocock-skills-zh', 'matt-skills-panel-plugin/package']) files.push(directory)
  files.push(...(await readdir(join(root, 'macos-launcher/runtime'))).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(name => `macos-launcher/runtime/${name}`))
  for (const name of ['lib/index.js', 'lib/client.js', 'lib/bootstrap.js']) {
    if (!existsSync(join(root, 'matt-skills-panel-plugin/package', name))) throw new Error('Build the current maintained Matt package before staging')
  }
  return files
}

async function inventory(root, selections = ['']) {
  const members = {}
  async function visit(name) {
    if (ignored(name)) return
    const path = join(root, name), info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Project resource symlink is not a sealed file: ${name}`)
    if (info.isDirectory()) {
      if (name) members[name + '/'] = { directory: true }
      for (const child of (await readdir(path)).sort()) await visit(name ? `${name}/${child}` : child)
    } else if (info.isFile()) members[name] = { mode: info.mode & 0o777, sha256: sha(await readFile(path)) }
    else throw new Error(`Unsupported project resource: ${name}`)
  }
  for (const name of selections) await visit(name)
  return Object.fromEntries(Object.entries(members).sort(([a], [b]) => a.localeCompare(b)))
}

async function identity(root) {
  const { stdout } = await exec('git', ['-C', root, 'rev-parse', 'HEAD'])
  const files = await sources(root)
  return { sourceCommit: stdout.trim(), files: await inventory(root, files),
    mattBuildInputs: Object.fromEntries(await Promise.all(['package.json', 'package-lock.json', 'upstream.json'].map(async name =>
      [name, sha(await readFile(join(root, 'matt-skills-panel-plugin', name)))]))) }
}

export async function copyProjectIntegration(projectRoot, workflow) {
  const root = resolve(projectRoot)
  if (existsSync(workflow)) throw new Error('Refusing to overwrite a project layer')
  const input = await identity(root)
  await mkdir(workflow, { recursive: true })
  for (const name of await sources(root)) {
    await mkdir(dirname(join(workflow, name)), { recursive: true })
    await cp(join(root, name), join(workflow, name), { recursive: true, filter: path => !ignored(relative(root, path).replaceAll('\\', '/')) })
  }
  const pkg = JSON.parse(await readFile(join(workflow, 'package.json'), 'utf8'))
  if (pkg.name !== 'dsh-workflow' || pkg.exports?.['./jev-center'] !== './agent-observation-plugin/src/jev-center-plugin.mjs'
    || pkg.exports?.['./agent-monitor'] !== './agent-observation-plugin/src/agent-monitor-plugin.mjs') throw new Error('Current project module contract is missing')
  // The project layer is independent of the frozen official Node/Desktop dependency tree.
  const manifest = { schema: 1, input, members: await inventory(workflow) }
  await writeFile(join(dirname(workflow), 'project-layer.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

export async function verifyProjectIntegration(projectRoot, workflow) {
  const manifest = JSON.parse(await readFile(join(dirname(workflow), 'project-layer.json'), 'utf8'))
  if (manifest.schema !== 1 || JSON.stringify(manifest.input) !== JSON.stringify(await identity(resolve(projectRoot)))
    || JSON.stringify(manifest.members) !== JSON.stringify(await inventory(workflow))) {
    throw new Error('Project layer does not match the current candidate input and complete membership')
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, root, workflow, destination] = process.argv.slice(2)
  if (operation === 'create') await copyProjectIntegration(root, workflow)
  else if (operation === 'verify') await verifyProjectIntegration(root, workflow)
  else if (operation === 'restore') {
    const manifest = await verifyProjectIntegration(root, workflow)
    if (existsSync(destination)) throw new Error('Refusing to overwrite a project layer')
    await cp(workflow, destination, { recursive: true })
    await writeFile(join(dirname(destination), 'project-layer.json'), JSON.stringify(manifest, null, 2) + '\n')
    await verifyProjectIntegration(root, destination)
  } else throw new Error('Use create|verify|restore ROOT WORKFLOW [DESTINATION]')
}
