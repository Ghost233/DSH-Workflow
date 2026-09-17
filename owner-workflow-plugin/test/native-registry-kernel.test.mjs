import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'
import { loadRegistry } from '../src/registry.mjs'

// This isolated node:test worker owns only temporary repositories. No Git config is written.
Object.assign(process.env, { GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@invalid' })

test('project status discovers the complete existing Registry and reports a missing Registry without creating it', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'ukr-registry-status-'))
  const existingRoot = join(parent, 'existing')
  const missingRoot = join(parent, 'missing')
  await mkdir(join(existingRoot, '.owner-workflow/owners/api'), { recursive: true })
  await mkdir(missingRoot)
  await writeFile(join(existingRoot, '.owner-workflow/config.json'), `${JSON.stringify({
    contract: 'DSH_OWNER_REGISTRY_V1', version: 1, managedRoots: ['**'], parallel: 4, profiles: {},
  }, null, 2)}\n`)
  await writeFile(join(existingRoot, '.owner-workflow/owners/api/owner.md'), [
    '---',
    'registry: {"declaredExclude":[],"description":"API module","id":"api","managedExclude":[],"name":"API","parentOwnerId":null,"scope":["src/api/**"],"status":"active"}',
    '---',
    '# API',
    '',
    'API module',
    '',
  ].join('\n'))
  const hosts = []
  const runtimes = []
  const disposers = []
  t.after(async () => {
    for (const dispose of disposers.toReversed()) dispose()
    for (const runtime of runtimes.toReversed()) await runtime.dispose()
    for (const host of hosts.toReversed()) await host.close()
    await rm(parent, { recursive: true, force: true })
  })

  const statusFor = async root => {
    const host = await kernelNativeHost(root, { executable: true })
    hosts.push(host)
    const runtime = new KernelRuntime(host.ctx, { catalogRoot: root })
    runtimes.push(runtime)
    await runtime.ready
    disposers.push(...kernelToolDefinitions(runtime).map(definition => host.parent.agent.ctx.tools.register(definition)))
    return runtime.status(host.parent.agent)
  }

  const existing = await statusFor(existingRoot)
  assert.deepEqual(existing.workflows, [])
  assert.equal(existing.registry.exists, true)
  assert.deepEqual(existing.registry.owners, [{
    id: 'api', name: 'API', description: 'API module', scope: ['src/api/**'], exclude: [],
    declaredExclude: [], managedExclude: [], status: 'active',
  }])
  assert.deepEqual(existing.registry.config, {
    contract: 'DSH_OWNER_REGISTRY_V1', version: 1, managedRoots: ['**'], parallel: 4, profiles: {},
  })

  const missing = await statusFor(missingRoot)
  assert.deepEqual(missing.workflows, [])
  assert.equal(missing.registry.exists, false)
  assert.deepEqual(missing.registry.owners, [])
  await assert.rejects(access(join(missingRoot, '.owner-workflow')), { code: 'ENOENT' })
})

test('root tool descriptions direct a fresh thread to inspect Registry status before proposing a change', () => {
  const definitions = kernelToolDefinitions({})
  const status = definitions.find(definition => definition.name === 'workflow_status')
  const change = definitions.find(definition => definition.name === 'workflow_registry_change')
  assert.match(status.description, /complete.*Registry/u)
  assert.match(change.description, /workflow_status\.registry/u)
  assert.match(change.description, /not.*probe/u)
})

