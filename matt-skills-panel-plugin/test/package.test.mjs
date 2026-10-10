import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createBootstrap } from '../package/lib/bootstrap.js'
import host from '../package/lib/index.js'
import * as tools from '../package/lib/platform/deckToolsRow.js'
import { createUpdatePhoneHandlers } from '../package/lib/updateFromPackage.js'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('the derived package has its own host, client and tools identity', () => {
  const manifest = JSON.parse(read('package/package.json'))
  assert.equal(manifest.name, 'dsh-workflow-matt-panel')
  assert.equal(manifest.version, JSON.parse(read('package.json')).version)
  const require = createRequire(new URL('package/package.json', root))
  assert.equal(require.resolve(manifest.name), fileURLToPath(new URL('package/lib/index.js', root)))
  assert.equal(host.name, manifest.name)
  assert.equal(typeof host.apply, 'function')
  assert.equal(tools.name, `${manifest.name}-tools`)
  let client
  vm.runInNewContext(read('package/lib/client.js'), { window: { __ModuleLoader__: { load(value) { client = value } } } })
  assert.equal(client.id, manifest.name)
  assert.equal(typeof client.factory, 'function')
  assert.match(read('LICENSE'), /MIT License/)
  assert.equal(read('LICENSE'), read('package/LICENSE'))
})

test('the panel discovers external skills and never registers its own bundled provider', async () => {
  let registered = 0
  const bootstrap = createBootstrap({ ctx: { get: () => ({ registerProvider() { registered++ } }) } })
  const names = await bootstrap.getMattSkillProbeNames()
  assert.equal(names.length, 27)
  assert.ok(names.includes('implement-spec'))
  assert.ok(names.includes('pr'))
  assert.ok(names.includes('retro'))
  assert.equal(names.includes('resolving-merge-conflicts'), false)
  assert.equal(registered, 0)
  assert.equal(existsSync(new URL('package/bundled-skills', root)), false)
})

test('upstream npm update calls cannot replace the project-maintained panel', () => {
  const handlers = createUpdatePhoneHandlers()
  const check = handlers.handleUpdateCheck()
  assert.equal(check.snapshot.canInstall, false)
  assert.equal(check.snapshot.latestVersion, null)
  assert.equal(check.snapshot.blockedReason, 'managed-by-workflow')
  assert.throws(() => handlers.handleUpdateInstall(), /DSH Workflow/)
  assert.doesNotMatch(read('scripts/build.mjs'), /profilesDir|node_modules\/dsh-mattpocock-skills-deck|process\.env\.HOME/)
})

test('upstream updater files removed during the upgrade are absent from the shipped package', () => {
  for (const name of ['update.js', 'updateReader.js', 'updateStore.js', 'updatePkg']) {
    assert.equal(existsSync(new URL(`package/lib/${name}`, root)), false, name)
  }
})
