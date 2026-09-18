import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeDecisionEffects } from '../src/native-decision-effects.mjs'
import { NativeRegistryEffects } from '../src/native-registry-effects.mjs'
import { artifactPath, publishArtifact, readArtifact } from '../src/effect-artifacts.mjs'
import { proposeRegistryChange } from '../src/registry.mjs'

for (const persisted of [false, true]) test(`native decision ${persisted ? 'reuses the original' : 'creates a Markdown'} question without changing its digest`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-question-presentation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const decision = { id: 'decision-1', status: 'pending', kind: 'product', rootSessionId: 'root', requestDigest: 'fixed-digest',
    binding: { publicOwnerDecisionDigest: 'public-digest' }, request: { question: '变更承诺？',
      detail: JSON.stringify({ acceptanceCriterion: 'AC-1', currentCommitment: '保留',
        proposedCommitment: '移除', consequence: '不再恢复' }), options: ['保留', '接受'] } }
  const original = structuredClone(decision)
  const action = { id: 'action-1', workflowId: 'wf', input: { decisionId: decision.id, requestDigest: decision.requestDigest } }
  const parent = { id: 'root' }
  const questions = [], events = []
  const store = { read: async () => ({ workflows: { wf: { rootSessionId: parent.id, decisions: { [decision.id]: decision } } } }),
    transact: async event => { events.push(event) } }
  const ctx = { agents: { get: () => parent, roots: () => [parent] },
    userQuestions: { ask: async request => {
      questions.push(request.questions[0])
      return { answers: [{ id: decision.id, selected: ['接受'] }] }
    } } }
  const requestPath = artifactPath(root, action.id, 'request.json')
  if (persisted) await publishArtifact(requestPath, { question: { id: decision.id, header: '需求决定',
    question: decision.request.question, detail: decision.request.detail,
    options: decision.request.options.map(label => ({ label, description: label })), multiSelect: false },
  requestDigest: decision.requestDigest, rootSessionId: parent.id })
  await new NativeDecisionEffects(ctx, store, root).execute(action)
  assert.equal(questions.length, 1)
  if (persisted) assert.equal(questions[0].detail, decision.request.detail)
  else assert.match(questions[0].detail, /建议承诺：移除/u)
  assert.deepEqual(decision, original)
  assert.equal((await readArtifact(requestPath)).requestDigest, 'fixed-digest')
  assert.equal(events[0].requestDigest, 'fixed-digest')
})

test('a pending Registry decision reuses its legacy request instead of changing its identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ukr-registry-presentation-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const before = { config: { contract: 'DSH_OWNER_REGISTRY_V1', version: 1,
    managedRoots: ['**'], parallel: 4, profiles: {} }, owners: [] }
  const operation = { type: 'add', reason: 'Create API owner', owner: { id: 'api', name: 'API',
    description: 'API module', scope: ['api/**'], exclude: [] } }
  const proposal = proposeRegistryChange(before, { type: 'batch', reason: 'Define modules', operations: [operation] })
  const action = { id: 'action-1', workflowId: 'wf', inputDigest: 'input-digest',
    input: { root: '/project', proposal } }
  const legacyRequest = { question: 'Apply owner changes?', detail: JSON.stringify(proposal), options: ['应用这批职责', '取消'] }
  const original = { id: `registry-${action.id}`, status: 'pending', request: legacyRequest,
    binding: { actionId: action.id, inputDigest: action.inputDigest, proposalDigest: proposal.digest, root: '/project' } }
  const stop = new Error('observed original request')
  const store = { directory, read: async () => ({ workflows: { wf: { decisions: { [original.id]: original } } } }),
    transact: async event => {
      assert.equal(event.id, original.id)
      assert.equal(event.request, legacyRequest)
      assert.deepEqual(event.binding, original.binding)
      throw stop
    } }
  await assert.rejects(new NativeRegistryEffects(store).execute(action), error => error === stop)
})
