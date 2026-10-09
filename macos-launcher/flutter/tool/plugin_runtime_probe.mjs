// Supplemental runtime acceptance, not Flutter/SDK/native-window proof.
// Only this probe's own npm tarball and private Desktop profile are writable.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { copyFile, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { checkPluginVersions } from '../../runtime/plugin-versions.mjs'
import { updateProfilePlugins } from '../../runtime/plugin-update.mjs'
import { startPluginRegistry, seedPluginProfile, pluginNames } from './plugin_registry_fixture.mjs'

const exec = promisify(execFile)
async function verifyLoadedPluginVersions(root, resources) {
  const helper = fileURLToPath(new URL('desktop_host_probe.mjs', import.meta.url))
  const child = spawn(`${resources}/node`, [helper, resources, `${root}/data`, `${root}/home`], {
    env: { ...process.env, DSH_HOME: `${root}/home` }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  let hostPid, output = ''
  const exited = new Promise(done => child.once('exit', done))
  const ready = new Promise((done, fail) => {
    createInterface({ input: child.stdout }).on('line', line => {
      output += line + '\n'
      const pid = /^HOST_PID=(\d+)$/.exec(line)
      if (pid) hostPid = Number(pid[1])
      if (line === 'HOST_READY') done()
    })
    createInterface({ input: child.stderr }).on('line', line => { output += line + '\n' })
    child.once('exit', code => fail(new Error(`Host before readiness exited ${code}`)))
  })
  try {
    await ready
    let receipt
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const current = JSON.parse(await readFile(`${root}/data/global/.dsh-workflow/desktop/desktop-host.json`, 'utf8'))
        if (current.pid === hostPid) { receipt = current; break }
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      await delay(100)
    }
    assert.ok(receipt, 'official Host publishes its actual ready receipt after IPC readiness')
    const login = await fetch(receipt.url, { redirect: 'manual', headers: { connection: 'close' } })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await login.arrayBuffer()
    const versions = []
    for (const [name, expected] of [[pluginNames[0], '1.2.0'], [pluginNames[1], '1.1.0']]) {
      const response = await fetch(new URL(`/t08-plugin/${name}`, receipt.url), { headers: { cookie, connection: 'close' } })
      const body = await response.text()
      assert.equal(response.status, 200, 'actual Host serves the self-owned endpoint')
      const value = JSON.parse(body)
      assert.equal(value.version, expected)
      assert.equal(value.hostPid, receipt.pid)
      versions.push(value)
    }
    await writeFile(`${root}/loaded-cold-profile.json`, JSON.stringify({ hostPid, hostLease: receipt.lease, versions }, null, 2))
  } finally {
    child.stdin.write('shutdown\n')
    const code = await exited
    await writeFile(`${root}/cold-host.log`, output + `HOST_HELPER_EXIT=${code}\n`)
    assert.equal(code, 0, 'owned Host acknowledges actual disposal and is reclaimed by its bounded owner contract')
  }
}

async function httpsProtocolProbe(source) {
  const root = await mkdtemp('/private/tmp/dsh-t08-protocol-')
  console.log(`ISOLATED_ROOT=${root}`)
  const resources = join(root, 'resources'), home = join(root, 'home')
  await mkdir(resources)
  for (const entry of ['node_modules', 'bin', 'node', 'desktop']) await symlink(join(source, entry), join(resources, entry))
  await cp(join(source, 'workflow'), join(resources, 'workflow'), { recursive: true })
  const ownRuntime = fileURLToPath(new URL('../../runtime/', import.meta.url))
  await cp(ownRuntime, join(resources, 'workflow/macos-launcher/runtime'), { recursive: true })
  const runtime = JSON.parse(await readFile(join(source, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
  const fixture = await startPluginRegistry(root, runtime.version)
  const env = { ...process.env, ...fixture.environment, DSH_HOME: home }
  const invoke = async (label, file, args = []) => {
    const result = await exec(join(resources, 'node'), [join(resources, 'workflow/macos-launcher/runtime', file), resources, ...args], { env, maxBuffer: 1024 * 1024 })
    await writeFile(join(root, `${label}.stdout`), result.stdout)
    await writeFile(join(root, `${label}.stderr`), result.stderr)
    await writeFile(join(root, `${label}.exit`), '0\n')
    return JSON.parse(result.stdout)
  }
  try {
    await seedPluginProfile({ root, resources, fixture })
    const checked = await invoke('check-initial', 'plugin-versions.mjs')
    const byName = Object.fromEntries(checked.rows.map(row => [row.name, row]))
    for (const name of pluginNames) {
      assert.equal(byName[name].current, '1.0.0')
      assert.equal(byName[name].latest, '1.1.0')
      assert.equal(byName[name].status, 'newer')
    }
    assert.ok(checked.rows.some(row => row.status === 'error'), 'unserved third-party registry queries remain visible failures')
    const selected = await invoke('selected', 'plugin-update.mjs', ['--only', pluginNames[0]])
    assert.deepEqual(selected.updated, [{ name: pluginNames[0], from: '1.0.0', to: '1.1.0' }])
    assert.equal(selected.error, undefined)
    assert.ok(selected.failedChecks > 0)
    await fixture.control({ latest: { [pluginNames[0]]: '1.2.0' } })
    const batch = await invoke('batch', 'plugin-update.mjs')
    assert.deepEqual(Object.fromEntries(batch.updated.map(row => [row.name, row.to])), { [pluginNames[0]]: '1.2.0', [pluginNames[1]]: '1.1.0' })
    assert.equal(batch.error, undefined)
    const observed = await invoke('check-after', 'plugin-versions.mjs')
    for (const [name, expected] of [[pluginNames[0], '1.2.0'], [pluginNames[1], '1.1.0']]) {
      assert.equal(observed.rows.find(row => row.name === name).current, expected)
    }
    assert.ok(fixture.facts.connects.includes('registry.npmjs.org:443'))
    assert.ok(fixture.facts.requests.some(request => request.path.includes('/-/1.2.0.tgz')))
    await verifyLoadedPluginVersions(root, resources)
    console.log(`PROTOCOL_RESULT=${JSON.stringify({ selected, batch, standardNetworkEnvironment: fixture.environment, facts: fixture.facts })}`)
    console.log('T08 PRODUCTION CLI HTTPS/PRIVATE CA/REAL TARBALL PROTOCOL PASSED; COLD HOST LOADED VERSIONS VERIFIED; GUI/NATIVE RELOAD NOT EXERCISED')
  } finally { await fixture.close() }
}

if (process.argv[2] === '--https') {
  if (!process.argv[3]) throw new Error('Pass --https immutable packaged resources')
  await httpsProtocolProbe(resolve(process.argv[3]))
  process.exit(0)
}

const [sourceResources] = process.argv.slice(2)
if (!sourceResources) throw new Error('Pass immutable packaged application resources')
const source = resolve(sourceResources)
const root = await mkdtemp('/private/tmp/dsh-t08-plugin-runtime-')
const resources = join(root, 'resources'), home = join(root, 'home')
const profile = join(home, 'profiles/desktop')
const name = 'dsh-t08-owned-plugin', other = 'dsh-t08-other-plugin'
const runtime = JSON.parse(await readFile(join(source, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
assert.equal(runtime.name, '@deepseek-ai/dsh')
console.log(`ISOLATED_ROOT=${root}`)
await mkdir(resources)
await mkdir(join(resources, 'desktop/DeepSeek Harness.app'), { recursive: true })
for (const packageName of [name, other]) await mkdir(join(profile, 'node_modules', packageName), { recursive: true })
for (const entry of ['node_modules', 'bin', 'node']) {
  await symlink(join(source, entry), join(resources, entry))
}
const workflow = fileURLToPath(new URL('../../../', import.meta.url))
const stagedWorkflow = join(resources, 'workflow')
await mkdir(join(stagedWorkflow, 'macos-launcher/runtime'), { recursive: true })
await mkdir(join(stagedWorkflow, 'scripts'), { recursive: true })
await mkdir(join(stagedWorkflow, 'matt-skills-panel-plugin/package'), { recursive: true })
for (const entry of ['macos-launcher/runtime/run-dsh.mjs', 'scripts/project-plugins.mjs',
  'scripts/project-plugin-resolver.mjs', 'scripts/harness-runtime.mjs', 'dsh-runtime.json']) {
  await copyFile(join(workflow, entry), join(stagedWorkflow, entry))
}
const manifest = (version, packageName = name) => ({ name: packageName, version, type: 'module',
  dsh: { bundle: { patch: './cordis.patch.yml' }, compatibility: { dshReleases: { [runtime.version]: 'compatible' } } } })
const profileManifest = { name: 'dsh-profile-desktop', private: true,
  dependencies: { [name]: '1.0.0', [other]: '1.0.0' }, dsh: { profile: { bundles: [name, other] } } }
await writeFile(join(profile, 'package.json'), JSON.stringify(profileManifest))
for (const packageName of [name, other]) {
  await writeFile(join(profile, 'node_modules', packageName, 'package.json'), JSON.stringify(manifest('1.0.0', packageName)))
  await writeFile(join(profile, 'node_modules', packageName, 'cordis.patch.yml'), '[]\n')
}
const archives = new Map()
for (const [packageName, version] of [[name, '1.0.0'], [name, '1.1.0'], [name, '1.2.0'], [name, '1.3.0'], [other, '1.0.0'], [other, '1.1.0']]) {
  const directory = join(root, `${packageName}-${version}`)
  await mkdir(join(directory, 'package'), { recursive: true })
  await writeFile(join(directory, 'package/package.json'), JSON.stringify(manifest(version, packageName)))
  await writeFile(join(directory, 'package/cordis.patch.yml'), '[]\n')
  const archive = join(directory, 'plugin.tgz')
  await exec('/usr/bin/tar', ['-czf', archive, '-C', directory, 'package'])
  const bytes = await readFile(archive)
  archives.set(`${packageName}@${version}`, { bytes,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex') })
}
const latest = new Map([[name, '1.1.0'], [other, '1.1.0']])
const requests = []
let failMetadata = false, failInstall = false
const registry = createServer((request, response) => {
  requests.push(request.url)
  const [packageName, part, archiveName] = request.url.slice(1).split('/')
  const version = part === '-' ? archiveName.replace('.tgz', '') : part
  if (part === '-' && archives.has(`${packageName}@${version}`)) {
    response.setHeader('Content-Type', 'application/octet-stream')
    response.end(archives.get(`${packageName}@${version}`).bytes)
  } else if (latest.has(packageName) && !(failMetadata && packageName === other)) {
    const published = [...archives].filter(([key]) => key.startsWith(`${packageName}@`) && !(failInstall && key === `${name}@1.3.0`)).map(([key, archive]) => {
      const publishedVersion = key.split('@').at(-1)
      return [publishedVersion, { ...manifest(publishedVersion, packageName), dist: {
        tarball: `http://127.0.0.1:${registry.address().port}/${packageName}/-/${publishedVersion}.tgz`,
        integrity: archive.integrity, shasum: archive.shasum,
      } }]
    })
    const versions = Object.fromEntries(published)
    response.setHeader('Content-Type', 'application/json')
    if (version && !versions[version]) { response.statusCode = 404; response.end(JSON.stringify({ error: 'owned version intentionally unavailable' })); return }
    response.end(JSON.stringify(version ? versions[version] : {
      name: packageName, 'dist-tags': { latest: latest.get(packageName) }, versions,
    }))
  } else {
    response.statusCode = failMetadata && packageName === other ? 503 : 404
    response.end(JSON.stringify({ error: 'owned registry intentionally unavailable for this package' }))
  }
})
await new Promise(done => registry.listen(0, '127.0.0.1', done))
const endpoint = `http://127.0.0.1:${registry.address().port}/`
const userconfig = join(root, 'npmrc')
await writeFile(userconfig, `registry=${endpoint}\nstore-dir=${root}/store\ncache=${root}/cache\n`)
// Standard package-manager configuration is inherited by the actual DSH CLI.
Object.assign(process.env, { npm_config_registry: endpoint, npm_config_userconfig: userconfig,
  npm_config_store_dir: join(root, 'store'), npm_config_cache: join(root, 'cache'), npm_config_fetch_retries: '0',
  XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'xdg-data'),
  XDG_STATE_HOME: join(root, 'xdg-state'), PNPM_HOME: join(root, 'pnpm-home') })
const check = options => checkPluginVersions({ ...options, fetchLatest: async packageName => {
  const response = await fetch(new URL(encodeURIComponent(packageName), endpoint))
  if (!response.ok) throw new Error(`owned registry HTTP ${response.status}`)
  const metadata = await response.json()
  assert.equal(metadata.name, packageName)
  return metadata['dist-tags'].latest
} })
const evidence = []
const installedVersion = async packageName => {
  try { return JSON.parse(await readFile(join(profile, 'node_modules', packageName, 'package.json'), 'utf8')).version }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
const save = async (scenario, result) => {
  console.log(`${scenario.toUpperCase()}_RESULT=${JSON.stringify(result)}`)
  evidence.push({ scenario, result, installed: { [name]: await installedVersion(name), [other]: await installedVersion(other) } })
  await writeFile(join(root, 'evidence.json'), JSON.stringify({ sourceResources: source,
    runtimeVersion: runtime.version, registry: endpoint, registryRequests: requests,
    archives: Object.fromEntries([...archives].map(([key, value]) => [key, value.integrity])), evidence }, null, 2))
}
try {
  const selected = await updateProfilePlugins({ resourcesRoot: resources, home, only: [name], check })
  await save('selected', selected)
  assert.equal(selected.error, undefined, 'the real packaged DSH updater accepts its existing Desktop profile')
  assert.deepEqual(selected.updated, [{ name, from: '1.0.0', to: '1.1.0' }])
  assert.equal(await installedVersion(other), '1.0.0', 'single selection leaves the other actual package unchanged')
  assert.ok(requests.includes(`/${name}/-/1.1.0.tgz`), 'real package manager fetched the owned tarball')

  latest.set(name, '1.2.0')
  const batch = await updateProfilePlugins({ resourcesRoot: resources, home, check })
  await save('batch', batch)
  assert.equal(batch.error, undefined)
  assert.deepEqual(Object.fromEntries(batch.updated.map(row => [row.name, { from: row.from, to: row.to }])), {
    [name]: { from: '1.1.0', to: '1.2.0' }, [other]: { from: '1.0.0', to: '1.1.0' },
  })
  assert.equal(await installedVersion(name), '1.2.0')
  assert.equal(await installedVersion(other), '1.1.0')

  failMetadata = true
  const partiallyChecked = await updateProfilePlugins({ resourcesRoot: resources, home, check })
  await save('partial-check', partiallyChecked)
  assert.equal(partiallyChecked.failedChecks, 1, 'the actual failing registry response remains an incomplete check')
  assert.deepEqual(partiallyChecked.updated, [])
  failMetadata = false

  latest.set(name, '1.3.0')
  failInstall = true
  const failed = await updateProfilePlugins({ resourcesRoot: resources, home, only: [name], check })
  await save('install-failure', failed)
  assert.match(failed.error, /ERR_PNPM_NO_MATCHING_VERSION|No matching version/u, 'the actual package-manager failure is returned with diagnostics')
  assert.deepEqual(failed.updated, [])
  assert.notEqual(await installedVersion(name), '1.3.0', 'unavailable self-owned version is never reported or observed as installed')
  console.log('T08 OWNED PLUGIN RUNTIME SELECTED/BATCH/CHECK/INSTALL FAILURE PASSED; UI/SDK/NATIVE/RELOAD NOT EXERCISED')
} finally {
  await new Promise(done => registry.close(done))
}
