import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, access, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { acquireLock, releaseLock, prepare, pluginDirectory } from './project-plugins.mjs'
import { installProjectResolver } from './project-plugin-resolver.mjs'
import { target as harnessTarget } from './harness-runtime.mjs'

const exec = promisify(execFile)
const writeJson = (path, value) => writeFile(path, JSON.stringify(value))
async function pkg(directory, manifest, source = 'export const name = "fixture"') {
  await mkdir(directory, { recursive: true })
  await writeJson(join(directory, 'package.json'), { type: 'module', main: 'index.js', exports: { '.': './index.js', './package.json': './package.json', './client': './client.js' }, ...manifest })
  await writeFile(join(directory, 'index.js'), source)
  await writeFile(join(directory, 'client.js'), '// prebuilt fixture')
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-plugins-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const list = JSON.parse(await readFile(new URL('../project-plugins.json', import.meta.url), 'utf8'))
  await writeJson(join(root, 'project-plugins.json'), list)
  await pkg(root, { name: 'dsh-owner-workflow', version: '1.0.0', dsh: { client: { platform: 'web' } } })
  await pkg(join(root, 'sol-efficiency-plugin'), { name: 'dsh-sol-efficiency', version: '1.0.0', dsh: { client: { platform: 'web' } } })
  const harness = join(root, 'harness')
  await pkg(harness, { name: '@deepseek-ai/dsh', version: harnessTarget.version, dependencies: { '@deepseek-ai/dsh-app-boot': '1.0.0' } })
  const anchor = join(harness, 'package.json')
  const boot = join(harness, 'node_modules', '@deepseek-ai/dsh-app-boot')
  await pkg(boot, { name: '@deepseek-ai/dsh-app-boot', version: '1.0.0' }, `
    import {readFileSync} from 'node:fs';
    export const loadProfile = () => ({layers: [{patches: [{insert: [{id:'dsh-context',name:'dsh-context'}]}]}],patches:[]});
    export const composeEntries = layers => layers.flat(2).flatMap(x=>x.insert ?? []);
    export const loadOverlayPatches = (_name,path) => JSON.parse(readFileSync(path,'utf8'));
  `)
  const calls = []
  const run = async (executable, args, options) => {
    calls.push(args[1])
    assert.equal(executable, 'pnpm')
    assert.equal(options.cwd, pluginDirectory(root))
    assert.ok(args.includes('--save-exact'))
    assert.ok(args.includes('https://registry.npmjs.org/'))
    const spec = args[1]
    const name = spec.slice(0, spec.lastIndexOf('@'))
    const version = spec.includes('@git+') ? '1.0.0' : spec.slice(spec.lastIndexOf('@') + 1)
    const packagePath = join(options.cwd, 'package.json')
    const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'))
    packageManifest.dependencies[name] = spec.slice(spec.lastIndexOf('@') + 1)
    await writeJson(packagePath, packageManifest)
    const entry = list.plugins.find(item => item.package === name)
    const target = join(options.cwd, 'node_modules', name)
    await pkg(target, { name, version, dsh: { ...(entry.bundle === 'entry' ? {} : { bundle: { patch: './cordis.patch.yml' } }), client: { platform: 'web' } } })
    await writeJson(join(target, 'cordis.patch.yml'), [{ insert: [{ id: entry.entryId, name }] }])
    const semver = join(options.cwd, 'node_modules', 'semver')
    await mkdir(semver, { recursive: true })
    await writeJson(join(semver, 'package.json'), { name:'semver', main:'index.cjs' })
    await writeFile(join(semver, 'index.cjs'), 'exports.satisfies = () => true')
  }
  return { root, home: join(root, 'home'), anchor, list, calls, run, update: true,
    readMetadata: async item => ({ name: item.package, dsh: { client: { inject: [] } } }),
    resolvePackage: async item => item.source === 'git' ? { commit: 'a'.repeat(40) } : { version: '1.0.0' } }
}

async function withGitPlugin(f) {
  const item = { package: 'fixture-git-plugin', version: 'latest', source: 'git', ref: 'main',
    entryId: 'fixture-git-plugin', repository: 'https://github.com/example/fixture-git-plugin' }
  f.list.plugins.splice(1, 0, item)
  await writeJson(join(f.root, 'project-plugins.json'), f.list)
}

