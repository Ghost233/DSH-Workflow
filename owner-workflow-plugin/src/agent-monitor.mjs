/** Observe DSH native events without changing the watched request or Agent. */
export function createAgentMonitor(config = {}, { now = Date.now, onAlert = () => {}, onRecord = () => {} } = {}) {
  const value = (key, fallback) => config[key]?.get?.() ?? config[key] ?? fallback
  const agents = new Map(), alerts = []
  let closed = false
  const metadata = row => ({ agentId: row.agentId, role: row.role, parentId: row.parentId,
    provider: row.provider, model: row.model, turn: row.turn, step: row.step, attemptId: row.attemptId })
  function record(entry) {
    Promise.resolve().then(() => closed ? undefined : onRecord(entry)).catch(() => {})
  }
  function report(row, kind, reason, evidence = {}, repeated = false) {
    if (closed || !repeated && row.reported.has(kind)) return
    row.reported.add(kind)
    const alert = { recordType: 'alert', at: now(), ...metadata(row), kind, reason, evidence }
    alerts.push(alert)
    if (alerts.length > 200) alerts.shift()
    record(alert)
    Promise.resolve().then(() => closed ? undefined : onAlert(alert)).catch(() => {})
  }
  function recover(row) {
    if (!row.reported.has('no-output')) return
    row.recoveredAt = now()
    for (const alert of alerts) {
      if (alert.agentId === row.agentId && alert.attemptId === row.attemptId
        && alert.kind === 'no-output' && alert.recoveredAt === undefined) alert.recoveredAt = row.recoveredAt
    }
    row.reported.delete('no-output')
    record({ recordType: 'recovery', at: now(), ...metadata(row), kind: 'no-output',
      reason: '模型输出恢复', recoveredAt: row.recoveredAt })
  }
  const begin = (row, facts) => {
    Object.assign(row, { active: true, lastOutputAt: now(), lastCheckAt: now(), noOutputCount: 0,
      recoveredAt: undefined, seenFinish: false, ...facts })
    row.reported.clear()
  }
  return {
    observe(type, payload) {
      if (closed || !payload.agent?.id) return
      const id = payload.agent.id
      let row = agents.get(id)
      if (!row) {
        const header = payload.agent.session?.header
        row = { agentId: id, role: header?.origin === 'subagent' || header?.parentSession ? 'child' : 'main',
          parentId: header?.parentSession, active: false, noOutputCount: 0, reported: new Set() }
        agents.set(id, row)
      }
      if (type === 'agent/request') {
        begin(row, { turn: payload.turn, step: payload.step, provider: payload.provider,
          model: payload.model, signal: payload.signal, attemptId: undefined })
      } else if (type === 'agent/request-config') {
        Object.assign(row, { provider: payload.provider, model: payload.model })
      } else if (type === 'agent/assistant-stream') {
        const frame = payload.frame
        if (frame.revision !== undefined && row.frameRevision !== undefined && frame.revision <= row.frameRevision) return
        if (frame.type === 'start') {
          begin(row, { attemptId: frame.attemptId, turn: frame.turn, step: frame.step })
        } else if (frame.attemptId !== undefined && frame.attemptId !== row.attemptId) {
          return
        } else if (frame.type === 'chunk') {
          const chunk = frame.chunk
          if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text?.length
            || chunk.type === 'tool-call-delta' && chunk.argumentsDelta?.length) {
            recover(row)
            row.lastOutputAt = now()
            row.lastCheckAt = now()
            row.noOutputCount = 0
          }
          if (chunk.type === 'finish') {
            row.seenFinish = true
            row.active = false
            if (['error', 'aborted'].includes(chunk.reason?.kind) && !row.signal?.aborted) {
              report(row, 'model-error', '模型请求异常结束', { code: chunk.reason.failure?.code ?? chunk.reason.kind })
            } else if (chunk.reason?.kind === 'max-tokens') {
              report(row, 'output-limit', '模型达到输出上限，响应可能不完整', { source: 'finish' })
            }
          }
        } else if (frame.type === 'end') {
          if (!row.seenFinish && !row.signal?.aborted && !row.reported.has('model-error')) {
            report(row, 'unmarked-end', '模型流结束但没有明确完成标记；可能被静默截断', { outcome: frame.outcome?.kind })
          }
          row.active = false
        }
        row.frameRevision = frame.revision
      } else if (type === 'agent/status' && payload.status === 'idle') {
        row.active = false
      } else if (type === 'agent/error' && !row.signal?.aborted) {
        report(row, 'model-error', '代理执行异常', { code: payload.error?.code ?? 'AGENT_ERROR' })
      } else if (type === 'agent/disposed') {
        agents.delete(id)
      }
    },
    async tick() {
      const timestamp = now(), interval = value('checkIntervalMs', 60_000), threshold = value('noOutputThreshold', 5)
      for (const row of agents.values()) {
        if (!row.active || row.signal?.aborted || timestamp - row.lastCheckAt < interval) continue
        row.lastCheckAt = timestamp
        row.noOutputCount++
        if (row.noOutputCount >= threshold) {
          report(row, 'no-output', '模型请求连续检查没有可见输出；尚未确认上游原因',
            { silentMs: timestamp - row.lastOutputAt, consecutiveChecks: row.noOutputCount }, true)
        }
      }
    },
    snapshot() {
      return { semanticAvailable: false, agents: [...agents.values()].map(({ reported, signal, ...row }) => row),
        alerts: structuredClone(alerts), diagnostics: [] }
    },
    close() { closed = true; agents.clear() },
  }
}
