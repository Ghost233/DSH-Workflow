import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './kernel-native-host.mjs'
import { KernelRuntime } from '../../src/kernel-runtime.mjs'
import { git } from '../../src/git.mjs'
import { normalizePlanV2 } from '../../src/model.mjs'
import { kernelDigest } from '../../src/workflow-engine.mjs'
import { publicOwnerContextDigest } from '../../src/public-owner-change.mjs'
import { readSessionEvents } from '../../src/dsh-execution.mjs'

function *call(id, name, args) {
  const value = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: value }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: value } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
function judgment(value) {
  const { contract, requestId, requestVersion, requestDigest, targetOwnerId, baseline, ...report } = value
  return report
}
const original = {
  public: 'export function clear(state) { return {} }\n',
  app: "import {clear} from './public.mjs'; export const resetApp = state => clear(state)\n",
  cache: "export const canRecover = state => state.recovery === 'kept'\n",
}
const changed = {
  public: original.public + 'export function clearScope(state, scope) { const next = {...state}; delete next[scope]; return next }\n',
  app: "import {clearScope} from './public.mjs'; export const resetApp = state => clearScope(state, 'app')\n",
  cache: original.cache,
}
const owners = ['public', 'app', 'cache'], steps = new Map()
let consultStep = 0, decision, host, runtime, issueId
async function *model(options) {
  const content = JSON.stringify(options)
  if (content.includes('You are the independent public module Owner.')) {
    assert.equal(options.tools.some(tool => ['write', 'edit', 'owner_submit'].includes(tool.name)), false)
    const step = consultStep++
    if (step < owners.length) yield* call(`inspect-${owners[step]}`, 'read', { file_path: `src/${owners[step]}.mjs` })
    else if (step === owners.length) yield* call('migration-decision', 'workflow_action_submit', { report: { decision: judgment(decision) } })
    else assert.fail(`Public Owner judgment was not accepted${content.includes('INVALID_INPUT') ? ': workflow_action_submit returned INVALID_INPUT' : ''}`)
    return
  }
  if (content.includes('Summarize only this sealed Owner history')) {
    const sourceDigest = /sourceDigest\\?"\s*:\s*\\?"([a-f0-9]{64})/.exec(content)?.[1]
    const worklogRef = /worklogRef\\?"\s*:\s*\\?"([^"\\]+)\\?"/.exec(content)?.[1]
    yield* call('memory', 'workflow_action_submit', { report: { sourceDigest, worklogRef, summary: 'Shared reset migration and recovery preservation verified.' } }); return
  }
  if (options.tools.some(tool => tool.name === 'owner_submit')) {
    const owner = owners.find(id => content.includes(`MIGRATION_${id.toUpperCase()}`))
    assert.ok(owner)
    assert.equal((await runtime.store.read()).workflows.wf.issues[issueId].status, 'open', 'decision and partial integration cannot close the migration obligation')
    const step = (steps.get(owner) ?? 0) + 1; steps.set(owner, step)
    if (step === 1) yield* call(`read-${owner}`, 'read', { file_path: `src/${owner}.mjs` })
    else if (owner !== 'cache' && step === 2) yield* call(`edit-${owner}`, 'edit', { file_path: `src/${owner}.mjs`, old_string: original[owner], new_string: changed[owner] })
    else yield* call(`submit-${owner}`, 'owner_submit', { report: { status: 'completed', summary: owner === 'cache' ? 'Verify the unchanged recovery consumer against the migrated app.' : `Implement the independently approved ${owner} migration.` } })
    return
  }
  const digest = /commitSha\\?"\s*:\s*\\?"([a-f0-9]{40,64})/.exec(content)?.[1]
  if (digest) { yield* call('review', 'workflow_action_submit', { report: { passed: true, commitSha: digest, reasons: ['Actual frozen tests exercise scoped reset and retained legacy behavior.'] } }); return }
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Received native workflow feedback.' } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-public-migration-'))), project = join(root, 'project')
await mkdir(project)
try {
  await git(project, ['init', '-q']); await mkdir(join(project, 'src')); await mkdir(join(project, 'test'))
  for (const id of owners) await writeFile(join(project, `src/${id}.mjs`), original[id])
  const prefix = "import test from 'node:test'; import assert from 'node:assert/strict'; "
  await writeFile(join(project, 'test/public.test.mjs'), prefix + "import {clear, clearScope} from '../src/public.mjs'; test('K1 preserved and K2 scoped',()=>{assert.deepEqual(clear({recovery:'kept'}),{}); assert.deepEqual(clearScope({app:'value',recovery:'kept'},'app'),{recovery:'kept'})})")
  await writeFile(join(project, 'test/app.test.mjs'), prefix + "import {resetApp} from '../src/app.mjs'; test('A adopts K2',()=>assert.deepEqual(resetApp({app:'value',recovery:'kept'}),{recovery:'kept'}))")
  await writeFile(join(project, 'test/cache.test.mjs'), prefix + "import {resetApp} from '../src/app.mjs'; import {canRecover} from '../src/cache.mjs'; test('B recovery survives A reset',()=>assert.equal(canRecover(resetApp({app:'value',recovery:'kept'})),true))")
  await git(project, ['add', '.']); await git(project, ['commit', '-qm', 'controlled migration fixture'])
  const baseCommit = await git(project, ['rev-parse', 'HEAD']), integrationRef = 'refs/heads/dsh/workflow/public-migration'
  await git(project, ['update-ref', integrationRef, baseCommit])
  host = await kernelNativeHost(project, { executable: true, filesystem: true, model, persistenceRoot: join(root, 'sessions') })
  const errors = []
  runtime = new KernelRuntime(host.ctx, { catalogRoot: root, registryVerifier: async () => {}, onError: error => errors.push(String(error.stack ?? error)) }); await runtime.ready
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Keep recovery after app reset',
    owners: owners.map(id => ({ id, name: id, description: id, scope: [`src/${id}.mjs`], exclude: [] })),
    tasks: owners.map(id => ({ id, title: `MIGRATION_${id.toUpperCase()}`, ownerId: id, role: id === 'cache' ? 'verify' : 'work',
      write: id === 'cache' ? [] : [`src/${id}.mjs`], dependsOn: id === 'public' ? [] : id === 'app' ? ['public'] : ['public', 'app'],
      verify: [`unit-${id}`], done: ['Reset preserves recovery and the legacy contract'] })),
    verifications: owners.map(id => ({ id: `unit-${id}`, run: [process.execPath, '--test', `test/${id}.test.mjs`] })) })
  await runtime.store.transact({ type: 'workflow.create', id: 'wf', root: project, rootSessionId: host.parent.agent.id,
    request: 'Reset app without losing recovery', baseCommit, integrationRef, baseBranch: await git(project, ['symbolic-ref', '--short', 'HEAD']) })
  const activate = value => runtime.store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: value.publicOwnerChanges ? 1 : 0,
    plan: value, sources: { snapshotDigest: 'explicit-planning-fixture' }, authorization: { scope: 'implementation', sourceId: 'explicit-planning-fixture' },
    review: { status: 'passed', planDigest: kernelDigest(value), evidenceRef: 'explicit-planning-fixture' } })
  await activate(plan)
  const context = { workflowId: 'wf', planRevision: 1, planDigest: kernelDigest(plan), owners,
    tickets: [{ id: 'T-reset', revision: 'R1' }], acceptanceCriteria: ['AC-recovery'],
    contracts: [{ id: 'reset', revision: 'K1', ownerId: 'public' }], evidenceRefs: ['ev-gap', 'ev-public', 'ev-app', 'ev-cache'], consumerInventoryComplete: true,
    consumers: ['app', 'cache'].map(id => ({ consumerId: id, ownerId: id, contract: { id: 'reset', revision: 'K1' }, evidenceRefs: [`ev-${id}`] })) }
  const request = { contract: 'DSH_PUBLIC_OWNER_CHANGE_REQUEST_V1', requestId: 'reset', requestVersion: 1, requesterOwnerId: 'app', targetOwnerId: 'public',
    source: { tickets: context.tickets, acceptanceCriteria: context.acceptanceCriteria },
    baseline: { workflowId: 'wf', planRevision: 1, planDigest: kernelDigest(plan), contract: { id: 'reset', revision: 'K1' }, contextDigest: publicOwnerContextDigest(context) },
    expectedBehavior: 'Clear app data and preserve recovery', actualGap: 'Global reset loses recovery', evidenceRefs: ['ev-gap'], suggestion: 'Offer scoped reset and migrate app', supersedesRequestDigest: null }
  const requested = await runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context, request })
  const action = (await runtime.store.transact({ type: 'action.claim', actionId: requested.result, hostId: 'fixture', token: 'consult' })).result
  decision = { contract: 'DSH_PUBLIC_OWNER_CHANGE_DECISION_V1', decisionId: 'migrate-app', requestId: 'reset', requestVersion: 1, requestDigest: action.input.requestDigest,
    targetOwnerId: 'public', baseline: request.baseline, outcome: 'migration_required', summary: 'Preserve K1, add K2 and migrate app; independently verify recovery', basisRefs: ['ev-public', 'ev-app', 'ev-cache'],
    affectedConsumers: [{ consumerId: 'app', ownerId: 'app', impact: 'update_required', evidenceRefs: ['ev-app'] }, { consumerId: 'cache', ownerId: 'cache', impact: 'compatible', evidenceRefs: ['ev-cache'] }],
    contractChange: { nextRevision: 'K2', behavior: 'Scoped reset', compatibility: 'Keep global clear unchanged' }, migrationOrder: ['app'], alternative: null, unknowns: [], businessChange: null }
  const result = await runtime.effects.adapters.consult_owner.execute(action, { started: evidence => runtime.store.transact({ type: 'action.started', actionId: action.id, token: 'consult', evidence }) })
  await runtime.store.transact({ type: 'action.result', actionId: action.id, token: 'consult', result })
  let workflow = (await runtime.store.read()).workflows.wf
  issueId = Object.values(workflow.issues).find(issue => issue.origin === 'public_owner').id
  assert.equal(workflow.issues[issueId].status, 'open')
  const record = workflow.publicOwnerChangeLog.decisions[0]
  const revised = normalizePlanV2({ ...plan, publicOwnerChanges: [{ contract: 'DSH_PUBLIC_OWNER_PLAN_BINDING_V1', requestId: 'reset', requestVersion: 1,
    requestDigest: action.input.requestDigest, decisionId: decision.decisionId, decisionDigest: record.decisionDigest, targetOwnerId: 'public', outcome: 'migration_required',
    implementationTaskId: 'public', consumers: [{ consumerId: 'app', ownerId: 'app', impact: 'update_required', taskId: 'app', contract: { id: 'reset', revision: 'K2' } },
      { consumerId: 'cache', ownerId: 'cache', impact: 'compatible', taskId: 'cache', contract: { id: 'reset', revision: 'K2' } }], migrationOrder: ['app'] }] })
  await activate(revised)
  for (let i = 0; i < 24; i++) {
    await runtime.effects.pump(); await runtime.effects.drain()
    const view = await runtime.store.readView('wf')
    if (view.terminal || errors.length) break
  }
  const view = await runtime.store.readView('wf')
  assert.equal(view.status, 'completed', JSON.stringify({ view, errors }))
  workflow = (await runtime.store.read()).workflows.wf
  assert.equal(workflow.issues[issueId].status, 'closed')
  for (const id of owners) assert.equal(await readFile(join(project, `src/${id}.mjs`), 'utf8'), changed[id])
  assert.equal(await git(project, ['rev-parse', 'HEAD']), view.delivery.commitSha)
  assert.equal(view.counts.completedTasks, 3)
  const events = (await readSessionEvents(host.ctx.sessionPersistence, result.sessionId)).events
  assert.equal(events.filter(event => event.type === 'tool/result' && !event.data.message.content[0].isError).length, 4)
  console.log(JSON.stringify({ status: 'passed', nativeConsultation: true, actualMigration: true, unchangedConsumerVerified: true,
    realModel: false, planningAuthority: 'explicit-fixture', counts: view.counts }))
} finally { await runtime?.dispose(); await host?.close(); await rm(root, { recursive: true, force: true }) }
