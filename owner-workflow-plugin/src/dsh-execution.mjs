
/** Public DSH 0.1.5 execution boundaries. Missing APIs are compatibility errors. */
export class DshCompatibilityError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DshCompatibilityError'
    this.code = 'DSH_INCOMPATIBLE_HOST'
  }
}

export function sessionEvents(agent) {
  if (typeof agent?.session?.snapshotEvents !== 'function') {
    throw new DshCompatibilityError('DSH 必须提供显式 Agent 和 Session.snapshotEvents()')
  }
  return agent.session.snapshotEvents()
}

/** Keep the native root/answerer checks; cancellation must also work if an answerer stalls. */
export async function askNativeQuestion(userQuestions, request) {
  if (request.agent === undefined || typeof userQuestions?.ask !== 'function') {
    throw new DshCompatibilityError('原生问询必须提供真实 Agent 和 UserQuestionService.ask()')
  }
  const { signal } = request
  signal?.throwIfAborted()
  let onAbort
  try {
    const cancelled = signal === undefined ? undefined : new Promise((_, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    const pending = userQuestions.ask(request)
    const answer = await (cancelled === undefined ? pending : Promise.race([pending, cancelled]))
    signal?.throwIfAborted()
    return answer
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

/** A reused session's latest turn may belong to another task. Bind by prompt id. */
export function terminalForPrompt(events, promptId) {
  if (promptId === undefined) return events.findLast(event => event.type === 'turn/end')
  const messages = events.filter(event => event.type === 'user/message' && event.data.id === promptId)
  const inbox = events.filter(event => event.type === 'agent/inbox/spliced'
    && event.data.inserted?.some(message => message.id === promptId))
  if (messages.length > 1 || messages.length === 0 && inbox.length !== 1) return undefined
  // Some hosts retain both the inbox admission and its materialized
  // user/message. Prefer the latter because it is already inside the turn.
  const delivery = messages[0] ?? inbox[0]
  const start = delivery.type === 'user/message'
    ? events.findLast(event => event.type === 'turn/start' && event.seq < delivery.seq)
    : events.find(event => event.type === 'turn/start' && event.seq > delivery.seq)
  if (start === undefined) return undefined
  return events.find(event => event.type === 'turn/end' && event.seq > start.seq && event.data.turn === start.data.turn)
}

/** Observation uses a read handle; it never activates an Agent or obtains a writer. */
export async function readSessionEvents(persistence, sessionId, { signal } = {}) {
  if (typeof persistence?.open !== 'function') {
    throw new DshCompatibilityError('DSH 必须提供 SessionPersistence.open()')
  }
  const handle = await persistence.open(sessionId, 'read', { signal })
  try {
    const result = await handle.read(undefined, undefined, { signal })
    return { header: handle.header, events: result.events }
  } finally {
    await handle.close()
  }
}
