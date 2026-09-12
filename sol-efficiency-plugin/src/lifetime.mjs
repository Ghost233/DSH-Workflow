/** Tie optional work to both the caller and the plugin fiber; unload waits for cancellation to settle. */
export function createLifetime(ctx) {
  const controller = new AbortController()
  const pending = new Set()
  ctx.effect(() => async () => {
    controller.abort(new Error('sol-efficiency unloaded'))
    await Promise.allSettled([...pending])
  })
  return {
    run(parent, task) {
      const signal = AbortSignal.any([parent, controller.signal])
      const promise = Promise.resolve().then(() => task(signal))
      pending.add(promise)
      const done = () => pending.delete(promise)
      promise.then(done, done)
      return promise
    },
  }
}
