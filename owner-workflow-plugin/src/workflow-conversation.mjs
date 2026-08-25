/** 判断状态是否仍占用当前 Git 项目唯一的 Workflow 槽位。 */
export function workflowOccupiesActiveSlot(state) {
  if (state?.finalized === true) return false
  if (state?.status === 'cancelled' && state?.temporaryArtifactsCleaned === true) return false
  return true
}

function actorSessionId(agent) {
  const id = agent?.id ?? agent?.session?.id
  if (typeof id !== 'string' || id.trim() === '') throw new Error('Workflow 会话缺少可核验的编号')
  return id
}

function sessionLineageOf(session) {
  const header = session?.header ?? {}
  const meta = header.meta ?? {}
  return {
    parentSessionId: typeof header.parentSession === 'string'
      ? header.parentSession
      : typeof meta.parentSession === 'string' ? meta.parentSession : null,
    seedLength: Number.isSafeInteger(header.seedLength)
      ? header.seedLength
      : Number.isSafeInteger(meta.seedLength) ? meta.seedLength : null,
    origin: header.origin ?? meta.origin,
  }
}

/** 把当前普通 fork 会话登记到 Workflow 的单根讨论树，并拒绝无关根与执行子代理。 */
export function registerConversationSession(runtime, state, agent, time = new Date().toISOString()) {
  const sessionId = actorSessionId(agent)
  state.conversationRootSessionId ??= state.orchestratorSessionId
  state.conversationNodes ??= [{
    sessionId: state.conversationRootSessionId,
    parentSessionId: null,
    seedLength: null,
    role: 'root',
    registeredAt: state.createdAt ?? time,
  }]
  const known = new Map(state.conversationNodes.map(node => [node.sessionId, node]))
  if (known.has(sessionId)) return known.get(sessionId)
  const pending = []
  let session = agent?.session
  let currentId = sessionId
  for (let depth = 0; depth < 64 && !known.has(currentId); depth += 1) {
    const lineage = sessionLineageOf(session)
    if (lineage.origin === 'subagent') throw new Error('执行子代理不能加入 Workflow 讨论树或提交 Intent')
    if (lineage.parentSessionId === null) {
      throw new Error(`会话 ${sessionId} 不属于当前 Workflow 的单根讨论树`)
    }
    pending.push({
      sessionId: currentId,
      parentSessionId: lineage.parentSessionId,
      seedLength: lineage.seedLength,
      role: 'discussion',
      registeredAt: time,
    })
    currentId = lineage.parentSessionId
    session = runtime.ctx?.sessions?.get?.(currentId)
      ?? runtime.ctx?.agents?.get?.(currentId)?.session
    if (session === undefined && !known.has(currentId)) {
      throw new Error(`无法核验会话 ${sessionId} 到 Workflow 根会话的完整 DSH fork 谱系`)
    }
  }
  if (!known.has(currentId)) throw new Error('Workflow 讨论树谱系深度超过安全上限')
  if (currentId !== state.conversationRootSessionId && known.get(currentId)?.role === 'execution') {
    throw new Error('执行子代理谱系不能成为普通讨论分支的父节点')
  }
  for (const node of pending.reverse()) {
    if (!known.has(node.sessionId)) {
      state.conversationNodes.push(node)
      known.set(node.sessionId, node)
    }
  }
  return known.get(sessionId)
}
