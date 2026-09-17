import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './kernel-native-host.mjs'
import { readSessionEvents } from '../../src/dsh-execution.mjs'
import { KernelRuntime } from '../../src/kernel-runtime.mjs'
import { git } from '../../src/git.mjs'
import { normalizePlanV2 } from '../../src/model.mjs'
import { kernelDigest } from '../../src/workflow-engine.mjs'

function *call(id, name, args) {
  const argumentsJson = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
const parallel = process.argv.includes('--parallel')
const modules = parallel ? ['alpha', 'beta', 'gamma'] : ['a']
const ownerSteps = new Map(), entered = new Set(), together = Promise.withResolvers()
let ownerStep = 0, parallelObserved = false
async function *model(options) {
  const serialized = JSON.stringify(options)
  if (serialized.includes('Summarize only this sealed Owner history')) {
    const sourceDigest = /sourceDigest\\?"\s*:\s*\\?"([a-f0-9]{64})/.exec(serialized)?.[1]
    const worklogRef = /worklogRef\\?"\s*:\s*\\?"([^"\\]+)\\?"/.exec(serialized)?.[1]
    yield* call('memory-summary', 'workflow_action_submit', { report: { sourceDigest, worklogRef, summary: 'Changed source; fixed unit verification passed. Deterministic memory fixture.' } })
    return
  }
  const digest = /commitSha\\?"\s*:\s*\\?"([a-f0-9]{40,64})/.exec(serialized)?.[1]
  if (digest && !options.tools?.some(tool => tool.name === 'owner_submit')) {
    yield* call(`review-${digest}`, 'workflow_action_submit', { report: { passed: true, commitSha: digest, reasons: ['Deterministic reviewer fixture: actual fixed command verifies changed source'] } })
  } else if (options.tools?.some(tool => tool.name === 'owner_submit')) {
    const module = parallel ? modules.find(name => serialized.includes(`MODULE_${name.toUpperCase()}`)) : 'a'
    assert.ok(module, 'Owner model fixture must identify its assigned module')
    const step = (ownerSteps.get(module) ?? 0) + 1; ownerSteps.set(module, step)
    if (parallel && step === 1 && module !== 'gamma') {
      entered.add(module)
      if (entered.size === 2) { parallelObserved = true; together.resolve() }
      let timer
      try { await Promise.race([together.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Independent native Owners did not overlap')), 5_000) })]) }
      finally { clearTimeout(timer) }
    }
    ownerStep++
    const editStep = parallel && module === 'alpha' ? 3 : 2
    if (step === 1) yield* call(`read-${module}`, 'read', { file_path: `src/${module}` })
    else if (parallel && module === 'alpha' && step === 2) yield* call('denied-sibling-write', 'write', { file_path: 'src/beta', content: 'forbidden sibling overwrite' })
    else if (step === editStep) yield* call(`edit-${module}`, 'edit', { file_path: `src/${module}`, old_string: 'base', new_string: 'changed' })
    else if (step === editStep + 1) yield* call(`submit-${module}`, 'owner_submit', { report: { status: 'completed', summary: `Changed ${module} to satisfy its fixed test` } })
    else throw new Error('Owner did not conclude after accepted submission')
  } else {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Received workflow result.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-pipeline-')))
const project = join(root, 'project'); await mkdir(project)
let host, runtime
try {
  await git(project, ['init', '-q'])
  await mkdir(join(project, 'src')); await mkdir(join(project, 'test'))
  for (const module of modules) {
    await writeFile(join(project, 'src', module), 'base')
    const required = module === 'gamma' ? modules : [module]
    await writeFile(join(project, 'test', `${module}.test.mjs`), `import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test(${JSON.stringify(module + ' behavior')},()=>{for(const name of ${JSON.stringify(required)}) assert.equal(readFileSync('src/'+name,'utf8'),'changed')})`)
  }
  await git(project, ['add', '.']); await git(project, ['commit', '-qm', 'baseline fixture'])
  const baseCommit = await git(project, ['rev-parse', 'HEAD'])
  const integrationRef = 'refs/heads/dsh/workflow/20260913-1-native-smoke'
  await git(project, ['update-ref', integrationRef, baseCommit])
  host = await kernelNativeHost(project, { executable: true, filesystem: true, model, persistenceRoot: join(root, 'sessions') })
  const errors = []
  runtime = new KernelRuntime(host.ctx, { catalogRoot: root, registryVerifier: async () => {}, onError: error => errors.push(String(error.stack ?? error)) })
  await runtime.ready
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Native execution smoke fixture',
    owners: modules.map(module => ({ id: module, name: module, description: 'Source module', scope: [`src/${module}`], exclude: [] })),
    tasks: modules.map(module => ({ id: module, title: `MODULE_${module.toUpperCase()}`, role: 'work', ownerId: module, write: [`src/${module}`],
      dependsOn: module === 'gamma' ? ['alpha', 'beta'] : [], resources: [], verify: [`unit-${module}`], done: ['source contains changed'] })),
    verifications: modules.map(module => ({ id: `unit-${module}`, run: [process.execPath, '--test', `test/${module}.test.mjs`] })) })
  await runtime.store.transact({ type: 'workflow.create', id: 'wf', root: project, rootSessionId: host.parent.agent.id, request: 'Native test fixture', baseCommit, baseBranch: await git(project, ['symbolic-ref', '--short', 'HEAD']), integrationRef })
  // This smoke isolates execution; source/checkpoint authorization is explicitly a fixture, not an AC-01 proof.
  await runtime.store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan, authorization: { scope: 'implementation', sourceId: 'controlled-test' },
    sources: { snapshotDigest: 'controlled-test' }, review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: 'controlled-test' } })
  for (let count = 0; count < 24; count++) {
    await runtime.effects.pump(); await runtime.effects.drain()
    const view = await runtime.store.readView('wf')
    if (view.terminal) break
    if (errors.length) break
  }
  const view = await runtime.store.readView('wf')
  if (view.status !== 'completed') {
    for (const action of Object.values((await runtime.store.read()).actions).filter(item => item.kind === 'integrate_candidate')) {
      const proof = await readFile(join(runtime.pipeline.root, `${action.id}-combined`, 'result.json'), 'utf8').catch(() => null)
      if (proof) console.error('combined-verification:', proof)
    }
    for (const attempt of Object.values((await runtime.store.read()).workflows.wf.attempts)) {
      if (attempt.sessionId) console.error(JSON.stringify((await readSessionEvents(host.ctx.sessionPersistence, attempt.sessionId)).events.filter(event => event.type === 'tool/result')))
    }
  }
  assert.equal(view.status, 'completed', JSON.stringify({ view, errors, verification: Object.values((await runtime.store.read()).workflows.wf.attempts).map(attempt => attempt.verification) }))
  for (const module of modules) {
    assert.equal(await readFile(join(project, 'src', module), 'utf8'), 'changed')
    assert.equal(await git(project, ['show', `${integrationRef}:src/${module}`]), 'changed')
  }
  assert.equal(await git(project, ['rev-parse', 'HEAD']), view.delivery.commitSha)
  assert.equal(view.counts.completedTasks, modules.length)
  if (parallel) {
    assert.equal(parallelObserved, true)
    const workflow = (await runtime.store.read()).workflows.wf
    const events = (await readSessionEvents(host.ctx.sessionPersistence, workflow.attempts[workflow.tasks.alpha.attemptId].sessionId)).events
    const denied = events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'denied-sibling-write')
    assert.equal(denied?.data.message.content[0].isError, true)
    assert.match(JSON.stringify(denied), /exceeds task scope/)
    const consumer = workflow.attempts[workflow.tasks.gamma.attemptId]
    for (const dependency of ['alpha', 'beta']) assert.equal(consumer.inputs[dependency].commitSha, workflow.attempts[workflow.tasks[dependency].attemptId].integration.commitSha)
  }
  console.log(JSON.stringify({ status: 'passed', contract: 'native-kernel-execution-smoke', ownerStep, parallelObserved, counts: view.counts, realModel: false, sourceAuthority: 'controlled-test', realNativeTools: true, realGit: true, realSandbox: true }))
} finally {
  await runtime?.dispose(); await host?.close(); await rm(root, { recursive: true, force: true })
}
