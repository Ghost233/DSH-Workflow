import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { bundleProjectPlugins } from '../bundle-plugins.mjs'
import { verifyPluginPayload } from './plugin-payload.mjs'

const exec = promisify(execFile)

test('a profile checklist ships without npm plugin archives or a registry lookup', async t => {
  const root = await mkdtemp(join(tmpdir(), 'station-checklist-payload-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workflow = join(root, 'workflow')
  await mkdir(workflow)
  const item = { package: 'owned-profile-fixture', version: '1.2.3', startup: true }
  const config = { registry: 'https://registry.npmjs.org/', npmStartup: 'profile', plugins: [item] }
  const bytes = JSON.stringify(config)
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.2.1-rc.2' }))
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, registry: config.registry,
    harnessVersion: '0.2.1-rc.2', manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    plugins: [{ ...item, metadata: { name: item.package, version: item.version } }] }))
  const run = (name, args, cwd) => {
    assert.equal(name, 'npm')
    assert.ok(['install', 'ci'].includes(args[0]))
    return exec(name, [...args, '--offline'], { cwd })
  }
  const payload = await bundleProjectPlugins({ resourcesRoot: root, run })
  assert.deepEqual(payload.plugins, [])
  assert.ok(!Object.keys(payload.members).some(path => path.includes(item.package)))
})

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

test('a newly published pinned plugin is found when the npm cache has older metadata', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-plugin-registry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), resources = join(root, 'resources'), workflow = join(resources, 'workflow'), cache = join(root, 'cache')
  await mkdir(source); await mkdir(workflow, { recursive: true })
  const name = 'workflow-registry-fixture', version = '1.2.3'
  const pkg = { name, version, type: 'module', exports: { '.': './host.mjs', './client': './client.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } }
  await writeFile(join(source, 'package.json'), JSON.stringify({ ...pkg, version: '1.2.2' }))
  await writeFile(join(source, 'host.mjs'), 'export function apply() {}\n')
  await writeFile(join(source, 'client.js'), 'export function apply() {}\n')
  await writeFile(join(source, 'cordis.patch.yml'), '[]\n')
  const pack = async () => {
    const output = JSON.parse((await exec('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { cwd: source })).stdout)
    return (Array.isArray(output) ? output : Object.values(output))[0]
  }
  const oldPacked = await pack()
  await writeFile(join(source, 'package.json'), JSON.stringify(pkg))
  const packed = await pack()
  const tarballs = new Map([[oldPacked.filename, await readFile(join(root, oldPacked.filename))], [packed.filename, await readFile(join(root, packed.filename))]])
  let published = false, requestsAfterPublish = 0, httpRegistry
  const server = createServer((request, response) => {
    if (request.url.startsWith(`/${name}/-/`)) {
      const tarball = tarballs.get(request.url.split('/').at(-1))
      response.writeHead(tarball ? 200 : 404, { 'content-type': 'application/octet-stream' }); response.end(tarball); return
    }
    if (request.url !== `/${name}`) { response.writeHead(404); response.end(); return }
    if (published) requestsAfterPublish++
    const old = { ...pkg, version: '1.2.2', dist: { tarball: `${httpRegistry}/${name}/-/${oldPacked.filename}`, integrity: oldPacked.integrity } }
    const current = { ...pkg, dist: { tarball: `${httpRegistry}/${name}/-/${packed.filename}`, integrity: packed.integrity } }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', etag: published ? '"new"' : '"old"' })
    response.end(JSON.stringify({ name, 'dist-tags': { latest: published ? version : old.version },
      versions: { [old.version]: old, ...(published ? { [version]: current } : {}) } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  httpRegistry = `http://127.0.0.1:${server.address().port}`
  const registry = httpRegistry.replace('http:', 'https:')
  const seed = join(root, 'seed'); await mkdir(seed)
  await exec('npm', ['pack', `${name}@1.2.2`, '--json', '--pack-destination', seed, '--prefer-offline', '--cache', cache, '--registry', httpRegistry])
  published = true
  const item = { package: name, version, source: 'npm', startup: true }, bytes = JSON.stringify({ registry, plugins: [item] })
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), '{"version":"0.2.1-rc.2"}')
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, registry, harnessVersion: '0.2.1-rc.2',
    manifestSha256: createHash('sha256').update(bytes).digest('hex'), plugins: [{ ...item, metadata: { name, version } }] }))
  // Keep the test registry local while the real manifest still passes its HTTPS-only validation.
  const run = (command, args, cwd) => exec(command, args.map(arg => arg === registry ? httpRegistry : arg), { cwd, maxBuffer: 1024 * 1024 })
  const payload = await bundleProjectPlugins({ resourcesRoot: resources, npmCache: cache, run })
  assert.equal(payload.plugins[0].version, version)
  assert.ok(requestsAfterPublish > 0, 'the published registry metadata was actually requested')
})
