/** Observe DSH native events without changing the watched request or Agent. */
export function createAgentMonitor(config = {}, { now = Date.now, onAlert = () => {}, onRecord = () => {}, judge } = {}) {
  const value = (key, fallback) => config[key]?.get?.() ?? config[key] ?? fallback
  const agents = new Map(), alerts = [], diagnostics = []
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
  function recover(row, kind = 'no-output') {
    if (!row.reported.has(kind)) return
    const recoveredAt = now()
    if (kind === 'no-output') row.recoveredAt = recoveredAt
    else row.semanticRecoveredAt = recoveredAt
    for (const alert of alerts) {
      if (alert.agentId === row.agentId && alert.attemptId === row.attemptId
        && alert.kind === kind && alert.recoveredAt === undefined) alert.recoveredAt = recoveredAt
    }
    row.reported.delete(kind)
    record({ recordType: 'recovery', at: now(), ...metadata(row), kind,
      reason: kind === 'no-output' ? '模型输出恢复' : '模型取得进展', recoveredAt })
  }
  const failureFacts = failure => ({
    code: typeof failure?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(failure.code) ? failure.code : 'UNKNOWN',
    ...Number.isInteger(failure?.status) && failure.status >= 100 && failure.status <= 599 ? { status: failure.status } : {},
  })
  function terminal(row, kind, reason, evidence) {
    if (row.terminalAlerted) return
    row.terminalAlerted = true
    report(row, kind, reason, evidence)
  }
  function output(row, index, length, delta = false) {
    const previous = row.outputLengths.get(index) ?? 0
    const current = delta ? previous + length : length
    if (current <= previous) return false
    row.outputLengths.set(index, current)
    recover(row)
    row.lastOutputAt = now()
    row.lastCheckAt = now()
    row.noOutputCount = 0
    row.seenContent = true
    return true
  }
  function progress(row) {
    row.check?.abort()
    row.progressGeneration++
    row.thinkingAt = undefined
    row.semanticCheckAt = undefined
    row.reasoning = ''
    row.semanticCount = 0
    row.semanticStatus = 'progress'
    recover(row, 'semantic-stall')
  }
  const begin = (row, facts) => {
    row.check?.abort()
    Object.assign(row, { active: true, lastOutputAt: now(), lastCheckAt: now(), noOutputCount: 0,
      recoveredAt: undefined, seenFinish: false, seenContent: false, terminalAlerted: false,
      thinkingAt: undefined, semanticCount: 0, semanticStatus: 'waiting', semanticRecoveredAt: undefined,
      reasoning: '', outputLengths: new Map(), check: undefined, semanticCheckAt: undefined, semanticModelName: value('jevModelName', ''), progressGeneration: 0, ...facts })
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
      } else if (type === 'agent/inbox/claimed') {
        row.task = (payload.message?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n').slice(-2000)
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
            output(row, chunk.index, chunk.type === 'tool-call-delta' ? chunk.argumentsDelta.length : chunk.text.length, true)
            if (chunk.type === 'reasoning-delta') {
              row.thinkingAt ??= now()
              row.reasoning = (row.reasoning + chunk.text).slice(-6000)
            } else {
              progress(row)
            }
          }
          if (chunk.type === 'block-end' && (chunk.block?.text?.length || chunk.block?.type === 'tool-call')) {
            row.seenContent = true
            const length = (chunk.block.type === 'tool-call' ? chunk.block.arguments : chunk.block.text)?.length ?? 0
            const previousLength = row.outputLengths.get(chunk.index) ?? 0
            const added = output(row, chunk.index, length)
            if (added && (chunk.block.type === 'text' || chunk.block.type === 'tool-call')) progress(row)
            else if (added && chunk.block.type === 'reasoning') {
              row.thinkingAt ??= now()
              row.reasoning = (row.reasoning + chunk.block.text.slice(previousLength)).slice(-6000)
            }
          }
          if (chunk.type === 'finish') {
            row.seenFinish = true
            row.active = false
            row.check?.abort()
            if (['error', 'aborted'].includes(chunk.reason?.kind) && !row.signal?.aborted) {
              terminal(row, 'model-error', '模型请求异常结束', { ...failureFacts(chunk.reason.failure), finishKind: chunk.reason.kind, source: 'finish' })
            } else if (chunk.reason?.kind === 'max-tokens') {
              terminal(row, 'output-limit', '模型达到输出上限，响应可能不完整', { source: 'finish' })
            } else if (chunk.reason?.kind === 'stop' && !row.seenContent) {
              terminal(row, 'empty-output', '模型请求完成但没有返回内容', { source: 'finish', finishKind: 'stop' })
            }
          }
        } else if (frame.type === 'end') {
          if (!row.seenFinish && !row.signal?.aborted && !row.reported.has('model-error')) {
            terminal(row, 'unmarked-end', '模型流结束但没有明确完成标记；可能被静默截断',
              { source: 'assistant-stream-end', outcome: frame.outcome?.kind, empty: !row.seenContent })
          }
          row.active = false
          row.check?.abort()
        }
        row.frameRevision = frame.revision
      } else if (type === 'agent/status' && payload.status === 'idle') {
        row.active = false
        row.check?.abort()
      } else if (type === 'agent/error' && !row.signal?.aborted) {
        terminal(row, 'model-error', '代理执行异常', { ...failureFacts(payload.error?.failure ?? payload.error), source: 'agent-error' })
      } else if (type === 'agent/disposed') {
        row.check?.abort()
        agents.delete(id)
      }
    },
    async tick() {
      const timestamp = now(), interval = value('checkIntervalMs', 60_000), threshold = value('noOutputThreshold', 5)
      for (const row of agents.values()) {
        if (!row.active || row.signal?.aborted || timestamp - row.lastCheckAt < interval) continue
        // Advance the scheduled round, rather than shifting it to a late callback.
        // A delayed callback counts once and consumes its current round, so duplicates cannot catch up missed checks.
        row.lastCheckAt += Math.floor((timestamp - row.lastCheckAt) / interval) * interval
        row.noOutputCount++
        if (row.noOutputCount >= threshold) {
          report(row, 'no-output', '模型请求连续检查没有可见输出；尚未确认上游原因',
            { silentMs: timestamp - row.lastOutputAt, consecutiveChecks: row.noOutputCount }, true)
        }
      }
      const checks = []
      for (const row of agents.values()) {
        const modelName = value('jevModelName', '')
        if (row.semanticModelName !== modelName) {
          row.check?.abort()
          row.semanticCount = 0
          row.semanticModelName = modelName
          row.lastJudgment = undefined
          row.semanticStatus = 'waiting'
        }
        const wait = value('semanticWaitMs', 180_000)
        if (!judge || !row.active || row.signal?.aborted || row.check || row.thinkingAt === undefined
          || timestamp < row.thinkingAt + wait) continue
        const deadline = row.semanticCheckAt ?? row.thinkingAt + wait - interval
        if (timestamp - deadline < interval) continue
        row.semanticCheckAt = deadline + Math.floor((timestamp - deadline) / interval) * interval
        const attempt = row.attemptId, generation = row.progressGeneration, check = new AbortController()
        row.check = check
        checks.push((async () => {
          try {
            const evidence = { task: row.task ?? '', reasoning: row.reasoning }
            const result = await judge(evidence, check.signal)
            if (closed || !row.active || row.attemptId !== attempt || row.progressGeneration !== generation
              || check.signal.aborted || value('jevModelName', '') !== modelName) return
            row.lastJudgment = { at: now(), status: result.status, model: result.model, modelName: result.modelName,
              elapsedMs: result.elapsedMs, probabilities: result.probabilities, confidence: result.confidence,
              selection: result.selection, declaredChoice: result.declaredChoice, argmax: result.argmax, error: result.error }
            record({ recordType: 'judgment', at: now(), ...metadata(row), ...row.lastJudgment,
              ...value('debugEvidence', false) ? { debugEvidence: evidence } : {} })
            if (result.ok && result.status === 'anomaly') {
              row.semanticStatus = 'anomaly'
              row.semanticCount++
              if (row.semanticCount >= value('semanticThreshold', 5)) {
                report(row, 'semantic-stall', 'JEV 判断持续思考疑似停滞；请人工确认',
                  { ...row.lastJudgment, consecutiveChecks: row.semanticCount }, true)
              }
            } else {
              row.semanticCount = 0
              row.semanticStatus = result.ok && result.status === 'normal' ? 'normal' : 'unavailable'
              if (row.semanticStatus === 'normal') recover(row, 'semantic-stall')
              else {
                diagnostics.push({ at: now(), agentId: row.agentId, kind: 'jev-unavailable', ...row.lastJudgment })
                if (diagnostics.length > 20) diagnostics.shift()
              }
            }
          } finally { if (row.check === check) row.check = undefined }
        })())
      }
      await Promise.all(checks)
    },
    snapshot() {
      return { semanticAvailable: Boolean(judge), agents: [...agents.values()].map(({ reported, signal, check, task, reasoning, outputLengths, ...row }) => row),
        alerts: structuredClone(alerts), diagnostics: structuredClone(diagnostics) }
    },
    close() { closed = true; for (const row of agents.values()) row.check?.abort(); agents.clear() },
  }
}
