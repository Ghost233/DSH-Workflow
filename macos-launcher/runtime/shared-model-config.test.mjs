import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectSharedModelPatches, sharedModelEnvironment, watchSharedModelConfig, writeSharedModelOverlay } from './shared-model-config.mjs'

function modelEntries() {
  return [{ group: true, config: [
    { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'fixture', model: 'm1' } },
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: {} },
    { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { fixture: { baseURL: 'https://example.invalid', apiKeyEnv: 'FIXTURE_KEY', models: [{ id: 'm1' }] } } } },
    { id: 'llm-deepseek', name: '@deepseek-ai/dsh-llm-deepseek-api-key', config: {} },
    { id: 'llm-deepseek-account', name: '@deepseek-ai/dsh-llm-deepseek-account', disabled: true },
  ] }]
}

test('shares complete provider settings and the same credential store without touching other entries', () => {
  const entries = modelEntries()
  const result = projectSharedModelPatches(entries, '/fixture/home')
  assert.deepEqual(result.find(row => row.id === 'llm-pi-ai').config, entries[0].config[2].config)
  assert.equal(result.find(row => row.id === 'credentials').config.path, '/fixture/home/.credentials.yaml')
  assert.equal(result.find(row => row.id === 'llm-deepseek-account').disabled, true)
  assert.equal(result.length, 5)
  entries[0].config[2].config.providers.fixture.baseURL = 'changed'
  assert.equal(result.find(row => row.id === 'llm-pi-ai').config.providers.fixture.baseURL, 'https://example.invalid')
})

test('does not guess ambiguous model entries, relative credential paths or executable expressions', () => {
  const duplicate = modelEntries(); duplicate[0].config.push({ ...duplicate[0].config[2] })
  assert.throws(() => projectSharedModelPatches(duplicate, '/fixture/home'), /llm-pi-ai/)
  const relative = modelEntries(); relative[0].config[1].config.path = 'relative.yml'
  assert.throws(() => projectSharedModelPatches(relative, '/fixture/home'), /凭据/)
  const expression = modelEntries(); expression[0].config[2].config.providers.fixture.baseURL = { __jsExpr: 'process.env.BASE_URL' }
  assert.throws(() => projectSharedModelPatches(expression, '/fixture/home'), /表达式/)
})

test('only selected model references are inherited from the DSH home environment', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-model-env-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await writeFile(join(home, '.env'), 'FIXTURE_KEY=fixture-value\nDEEPSEEK_API_KEY=another-fixture\nGH_TOKEN=unrelated\n', { mode: 0o600 })
  const patches = projectSharedModelPatches(modelEntries(), home)
  const result = await sharedModelEnvironment(home, patches, { DEEPSEEK_API_KEY: 'already-inherited' })
  assert.deepEqual(result, { FIXTURE_KEY: 'fixture-value' })
})

test('managed overlay updates atomically while preserving unowned or modified user files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-shared-model-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'cordis.patch.yml')
  const first = projectSharedModelPatches(modelEntries(), '/fixture/home')
  await writeFile(path, '# user-owned\n[]\n', { mode: 0o600 })
  await assert.rejects(writeSharedModelOverlay(path, first), /已有/)
  assert.equal(await readFile(path, 'utf8'), '# user-owned\n[]\n')
  await rm(path)
  await writeSharedModelOverlay(path, first)
  const saved = await readFile(path, 'utf8')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal(await writeSharedModelOverlay(path, first), false)
  const updated = structuredClone(first); updated.find(row => row.id === 'agent-default-model').config.model = 'm2'
  assert.equal(await writeSharedModelOverlay(path, updated), true)
  assert.match(await readFile(path, 'utf8'), /m2/)
  await writeFile(path, saved + '# user edit\n')
  await assert.rejects(writeSharedModelOverlay(path, updated), /修改/)
  assert.equal(await readFile(path, 'utf8'), saved + '# user edit\n')
})

test('live model changes propagate while an edited destination is preserved and reported', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-shared-model-watch-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const home = join(dir, 'home'), profile = join(home, 'profiles/desktop'), target = join(dir, 'overlay')
  await mkdir(profile, { recursive: true })
  const source = join(profile, 'cordis.patch.yml')
  await writeFile(source, JSON.stringify(modelEntries()))
  let failure
  const close = await watchSharedModelConfig({ home, target, resources: dir,
    readPatches: async () => projectSharedModelPatches(JSON.parse(await readFile(source, 'utf8')), home),
    onError: value => { failure = value },
  })
  t.after(close)
  const change = async model => {
    const entries = modelEntries(); entries[0].config[0].config.model = model
    const next = `${source}.new`; await writeFile(next, JSON.stringify(entries)); await rename(next, source)
  }
  const until = async predicate => {
    const deadline = Date.now() + 5000
    while (!await predicate()) {
      if (Date.now() >= deadline) throw new Error('model update was not observed')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  await change('m2')
  await until(async () => (await readFile(target, 'utf8')).includes('"m2"'))
  await writeFile(target, '# user-owned\n[]\n')
  await change('m3')
  await until(() => failure !== undefined)
  assert.match(failure, /共享模型配置更新失败/)
  assert.equal(await readFile(target, 'utf8'), '# user-owned\n[]\n')
})

test('refuses a shared model overlay in the primary DSH home', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-shared-model-same-home-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await assert.rejects(watchSharedModelConfig({ home, resources: home, target: join(home, 'cordis.patch.yml') }), /不能与/)
})
