import { createHash } from 'node:crypto'

const alias = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x)
const kinds = new Set(['approval','question','other'])

export function stationDigest(rows, watched) {
  if (!Array.isArray(rows) || rows.length > 8 || !Array.isArray(watched) ||
      watched.length > 8 || watched.some(x => !alias(x)) || new Set(watched).size !== watched.length)
    throw new TypeError('invalid_digest')
  const seen = new Set()
  let hasGap = false
  const pending = [], digests = []
  for (const r of rows) {
    if (!alias(r?.session) || seen.has(r.session) || !['running','idle','inactive','unavailable'].includes(r.state) ||
        !Array.isArray(r.kinds) || r.kinds.length > 8 || r.kinds.some(k => !kinds.has(k)))
      throw new TypeError('invalid_row')
    seen.add(r.session)
    if (r.state === 'unavailable') hasGap = true
    const pendingKinds = r.state === 'unavailable' ? [] : [...new Set(r.kinds)].sort()
    // Existing source has no stable pending occurrence IDs or verified session deep links.
    if (pendingKinds.length) pending.push({session:r.session,kinds:pendingKinds,coverage:'kind_only',link:null})
    if (watched.includes(r.session)) digests.push({session:r.session,state:r.state,pending:pendingKinds})
  }
  for (const s of watched) if (!seen.has(s)) {
    hasGap = true
    digests.push({session:s,state:'unavailable',pending:[]})
  }
  return {pending,digests,coverage:hasGap?'partial':'snapshot',recommended_interval_s:300}
}

// Isolated test seam only. No real writer or owner authorizer is supplied by this module.
// Caller must own a separately authorized session inbox and consume a one-time trust decision.
export function createFixturePromptWriter({projection,consumeOwnerGrant,injectInbox,maxEntries=32}) {
  if (typeof consumeOwnerGrant !== 'function' || typeof injectInbox !== 'function' ||
      !Number.isSafeInteger(maxEntries) || maxEntries<1 || maxEntries>32) throw new TypeError('invalid_writer')
  const receipts = new Map()
  return async ({session,text,idempotencyKey,grant}={}) => {
    if (!alias(idempotencyKey)) throw new TypeError('invalid_key')
    const draft = projection.draftPrompt(session,text)
    const digest = createHash('sha256').update(JSON.stringify([draft.session,draft.text])).digest('hex')
    // No result or in-flight claim is exposed to unauthenticated callers.
    if (consumeOwnerGrant(grant,Object.freeze({session,digest,idempotencyKey})) !== true)
      throw new Error('owner_authorization_required')
    const old = receipts.get(idempotencyKey)
    if (old) {
      if (old !== digest) throw new Error('idempotency_conflict')
      return {state:'already_attempted'}
    }
    if (receipts.size>=maxEntries) throw new Error('receipt_capacity_reached')
    receipts.set(idempotencyKey,digest)
    await injectInbox(Object.freeze({session,text:draft.text}))
    return {state:'accepted_by_fixture'}
  }
}