test('ordered latest resolution, project-local install, patch publication and profile deduplication', async t => {
  const f = await fixture(t)
  const state = await prepare(f.root, f.anchor, process.pid, f)
  assert.deepEqual(f.calls, f.list.plugins.map(p => p.source === 'git' ? `${p.package}@git+${p.repository}.git#${'a'.repeat(40)}` : `${p.package}@1.0.0`))
  assert.ok(state.installed.filter(p => p.source === 'git').every(p => p.commit === 'a'.repeat(40)))
  const patch = JSON.parse(await readFile(state.patch, 'utf8'))
  assert.deepEqual(patch.flatMap(item => item.insert?.map(row => row.name) ?? []), f.list.plugins.map(p=>p.package))
  assert.ok(patch.some(row=>row.id === 'dsh-context' && row.disabled))
  const workspace = await readFile(join(state.directory, 'pnpm-workspace.yaml'), 'utf8')
  assert.match(workspace, /autoInstallPeers: false/)
  assert.match(workspace, /node-pty: true/)
  await assert.rejects(acquireLock(state.directory, process.pid), /正在被启动进程/)
  await releaseLock(state.directory, process.pid)
  await writeFile(join(state.directory, 'pnpm-workspace.yaml'), workspace + '# explicit user approvals must survive\n')
  const next = await prepare(f.root, f.anchor, process.pid, { ...f, resolvePackage: async item => item.source === 'git' ? { commit: 'b'.repeat(40) } : { version: '1.0.1' } })
  assert.ok(next.installed.filter(p => p.source !== 'project').every(p => p.source === 'git' ? p.commit === 'b'.repeat(40) : p.version === '1.0.1'))
  assert.match(await readFile(join(state.directory, 'pnpm-workspace.yaml'), 'utf8'), /explicit user approvals must survive/)
  await releaseLock(state.directory, process.pid)
})

test('failed second installation stops the sequence, releases lock and never publishes launch state', async t => {
  const f = await fixture(t)
  await withGitPlugin(f)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    if (args[1][1].startsWith('fixture-git-plugin@')) throw new Error('network failure')
    return f.run(...args)
  } }), /network failure/)
  assert.deepEqual(f.calls, ['dsh-context@1.0.0'])
  await assert.rejects(access(join(pluginDirectory(f.root), 'launch.json')))
  await acquireLock(pluginDirectory(f.root), process.pid)
  await releaseLock(pluginDirectory(f.root), process.pid)
})

test('missing build artifact fails closed even when the package manager reports success', async t => {
  const f = await fixture(t)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    await f.run(...args)
    await rm(join(pluginDirectory(f.root), 'node_modules', 'dsh-context', 'client.js'))
  } }), /ENOENT|Cannot find module/)
  assert.equal(f.calls.length, 1)
})

test('Git build approval failure stops before subsequent plugins without npm fallback', async t => {
  const f = await fixture(t)
  await withGitPlugin(f)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    if (args[1][1].startsWith('fixture-git-plugin@git+')) throw new Error('Git prepare requires allowBuilds approval')
    return f.run(...args)
  } }), /requires allowBuilds approval/)
  assert.equal(f.calls.length, 1)
  await assert.rejects(access(join(pluginDirectory(f.root), 'launch.json')))
  await assert.rejects(access(join(pluginDirectory(f.root), 'startup.lock')))
})

test('invalid Git revision rejects the package before installation', async t => {
  const f = await fixture(t)
  await withGitPlugin(f)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, resolvePackage: async item => item.source === 'git' ? { commit: 'main' } : { version: '1.0.0' } }), /Invalid plugin revision/)
  assert.equal(f.calls.length, 0)
})

test('installed Git package must still match the configured identity', async t => {
  const f = await fixture(t)
  await withGitPlugin(f)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    await f.run(...args)
    if (!args[1][1].startsWith('fixture-git-plugin@git+')) return
    const path = join(pluginDirectory(f.root), 'node_modules', 'fixture-git-plugin', 'package.json')
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    await writeJson(path, { ...manifest, name: 'unrelated-plugin' })
  } }), /Installed version mismatch/)
  assert.equal(f.calls.length, 2)
})

test('missing legacy bundle needs an explicit adapter', async t => {
  const f = await fixture(t)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    await f.run(...args)
    const path = join(pluginDirectory(f.root), 'node_modules', 'dsh-context', 'package.json')
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    delete manifest.dsh.bundle
    await writeJson(path, manifest)
  } }), /Missing DSH bundle/)
  assert.equal(f.calls.length, 1)
})

test('required predecessor is validated before any installation', async t => {
  const f = await fixture(t)
  f.list.plugins.at(-1).requires = ['missing-plugin']
  await writeJson(join(f.root, 'project-plugins.json'), f.list)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, f), /Required plugin must precede/)
  assert.equal(f.calls.length, 0)
})

