import { resolveConfig } from './src/config.mjs'
import { installActionFusion } from './src/action-fusion.mjs'
import { installEvidenceReducer } from './src/evidence-reducer.mjs'
import { createLifetime } from './src/lifetime.mjs'
import { SettingsSchema } from './src/settings.mjs'

export const name = 'sol-efficiency'
export const inject = ['tools']
export const Config = SettingsSchema

/** Install independently opt-in features; disabled features acquire no services. */
export async function apply(ctx, config = {}) {
  const current = () => resolveConfig({
    actionFusion: config.actionFusion?.get?.() ?? config.actionFusion,
    evidenceReducer: config.evidenceReducer?.get?.() ?? config.evidenceReducer,
  })
  let runtime, previous, stopped = false
  let tail = Promise.resolve()
  // Serialize replacement so toggling cannot leave duplicate tools or reducers behind.
  const reconcile = () => {
    const resolved = current()
    tail = tail.catch(() => {}).then(async () => {
      const key = JSON.stringify(resolved)
      if (stopped || key === previous) return
      await runtime?.dispose()
      if (stopped) return
      runtime = ctx.plugin({ name: 'sol-efficiency-features', apply(child) {
        const fusionCalls = new Map()
        if (resolved.actionFusion.enabled) {
          child.inject(['fs'], scoped => installActionFusion(scoped, fusionCalls, createLifetime(scoped)))
        }
        if (resolved.evidenceReducer.enabled) {
          child.inject(['llm', 'fs', 'spillStore'], scoped =>
            installEvidenceReducer(scoped, resolved.evidenceReducer, fusionCalls, createLifetime(scoped)))
        }
      } })
      await runtime
      previous = key
    })
    return tail
  }
  ctx.effect(() => async () => { stopped = true; await tail; await runtime?.dispose() })
  await reconcile()
  ctx.on('loader/volatile-update', () => { void reconcile().catch(error => ctx.logger.error(error)) })
  ctx.provide('workflowComponent:sol', Object.freeze({ ready: true }))
}
