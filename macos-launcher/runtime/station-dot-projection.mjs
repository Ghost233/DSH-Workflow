import { createHash, randomUUID } from 'node:crypto'

const outcomes = new Set(['completed','error','aborted','other'])
const scopePattern = /^[A-Za-z0-9_-]{1,64}$/

// Pure candidate API core: no listener, browser auth, legacy credential, or DSH mutation.
export function createStationDotProjection(allowed, {epoch = randomUUID(), capacity = 32} = {}) {
  if (!Array.isArray(allowed) || !allowed.length || allowed.length > 8 ||
      new Set(allowed).size !== allowed.length || allowed.some(x => !scopePattern.test(x)) ||
      !scopePattern.test(epoch) || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 32)
    throw new TypeError('invalid_scope')
  const scopes = new Set(allowed)
  const latestTurns = new Map()
  const events = []
  let seq = 0
  const cursor = number => epoch + '.' + number
  const opaque = (session, turn) => createHash('sha256').update(JSON.stringify([epoch,session,turn])).digest('hex')
  return Object.freeze({
    observe(session, turn, outcome, time) {
      if (!scopes.has(session) || !Number.isSafeInteger(turn) || turn <= (latestTurns.get(session) ?? 0) ||
          !outcomes.has(outcome) || !Number.isSafeInteger(time) || time < 1 || time > 8640000000000000)
        return false
      latestTurns.set(session, turn)
      events.push(Object.freeze({id:opaque(session,turn),seq:++seq,session,outcome,ended_at:new Date(time).toISOString()}))
      if (events.length > capacity) events.shift()
      return true
    },
    read(after = null, limit = 32) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) throw new TypeError('invalid_limit')
      const oldest = events[0]?.seq ?? seq+1
      let number = oldest - 1
      let gap = null
      if (after !== null) {
        const match = typeof after === 'string' && /^([A-Za-z0-9_-]{1,64})\.(0|[1-9][0-9]{0,15})$/.exec(after)
        if (!match || !Number.isSafeInteger(Number(match[2]))) throw new TypeError('invalid_cursor')
        if (match[1] !== epoch) gap = 'host_restarted'
        else if (Number(match[2]) < oldest - 1) gap = 'retention_exceeded'
        else if (Number(match[2]) > seq) throw new TypeError('invalid_cursor')
        else number = Number(match[2])
      } else if (oldest > 1) gap = 'retention_exceeded'
      const rows = events.filter(event => event.seq > number).slice(0, limit)
      const next = rows.at(-1)?.seq ?? number
      return {epoch, gap, events:rows, cursor:cursor(next), has_more:seq > next}
    },
    // Stable pending identities and safe deep links are unsupported by the current source.
    approvalAdvice(session, kinds) {
      if (!scopes.has(session) || !Array.isArray(kinds) || kinds.some(x => !['approval','question','other'].includes(x)))
        throw new TypeError('invalid_pending')
      return {session, kinds:[...new Set(kinds)], coverage:'kind_only', can_approve:false, link:null}
    },
    // Store or send nothing. Execution must go through a separately authorized writer.
    draftPrompt(session, text) {
      if (!scopes.has(session) || typeof text !== 'string' || text.includes('\0') ||
          !text.trim() || Buffer.byteLength(text) > 4096) throw new TypeError('invalid_draft')
      return Object.freeze({session, text, state:'draft_only'})
    },
  })
}
