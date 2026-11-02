export const name = 'dsh-workflow-superagent-lifetime'

/** Stop the Host if its owning Station manager disappears unexpectedly. */
export function attachManagerLifetime(ctx, runtime) {
  if (runtime.env.DSH_WORKFLOW_MANAGED_SUPERAGENT !== '1') throw new Error('缺少 Superagent 管理连接。')
  let closed = false, disconnected = false
  const stop = () => { if (!closed) { disconnected = true; runtime.kill(runtime.pid, 'SIGINT') } }
  const cleanup = () => {
    if (disconnected) {
      // This Host leads the group; keep its already-completed shutdown from
      // being reported as a signal exit when notifying surviving descendants.
      runtime.on('SIGTERM', () => {})
      try { runtime.kill(-runtime.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  runtime.once('disconnect', stop)
  runtime.once('exit', cleanup)
  if (!runtime.connected) queueMicrotask(stop)
  ctx.effect(() => () => {
    closed = true
    runtime.removeListener('disconnect', stop)
    if (!disconnected) runtime.removeListener('exit', cleanup)
  })
}

export function apply(ctx) { attachManagerLifetime(ctx, process) }
