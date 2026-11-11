import { createHash } from 'node:crypto'

export class GitHubError extends Error {
  constructor(message, dependency, retryAfterMs) { super(message); this.dependency = dependency; this.retryAfterMs = retryAfterMs }
}

/** Credentials and the API origin come only from trusted Host configuration. */
export class GitHub {
  constructor({ service, token, baseUrl = 'https://api.github.com', fetcher = fetch, signal }) {
    this.service = service
    this.token = token
    this.baseUrl = new URL(baseUrl)
    this.fetcher = fetcher
    this.signal = signal
  }
  path(repository, suffix) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository')
    return `/repos/${repository.split('/').map(encodeURIComponent).join('/')}/${suffix}`
  }
  async request(repository, path, { method = 'GET', body, signal, authorize } = {}) {
    const url = new URL(path, this.baseUrl)
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(`/repos/${repository.repository}/`)) throw new Error('GitHub request escapes the configured repository')
    const token = await this.token(repository)
    if (!token) throw new GitHubError('GitHub credentials are not configured', 'credentials')
    authorize?.()
    const signals = [AbortSignal.timeout(15000), this.signal, signal].filter(Boolean)
    const response = await this.fetcher(url, { method, redirect: 'error', signal: AbortSignal.any(signals), headers: {
      authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json',
      'x-github-api-version': '2026-03-10',
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!response.ok) {
      const limited = response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0'
      const retry = response.headers.get('retry-after')
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      const delay = retry ? Number(retry) * 1000 || Date.parse(retry) - Date.now() : reset > Date.now() ? reset - Date.now() : 60000
      await response.text()
      throw Object.assign(new GitHubError(`GitHub HTTP ${response.status} for ${url.pathname}`,
        limited || response.status >= 500 ? 'network' : 'credentials', limited ? Math.max(1000, delay) : undefined), { status: response.status })
    }
    return { data: response.status === 204 ? null : await response.json(), next: response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] }
  }
  async list(repository, path, field) {
    const rows = [], seen = new Set()
    while (path) {
      if (seen.has(path)) throw new Error('GitHub pagination cycle')
      seen.add(path)
      const result = await this.request(repository, path)
      const data = field ? result.data?.[field] : result.data
      if (!Array.isArray(data)) throw new Error('GitHub list response is malformed')
      rows.push(...data)
      path = result.next
    }
    return rows
  }
  ingest(repository, object, kind) {
    if (object.user?.login === repository.githubActor && this.service.store.list('effect').some(effect => effect.payload?.body === object.body)) return
    const number = kind === 'comment' || kind === 'review-comment'
      ? Number(new URL(object.issue_url ?? object.pull_request_url).pathname.match(/\/(?:issues|pulls)\/(\d+)$/)?.[1]) : object.number
    const at = object.updated_at ?? object.submitted_at ?? object.created_at
    if (!Number.isSafeInteger(number) || number < 1 || !object.id || !Number.isFinite(Date.parse(at))) throw new Error('GitHub object identity is malformed')
    const id = createHash('sha256').update(JSON.stringify([repository.repository, kind, object.id, at])).digest('hex')
    return this.service.ingest({ id, repository: repository.repository, kind, actor: object.user?.login ?? 'ghost',
      human: object.user?.type === 'User', number, url: object.html_url, text: [object.title, object.body].filter(Boolean).join('\n\n'), updatedAt: at })
  }
  async poll(repository) {
    const started = this.service.now()
    const cursor = this.service.cursor(repository.repository)
    const since = cursor ? new Date(Date.parse(cursor) - 5000).toISOString() : repository.initialSince
    const suffix = `per_page=100&sort=updated&direction=asc${since ? `&since=${encodeURIComponent(since)}` : ''}`
    for (const issue of await this.list(repository, this.path(repository.repository, `issues?state=${cursor ? 'all' : 'open'}&${suffix}`))) {
      this.ingest(repository, issue, issue.pull_request ? 'pull' : 'issue')
    }
    for (const comment of await this.list(repository, this.path(repository.repository, `issues/comments?${suffix}`))) this.ingest(repository, comment, 'comment')
    for (const comment of await this.list(repository, this.path(repository.repository, `pulls/comments?${suffix}`))) this.ingest(repository, comment, 'review-comment')
    const pulls = new Set(this.service.store.list('task').filter(task => task.repositories.includes(repository.repository)
      && task.evidence?.pull).map(task => Number(/\/pull\/(\d+)$/.exec(task.evidence.pull)?.[1])))
    for (const number of pulls) {
      const pull = (await this.request(repository, this.path(repository.repository, `pulls/${number}`))).data
      const reviews = await this.list(repository, this.path(repository.repository, `pulls/${number}/reviews?per_page=100`))
      const status = (await this.request(repository, this.path(repository.repository, `commits/${pull.head.sha}/status`))).data
      const checks = await this.list(repository, this.path(repository.repository, `commits/${pull.head.sha}/check-runs?per_page=100`), 'check_runs')
      const observation = { head: pull.head.sha, merged: pull.merged === true, state: pull.state,
        status: status.state, checks: checks.map(row => ({ id: row.id, name: row.name, status: row.status, conclusion: row.conclusion })),
        reviews: reviews.map(row => ({ id: row.id, actor: row.user?.login, state: row.state })) }
      const id = createHash('sha256').update(JSON.stringify([repository.repository, number, observation])).digest('hex')
      if (!this.service.store.get('observation', id)) {
        this.service.observePull(repository.repository, number, observation)
        this.service.store.put('observation', id, observation)
        this.service.notify(repository.manager, { id: `pull-state:${id}`, kind: 'pull-state', repository: repository.repository,
          number, text: JSON.stringify(observation) })
      }
    }
    this.service.setCursor(repository.repository, new Date(started).toISOString())
  }
  writeScope(taskId) {
    const task = this.service.store.get('task', taskId)
    if (!task || !task.canDevelop || task.repositories.length !== 1) throw new Error('GitHub write is outside task authority')
    this.service.assertRunning(task)
    const repository = this.service.configuration.repositories.find(row => row.repository === task.repositories[0])
    if (!repository?.githubActor) throw new GitHubError('Configure the GitHub execution identity before automatic writes', 'credentials')
    return { task, repository }
  }
  async ensureIssue(taskId, signal) {
    const { task, repository } = this.writeScope(taskId)
    if (task.issue) return task.issue
    const key = `issue:${task.id}`, marker = `<!-- project-operation:${key} -->`
    const payload = { title: task.title, body: `Automated project task.\n\n${task.title}\n\nAcceptance:\n${task.criteria.map(value => `- ${value}`).join('\n')}\n\n${marker}` }
    const effect = this.service.beginEffect(key, 'issue', task.id, payload)
    let issue
    if (effect.state === 'confirmed') issue = effect.receipt
    else if (effect.state === 'unknown' || effect.state === 'sent') {
      const since = encodeURIComponent(new Date(effect.createdAt - 60000).toISOString())
      const matches = (await this.list(repository, this.path(repository.repository, `issues?state=all&per_page=100&since=${since}`)))
        .filter(row => !row.pull_request && row.body === payload.body && row.user?.login === repository.githubActor)
      if (matches.length !== 1) throw new GitHubError('Issue creation outcome still needs reconciliation; no write was replayed', 'reconcile')
      issue = matches[0]
    } else {
      this.service.effectState(key, 'sent')
      try {
        issue = (await this.request(repository, this.path(repository.repository, 'issues'), { method: 'POST', body: payload, signal,
          authorize: () => this.service.assertRunning(this.service.store.get('task', task.id)) })).data
      } catch (error) {
        this.service.effectState(key, error.status >= 400 && error.status < 500 ? 'prepared' : 'unknown')
        throw error
      }
    }
    if (!Number.isSafeInteger(issue.number) || issue.user?.login !== repository.githubActor) throw new GitHubError('Created Issue identity needs reconciliation', 'reconcile')
    this.service.effectState(key, 'confirmed', issue)
    return this.service.linkIssue(taskId, { repository: repository.repository, number: issue.number, url: issue.html_url }).issue
  }
  async ensurePull(taskId, { branch, head, summary }, signal) {
    const { task, repository } = this.writeScope(taskId)
    const key = `pull:${task.id}:${head}`, marker = `<!-- project-task:${task.id} -->`
    const payload = { title: task.title, head: branch, base: repository.baseBranch ?? 'main',
      body: `${summary}\n\nCloses #${task.issue.number}\n\n${marker}` }
    const effect = this.service.beginEffect(key, 'pull', taskId, payload)
    const find = async () => (await this.list(repository, this.path(repository.repository,
      `pulls?state=all&per_page=100&head=${encodeURIComponent(repository.repository.split('/')[0] + ':' + branch)}`)))
      .filter(row => row.head?.ref === branch && row.head?.sha === head && row.base?.ref === payload.base
        && row.head?.repo?.full_name === repository.repository && row.body === payload.body && row.user?.login === repository.githubActor)
    let pull = effect.state === 'confirmed' ? effect.receipt : undefined
    if (!pull && ['sent', 'unknown'].includes(effect.state)) {
      const matches = await find()
      if (matches.length !== 1) throw new GitHubError('PR outcome needs reconciliation; no write was replayed', 'reconcile')
      pull = matches[0]
    }
    if (!pull) {
      this.service.effectState(key, 'sent')
      try {
        const existing = (await this.list(repository, this.path(repository.repository,
          `pulls?state=open&per_page=100&head=${encodeURIComponent(repository.repository.split('/')[0] + ':' + branch)}`)))
          .filter(row => row.head?.repo?.full_name === repository.repository && row.head?.ref === branch
            && row.user?.login === repository.githubActor && row.body?.includes(marker))
        if (existing.length > 1) throw new GitHubError('Multiple PRs require reconciliation', 'reconcile')
        pull = (await this.request(repository, this.path(repository.repository, existing.length ? `pulls/${existing[0].number}` : 'pulls'),
          { method: existing.length ? 'PATCH' : 'POST', body: existing.length ? { title: payload.title, body: payload.body } : payload, signal,
          authorize: () => this.service.assertRunning(this.service.store.get('task', taskId)) })).data
      } catch (error) {
        this.service.effectState(key, error.status >= 400 && error.status < 500 ? 'prepared' : 'unknown')
        throw error
      }
    }
    // A confirmed response is re-read: the branch might have moved after an earlier run.
    const actual = (await this.request(repository, this.path(repository.repository, `pulls/${pull.number}`))).data
    if (actual.head?.sha !== head || actual.head?.repo?.full_name !== repository.repository || actual.head?.ref !== branch
      || actual.base?.ref !== payload.base || actual.draft || actual.state !== 'open' && !actual.merged) throw new GitHubError('PR does not match the verified execution', 'reconcile')
    this.service.effectState(key, 'confirmed', actual)
    return { pull: actual.html_url, head }
  }
  async publishStatus(task, summary, signal) {
    if (!task.issue || !summary?.trim()) return
    const repository = this.service.configuration.repositories.find(row => row.repository === task.repositories[0])
    if (!repository?.githubActor) return
    const key = `status:${task.id}:${task.revision}`, body = `${summary}\n\n<!-- project-operation:${key} -->`
    const effect = this.service.beginEffect(key, 'status', task.id, { body })
    if (effect.state === 'confirmed') return
    const path = this.path(repository.repository, `issues/${task.issue.number}/comments`)
    if (['unknown', 'sent'].includes(effect.state)) {
      const matches = (await this.list(repository, `${path}?per_page=100`)).filter(row => row.body === body && row.user?.login === repository.githubActor)
      if (matches.length !== 1) throw new GitHubError('Status outcome needs reconciliation', 'reconcile')
      this.service.effectState(key, 'confirmed', { id: matches[0].id })
      return
    }
    this.service.effectState(key, 'sent')
    try {
      const result = (await this.request(repository, path, { method: 'POST', body: { body }, signal })).data
      this.service.effectState(key, 'confirmed', { id: result.id })
    } catch (error) {
      this.service.effectState(key, error.status >= 400 && error.status < 500 ? 'prepared' : 'unknown')
      throw error
    }
  }
  async closeCompletedIssue(taskId, signal) {
    const { task, repository } = this.writeScope(taskId)
    if (task.state !== 'completed' || !task.accepted || !task.issue) throw new Error('Issue closure requires accepted final completion')
    const key = `close-issue:${taskId}`, payload = { state: 'closed', state_reason: 'completed' }
    const effect = this.service.beginEffect(key, 'close-issue', taskId, payload)
    if (effect.state === 'confirmed') return
    const path = this.path(repository.repository, `issues/${task.issue.number}`)
    const current = (await this.request(repository, path)).data
    if (current.state !== 'closed') {
      this.service.effectState(key, 'sent')
      try {
        await this.request(repository, path, { method: 'PATCH', body: payload, signal, authorize: () => {
          const actual = this.service.store.get('task', taskId)
          this.service.assertRunning(actual)
          if (actual.state !== 'completed' || !actual.accepted) throw new Error('Task completion changed before Issue closure')
        } })
      } catch (error) { this.service.effectState(key, 'unknown'); throw error }
    }
    this.service.effectState(key, 'confirmed', { number: task.issue.number })
  }
}
