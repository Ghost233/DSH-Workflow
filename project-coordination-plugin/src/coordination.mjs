import { randomUUID, createHash } from 'node:crypto'
import { Store } from './store.mjs'

function criteriaList(value) {
  if (typeof value === 'string') return value.trim() ? [value] : []
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value
  throw new Error('Acceptance criteria must be text or a list of text items')
}

export class Coordination {
  constructor({ path, configuration, now = Date.now }) {
    this.store = new Store(path)
    this.configuration = structuredClone(configuration ?? { repositories: [], members: [] })
    this.now = now
    this.store.transaction(() => {
      for (const task of this.store.list('task')) {
        if (typeof task.criteria === 'string') this.store.put('task', task.id, { ...task, criteria: criteriaList(task.criteria) })
      }
    })
  }
  member(bot) {
    const member = this.store.get('member', bot) ?? this.configuration.members.find(row => row.bot === bot)
    if (!member) throw new Error('Unknown project member')
    return member
  }
  team(bot) {
    const self = this.member(bot)
    const members = [...this.configuration.members, ...this.store.list('member')]
      .filter(row => self.role === 'principal' || row.repository === self.repository || row.bot === self.parent)
      .map(({ bot, role, repository, parent, state }) => ({ bot, role, repository, parent, state: state ?? 'active' }))
    return { self, members, limits: this.configuration.limits ?? {},
      repositories: this.configuration.repositories.filter(row => self.role === 'principal' || row.repository === self.repository)
        .map(({ repository, manager, baseBranch }) => ({ repository, manager, baseBranch })),
      templates: (this.configuration.templates ?? []).map(({ name, role, modelPreset }) => ({ name, role, modelPreset })) }
  }
  assertRunning(task) {
    while (task) {
      if (task.hold) throw new Error('Task or ancestor is stopped')
      task = task.parentId && this.store.get('task', task.parentId)
    }
  }
  ingest(source) {
    const repository = this.configuration.repositories.find(row => row.repository === source.repository)
    if (!repository) throw new Error('Repository is not configured')
    return this.store.transaction(() => this.store.get('event', source.id) ?? this.store.put('event', source.id, {
      id: source.id, source, bot: repository.manager, canDevelop: repository.allowedActors.includes(source.actor),
      state: 'pending', createdAt: this.now(),
    }))
  }
  /** Only the Host adapter calls this, after reading a real admitted Human DM. */
  ingestHuman(bot, source) {
    const member = this.member(bot)
    if (!source.id || !source.text || !Number.isFinite(source.createdAt)
      || source.createdAt > this.now() || this.now() - source.createdAt > (this.configuration.sourceMaxAgeMs ?? 900000)) {
      throw new Error('Human source is unavailable or too old')
    }
    const repositories = member.role === 'principal' ? this.configuration.repositories.map(row => row.repository) : [member.repository]
    return this.store.transaction(() => {
      const prior = this.store.get('event', source.id)
      if (prior && (prior.bot !== bot || prior.source.text !== source.text)) throw new Error('Human source content changed')
      return prior ?? this.store.put('event', source.id, { id: source.id,
        source: { ...source, kind: 'chat', actor: 'human', repository: member.repository, repositories },
        bot, canDevelop: true, state: 'pending', createdAt: this.now() })
    })
  }
  claim(bot, { limit = 20, leaseMs = 60000 } = {}) {
    this.member(bot)
    return this.store.transaction(() => this.store.list('event')
      .filter(row => row.bot === bot && row.state !== 'handled' && (!row.leaseUntil || row.leaseUntil <= this.now()))
      .slice(0, Math.max(1, Math.min(limit, 100))).map(row => this.store.put('event', row.id, {
        ...row, state: 'leased', token: randomUUID(), leaseUntil: this.now() + leaseMs,
      })))
  }
  accept(bot, eventId, token, { title, criteria = [] }) {
    this.member(bot)
    return this.store.transaction(() => {
      const event = this.store.get('event', eventId)
      if (!event || event.bot !== bot) throw new Error('Wrong event recipient')
      if (event.taskId) return this.store.get('task', event.taskId)
      if (['draining', 'archived'].includes(this.member(bot).state)) throw new Error('Member is not accepting new work')
      if (event.token !== token || event.leaseUntil <= this.now()) throw new Error('Invalid or expired source receipt')
      if (event.source.kind === 'chat' && this.now() - event.source.createdAt > (this.configuration.sourceMaxAgeMs ?? 900000)) throw new Error('Source receipt is too old')
      if (!['issue', 'comment', 'chat'].includes(event.source.kind)) throw new Error('A project notification cannot create new authority')
      const existing = ['issue', 'comment'].includes(event.source.kind) && this.store.list('task').find(row => row.issue?.repository === event.source.repository && row.issue?.number === event.source.number)
      if (existing) {
        this.store.put('event', eventId, { ...event, state: 'handled', taskId: existing.id })
        if (event.canDevelop && !existing.canDevelop) this.saveTask(existing, { canDevelop: true, authorizationSourceId: eventId })
        this.notify(existing.owner, { id: `update:${event.id}`, kind: 'task-update', taskId: existing.id, actor: event.source.actor, text: event.source.text })
        return this.store.get('task', existing.id)
      }
      if (!title?.trim()) throw new Error('A task needs a title')
      const task = { id: randomUUID(), title: title.trim(), criteria: criteriaList(criteria), owner: bot,
        kind: event.source.kind === 'chat' && this.member(bot).role === 'principal' ? 'goal' : 'development',
        repositories: event.source.repositories ?? [event.source.repository],
        canDevelop: event.canDevelop, sourceId: eventId, issue: event.source.kind === 'issue' ? event.source : null,
        state: 'open', revision: 1, createdAt: this.now(), updatedAt: this.now() }
      this.store.put('task', task.id, task)
      this.store.put('event', eventId, { ...event, state: 'handled', taskId: task.id })
      return task
    })
  }
  task(bot, id) {
    const member = this.member(bot), task = this.store.get('task', id)
    if (!task) throw new Error('Unknown task')
    if (member.role !== 'principal' && task.owner !== bot && task.offeredTo !== bot
      && member.repository !== task.repositories[0]) throw new Error('Task access denied')
    return task
  }
  tasks(bot) {
    const member = this.member(bot)
    return this.store.list('task').filter(task => member.role === 'principal' || task.owner === bot
      || task.offeredTo === bot || member.repository === task.repositories[0])
  }
  isBelow(bot, parent) {
    const seen = new Set()
    while (bot && !seen.has(bot)) {
      seen.add(bot)
      const member = this.member(bot)
      if (member.parent === parent) return true
      bot = member.parent
    }
    return false
  }
  saveTask(task, changes) {
    return this.store.put('task', task.id, { ...task, ...changes, revision: task.revision + 1, updatedAt: this.now() })
  }
  notify(bot, source, canDevelop = false) {
    this.store.put('event', source.id, { id: source.id, source, bot, canDevelop, state: 'pending', createdAt: this.now() })
  }
  split(bot, taskId, children) {
    const parent = this.task(bot, taskId)
    this.assertRunning(parent)
    if (parent.owner !== bot || parent.hold || parent.state !== 'open') throw new Error('Task is not available for splitting')
    if (!Array.isArray(children) || !children.length || children.length > 30) throw new Error('Provide 1 to 30 sub-tasks')
    let ancestor = parent, depth = 0
    while (ancestor) { depth++; ancestor = ancestor.parentId && this.store.get('task', ancestor.parentId) }
    if (depth >= (this.configuration.limits?.maxDepth ?? 8)) throw new Error('Task hierarchy capacity is reached')
    for (const child of children) {
      if (this.member(child.bot).state === 'draining' || this.member(child.bot).state === 'archived') throw new Error('Member is draining or archived')
      if (!parent.repositories.includes(child.repository) || !this.isBelow(child.bot, bot)
        || this.member(child.bot).repository && this.member(child.bot).repository !== child.repository) throw new Error('Child scope exceeds the parent')
      if (!child.title?.trim() || !criteriaList(child.criteria ?? []).length) throw new Error('A child needs a title and acceptance criteria')
    }
    const key = `${taskId}:${createHash('sha256').update(JSON.stringify(children)).digest('hex')}`
    return this.store.transaction(() => {
      const prior = this.store.get('plan', key)
      if (prior) return prior.children.map(id => this.store.get('task', id))
      const result = children.map(child => {
        const task = { id: randomUUID(), title: child.title, criteria: criteriaList(child.criteria), parentId: parent.id,
          owner: bot, offeredTo: child.bot, repositories: [child.repository], canDevelop: parent.canDevelop,
          sourceId: parent.sourceId, state: 'open', revision: 1, createdAt: this.now(), updatedAt: this.now() }
        this.store.put('task', task.id, task)
        this.notify(child.bot, { id: `offer:${task.id}`, kind: 'task-offer', taskId: task.id,
          actor: bot, repository: child.repository, text: child.title }, parent.canDevelop)
        return task
      })
      this.store.put('plan', key, { children: result.map(task => task.id) })
      return result
    })
  }
  acceptTask(bot, taskId) {
    return this.store.transaction(() => {
      const task = this.task(bot, taskId)
      this.assertRunning(task)
      if (task.owner === bot && !task.offeredTo) return task
      if (['draining', 'archived'].includes(this.member(bot).state)) throw new Error('Member is not accepting new work')
      if (task.offeredTo !== bot) throw new Error('Wrong task recipient')
      if (task.hold) throw new Error('Task is stopped')
      const result = this.saveTask(task, { owner: bot, offeredTo: null })
      const event = this.store.get('event', `offer:${taskId}`)
      if (event) this.store.put('event', event.id, { ...event, state: 'handled' })
      return result
    })
  }
  rejectTask(bot, taskId, reason) {
    return this.store.transaction(() => {
      const task = this.task(bot, taskId)
      const parent = task.parentId && this.store.get('task', task.parentId)
      const owned = task.owner === bot && parent
      if (task.offeredTo !== bot && !owned || !reason?.trim()) throw new Error('Only the recipient may reject with a reason')
      if (this.store.list('attempt').some(row => row.taskId === taskId && !['ended', 'failed', 'stopped'].includes(row.state))) throw new Error('Stop and reconcile the active execution before returning the task')
      const result = this.saveTask(task, { owner: owned ? parent.owner : task.owner, offeredTo: null, waitReason: reason.trim() })
      const event = this.store.get('event', `offer:${taskId}`)
      if (event) this.store.put('event', event.id, { ...event, state: 'handled' })
      this.notify(result.owner, { id: `rejected:${task.id}:${result.revision}`, kind: 'task-rejected',
        taskId, actor: bot, repository: task.repositories[0], text: reason })
      return result
    })
  }
  reserve(bot, taskId) {
    const task = this.task(bot, taskId)
    this.assertRunning(task)
    if (task.state === 'completed' || task.state === 'delivered' || task.offeredTo) throw new Error('Task is not executable')
    if (task.owner !== bot || !task.canDevelop) throw new Error('Development authority is required')
    if (task.hold) throw new Error('Task is stopped')
    for (const edge of task.dependencies ?? []) {
      const predecessor = this.store.get('task', edge.taskId)
      if (!predecessor || predecessor.hold || !(edge.stage === 'completed' ? predecessor.state === 'completed'
        : predecessor.state === 'completed' || predecessor.state === 'delivered' && predecessor.accepted)) throw new Error('Task dependency is not ready')
    }
    if (!task.issue) throw new Error('A formal development task requires its GitHub Issue')
    return this.store.transaction(() => {
      const prior = this.store.list('attempt').find(row => row.taskId === taskId && row.bot === bot
        && (row.sessionId || !['ended', 'failed'].includes(row.state)))
      if (prior) return prior
      if (this.store.list('attempt').filter(row => !['ended', 'failed', 'stopped', 'waiting_dependency'].includes(row.state)).length
        >= (this.configuration.limits?.maxRunning ?? 8)) throw new Error('Project execution capacity is reached')
      const attempt = { id: randomUUID(), taskId, bot, repository: task.repositories[0], state: 'reserved', createdAt: this.now() }
      return this.store.put('attempt', attempt.id, attempt)
    })
  }
  prepare(id, workspace) {
    const attempt = this.store.get('attempt', id)
    if (!attempt || attempt.sessionId || !workspace.grantId || !workspace.workspaceId || !workspace.path) throw new Error('Invalid execution preparation')
    this.assertRunning(this.store.get('task', attempt.taskId))
    return this.store.put('attempt', id, { ...attempt, ...workspace, state: 'prepared' })
  }
  matches(attempt, facts) {
    return facts.bot === attempt.bot && facts.grantId === attempt.grantId && facts.workspaceId === attempt.workspaceId
      && facts.path === attempt.path && (!attempt.sessionId || facts.sessionId === attempt.sessionId)
  }
  bind(bot, id, facts) {
    return this.store.transaction(() => {
      const attempt = this.store.get('attempt', id)
      if (!attempt || attempt.bot !== bot || !attempt.grantId || !facts.sessionId || !this.matches(attempt, facts)
        || !attempt.sessionId && facts.continuityKey !== id) throw new Error('Native execution binding does not match')
      const task = this.task(bot, attempt.taskId)
      if (task.owner !== bot || task.offeredTo) throw new Error('This execution no longer owns the task')
      this.assertRunning(task)
      if (task.hold) throw new Error('Task is stopped')
      if (this.store.list('attempt').some(row => row.sessionId === facts.sessionId && row.taskId !== attempt.taskId)) {
        throw new Error('A native Session cannot own two project tasks')
      }
      return this.store.put('attempt', id, { ...attempt, sessionId: facts.sessionId,
        sourceEventId: facts.sourceEventId, state: 'running', updatedAt: this.now() })
    })
  }
  reconcile(id, facts) {
    const attempt = this.store.get('attempt', id)
    if (!attempt || !attempt.sessionId || !this.matches(attempt, facts)) throw new Error('Execution outcome needs reconciliation')
    const task = this.store.get('task', attempt.taskId)
    return this.store.put('attempt', id, { ...attempt, state: task.hold ? 'stop_requested'
      : ['delivered', 'completed'].includes(task.state) && ['idle', 'stopped'].includes(facts.activity) ? 'ended'
      : facts.activity === 'error' ? attempt.state === 'waiting_dependency' ? attempt.state : 'interrupted'
      : facts.activity === 'working' ? 'running' : attempt.state, updatedAt: this.now() })
  }
  attempts(bot) {
    this.member(bot)
    return this.store.list('attempt').filter(row => row.bot === bot || this.member(bot).role === 'principal')
  }
  linkIssue(taskId, issue) {
    const task = this.store.get('task', taskId)
    if (!task || !task.repositories.includes(issue.repository) || !Number.isSafeInteger(issue.number) || issue.number < 1) throw new Error('Issue binding is outside task scope')
    return this.saveTask(task, { issue })
  }
  recordVerification(attemptId, evidence) {
    const attempt = this.store.get('attempt', attemptId)
    if (!attempt || !evidence.id || !/^[a-f0-9]{40}$/.test(evidence.head) || !evidence.commands?.length
      || evidence.commands.some(row => !row.command || row.exitCode !== 0)) throw new Error('Verification did not pass')
    return this.store.put('verification', evidence.id, { ...evidence, attemptId, at: this.now() })
  }
  report(bot, attemptId, report) {
    return this.store.transaction(() => {
      const attempt = this.store.get('attempt', attemptId)
      if (!attempt || attempt.bot !== bot || !attempt.sessionId) throw new Error('Wrong execution reporter')
      const task = this.task(bot, attempt.taskId)
      if (task.owner !== bot || task.offeredTo) throw new Error('This execution no longer owns the task')
      this.assertRunning(task)
      if (task.state === 'completed') throw new Error('Task is already complete')
      if (task.hold) throw new Error('Task is stopped')
      if (!['progress', 'waiting', 'blocked', 'delivered', 'no-change'].includes(report.state) || !report.summary?.trim()) throw new Error('Invalid project report')
      if (report.state === 'delivered') {
        const verification = this.store.get('verification', report.evidence?.verificationId)
        const pull = new RegExp(`^https://github\\.com/${task.repositories[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/([1-9][0-9]*)$`).exec(report.evidence?.pull ?? '')
        if (!pull || !verification || verification.attemptId !== attemptId || verification.head !== report.evidence.head) throw new Error('Delivery requires matching verification and a repository PR')
      }
      if (report.state === 'no-change' && !report.evidence?.reason) throw new Error('No-change results require evidence')
      const id = createHash('sha256').update(JSON.stringify([attemptId, report])).digest('hex')
      if (this.store.get('report', id)) return task
      if (!this.store.get('report', id)) this.store.put('report', id, { ...report, id, taskId: task.id, bot, attemptId, createdAt: this.now() })
      const terminal = ['delivered', 'no-change'].includes(report.state)
      const blocked = ['blocked', 'waiting'].includes(report.state)
      const result = this.saveTask(task, { state: terminal ? 'delivered' : blocked ? 'open' : task.state,
        latestReportId: id, evidence: terminal ? report.evidence : task.evidence, noChange: terminal ? report.state === 'no-change' : task.noChange,
        waitReason: ['blocked', 'waiting'].includes(report.state) ? report.summary : null,
        accepted: terminal || blocked ? false : task.accepted })
      const superior = task.parentId ? this.store.get('task', task.parentId)?.owner : this.member(bot).parent
      if (superior && report.state !== 'progress') {
        this.notify(superior, { id: `report:${id}`, kind: 'child-report', taskId: task.id,
          actor: bot, repository: task.repositories[0], text: report.summary })
      }
      return result
    })
  }
  review(bot, taskId, accepted, summary) {
    if (typeof accepted !== 'boolean') throw new Error('Parent acceptance must be a boolean')
    return this.store.transaction(() => {
      const task = this.task(bot, taskId), parent = task.parentId && this.store.get('task', task.parentId)
      if ((parent?.owner ?? this.member(task.owner).parent) !== bot) throw new Error('Only the direct parent may accept a result')
      if (task.state !== 'delivered' || !summary?.trim() || task.hold) throw new Error('Task is not reviewable')
      const pull = task.evidence?.pull && /\/pull\/(\d+)$/.exec(task.evidence.pull)
      const observation = pull && this.store.get('pull', `${task.repositories[0]}:${pull[1]}`)
      const children = this.store.list('task').filter(row => row.parentId === taskId)
      const completed = task.noChange || children.length && children.every(row => row.state === 'completed') || observation?.merged && observation.head === task.evidence?.head
      const result = this.saveTask(task, { accepted, review: summary, state: accepted ? completed ? 'completed' : 'delivered' : 'open' })
      if (parent) this.finishParents(parent.id)
      this.notify(bot, { id: `review:${task.id}:${result.revision}`, kind: 'review-result', taskId, actor: bot, text: summary })
      return result
    })
  }
  finishParents(parentId) {
    const parent = this.store.get('task', parentId)
    const children = this.store.list('task').filter(row => row.parentId === parentId)
    if (parent && !parent.hold && children.length && children.every(row => row.state === 'completed'
      || row.state === 'delivered' && row.accepted) && !parent.evidence) {
      const waitReason = children.every(row => row.state === 'completed') ? 'All children completed; parent acceptance is required' : 'Children delivered; awaiting merge'
      const saved = this.saveTask(parent, { state: 'delivered', waitReason })
      const superior = parent.parentId ? this.store.get('task', parent.parentId)?.owner : this.member(parent.owner).parent
      if (superior) this.notify(superior, { id: `aggregate:${parent.id}:${saved.revision}`, kind: 'child-report', taskId: parent.id, actor: parent.owner, text: waitReason })
    }
  }
  observePull(repository, number, observation) {
    return this.store.transaction(() => {
      for (const task of this.store.list('task')) {
        if (!task.repositories.includes(repository) || !task.evidence?.pull?.endsWith(`/pull/${number}`)) continue
        this.store.put('pull', `${repository}:${number}`, observation)
        if (observation.head === task.evidence.head && observation.merged && task.accepted && !task.hold) {
          this.saveTask(task, { state: 'completed' })
          if (task.parentId) this.finishParents(task.parentId)
        }
      }
    })
  }
  consumeHuman(bot, receipt, purpose) {
    const event = receipt && this.store.get('event', receipt.sourceId)
    if (!event || event.bot !== bot || event.source.kind !== 'chat' || !event.canDevelop
      || event.token !== receipt.token || event.leaseUntil <= this.now() || event.taskId
      || this.now() - event.source.createdAt > (this.configuration.sourceMaxAgeMs ?? 900000)
      || event.purpose && event.purpose !== purpose) throw new Error('A fresh user source receipt is required')
    this.store.put('event', event.id, { ...event, state: 'handled', purpose })
    return event.id
  }
  subtree(taskId) {
    const tasks = this.store.list('task'), result = [], pending = [taskId], seen = new Set()
    while (pending.length) {
      const id = pending.shift()
      if (seen.has(id)) continue
      seen.add(id)
      const task = tasks.find(row => row.id === id)
      if (task) result.push(task)
      pending.push(...tasks.filter(row => row.parentId === id).map(row => row.id))
    }
    return result
  }
  stop(bot, taskId, receipt) {
    const task = this.task(bot, taskId)
    if (task.owner !== bot && this.member(bot).role !== 'principal' && !this.isBelow(task.owner, bot)) throw new Error('Stop authority is required')
    return this.store.transaction(() => {
      const sourceId = receipt && this.consumeHuman(bot, receipt, `stop:${taskId}`)
      const hold = { id: randomUUID(), rootTaskId: taskId, kind: sourceId ? 'human' : 'bot', actor: bot, sourceId, at: this.now() }
      const affected = this.subtree(taskId)
      for (const row of affected) this.saveTask(row, { hold: row.hold ?? hold })
      for (const attempt of this.store.list('attempt').filter(row => affected.some(task => task.id === row.taskId))) {
        if (!['ended', 'failed'].includes(attempt.state)) this.store.put('attempt', attempt.id, { ...attempt,
          state: !attempt.sessionId && !attempt.creationOffered ? 'stopped' : 'stop_requested' })
      }
      return this.store.get('task', taskId)
    })
  }
  resume(bot, taskId, receipt) {
    const task = this.task(bot, taskId)
    if (task.parentId) this.assertRunning(this.store.get('task', task.parentId))
    if (!task.hold) return task
    if (task.owner !== bot && this.member(bot).role !== 'principal' && !this.isBelow(task.owner, bot)) throw new Error('Resume authority is required')
    return this.store.transaction(() => {
      if (task.hold.kind === 'human') this.consumeHuman(bot, receipt, `resume:${taskId}`)
      else if (task.hold.actor !== bot && !this.isBelow(task.hold.actor, bot)) throw new Error('Only the stopping member or its superior may resume')
      for (const row of this.subtree(taskId)) if (row.hold?.id === task.hold.id) this.saveTask(row, { hold: null })
      return this.store.get('task', taskId)
    })
  }
  addDependency(bot, taskId, predecessorId, stage) {
    const task = this.task(bot, taskId)
    this.task(bot, predecessorId)
    const parent = task.parentId && this.store.get('task', task.parentId)
    if (task.owner !== bot && parent?.owner !== bot && this.member(bot).role !== 'principal') throw new Error('Dependency authority is required')
    if (!['delivered', 'completed'].includes(stage)) throw new Error('Invalid dependency stage')
    const visit = [predecessorId], seen = new Set()
    while (visit.length) {
      const id = visit.pop()
      if (id === taskId) throw new Error('Task dependency cycle')
      if (seen.has(id)) continue
      seen.add(id)
      const row = this.store.get('task', id)
      visit.push(...(row?.dependencies ?? []).map(edge => edge.taskId))
    }
    let ancestor = task.parentId
    while (ancestor) {
      if (ancestor === predecessorId) throw new Error('Task dependency cycle through a parent')
      ancestor = this.store.get('task', ancestor)?.parentId
    }
    return this.saveTask(task, { dependencies: [...(task.dependencies ?? []).filter(row => row.taskId !== predecessorId), { taskId: predecessorId, stage }] })
  }
  waitFor(attemptId, dependency, summary, retryAfterMs) {
    const attempt = this.store.get('attempt', attemptId)
    if (!attempt || !['model', 'network', 'execution'].includes(dependency)) throw new Error('Unknown recoverable dependency')
    const task = this.store.get('task', attempt.taskId)
    const failures = (attempt.failures ?? 0) + 1
    const delay = retryAfterMs ?? Math.min(300000, 1000 * 2 ** Math.min(failures, 9))
    const result = this.store.put('attempt', attemptId, { ...attempt, state: task.hold ? 'stop_requested' : 'waiting_dependency',
      dependency, failures, retryAt: this.now() + Math.max(1000, delay), summary })
    this.saveTask(task, { waitReason: `Waiting for ${dependency}: ${summary}` })
    return result
  }
  finalize(bot, taskId, summary) {
    const task = this.task(bot, taskId)
    const children = this.store.list('task').filter(row => row.parentId === taskId)
    if (task.owner !== bot || task.parentId || task.hold || !summary?.trim() || !children.length
      || children.some(row => row.state !== 'completed')) throw new Error('Root acceptance conditions are not met')
    return this.saveTask(task, { state: 'completed', accepted: true, review: summary, waitReason: null })
  }
  requestMember(bot, taskId, templateName) {
    const task = this.task(bot, taskId)
    this.assertRunning(task)
    const template = this.configuration.templates?.find(row => row.name === templateName)
    if (!template || !['lead', 'executor'].includes(template.role) || !template.modelPreset) throw new Error('Unapproved member template')
    if (task.owner !== bot || task.state !== 'open' || !task.canDevelop || task.repositories.length !== 1
      || ['draining', 'archived'].includes(this.member(bot).state)) throw new Error('Member creation exceeds task authority')
    const id = `${taskId}:${templateName}`
    return this.store.transaction(() => {
      const previous = this.store.get('member-request', id)
      if (previous) return previous
      const active = this.configuration.members.length + this.store.list('member').filter(row => row.state !== 'archived').length
        + this.store.list('member-request').filter(row => row.state === 'pending').length
      if (active >= (this.configuration.limits?.maxMembers ?? 16)) throw new Error('Project member capacity is reached')
      return this.store.put('member-request', id, { id, bot, taskId, template: templateName,
        repository: task.repositories[0], operationKey: `project-member:${createHash('sha256').update(id).digest('hex')}`, state: 'pending' })
    })
  }
  bindMember(requestId, bot) {
    return this.store.transaction(() => {
      const request = this.store.get('member-request', requestId)
      if (!request || !bot || request.member && request.member !== bot) throw new Error('Member creation receipt mismatch')
      if (this.configuration.members.some(row => row.bot === bot)) throw new Error('An existing permanent member cannot be replaced')
      const template = this.configuration.templates.find(row => row.name === request.template)
      const member = { bot, role: template.role, repository: request.repository, parent: request.bot,
        template: template.name, state: 'active', operationKey: request.operationKey }
      this.store.put('member', bot, member)
      this.store.put('member-request', requestId, { ...request, member: bot, state: 'created' })
      return member
    })
  }
  drainMember(bot, memberBot) {
    const member = this.store.get('member', memberBot)
    if (!member || !this.isBelow(memberBot, bot)) throw new Error('Only a member superior may drain a temporary member')
    for (const row of this.store.list('member')) if (row.state !== 'archived' && (row.bot === memberBot || this.isBelow(row.bot, memberBot))) {
      this.store.put('member', row.bot, { ...row, state: 'draining' })
    }
    return this.store.get('member', memberBot)
  }
  readyForArchive(bot) {
    const member = this.store.get('member', bot)
    return member?.state === 'draining' && !this.store.list('task').some(row => (row.owner === bot || row.offeredTo === bot)
      && row.state !== 'completed') && !this.store.list('attempt').some(row => row.bot === bot && !['ended', 'failed', 'stopped'].includes(row.state))
      && !this.store.list('member').some(row => row.parent === bot && row.state !== 'archived')
  }
  acknowledge(bot, eventId, token) {
    const event = this.store.get('event', eventId)
    if (!event || event.bot !== bot || event.token !== token || event.leaseUntil <= this.now()) throw new Error('Invalid event receipt')
    if (['issue', 'comment', 'chat'].includes(event.source.kind) && !event.taskId && !event.purpose) throw new Error('An external request needs an explicit decision')
    return this.store.put('event', eventId, { ...event, state: 'handled' })
  }
  decideSource(bot, eventId, token, summary) {
    const event = this.store.get('event', eventId)
    if (!event || event.bot !== bot || event.token !== token || event.leaseUntil <= this.now() || !summary?.trim()) throw new Error('A live source receipt and decision are required')
    this.store.put('event', eventId, { ...event, state: 'handled', decision: summary })
    const parent = this.member(bot).parent
    if (parent) this.notify(parent, { id: `decision:${eventId}`, kind: 'source-decision', actor: bot, text: summary })
    return { eventId, summary }
  }
  reassign(bot, taskId, recipient) {
    const task = this.task(bot, taskId), parent = task.parentId && this.store.get('task', task.parentId)
    this.assertRunning(task)
    if (task.owner !== bot || task.state !== 'open' || parent && parent.owner !== bot || !this.isBelow(recipient, bot)
      || ['draining', 'archived'].includes(this.member(recipient).state)
      || this.member(recipient).repository !== task.repositories[0] || this.store.list('attempt').some(row => row.taskId === taskId && !['ended', 'failed'].includes(row.state))) throw new Error('Task cannot be reassigned')
    const result = this.saveTask(task, { offeredTo: recipient, waitReason: null })
    this.notify(recipient, { id: `offer:${taskId}`, kind: 'task-offer', taskId, actor: bot, text: task.title }, task.canDevelop)
    return result
  }
  cursor(repository) { return this.store.get('cursor', repository)?.since }
  setCursor(repository, since) { this.store.put('cursor', repository, { since }) }
  beginEffect(id, kind, taskId, payload) {
    return this.store.transaction(() => {
      const previous = this.store.get('effect', id)
      if (previous) {
        if (previous.kind !== kind || previous.taskId !== taskId || JSON.stringify(previous.payload) !== JSON.stringify(payload)) throw new Error('Operation key was reused for different work')
        return previous
      }
      return this.store.put('effect', id, { id, kind, taskId, payload, state: 'prepared', createdAt: this.now() })
    })
  }
  effectState(id, state, receipt) {
    const effect = this.store.get('effect', id)
    if (!effect) throw new Error('Unknown project operation')
    return this.store.put('effect', id, { ...effect, state, ...(receipt ? { receipt } : {}), updatedAt: this.now() })
  }
  close() { this.store.close() }
}
