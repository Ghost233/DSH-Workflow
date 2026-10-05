// Supplemental runtime acceptance, not Flutter/SDK/native-window proof.
// Only this probe's own npm tarball and private Desktop profile are writable.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { checkPluginVersions } from '../../runtime/plugin-versions.mjs'
import { updateProfilePlugins } from '../../runtime/plugin-update.mjs'

const exec = promisify(execFile)
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