test('all installs finish before host compatibility check; missing peers block publication', async t => {
  const f = await fixture(t)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async (...args) => {
    await f.run(...args)
    if (!args[1][1].startsWith('dsh-context@')) return
    const path = join(pluginDirectory(f.root), 'node_modules', 'dsh-context', 'package.json')
    const manifest = JSON.parse(await readFile(path,'utf8'))
    manifest.peerDependencies = {'@deepseek-ai/new-host-service':'>=0.1.5-rc.1'}
    await writeJson(path, manifest)
  } }), /当前 Harness 不兼容/)
  assert.equal(f.calls.length,f.list.plugins.length)
  await assert.rejects(access(join(pluginDirectory(f.root),'launch.json')))
  await assert.rejects(access(join(pluginDirectory(f.root),'installed.json')))
})

test('resolver supports Node ESM/CommonJS, browser package.json lookup, and one shared host peer instance', async t => {
  const f = await fixture(t)
  const state = await prepare(f.root, f.anchor, process.pid, f)
  const core = join(f.root, 'core')
  await pkg(core, {name:'@deepseek-ai/fixture-core',version:'1.0.0'}, 'export const identity = {}')
  const commonjsCore = join(f.root, 'commonjs-core')
  await pkg(commonjsCore, {name:'@deepseek-ai/fixture-commonjs-core',version:'1.0.0',type:'commonjs',main:'index.cjs',exports:{'.':'./index.cjs','./package.json':'./package.json'}})
  await writeFile(join(commonjsCore, 'index.cjs'), 'module.exports = { identity: {} }\n')
  const consumer = join(state.directory, 'node_modules', 'dsh-context', 'consumer.mjs')
  await writeFile(consumer, 'export {identity} from "@deepseek-ai/fixture-core"')
  state.hostPackages['@deepseek-ai/fixture-core'] = core
  state.hostPackages['@deepseek-ai/fixture-commonjs-core'] = commonjsCore
  const hooks = installProjectResolver(state)
  try {
    const {stdout} = await exec(process.execPath, ['--input-type=module', '-e', `import {createRequire} from 'node:module'; console.log(createRequire(${JSON.stringify(join(f.root, 'unrelated-profile', 'package.json'))}).resolve('dsh-context/package.json'))`], {env:{...process.env,NODE_PATH:join(state.directory,'node_modules')}})
    assert.equal(await realpath(stdout.trim()), await realpath(join(state.packages['dsh-context'], 'package.json')))
    const actual = await import(pathToFileURL(consumer))
    const expected = await import(pathToFileURL(join(core,'index.js')))
    assert.equal(actual.identity, expected.identity)
    const commonjsConsumer = join(state.directory, 'node_modules', 'dsh-context', 'consumer.cjs')
    await writeFile(commonjsConsumer, 'module.exports = require("@deepseek-ai/fixture-commonjs-core")\n')
    const commonjs = createRequire(commonjsConsumer)(commonjsConsumer)
    assert.deepEqual(commonjs, { identity: {} })
  } finally { hooks.deregister(); await releaseLock(state.directory, process.pid) }
})

test('run keeps original CLI args and inserts --patch before web app options', async t => {
  const f = await fixture(t)
  const state = await prepare(f.root, f.anchor, process.pid, f)
  await mkdir(join(f.root, 'harness', 'lib'), {recursive:true})
  await writeFile(join(f.root, 'harness', 'lib', 'bin.js'), 'export async function runCli() { console.log(JSON.stringify(process.argv.slice(2))) }')
  const {stdout} = await exec(process.execPath, [fileURLToPath(new URL('./project-plugins.mjs', import.meta.url)), 'run', f.root, 'web', '--no-open', '--port', '9876'], {env:{...process.env,DSH_HOME:f.home,NODE_PATH:join(state.directory,'node_modules')}})
  assert.deepEqual(JSON.parse(stdout), ['web', '--patch', state.patch, '--no-open', '--port', '9876'])
  await releaseLock(state.directory, process.pid)
})

test('failed refresh invalidates previous launch; state stores facts only', async t => {
  const f = await fixture(t)
  const state = await prepare(f.root, f.anchor, process.pid, f)
  const saved = JSON.parse(await readFile(join(state.directory, 'launch.json'), 'utf8'))
  assert.deepEqual(Object.keys(saved).sort(), ['anchor', 'installed'])
  await releaseLock(state.directory, process.pid)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, run: async () => { throw new Error('refresh failed') } }), /refresh failed/)
  await assert.rejects(access(join(state.directory, 'launch.json')))
  await assert.rejects(access(join(state.directory, 'startup.lock')))
})

