import { resolveConfig } from './src/config.mjs'
import { installActionFusion } from './src/action-fusion.mjs'
import { installEvidenceReducer } from './src/evidence-reducer.mjs'
import { createLifetime } from './src/lifetime.mjs'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { SettingsSchema } from './src/settings.mjs'

export const name = 'sol-efficiency'
export const inject = ['tools']

/** Install independently opt-in features; disabled features acquire no services. */
export async function apply(ctx, config = {}) {
  const entry = resolveConfig(config)
  let source = () => entry
  let runtime, previous, stopped = false
  let tail = Promise.resolve()
  // Serialize replacement so toggling cannot leave duplicate tools or reducers behind.
  const reconcile = () => {
    const resolved = resolveConfig(source())
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
  installSettingsSection(ctx, settingsNamespace('sol-efficiency'), SettingsSchema, entry, {
    validate: resolveConfig,
    setSource: current => { source = current },
    onChange: () => { void reconcile().catch(error => ctx.logger.error(error)) },
  })
}
