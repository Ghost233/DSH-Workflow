import { attachManagerLifetime } from './superagent-lifetime.mjs'

export const name = 'dsh-workflow-superagent-mcp'
export const inject = ['agents', 'orchestrator', 'tools']
const resourceTools = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])

/** Reuse the Host's MCP connections while exposing their tools only to its active workers. */
export function apply(ctx) {
  if (process.env.DSH_WORKFLOW_MANAGED_SUPERAGENT === '1') attachManagerLifetime(ctx, process)
  const bindings = new Map()
  let closed = false, scheduled = false
  const clear = agent => {
    const tools = bindings.get(agent)
    if (!tools) return
    bindings.delete(agent)
    for (const { dispose } of tools.values()) dispose()
  }
  const ticketOf = agent => {
    let current = agent
    for (let depth = 0; current && depth < 9; depth++) {
      const id = String(current.id)
      if (id.startsWith('worker-')) return ctx.orchestrator.store.tickets.get(id.slice(7))
      const parent = current.session?.header?.parentSession
      current = parent ? ctx.agents.get(parent) : undefined
    }
  }
  const sync = agent => {
    if (closed) return
    const ticket = ticketOf(agent)
    if (!ticket || ticket.ended) { clear(agent); return }
    const current = bindings.get(agent) ?? new Map()
    bindings.set(agent, current)
    const desired = new Map(ctx.tools.schemas().filter(item => item.name.startsWith('mcp__') || resourceTools.has(item.name))
      .map(item => [item.name, ctx.tools.get(item.name)]).filter(([, tool]) => tool))
    for (const [name, binding] of current) {
      if (desired.get(name) !== binding.tool) { binding.dispose(); current.delete(name) }
    }
    for (const [name, tool] of desired) {
      if (!current.has(name)) current.set(name, { tool, dispose: agent.ctx.tools.register(tool) })
    }
  }
  const refresh = () => {
    if (closed || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!closed) for (const agent of [...bindings.keys()]) sync(agent)
    })
  }
  ctx.on('agent/created', ({ agent }) => { sync(agent) })
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'running' || bindings.has(agent)) sync(agent) })
  ctx.on('agent/disposed', ({ agent }) => { clear(agent) })
  ctx.on('tools/change', refresh)
  ctx.on('tools/result', execution => { if (execution.agent && bindings.has(execution.agent)) sync(execution.agent) })
  const timer = setInterval(refresh, 1000)
  timer.unref()
  ctx.effect(() => () => {
    closed = true
    clearInterval(timer)
    for (const agent of [...bindings.keys()]) clear(agent)
  })
}
