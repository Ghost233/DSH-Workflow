import { cp, mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readPinnedBrowserHarness, stageBrowserHarnessSkills } from '../browser-harness-plugin/build.mjs'

const exec = promisify(execFile)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const ignored = path => path.split('/').some(part => ['test', 'tests', '.git', 'node_modules', '.DS_Store'].includes(part))
const scripts = ['dsh-launch-composition.mjs',
  'dsh-readiness.mjs', 'dsh-delivery-policy.mjs', 'project-entry-migration.mjs', 'stage-artifact-set.mjs', 'upstream-artifacts.mjs', 'native-bundle.mjs']
const candidateFiles = ['dsh-runtime.json', 'project-plugins.json', 'project-plugins.lock.json']

async function sources(root) {
  const files = ['package.json', 'dsh-runtime.json', 'default-startup-plugins.json', 'project-plugins.json', 'project-plugins.lock.json', 'project-mcp.json',
    'vendor/mattpocock-skills-zh.upstream.json', 'vendor/dsh-skills.upstream.json',
    'matt-skills-panel-plugin/upstream.json', 'matt-skills-panel-plugin/LICENSE', 'matt-skills-panel-plugin/THIRD_PARTY_NOTICES.md',
    ...scripts.map(name => `scripts/${name}`)]
  for (const directory of ['agent-observation-plugin', 'browser-harness-plugin', 'matt-skills-panel-plugin/package',
    'vendor/mattpocock-skills-zh', 'vendor/dsh-skills', 'skills']) files.push(directory)
  files.push(...(await readdir(join(root, 'macos-launcher/runtime'))).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(name => `macos-launcher/runtime/${name}`))
  for (const path of ['lib/index.js', 'lib/client.js', 'deck/registration/agent-row.js']) {
    if (!existsSync(join(root, 'matt-skills-panel-plugin/package', path))) throw new Error(`Missing MattSkillsDeck build output: ${path}`)
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
  const { blobs, ...browserHarness } = await readPinnedBrowserHarness(root)
  return { sourceCommit: stdout.trim(), files: await inventory(root, files), browserHarness }
}

export async function copyProjectIntegration(projectRoot, workflow, candidate) {
  const root = resolve(projectRoot)
  if (existsSync(workflow)) throw new Error('Refusing to overwrite a project layer')
  const input = await identity(root)
  await mkdir(workflow, { recursive: true })
  for (const name of await sources(root)) {
    await mkdir(dirname(join(workflow, name)), { recursive: true })
    await cp(join(root, name), join(workflow, name), { recursive: true, filter: path => !ignored(relative(root, path).replaceAll('\\', '/')) })
  }
  if (candidate) {
    for (const name of candidateFiles) await cp(join(candidate, name), join(workflow, name))
    input.candidate = await inventory(candidate, candidateFiles)
  }
  await stageBrowserHarnessSkills(root, workflow)
  const pkg = JSON.parse(await readFile(join(workflow, 'package.json'), 'utf8'))
  if (pkg.name !== 'dsh-workflow' || pkg.exports?.['./delivery-inventory'] !== './agent-observation-plugin/src/delivery-inventory.mjs'
    || pkg.exports?.['./client'] !== './agent-observation-plugin/client.js') throw new Error('Current project module contract is missing')
  // The project layer is independent of the frozen official Node/Desktop dependency tree.
  const manifest = { schema: 1, input, members: await inventory(workflow) }
  await writeFile(join(dirname(workflow), 'project-layer.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

export async function verifyProjectIntegration(projectRoot, workflow, candidate) {
  const manifest = JSON.parse(await readFile(join(dirname(workflow), 'project-layer.json'), 'utf8'))
  const input = await identity(resolve(projectRoot))
  if (candidate) input.candidate = await inventory(candidate, candidateFiles)
  if (manifest.schema !== 1 || JSON.stringify(manifest.input) !== JSON.stringify(input)
    || candidate && JSON.stringify(input.candidate) !== JSON.stringify(await inventory(workflow, candidateFiles))
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
