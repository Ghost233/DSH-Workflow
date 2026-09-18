import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'

function *call(id, name, args) {
  const value = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: value }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: value } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

test('one native approval starts one Exec session that can perform several tool calls and then loses its authority', { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'owner-exec-task-'))
  await promisify(execFile)('git', ['init', '-q', root])
  let step = 0
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    step++
    if (step === 1) yield* call('exec-read', 'read', { file_path: 'README.md' })
    else if (step === 2) yield* call('exec-write', 'write', { file_path: 'README.md', content: 'done' })
    else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Task complete after reading and writing.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Task complete after reading and writing.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  } })
  const load = path => import(new URL(`../../deepseek-harness/${path}/lib/index.js`, import.meta.url))
  const [approvalModule, spawnModule] = await Promise.all([
    load('packages/interaction/user-approval'), load('packages/subagent/subagent-spawn-in-process'),
  ])
  await host.ctx.plugin(approvalModule.default)
  await host.ctx.plugin(spawnModule.default ?? spawnModule)
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: root }); await runtime.ready
  runtime.runner.start = () => {}
  const agent = host.parent.agent
  const disposers = kernelToolDefinitions(runtime).map(definition => agent.ctx.tools.register(definition))
  const toolCalls = []
  const tool = name => ({ name, description: `Fake ${name}`,
    parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
    output: { schema: {}, render: (_args, result) => [{ type: 'text', text: result.text }] },
    execute: async (args, exec) => {
      assert.equal(exec.agent.ctx.tools.get('workflow_status', exec.agent), undefined)
      assert.equal(exec.agent.ctx.tools.get('ask_user_question', exec.agent), undefined)
      toolCalls.push({ name, args, agent: exec.agent })
      return { text: `${name} done` }
    },
  })
  disposers.push(host.ctx.tools.register(tool('read')))
  disposers.push(host.ctx.tools.register(tool('write')))
  disposers.push(host.ctx.tools.register({ ...tool('bash'), parameters: { type: 'object', properties: {}, required: [], additionalProperties: true } }))
  disposers.push(host.ctx.tools.register(tool('workflow_status')))
  disposers.push(host.ctx.tools.register(tool('ask_user_question')))
  disposers.push(host.ctx.tools.guard(exec => runtime.checkToolExecution(exec)))
  let approvals = 0, decision = 'allowed-once'
  host.ctx.on('approval/request', req => { approvals++; assert.match(req.reason, /1\. Read the file/); return decision })
  t.after(async () => { disposers.toReversed().forEach(dispose => dispose()); await runtime.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  agent.session.append('turn/start', { turn: 1 })
  const input = { name: 'workflow_exec_task', callId: 'exec-task-1', agent, signal: new AbortController().signal,
    arguments: { task: 'Update the example file', steps: ['Read the file', 'Write the replacement'], reason: 'User requested one non-Owner task' } }
  const first = await host.ctx.tools.execute(input)
  assert.equal(first.isError, false, JSON.stringify(first))
  assert.equal(first.value.status, 'settled')
  assert.equal(first.value.stopReason, 'completed')
  assert.equal(toolCalls.length, 2)
  assert.deepEqual(toolCalls.map(item => item.name), ['read', 'write'])
  assert.notEqual(toolCalls[0].agent, agent)
  assert.equal(toolCalls[0].agent, toolCalls[1].agent)
  assert.equal(host.ctx.agents.get(first.value.sessionId), undefined, 'Exec Agent must be disposed after its task')
  assert.equal(approvals, 1)
  const replay = await host.ctx.tools.execute(input)
  assert.equal(replay.isError, false)
  assert.deepEqual(replay.value, first.value)
  assert.equal(toolCalls.length, 2)
  const parentEvents = Array.from({ length: agent.session.seq }, (_, i) => agent.session.eventAt(i))
  assert.deepEqual(parentEvents.filter(event => event.type.startsWith('approval/')).map(event => event.type), ['approval/asked', 'approval/decided'])
  assert.ok(parentEvents.some(event => event.type === 'subagent/catalog' && event.data.childId === first.value.sessionId))
  decision = 'rejected'
  const denied = await host.ctx.tools.execute({ ...input, callId: 'exec-task-rejected' })
  assert.equal(denied.isError, false)
  assert.deepEqual(denied.value, { status: 'rejected', executed: false })
  assert.equal(approvals, 2)
  assert.equal(toolCalls.length, 2)
})

test('a claimed Exec task with an uncertain launch cannot be dispatched twice', async t => {
  const root = await mkdtemp(join(tmpdir(), 'owner-exec-unknown-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const agent = { id: 'root-agent', session: { header: { cwd: root } } }
  const runtime = Object.create(KernelRuntime.prototype)
  runtime.ready = Promise.resolve()
  runtime.store = { directory: root }
  runtime.rootFor = async () => root
  let starts = 0, approvals = 0
  runtime.ctx = {
    tools: { get: name => ['bash', 'read'].includes(name) ? {} : undefined },
    get: name => name === 'approval' ? { request: async () => { approvals++; return 'allowed-once' } }
      : name === 'subagents' ? { getProvider: () => ({}), start: async () => { starts++; throw new Error('connection lost during launch') } }
        : undefined,
  }
  const args = { task: 'Remove stale module', steps: ['Inspect module', 'Remove module'], reason: 'User approved the maintenance task' }
  const exec = { callId: 'task-1', signal: new AbortController().signal }
  await assert.rejects(runtime.execTask(agent, args, exec), /connection lost/)
  assert.equal(starts, 1)
  assert.equal(approvals, 1)
  assert.equal((await runtime.execTask(agent, args, exec)).status, 'outcome_unknown')
  assert.equal(starts, 1)
  assert.equal(approvals, 1)
  await assert.rejects(runtime.execTask(agent, { ...args, task: 'Changed task' }, exec), /reused with different scope/)
})