test('ordinary startup reuses pinned versions without network resolution or reinstalling complete packages', async t => {
  const f = await fixture(t)
  const first = await prepare(f.root, f.anchor, process.pid, f)
  await releaseLock(first.directory, process.pid)
  const lockBefore = await readFile(join(f.root, 'project-plugins.lock.json'), 'utf8')
  const next = await prepare(f.root, f.anchor, process.pid, { ...f, update: false,
    resolvePackage: async () => { throw new Error('Must not resolve moving refs during startup') },
    run: async () => { throw new Error('Must not reinstall complete pinned packages') },
  })
  assert.deepEqual(next.installed, first.installed)
  assert.equal(await readFile(join(f.root, 'project-plugins.lock.json'), 'utf8'), lockBefore)
  await releaseLock(next.directory, process.pid)
})

test('missing pins, changed manifest and wrong host version fail before package mutation', async t => {
  const f = await fixture(t)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, update: false }), /ENOENT/)
  const initial = await prepare(f.root, f.anchor, process.pid, f)
  await releaseLock(initial.directory, process.pid)
  f.list.plugins[0].version = 'different-channel'
  await writeJson(join(f.root, 'project-plugins.json'), f.list)
  const calls = f.calls.length
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, update: false }), /lock does not match/)
  const host = JSON.parse(await readFile(f.anchor, 'utf8'))
  await writeJson(f.anchor, { ...host, version: '0.1.0-rc.8' })
  await assert.rejects(prepare(f.root, f.anchor, process.pid, f), /Unsupported Harness/)
  assert.equal(f.calls.length, calls)
})

test('a removed client module is rejected from pinned metadata before installing any external code', async t => {
  const f = await fixture(t)
  const first = await prepare(f.root, f.anchor, process.pid, f)
  await releaseLock(first.directory, process.pid)
  const path = join(f.root, 'project-plugins.lock.json')
  const lock = JSON.parse(await readFile(path, 'utf8'))
  lock.plugins[1].metadata = { dsh: { client: { inject: ['@deepseek-ai/dsh-client-runtime'] } } }
  await writeJson(path, lock)
  const calls = f.calls.length
  await assert.rejects(prepare(f.root, f.anchor, process.pid, { ...f, update: false }), /安装前已停止.*\n.*dsh-client-runtime/)
  assert.equal(f.calls.length, calls)
})

// Imported late only to keep the fixture helpers above compact.
import { fileURLToPath } from 'node:url'

test('owned scope preserves the external lock and excludes configured third-party profile entries without installation', async t => {
  const f = await fixture(t)
  await prepare(f.root, f.anchor, process.pid, f)
  await releaseLock(pluginDirectory(f.root), process.pid)
  const lock = await readFile(join(f.root, 'project-plugins.lock.json'), 'utf8')
  const state = await prepare(f.root, f.anchor, process.pid, { ...f, update: false, scope: 'owned',
    run: async () => { throw new Error('unexpected installation') },
    readMetadata: async () => { throw new Error('unexpected metadata fetch') },
    resolvePackage: async () => { throw new Error('unexpected package resolution') },
  })
  assert.deepEqual(state.installed.map(item => item.package).sort(), ['dsh-owner-workflow', 'dsh-sol-efficiency'])
  assert.equal(await readFile(join(f.root, 'project-plugins.lock.json'), 'utf8'), lock)
  const patch = JSON.parse(await readFile(state.patch, 'utf8'))
  assert.ok(patch.some(row => row.id === 'dsh-context' && row.disabled === true))
  assert.equal(patch.some(row => row.insert), false)
  await releaseLock(pluginDirectory(f.root), process.pid)
})

test('owned scope ignores unrelated third-party resolution settings while excluding their profile rows', async t => {
  const f = await fixture(t)
  f.list.registry = 'not-a-registry'
  f.list.plugins[0].version = 'invalid version'
  f.list.plugins[0].requires = ['unknown-plugin']
  await writeJson(join(f.root, 'project-plugins.json'), f.list)
  await assert.rejects(prepare(f.root, f.anchor, process.pid, f), /Invalid or duplicate plugin list entry/)
  const state = await prepare(f.root, f.anchor, process.pid, { ...f, scope: 'owned', update: false,
    run: async () => { throw new Error('unexpected installation') } })
  assert.deepEqual(state.installed.map(item => item.package).sort(), ['dsh-owner-workflow', 'dsh-sol-efficiency'])
  const patch = JSON.parse(await readFile(state.patch, 'utf8'))
  assert.ok(patch.some(row => row.id === 'dsh-context' && row.disabled === true))
  await releaseLock(pluginDirectory(f.root), process.pid)
})
