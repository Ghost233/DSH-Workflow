function byIdentity(left, right) {
  return String(left[0]).localeCompare(String(right[0]))
}

/** Excludes timestamps, revisions, wakeups and observation counters from liveness. */
export function workflowSemanticProgressToken(view) {
  return JSON.stringify({
    planVersion: view?.planVersion ?? null,
    tasks: (view?.tasks ?? []).map(task => [task.taskId, task.phase]).sort(byIdentity),
    actions: (view?.actions ?? []).map(action => [action.id, action.status]).sort(byIdentity),
  })
}

/** Waits for a test outcome while bounding both semantic inactivity and total time. */
export async function waitForWorkflowProgress({
  readView,
  shouldStop,
  clock = Date.now,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  pollMs = 25,
  idleMs = 10_000,
  absoluteMs = 40_000,
}) {
  const startedAt = clock()
  const absoluteDeadline = startedAt + absoluteMs
  let idleDeadline = Math.min(absoluteDeadline, startedAt + idleMs)
  let previousToken
  let view
  for (;;) {
    view = await readView()
    const now = clock()
    if (shouldStop(view)) return { view, reason: 'condition', elapsedMs: now - startedAt }
    const token = workflowSemanticProgressToken(view)
    if (token !== previousToken) {
      previousToken = token
      idleDeadline = Math.min(absoluteDeadline, now + idleMs)
    }
    if (now >= absoluteDeadline) return { view, reason: 'absolute_timeout', elapsedMs: now - startedAt }
    if (now >= idleDeadline) return { view, reason: 'idle_timeout', elapsedMs: now - startedAt }
    await sleep(Math.min(pollMs, absoluteDeadline - now, idleDeadline - now))
  }
}
