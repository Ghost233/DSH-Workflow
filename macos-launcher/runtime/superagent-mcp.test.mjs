import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as adapter from './superagent-mcp.mjs'

test('exposes shared MCP tools to a live Superagent worker, preserves its guard, and removes them when the task ends', async t => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const tickets = new Map([['ticket-a', { id: 'ticket-a' }]])
  const agents = new Map()
  ctx.reflect.provide('agents', { get: id => agents.get(id), list: () => [...agents.values()] })
  ctx.reflect.provide('orchestrator', { store: { tickets } })
  await ctx.plugin(adapter)
  t.after(() => ctx.fiber.dispose())
  let calls = 0
  ctx.tools.register(defineContentToolFixture({ name: 'read', description: '', parameters: {}, async execute() { return [] } }))
  const unregister = ctx.tools.register(defineContentToolFixture({ name: 'mcp__fixture__echo', description: '', parameters: {},
    async execute() { calls++; return [{ type: 'text', text: 'MCP fixture result' }] } }))
  ctx.tools.register(defineContentToolFixture({ name: 'list_mcp_resources', description: '', parameters: {}, async execute() { return [] } }))
  const agent = { id: 'worker-ticket-a', session: { header: {} }, status: 'idle' }
  let owner
  await ctx.plugin({ name: 'test-agent-owner', inject: ['tools'], apply(child) { owner = child } })
  const scope = createScope(owner, agent); agent.ctx = scope.ctx; agents.set(agent.id, agent)
  agent.ctx.tools.restrict({ allow: ['read'] })
  agent.ctx.tools.guard(() => tickets.get('ticket-a')?.ended ? 'Ticket ended' : undefined)
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'mcp__fixture__echo'), false)
  await ctx.serial('agent/created', { agent })
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'mcp__fixture__echo'), true)
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'list_mcp_resources'), true)
  const child = { id: 'child-a', session: { header: { parentSession: agent.id } }, status: 'idle' }
  const childScope = createScope(owner, child); child.ctx = childScope.ctx; agents.set(child.id, child)
  child.ctx.tools.restrict({ allow: ['read'] })
  await ctx.serial('agent/created', { agent: child })
  assert.equal(ctx.tools.schemas(child).some(item => item.name === 'mcp__fixture__echo'), true)
  const ordinary = { id: 'ordinary', session: { header: {} }, status: 'idle' }
  const ordinaryScope = createScope(owner, ordinary); ordinary.ctx = ordinaryScope.ctx; agents.set(ordinary.id, ordinary)
  ordinary.ctx.tools.restrict({ allow: ['read'] })
  await ctx.serial('agent/created', { agent: ordinary })
  assert.equal(ctx.tools.schemas(ordinary).some(item => item.name === 'mcp__fixture__echo'), false)
  const run = () => ctx.tools.execute({ agent, name: 'mcp__fixture__echo', arguments: {}, callId: 'fixture', signal: new AbortController().signal })
  assert.match(JSON.stringify(await run()), /MCP fixture result/)
  assert.equal(calls, 1)
  tickets.set('ticket-a', { id: 'ticket-a', ended: { by: 'worker' } })
  const denied = await run()
  assert.equal(denied.isError, true)
  assert.equal(calls, 1)
  await new Promise(setImmediate)
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'mcp__fixture__echo'), false)
  assert.equal(ctx.tools.schemas(child).some(item => item.name === 'mcp__fixture__echo'), false)
  tickets.set('ticket-a', { id: 'ticket-a' })
  ctx.emit('agent/status', { agent, status: 'running' })
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'mcp__fixture__echo'), true)
  unregister()
  await new Promise(setImmediate)
  assert.equal(ctx.tools.schemas(agent).some(item => item.name === 'mcp__fixture__echo'), false)
  await ordinaryScope.dispose()
  await childScope.dispose()
  await scope.dispose()
})
