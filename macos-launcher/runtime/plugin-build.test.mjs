import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bundleProjectPlugins } from '../bundle-plugins.mjs'
import { verifyPluginPayload } from './plugin-payload.mjs'

const exec = promisify(execFile)

for (const mode of ['full source', 'literal files', 'npm glob', 'root glob']) test(`the standard bundler seals a fixed Git package without lifecycle hooks (${mode})`, { timeout: 30_000 }, async t => {
  const sparse = mode === 'literal files'
  const root = await mkdtemp(join(tmpdir(), 'workflow-plugin-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), resources = join(root, 'resources'), workflow = join(resources, 'workflow')
  await mkdir(source); await mkdir(workflow, { recursive: true })
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'workflow-owned-build-fixture', version: '1.2.3', type: 'module',
    ...(mode === 'root glob' ? { files: ['**'] } : mode !== 'full source'
      ? { files: ['host.mjs', 'client.js', 'cordis.patch.yml', sparse ? 'runtime/version.mjs' : 'runtime/*.{mjs,json}'] } : {}),
    exports: { '.': './host.mjs', './client': './client.js' },
    scripts: { prepare: 'exit 99', postinstall: 'exit 98' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } }))
  await writeFile(join(source, 'host.mjs'), 'export {version} from "./runtime/version.mjs"; export function apply() {}\n')
  await writeFile(join(source, 'client.js'), 'export function apply() {}\n')
  await writeFile(join(source, 'cordis.patch.yml'), '[]\n')
  await mkdir(join(source, 'runtime')); await mkdir(join(source, 'not-shipped'))
  await writeFile(join(source, 'runtime/version.mjs'), 'export const version = "1.2.3"\n')
  await writeFile(join(source, 'not-shipped/development.md'), 'development data outside the package files')
  await exec('git', ['init', '--quiet', source])
  await exec('git', ['-C', source, 'add', '.'])
  await exec('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture'])
  const commit = (await exec('git', ['-C', source, 'rev-parse', 'HEAD'])).stdout.trim()
  const item = { package: 'workflow-owned-build-fixture', version: '1.2.3', source: 'git', repository: 'https://github.com/owned/build-fixture', commit, startup: true }
  const config = { registry: 'https://registry.npmjs.org/', plugins: [item] }, bytes = JSON.stringify(config)
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), '{"version":"0.2.1-rc.2"}')
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, registry: config.registry, harnessVersion: '0.2.1-rc.2',
    manifestSha256: createHash('sha256').update(bytes).digest('hex'), plugins: [{ ...item, metadata: { name: item.package, version: item.version } }] }))
  const run = async (name, args, cwd) => {
    // The real Git/npm tools consume only this owned fixture; no GitHub or registry request is needed.
    args = args.map(arg => arg === `${item.repository}.git` ? source : arg)
    const result = await exec(name, args, { cwd, maxBuffer: 1024 * 1024 })
    if (name === 'git' && args.includes('checkout') && sparse) {
      await assert.rejects(readFile(join(args[1], 'not-shipped/development.md')), { code: 'ENOENT' })
    }
    return result
  }
  const payload = await bundleProjectPlugins({ resourcesRoot: resources, run })
  assert.equal(payload.plugins[0].commit, commit)
  assert.equal(JSON.parse(await readFile(join(resources, 'plugins/node_modules', item.package, 'package.json'))).version, item.version)
  assert.ok(Object.keys(payload.members).includes('package-lock.json'))
  assert.equal(await readFile(join(resources, 'plugins/node_modules', item.package, 'runtime/version.mjs'), 'utf8'), 'export const version = "1.2.3"\n')
  assert.equal((await import(pathToFileURL(join(resources, 'plugins/node_modules', item.package, 'host.mjs')))).version, '1.2.3')
  await verifyPluginPayload(resources)
  await assert.rejects(bundleProjectPlugins({ resourcesRoot: resources, run }), { code: 'EEXIST' })
})
