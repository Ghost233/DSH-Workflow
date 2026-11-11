import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateConfiguration } from '../src/configuration.mjs'
import { Store } from '../src/store.mjs'

test('repository authority is explicit and rejects hierarchy cycles or missing verification inputs', async () => {
  const example = JSON.parse(await readFile(new URL('../configuration.example.json', import.meta.url)))
  assert.equal(validateConfiguration(example).schema, 1)
  const cycle = structuredClone(example); cycle.members[1].parent = 'developer'
  assert.throws(() => validateConfiguration(cycle), /cycle/)
  const missing = structuredClone(example); missing.repositories[0].verificationCommands = []
  assert.throws(() => validateConfiguration(missing), /verification/)
  const relative = structuredClone(example); relative.repositories[0].executionRoot = 'somewhere'
  assert.throws(() => validateConfiguration(relative), /authorization/)
})

test('only one Host can own a coordination database and a clean close permits recovery', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coordination-owner-'))
  let recovered
  const path = join(directory, 'state.sqlite'), first = new Store(path)
  t.after(async () => { first.close(); recovered?.close(); await rm(directory, { recursive: true, force: true }) })
  first.put('event', 'one', { state: 'pending' })
  assert.throws(() => new Store(path), /already owned/)
  first.close()
  recovered = new Store(path)
  assert.deepEqual(recovered.get('event', 'one'), { state: 'pending' })
})

test('repository credentials select exactly one absolute gh profile or named token variable', async () => {
  const config = JSON.parse(await readFile(new URL('../configuration.example.json', import.meta.url)))
  const repository = config.repositories[0]
  delete repository.tokenEnv
  repository.ghConfigDir = '/accounts/owner'
  assert.equal(validateConfiguration(config).repositories[0].ghConfigDir, '/accounts/owner')
  repository.tokenEnv = 'REPO_TOKEN'
  assert.throws(() => validateConfiguration(config), /authorization/)
  delete repository.tokenEnv
  repository.ghConfigDir = 'relative/owner'
  assert.throws(() => validateConfiguration(config), /authorization/)
  delete repository.ghConfigDir
  repository.tokenEnv = 'REPO_TOKEN'
  assert.equal(validateConfiguration(config).repositories[0].tokenEnv, 'REPO_TOKEN')
})