for (const choice of ['allow', 'reject', 'cancel']) test(`native Registry batch ${choice}: one exact decision, no speculative ownership or Git identity changes`, { timeout: 25_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-registry-'))
  await promisify(execFile)('git', ['init', '-q'], { cwd: root })
  await writeFile(join(root, 'source.txt'), 'original')
  await promisify(execFile)('git', ['add', 'source.txt'], { cwd: root })
  await promisify(execFile)('git', ['commit', '-qm', 'fixture baseline'], { cwd: root })
  const config = await readFile(join(root, '.git/config'))
  const host = await kernelNativeHost(root, { executable: true })
  const errors = []; let runtime, questions = 0
  t.after(async () => { await runtime?.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const { default: UserQuestions } = await import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
  await host.ctx.plugin(UserQuestions)
  host.ctx.on('user-questions/request', async request => {
    questions++; assert.equal(request.agent, host.parent.agent)
    const concrete = JSON.parse(request.questions[0].detail)
    assert.equal(concrete.after.owners.length, 2)
    assert.deepEqual(concrete.affectedOwnerIds, ['api', 'web'])
    await assert.rejects(access(join(root, '.owner-workflow')), { code: 'ENOENT' })
    if (choice === 'cancel') throw Object.assign(new Error('cancel'), { code: 'ASK_CANCELLED' })
    return { answers: [{ id: request.questions[0].id, selected: [choice === 'allow' ? '应用这批职责' : '取消'] }] }
  })
  runtime = new KernelRuntime(host.ctx, { catalogRoot: root, onError: error => errors.push(error.stack) }); await runtime.ready
  for (const definition of kernelToolDefinitions(runtime)) host.parent.agent.ctx.tools.register(definition)
  const result = await runtime.changeRegistry(host.parent.agent, { reason: 'Establish distinct module owners',
    operations: ['api', 'web'].map(id => ({ type: 'add', reason: `${id} needs persistent ownership`, owner: {
      id, name: id, description: `${id} module`, scope: [`src/${id}/**`], exclude: [] } })) },
  { callId: 'actual-registry-batch', signal: new AbortController().signal })
  const until = Date.now() + 10_000; let current
  while (Date.now() < until) {
    current = await runtime.store.readView(result.workflowId)
    if (current.terminal || errors.length) break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.deepEqual(errors, [])
  assert.equal(current.status, choice === 'allow' ? 'completed' : 'cancelled', JSON.stringify(current))
  assert.equal(current.registryResult.applied, choice === 'allow')
  assert.equal(questions, 1)
  assert.deepEqual(await readFile(join(root, '.git/config')), config)
  if (choice === 'allow') {
    assert.deepEqual((await loadRegistry(root)).owners.map(item => item.id), ['api', 'web'])
    assert.equal((await promisify(execFile)('git', ['diff', '--cached', '--name-only'], { cwd: root })).stdout.trim(), '')
    assert.equal((await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), current.registryResult.commitSha)
  }
  else await assert.rejects(access(join(root, '.owner-workflow')), { code: 'ENOENT' })
})


for (const interruption of ['installed', 'ref_updated']) test(`native Registry reconciles ${interruption} interruption from the original approval and preserves user index`, { timeout: 25_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-registry-recovery-'))
  const git = async args => (await promisify(execFile)('git', args, { cwd: root })).stdout.trim()
  await git(['init', '-q'])
  await writeFile(join(root, 'source.txt'), 'original')
  await git(['add', 'source.txt']); await git(['commit', '-qm', 'fixture baseline'])
  const baseline = await git(['rev-parse', 'HEAD'])
  await writeFile(join(root, 'source.txt'), 'staged user change')
  await git(['add', 'source.txt'])
  const indexBlob = await git(['rev-parse', ':source.txt'])
  const config = await readFile(join(root, '.git/config'))
  const host = await kernelNativeHost(root, { executable: true })
  let runtime, questions = 0, interrupted = false, updates = 0, timeOffset = 0
  const errors = []
  t.after(async () => { await runtime?.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const { default: UserQuestions } = await import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
  await host.ctx.plugin(UserQuestions)
  host.ctx.on('user-questions/request', async request => {
    questions++
    return { answers: [{ id: request.questions[0].id, selected: ['应用这批职责'] }] }
  })
  runtime = new KernelRuntime(host.ctx, { catalogRoot: root, onError: error => {
    errors.push(error.message)
    // Advance only this fixture's clock to the persisted observation deadline.
    timeOffset = 30_001; runtime.runner.wake()
  } }); await runtime.ready
  runtime.store.clock = () => Date.now() + timeOffset
  for (const definition of kernelToolDefinitions(runtime)) host.parent.agent.ctx.tools.register(definition)
  const nativeGit = runtime.registry.git
  runtime.registry.git = async (...args) => {
    if (args[1][0] === 'update-ref') updates++
    if (!interrupted && interruption === 'installed' && args[1][0] === 'write-tree') {
      interrupted = true; throw new Error('fixture interrupted after Registry installation')
    }
    const result = await nativeGit(...args)
    if (!interrupted && interruption === 'ref_updated' && args[1][0] === 'update-ref') {
      interrupted = true; throw new Error('fixture lost the Git update response')
    }
    return result
  }
  const view = await runtime.changeRegistry(host.parent.agent, { reason: 'Establish one module boundary', operations: [{ type: 'add', reason: 'API ownership',
    owner: { id: 'api', name: 'API', description: 'Source module', scope: ['src/**'], exclude: [] } }] },
  { callId: 'recover-registry', signal: new AbortController().signal })
  const until = Date.now() + 15_000; let current
  while (Date.now() < until) {
    current = await runtime.store.readView(view.workflowId)
    if (current.status === 'completed') break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(current.status, 'completed', JSON.stringify({ current, errors }))
  assert.equal(interrupted, true); assert.equal(questions, 1); assert.equal(updates, 1)
  assert.equal(errors.length, 1)
  assert.equal(await git(['rev-parse', ':source.txt']), indexBlob)
  assert.equal(await git(['show', 'HEAD:source.txt']), 'original')
  assert.equal(await readFile(join(root, 'source.txt'), 'utf8'), 'staged user change')
  assert.equal(await git(['rev-list', '--count', `${baseline}..HEAD`]), '1')
  assert.deepEqual(await readFile(join(root, '.git/config')), config)
  assert.deepEqual((await loadRegistry(root)).owners.map(owner => owner.id), ['api'])
})
