import { realpath } from 'node:fs/promises'
import { KernelRuntime } from './kernel-runtime.mjs'
import { kernelToolDefinitions } from './kernel-tools.mjs'
import { registerOrchestratorDocumentGuards } from './orchestrator-documents.mjs'
import { KERNEL_ORCHESTRATOR_GUIDANCE, KERNEL_WORKFLOW_SKILL } from './kernel-guidance.mjs'
import { assertOwnerTeamActivation } from './owner-team.mjs'

const hosts = new WeakMap()

// Read-only host lookup: the Dashboard never creates an executor to display it.
export function kernelHostHealth(host, canonicalCatalogRoot) {
  const runtime = hosts.get(host)?.get(canonicalCatalogRoot)?.runtime
  return runtime ? { ...runtime.runner.health, hostId: runtime.host.hostId } : { status: 'offline', lastCheckAt: null, nextWakeAt: null }
}

/** Register the production Owner root scope on the shared catalog executor. */
export function registerKernelRoot(ctx, runtime) {
  const disposers = kernelToolDefinitions(runtime).map(definition => ctx.tools.register(definition))
  disposers.push(ctx.tools.guard(exec => runtime.checkToolExecution(exec)))
  if (!runtime.documentGuards) runtime.documentGuards = registerOrchestratorDocumentGuards(runtime.ctx, runtime)
  ctx.systemPrompt.section({ name: 'owner-workflow:kernel', order: -20, text: KERNEL_ORCHESTRATOR_GUIDANCE })
  const skills = ctx.get('skills')
  if (skills) disposers.push(skills.register(KERNEL_WORKFLOW_SKILL))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}

export async function applyKernel(ctx, config = {}) {
  if (config.surfaceOnly) {
    ctx.on('agent/created', ({ agent }) => assertOwnerTeamActivation(agent), { global: true, prepend: true })
    ctx.provide('workflowComponent:owner', Object.freeze({ ready: true }))
    return
  }
  const host = ctx.root
  let catalogs = hosts.get(host)
  if (!catalogs) hosts.set(host, catalogs = new Map())
  const root = await realpath(config.catalogRoot ?? process.env.DSH_OWNER_WORKFLOW_CATALOG_ROOT ?? process.cwd())
  let entry = catalogs.get(root)
  if (!entry) {
    const runtime = new KernelRuntime(host, { catalogRoot: root, parallel: config.parallel ?? 3,
      onError: error => console.error('[owner-kernel]', error.stack ?? error) })
    entry = { runtime, references: 0 }; catalogs.set(root, entry)
    try { await runtime.ready } catch (error) { catalogs.delete(root); throw error }
  }
  await entry.runtime.ready
  if (config.parallel !== undefined && config.parallel !== entry.runtime.store.parallel) throw new Error('Owner preset scopes sharing a catalog must use the same host capacity')
  entry.references++
  let unregister
  try { unregister = registerKernelRoot(ctx, entry.runtime) }
  catch (error) { if (--entry.references === 0) { catalogs.delete(root); await entry.runtime.dispose() }; throw error }
  // One shared host driver, including persisted actions awaiting restored roots.
  entry.runtime.runner.start()
  ctx.effect(() => async () => {
    unregister()
    if (--entry.references === 0) { await entry.runtime.dispose(); catalogs.delete(root) }
  }, 'Unified Owner kernel scope')
  return entry.runtime
}
