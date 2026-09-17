import test from 'node:test'
import assert from 'node:assert/strict'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse, toolCallResponse } from '../../deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts'
import { fixture } from './helpers.mjs'

const verdict = decision => toolCallResponse('review-verdict', 'structured_output', { decision, rationale: 'A diagnostic command.' })
const config = { mode: 'rules-and-llm' }
const message = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

test('real AgentLoop calls Bash and the native no-tools reviewer, then resumes after a single approval', async t => {
  const f = await fixture(t, config, { manualTurn: false })
  const adapter = new MockAdapter([
    toolCallResponse('loop-bash', 'bash', { command: 'node --version', description: 'Inspect the installed Node version.',
      sandbox_permissions: 'danger-full-access', justification: 'Read a diagnostic version.' }),
    verdict('allow'), textResponse('Diagnostic completed.'),
  ])
  f.ctx.llm.registerAdapter(['approval-test'], adapter)
  const children = []
  f.ctx.on('agent/created', ({ agent }) => { if (agent.options.approveForMeReviewer) children.push(agent) }, { global: true })
  await f.agent.followup(message('Inspect the Node version.'))
  await f.agent.whenIdle()
  assert.equal(f.manual.length, 0)
  assert.equal(adapter.requests.length, 3)
  assert.deepEqual(adapter.requests[1].tools.map(tool => tool.name), ['structured_output'])
  assert.match(JSON.stringify(adapter.requests[1]), /Inspect the Node version/)
  assert.equal(children.length, 1)
  assert.equal(children[0].session.header.parentSession, f.agent.id)
  assert.equal(f.ctx.agents.get(children[0].id), undefined)
  const events = f.agent.session.snapshotEvents()
  assert.equal(events.find(event => event.type === 'approval/decided').data.outcome, 'allowed-once')
  assert.match(JSON.stringify(events), /Diagnostic completed/)
  assert.equal(f.ctx.sandboxPolicy.resolve({ session: f.agent.session }).mode, 'workspace-write')
})

for (const decision of ['deny', 'escalate', 'invalid']) {
  test(`reviewer ${decision} cannot grant permission and reaches native manual fallback`, async t => {
    const f = await fixture(t, config)
    f.ctx.llm.registerAdapter(['approval-test'], new MockAdapter([verdict(decision)]))
    assert.equal((await f.execute()).isError, true)
    assert.equal(f.manual.length, 1)
    assert.equal(f.agent.session.snapshotEvents().find(event => event.type === 'approval/decided').data.outcome, 'rejected')
    await f.adapter.dispose()
    assert.equal(f.ctx.agents.list().length, 1)
  })
}

for (const change of ['settings', 'preset', 'cancel', 'dispose']) {
  test(`a pending allow verdict cannot outlive ${change}`, async t => {
    const f = await fixture(t, config)
    const entered = Promise.withResolvers()
    const release = Promise.withResolvers()
    class Adapter extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model } }
      async *stream(options) {
        entered.resolve()
        await Promise.race([release.promise, new Promise(resolve => {
          if (options.signal.aborted) resolve()
          else options.signal.addEventListener('abort', resolve, { once: true })
        })])
        if (options.signal.aborted) throw options.signal.reason
        yield* verdict('allow')
      }
    }
    f.ctx.llm.registerAdapter(['approval-test'], new Adapter())
    const abort = new AbortController()
    const execution = f.execute('node --version', { signal: abort.signal })
    await entered.promise
    if (change === 'settings') {
      const section = f.ctx.settings.describe().find(item => item.ns === 'approve-for-me')
      await f.ctx.settings.mutate('approve-for-me', [{ op: 'set', path: ['rules', 'commandPrefixes'], value: [] }], section.revision)
    } else if (change === 'preset') f.ctx.permissionPresets.set(f.agent.session, 'workspace-write')
    else if (change === 'cancel') abort.abort(new Error('Caller cancelled'))
    else await f.adapter.dispose()
    release.resolve()
    assert.equal((await execution).isError, true)
    const outcomes = f.agent.session.snapshotEvents().filter(event => event.type === 'approval/decided').map(event => event.data.outcome)
    assert.ok(outcomes.every(outcome => outcome !== 'allowed-once'), JSON.stringify(outcomes))
    // The native tool cancellation returns before middleware teardown; drain
    // the plugin's lifecycle before asserting the reviewer registry is empty.
    await f.adapter.dispose()
    assert.equal(f.ctx.agents.list().length, 1)
  })
}

test('review timeout disposes the native child before falling back', { timeout: 5000 }, async t => {
  const f = await fixture(t, { ...config, reviewer: { timeoutMs: 1000 } })
  f.ctx.llm.registerAdapter(['approval-test'], new MockAdapter(['hang']))
  assert.equal((await f.execute()).isError, true)
  assert.equal(f.manual.length, 1)
  assert.equal(f.ctx.agents.list().length, 1)
})

test('fixed high risk is rejected before an allowlisted command can reach the reviewer', async t => {
  const f = await fixture(t, { ...config, rules: { commandPrefixes: [{ tool: 'shell', prefix: 'touch' }], reviewerInstructions: '' } })
  const model = new MockAdapter([verdict('allow')])
  f.ctx.llm.registerAdapter(['approval-test'], model)
  // Exercise a fixed-risk file mutation using only a disposable test path.
  // The guard additionally avoids running the command if policy regresses.
  f.ctx.on('tools/execute', async (execution, next) => {
    if (!execution.arguments.command.startsWith('touch ')) return next()
    const result = await f.ctx.approval.request({ agent: execution.agent, callId: execution.callId,
      toolName: 'bash', reason: 'escalate sandbox to danger-full-access: Inspect the installed tool version.' })
    assert.equal(result, 'rejected')
    return { isError: true, content: [] }
  }, { prepend: false })
  assert.equal((await f.execute(`touch '${f.root}/must-not-write'`)).isError, true)
  assert.equal(f.manual.length, 1)
  assert.equal(model.requests.length, 0)
})
