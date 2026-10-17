export const name = 'dsh-workflow-stop-inspection'
export const inject = ['agents', 'jobs', 'workflowHostInstance']

/** Read the actual Host services through their public interfaces, outside the HTTP admission lock. */
export function apply(ctx) {
  const instanceId = ctx.workflowHostInstance.instanceId
  const inspectionEpoch = randomUUID(), admissions = []
  let revision = 0, closed = false, generation = 0, droppedRevision = 0
  const changed = () => { revision++ }
  const record = value => {
    changed()
    let initiatorId = null
    try { initiatorId = ctx.agents.currentInitiator()?.id ?? null } catch { /* Closing admission cannot establish a new producer. */ }
    admissions.push({ ...value, revision, initiatorId })
    if (admissions.length > 4096) droppedRevision = admissions.shift().revision
  }
  ctx.on('agent/created', changed, { global: true })
  ctx.on('agent/inbox/inserted', ({ agent, message }) => record({ kind: 'message', id: message.id,
    agentId: agent.id, source: message.source?.kind ?? 'unknown' }), { global: true })
  ctx.on('schedule/changed', () => record({ kind: 'schedule' }), { global: true })
  const unsubscribe = ctx.jobs.events.subscribe({ owners: 'all' }, event => {
    if (event.type === 'registered') record({ kind: 'job', id: event.job.id, agentId: event.job.owner ?? null })
  })
  const inspect = async () => {
    const before = revision
    const schedule = ctx.get('schedule')
    if (!schedule) throw new Error('提醒库存服务不可用。')
    const reminders = (await schedule.catalog()).filter(row => row.status === 'active')
    const agents = ctx.agents.list()
    const work = [], jobs = new Map()
    for (const agent of agents) {
      if (agent.status === 'running') work.push({ kind: 'agent', id: agent.id, agentId: agent.id, label: `运行中的代理 ${agent.id}` })
      for (const message of [...agent.inbox.nextStep, ...agent.inbox.nextTurn]) {
        work.push({ kind: 'message', id: message.id, agentId: agent.id, label: `代理 ${agent.id} 的待处理消息` })
      }
      for (const job of ctx.jobs.list(agent.id)) jobs.set(job.id, job)
      const terminals = ctx.get('terminalController')?.list(agent.id) ?? []
      for (const terminal of terminals) {
        if (terminal.state !== 'exited') work.push({ kind: 'terminal', id: terminal.id, agentId: agent.id,
          label: `运行中的终端 ${terminal.title || terminal.id}`, state: terminal.state })
      }
    }
    for (const job of ctx.jobs.list()) jobs.set(job.id, job)
    for (const job of jobs.values()) {
      if (['running', 'stopping'].includes(job.status)) work.push({ kind: 'job', id: job.id, agentId: job.owner ?? null, label: job.label, state: job.status })
    }
    for (const reminder of reminders) {
      work.push({ kind: 'reminder', id: reminder.id, agentId: reminder.sessionId,
        label: reminder.title, scheduledAt: reminder.scheduledAt })
    }
    if (before !== revision) throw new Error('检查期间有新工作进入，请重新检查。')
    return { instanceId, inspectionEpoch, revision, work, unknown: false }
  }
  const readInspection = async () => {
    try { return await inspect() }
    catch (error) { return { instanceId, inspectionEpoch, revision, work: [], unknown: true,
      message: `任务状态未知：${error instanceof Error ? error.message : String(error)}` } }
  }
  const covered = async (first, current, confirmed) => {
    if (!first || !Array.isArray(first.work)) return false
    if ((first.unknown || first.changed || first.work.length) && confirmed !== true) return false
    if (first.unknown) return current.unknown || current.work.length === 0
    if (current.unknown || first.inspectionEpoch !== inspectionEpoch || !Number.isSafeInteger(first.revision)
      || first.revision > revision || first.revision < droppedRevision) return false
    const key = row => `${row.kind}:${row.agentId ?? ''}:${row.id}`
    const originals = new Set(first.work.map(key)), messages = new Set(first.work.filter(row => row.kind === 'message').map(row => row.id))
    const agents = new Set(first.work.filter(row => row.kind !== 'terminal' && row.agentId).map(row => row.agentId))
    const jobOwners = new Set(first.work.filter(row => row.kind === 'job').map(row => row.agentId))
    const live = ctx.agents.list()
    let expanded
    do {
      expanded = false
      for (const agent of live) {
        if (!agents.has(agent.id) && live.some(parent => agents.has(parent.id) && ctx.agents.isOwnedBy(agent.id, parent))) {
          agents.add(agent.id); expanded = true
        }
      }
    } while (expanded)
    const since = admissions.filter(row => row.revision > first.revision)
    const deliveries = new Set()
    if (since.some(row => row.kind === 'message' && row.source === 'schedule')) {
      for (const reminder of first.work.filter(row => row.kind === 'reminder')) {
        const history = await ctx.get('schedule').history({ id: reminder.id, sessionId: reminder.agentId, limit: 100 })
        for (const record of history.records ?? []) deliveries.add(`${reminder.agentId}:${record.messageId}`)
      }
    }
    // The event log covers inputs already claimed by a driver, beyond the current inbox projection.
    if (current.revision !== revision) return false
    const newJobs = new Set()
    for (const admission of since) {
      if (admission.kind === 'message') {
        const inherited = admission.source === 'schedule' && deliveries.has(`${admission.agentId}:${admission.id}`)
          || admission.source === 'tool-jobs' && jobOwners.has(admission.agentId)
          || !['user', 'user-rpc', 'schedule', 'unknown'].includes(admission.source) && agents.has(admission.initiatorId)
        if (!messages.has(admission.id) && !inherited) return false
        messages.add(admission.id)
      }
      if (admission.kind === 'job') {
        if (!agents.has(admission.initiatorId)) return false
        newJobs.add(key(admission))
      }
    }
    return current.work.every(row => originals.has(key(row))
      || row.kind === 'agent' && agents.has(row.id)
      || row.kind === 'message' && messages.has(row.id)
      || row.kind === 'job' && newJobs.has(key(row))
      || row.kind === 'reminder' && agents.has(row.agentId) && since.some(change => change.kind === 'schedule')
        && since.filter(change => change.kind === 'schedule').every(change => agents.has(change.initiatorId)))
  }
  const message = input => {
    if (input?.type !== 'workflow-stop-inspection' || !Number.isSafeInteger(input.requestId)) return
    const currentGeneration = ++generation
    if (input.action === 'cancel') {
      if (process.connected) process.send({ type: input.type, requestId: input.requestId, instanceId, canceled: true }, () => {})
      return
    }
    void (async () => {
      let value
      try {
        if (closed) throw new Error('DSH 任务检查已停止')
        value = await readInspection()
        if (input.action === 'commit') {
          const allowed = await covered(input.accepted, value, input.confirmed)
          if (closed || currentGeneration !== generation || !Number.isSafeInteger(input.expiresAt)
            || Date.now() > input.expiresAt || input.instanceId !== instanceId || typeof input.operationId !== 'string') {
            throw new Error('停止确认已失效，请重新检查。')
          }
          value = allowed ? { instanceId, committed: true, operationId: input.operationId, action: 'commit' }
            : { ...value, committed: false, changed: true, message: value.message || '确认范围外有新工作，请重新确认。' }
        }
      } catch (error) {
        value = { instanceId, inspectionEpoch, revision, work: [], unknown: true, committed: false,
          message: error instanceof Error ? error.message : String(error) }
      }
      if (process.connected) process.send({ type: input.type, requestId: input.requestId, ...value }, () => {})
      // The existing official listener owns teardown; no private disposer or reversible teardown is called.
      if (value.committed === true) process.emit('message', { type: 'shutdown' })
    })()
  }
  process.on('message', message)
  ctx.effect(() => () => { closed = true; generation++; unsubscribe(); process.removeListener('message', message) })
}
import { randomUUID } from 'node:crypto'
