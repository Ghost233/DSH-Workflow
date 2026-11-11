import { createHash } from 'node:crypto'

const wakePrompt = 'Project coordination has durable pending work. Call project_work inbox, inspect tasks and accept or explicitly decide each source. Decompose work, dispatch through native Assignments and review child evidence. Summarize material changes upward. Use existing execution bindings during recovery; do not replay GitHub writes or bypass stopped tasks.'
export class CoordinationRuntime {
  constructor({ service, bridge, github, core, log = () => {} }) {
    Object.assign(this, { service, bridge, github, core, log })
    this.abort = new AbortController()
    this.running = undefined
    this.closed = false
  }
  members() {
    return [...this.service.configuration.members, ...this.service.store.list('member')]
  }
  async ensureProjectGroup(repository) {
    const { core, service } = this
    const sections = core.roster.snapshot().sections
    const saved = service.store.get('project-group', repository.repository)
    let section = sections.find(row => row.id === saved?.sectionId)
    if (!section) {
      const project = repository.repository.split('/').at(-1)
      const name = service.configuration.repositories.filter(row => row.repository.split('/').at(-1) === project).length > 1
        ? repository.repository : project
      const occupied = new Set(service.store.list('project-group').filter(row => row.repository !== repository.repository).map(row => row.sectionId))
      const matches = sections.filter(row => row.name === name && !occupied.has(row.id))
      if (matches.length > 1) throw new Error(`Multiple project groups named ${name} need reconciliation`)
      section = matches[0] ?? await core.roster.sectionCreate(name)
      service.store.put('project-group', repository.repository, { repository: repository.repository, sectionId: section.id })
    }
    const channels = core.channels.list()
    for (const member of this.members().filter(row => row.repository === repository.repository && row.role !== 'principal')) {
      const channel = channels.find(row => row.type === 'dm' && row.botSlug === member.bot && !row.deletedAt && !row.remoteBot)
      if (channel && !section.channelIds.includes(channel.id)) await core.roster.channelAssign(channel.id, section.id)
    }
  }
  notice(bot, id, text, taskId) {
    let parent = this.service.member(bot).parent
    const seen = new Set([bot])
    while (parent && !seen.has(parent) && this.service.member(parent).state === 'archived') {
      seen.add(parent); parent = this.service.member(parent).parent
    }
    for (const recipient of new Set([bot, parent].filter(Boolean))) {
      const key = `${id}:${recipient}`
      if (!this.service.store.get('event', key)) this.service.notify(recipient, { id: key,
        kind: 'dependency-wait', actor: bot, text, ...(taskId ? { taskId } : {}) })
    }
  }
  wake(bot) {
    const { service, core } = this
    const held = core.runtime.heldCause?.(bot)
    if (held) {
      const id = `native-hold:${bot}:${held}`
      const parent = service.member(bot).parent
      if (parent && !service.store.get('event', id)) service.notify(parent, { id,
        kind: 'reconciliation-required', actor: bot, text: `Tobs holds this member (${held}); native owner recovery is required. Project tasks and source authority are retained.` })
      return false
    }
    const schedules = core.schedules.list(bot).filter(row => row.title === '[Project coordination] Durable inbox' && row.prompt === wakePrompt && row.locked)
    if (schedules.length > 1) throw new Error('Duplicate coordination schedules require reconciliation')
    let schedule = schedules[0]
    if (schedule && service.store.get('native-backoff', bot)?.failures > 0) {
      service.store.put('retired-schedule', schedule.id, { bot, at: service.now(), reason: 'Recover failed native wake' })
      core.schedules.remove(bot, schedule.id, 'human')
      schedule = undefined
    }
    schedule ??= core.schedules.create(bot, { title: '[Project coordination] Durable inbox', prompt: wakePrompt,
      enabled: false, locked: true, trigger: { kind: 'cron', expression: '0 0 1 1 *', timeZone: 'UTC' } }, 'human')
    core.schedules.runNow(bot, schedule.id)
    return true
  }
  start() {
    const run = () => {
      if (!this.running && !this.closed) {
        this.running = this.tick().catch(error => this.log(`Coordination tick failed: ${error.message}`)).finally(() => { this.running = undefined })
      }
    }
    this.timer = setInterval(run, 1000)
    this.timer.unref?.()
    run()
  }
  async tick() {
    const { service, core } = this
    for (const repository of service.configuration.repositories) {
      this.abort.signal.throwIfAborted()
      const key = `poll:${repository.repository}`, prior = service.store.get('retry', key)
      if (prior?.at > service.now()) continue
      try {
        await this.github.poll(repository)
        service.store.put('retry', key, { at: service.now() + (service.configuration.pollMs ?? 60000), failures: 0 })
      } catch (error) {
        const failures = (prior?.failures ?? 0) + 1
        service.store.put('retry', key, { at: service.now() + (error.retryAfterMs ?? Math.min(300000, 1000 * 2 ** Math.min(failures, 9))), failures,
          dependency: error.dependency ?? 'network' })
        if (failures === 1) {
          const text = `GitHub polling is waiting for ${error.dependency ?? 'network'} recovery.`
          for (const bot of new Set([repository.manager, service.member(repository.manager).parent].filter(Boolean))) {
            service.notify(bot, { id: `poll-wait:${repository.repository}:${service.now()}:${bot}`,
              kind: 'dependency-wait', actor: repository.manager, text })
          }
        }
      }
    }
    for (const task of service.store.list('task')) {
      const report = task.latestReportId && service.store.get('report', task.latestReportId)
      const summary = task.review ?? report?.summary
      if (!task.issue || !summary || report?.state === 'progress' && task.state !== 'completed') continue
      const key = `feedback:${task.id}`, previous = service.store.get('retry', key)
      if (previous?.revision === task.revision || previous?.at > service.now()) continue
      try {
        await this.github.publishStatus(task, `[${task.state}] ${summary}`, this.abort.signal)
        if (task.state === 'completed') await this.github.closeCompletedIssue(task.id, this.abort.signal)
        service.store.put('retry', key, { revision: task.revision })
      } catch (error) {
        service.store.put('retry', key, { at: service.now() + 60000, dependency: error.dependency ?? 'feedback' })
        this.notice(task.owner, `feedback-wait:${task.id}:${task.revision}`,
          'GitHub status synchronization is waiting for recovery. The development outcome is retained; inspect the pending feedback before claiming synchronization.', task.id)
      }
    }
    for (const request of service.store.list('member-request').filter(row => row.state === 'pending' && !(row.retryAt > service.now()))) {
      try {
        service.assertRunning(service.store.get('task', request.taskId))
        const template = service.configuration.templates.find(row => row.name === request.template)
        const preset = core.modelPresets.get(template.modelPreset)
        if (!preset) throw new Error('Approved model preset is unavailable')
        const input = { displayName: `${template.name} ${request.taskId.slice(0, 8)}`, persona: template.persona,
          description: `Project specialist for ${request.repository}`, workspaces: [] }
        const created = core.creations.create(input, request.operationKey)
        const applied = core.registry.applyModelPreset(created.record.slug, preset)
        if (!applied.ok) throw new Error('Could not apply approved member model preset')
        const member = service.bindMember(request.id, created.record.slug)
        service.notify(request.bot, { id: `member-created:${request.id}`, kind: 'member-created', text: JSON.stringify(member) })
      } catch (error) {
        const failures = (request.failures ?? 0) + 1
        service.store.put('member-request', request.id, { ...request, failures,
          retryAt: service.now() + Math.min(300000, 1000 * 2 ** Math.min(failures, 9)), waitReason: 'Approved model or native creation service is unavailable' })
        this.notice(request.bot, `member-wait:${request.id}`, 'Approved specialist creation is waiting for its configured model or native creation service. The operation key is retained.', request.taskId)
        this.log(`Member ${request.id} is waiting: ${error.message}`)
      }
    }
    for (const repository of service.configuration.repositories) {
      const key = `project-group:${repository.repository}`, previous = service.store.get('retry', key)
      if (previous?.failures > 0 && previous.at > service.now()) continue
      try {
        await this.ensureProjectGroup(repository)
        if (previous?.failures) service.store.put('retry', key, { failures: 0 })
      } catch (error) {
        const failures = (previous?.failures ?? 0) + 1
        service.store.put('retry', key, { failures, at: service.now() + Math.min(300000, 1000 * 2 ** Math.min(failures, 9)) })
        if (failures === 1) this.notice(repository.manager, key, 'Project channel grouping is waiting for native roster recovery or reconciliation.')
        this.log(`Project group ${repository.repository} is waiting: ${error.message}`)
      }
    }
    for (const member of this.members()) {
      try {
      if (!core.registry.get(member.bot) || member.state === 'archived') continue
      this.bridge.execution.reconcile(member.bot)
      for (const attempt of service.store.list('attempt').filter(row => row.bot === member.bot)) {
        const task = service.store.get('task', attempt.taskId)
        if (task.hold || ['delivered', 'completed'].includes(task.state)) continue
        if (attempt.state === 'interrupted') service.waitFor(attempt.id, 'execution', 'Native execution was interrupted; inspect and resume the same Assignment')
        const current = service.store.get('attempt', attempt.id)
        if (current.state === 'waiting_dependency' && current.retryAt <= service.now()) {
          service.notify(member.bot, { id: `recovery:${attempt.id}:${current.failures}`, kind: 'execution-recovery', taskId: task.id,
            text: `Inspect and resume existing attempt ${attempt.id}, Session ${attempt.sessionId ?? 'not yet bound'}. Wait again if its dependency is unavailable.` })
          service.store.put('attempt', attempt.id, { ...current, retryAt: service.now() + 300000 })
        }
      }
      if (service.readyForArchive(member.bot) && !core.runtime.turnRunning?.(member.bot) && !core.runtime.hasPendingInbox?.(member.bot)
        && core.runtime.listAssignments(member.bot).every(row => !['working', 'stopping'].includes(row.activity))) {
        const paused = core.registry.setPaused(member.bot, true)
        if (paused.ok) service.store.put('member', member.bot, { ...member, state: 'archived' })
        continue
      }
      if (core.registry.get(member.bot).paused || core.runtime.turnRunning?.(member.bot)) continue
      if (service.store.get('native-backoff', member.bot)?.retryAt > service.now()) continue
      const pending = service.store.list('event').filter(row => row.bot === member.bot && row.state !== 'handled')
      if (!pending.length) continue
      const fingerprint = createHash('sha256').update(pending.map(row => row.id).sort().join('\n')).digest('hex')
      const key = `wake:${member.bot}`, previous = service.store.get('wake', key)
      if (previous?.fingerprint === fingerprint && previous.retryAt > service.now()) continue
      if (previous?.fingerprint === fingerprint && member.parent) {
        const id = `coordinator-wait:${member.bot}:${fingerprint}`
        if (!service.store.get('event', id)) service.notify(member.parent, { id, kind: 'dependency-wait', actor: member.bot,
          text: 'This member still has unhandled project events. Its queue is retained and recovery will retry without creating new authority.' })
      }
      try {
        this.wake(member.bot)
        service.store.put('wake', key, { fingerprint, retryAt: service.now() + 300000 })
      } catch (error) {
        const failures = (service.store.get('native-backoff', member.bot)?.failures ?? 0) + 1
        service.store.put('native-backoff', member.bot, { failures,
          retryAt: service.now() + Math.min(300000, 1000 * 2 ** Math.min(failures, 9)) })
        this.notice(member.bot, `wake-wait:${member.bot}:${fingerprint}`, 'Native coordinator wake is waiting for recovery or reconciliation. The project queue is retained.')
        this.log(`Bot ${member.bot} wake is waiting: ${error.message}`)
      }
      } catch (error) {
        this.log(`Bot ${member.bot} needs reconciliation: ${error.message}`)
        const key = `member-error:${member.bot}`
        if (!service.store.get('runtime-error', key)) {
          service.store.put('runtime-error', key, { at: service.now() })
          service.notify(member.parent ?? member.bot, { id: key, kind: 'reconciliation-required', actor: member.bot, text: 'Native execution facts need reconciliation before this member can continue.' })
        }
      }
    }
    await this.bridge.execution.stopPending(this.abort.signal)
  }
  async close() {
    this.closed = true
    clearInterval(this.timer)
    this.abort.abort()
    await this.running
  }
}
