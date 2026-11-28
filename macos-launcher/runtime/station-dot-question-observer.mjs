import {randomUUID} from 'node:crypto'
import {classifyStationCard} from './station-dot-card-types.mjs'

const EVENT = 'user-questions/request'
const validId = /^[A-Za-z0-9_-]{1,128}$/

// Passive only: never answer a waterfall, alter its result, or store content.
// The existing Gateway exposes only event name and session, so concurrent
// same-session waterfalls fail closed instead of guessing a correlation.
export function installStationQuestionObserver(ctx, { capacity = 128, now = Date.now } = {}) {
  if (typeof ctx?.on !== 'function' || typeof ctx.typertGateway?.getPendingRemoteEvents !== 'function') {
    throw Error('question_source_unavailable')
  }
  const sessions = new Map()
  let count = 0, closed = false, overflow = 0
  const detach = ctx.on(EVENT, function observe(request, next) {
    const sessionId = request?.agent?.session?.id
    if (closed || typeof sessionId !== 'string' || !validId.test(sessionId)) return next()
    const {kind} = classifyStationCard(EVENT, request)
    const row = Object.freeze({session: sessionId, kind, occurrence: randomUUID(), at: now()})
    const signal = request.signal
    const bucket = sessions.get(sessionId) ?? new Set()
    const tracked = count < capacity
    if (tracked) { bucket.add(row); sessions.set(sessionId, bucket); count += 1 }
    else overflow += 1
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      signal?.removeEventListener('abort', finish)
      if (tracked) {
        if (bucket.delete(row)) count -= 1
        if (!bucket.size && sessions.get(sessionId) === bucket) sessions.delete(sessionId)
      } else if (!closed) overflow -= 1
    }
    signal?.addEventListener('abort', finish, {once:true})
    if (signal?.aborted) finish()
    let result
    try { result = next() } catch (error) {finish();throw error}
    Promise.resolve(result).then(finish, finish)
    return result
  }, {prepend:true})
  if (typeof detach !== 'function') throw Error('question_source_unavailable')
  function pending() {
    if (closed || overflow) return []
    const matches = new Map()
    for (const item of ctx.typertGateway.getPendingRemoteEvents()) {
      if (item.event !== EVENT) continue
      const id = String(item.agentId)
      if (sessions.has(id)) matches.set(id, (matches.get(id) ?? 0) + 1)
    }
    const out = []
    for (const [id, rows] of sessions) {
      if (rows.size !== 1 || matches.get(id) !== 1) continue
      const row = rows.values().next().value
      if (row.kind !== 'unknown') out.push(row)
    }
    return out
  }
  return {
    pending,
    current(sessionId) { return pending().find(x=>x.session===sessionId)?.kind ?? null },
    close() { if (!closed) {closed=true;sessions.clear();detach()} },
  }
}
