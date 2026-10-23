import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import { probeBrowserHarness } from './probe.mjs'

export const name = 'dsh-workflow-browser-harness'
export const inject = ['shell']

export function apply(ctx) {
  const controller = new AbortController()
  let pending
  const service = { inspect: () => {
    controller.signal.throwIfAborted()
    return pending ??= probeBrowserHarness(ctx.shell, { signal: controller.signal }).finally(() => { pending = undefined })
  } }
  ctx.effect(() => async () => {
    controller.abort()
    await pending
  })
  service.typertRemote = bindTypertRemote(service, 'browserHarness')
  ctx.provide('browserHarness', service)
  ctx.inject(['typert'], child => {
    child.effect(() => child.typert.register({ package: 'dsh-workflow-browser-harness', face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: [{
        id: 'dsh-workflow-browser-harness#browserHarness/inspect', service: 'browserHarness', namespace: 'browserHarness',
        method: 'inspect', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
      }] }))
  })
}

export default { name, inject, apply }
