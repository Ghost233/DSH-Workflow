/**
 * GitHubSource — the GitHub auto-processing loop (issue #71, spec「GitHub 接入」).
 *
 * 轮询: per-repo REST polling through the local gh CLI (本机 gh auth, 认证限额 5000 次/小时; default 5min,
 * configurable per config.github.intervalMs). 水位线: the first poll of a repo records ONLY the newest
 * Issue/PR number (github-watermarks.json in stateDir) — 历史存量不触发; later polls process only numbers
 * above the watermark. 重启不重放: watermarks persist across restarts.
 *
 * Policy (code-enforced, spec「Policy」): login 白名单 (default the gh-authenticated user, resolved at
 * startup when config leaves it empty); non-allowlisted authors and bot:ignore-labeled issues are
 * recorded-and-dropped (github-dropped trigger rows) and never reach a session.
 *
 * 自动处理闭环: a new allowlisted Issue = 显式请求豁免 (no confirmation): the plugin records the ack reply
 * intent (先存后做, delivered with the dsh-badge via deliverReplies) and routes the task to the L2 repo
 * owner through router.routeToOwner (triggerRef github:<repo>:issue:<n> — 幂等沿用). The injection carries
 * the full chain instruction (worktree 修复 → PR → 汇报链通知审核; 永不直推主分支, 合并永远由人) plus the
 * plugin-owned source mark [hub-bot github <repo>#<n>] so channel input is distinguishable from hand-typed
 * input. New PRs route with the initial-review instruction (摘要+风险点).
 *
 * 喊停与关闭: a comment reading 停 from an allowlisted author terminates the associated task
 * (tasks.fail — 让位于人, human messages can still release it) and notifies the chief (统一出口). Other
 * allowlisted comments follow up the tracked task; comments with the mention handle become Triggers
 * (mention 寻址). Polling also checks previously-triggered items: issue closed / PR merged or closed →
 * terminate + notify (源头关闭即终止).
 *
 * 回复回投: reply_source to github:<repo>:<n> rows sit recorded in the outbox; deliverReplies() posts them
 * as real gh issue comments — code appends the dsh-badge when missing (bot 产出的 GitHub 内容统一带标识) —
 * and only then marks them sent. Five consecutive failures fail the row and report a system problem (same
 * discipline as the feishu channel and the OutboxRunner).
 */
import { execFile } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { insertOutbox, deliverRecordedReplies } from './outbox.js'

/** The official badge (dsh-badge skill): every bot-produced GitHub content ends with it. */
export const DSH_BADGE = '[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)'

/** The injection source mark prefix (同飞书机制 — channel input vs hand-typed input are distinguishable). */
export const GITHUB_SOURCE_MARK = '[hub-bot github '

/** Consecutive gh send failures before a recorded intent fails out and reports a system problem. */
const MAX_GITHUB_ATTEMPTS = 5

/** Where per-repo watermarks persist (重启不重放). */
export function watermarkPath(stateDir) {
  return join(stateDir, 'github-watermarks.json')
}

/** The real gh runner: REST through the local CLI, 30s cap per call. */
export async function realGh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 30000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error('gh ' + args.slice(0, 3).join(' ') + ' failed: ' + (stderr || error.message).toString().trim()))
      else resolve(String(stdout))
    })
  })
}

export class GitHubSource {
  /**
   * @param {{ store: import('./store.js').Store, registry: import('./registry.js').OwnerRegistry,
   *   router: import('./router.js').Router, sessions: object, config: object,
   *   logger: { info: Function, warn: Function }, gh?: Function, now?: () => string }} deps
   */
  constructor({ store, registry, router, sessions, config, logger, gh, now }) {
    this.store = store
    this.registry = registry
    this.router = router
    this.sessions = sessions
    this.config = config ?? {}
    this.logger = logger
    this.gh = gh ?? realGh
    this.now = now ?? (() => new Date().toISOString())
    this.watermarks = { repos: {} }
    this.lastErrors = {}
    this.#loadWatermarks()
  }

  #loadWatermarks() {
    const file = watermarkPath(this.store.stateDir)
    if (!existsSync(file)) return
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (parsed && typeof parsed.repos === 'object' && parsed.repos !== null) this.watermarks = parsed
    } catch (error) {
      this.logger.warn('hub-bot github: watermark file unreadable (%s) — starting fresh (存量不触发仍成立)', error?.message ?? error)
    }
  }

  #saveWatermarks() {
    writeFileSync(watermarkPath(this.store.stateDir), JSON.stringify(this.watermarks, null, 2) + '\n')
  }

  #watermarkFor(repo) {
    if (!this.watermarks.repos[repo]) {
      this.watermarks.repos[repo] = { initialized: false, maxNumber: 0, maxCommentId: 0, commentsSince: this.now() }
    }
    return this.watermarks.repos[repo]
  }

  /** The panel-facing health view: per-repo watermark, switch, and the last polling error if any. */
  status() {
    const repos = {}
    for (const cfg of this.config.repos ?? []) {
      const wm = this.watermarks.repos[cfg.repo] ?? { initialized: false, maxNumber: 0, maxCommentId: 0 }
      repos[cfg.repo] = { enabled: cfg.enabled !== false, workspace: cfg.workspace, initialized: wm.initialized === true, maxNumber: wm.maxNumber ?? 0, maxCommentId: wm.maxCommentId ?? 0, lastError: this.lastErrors[cfg.repo] }
    }
    return {
      enabled: this.config.enabled === true,
      intervalMs: this.config.intervalMs ?? 300000,
      loginAllowlist: this.config.loginAllowlist ?? [],
      mentionHandle: this.config.mentionHandle ?? null,
      repos,
    }
  }

  /** Resolves the gh-authenticated login once (loginAllowlist 默认仅用户本人). */
  async resolveSelfLogin() {
    if ((this.config.loginAllowlist ?? []).length > 0) return this.config.loginAllowlist
    try {
      const raw = await this.gh(['api', 'user'])
      const login = JSON.parse(String(raw)).login
      if (typeof login === 'string' && login) {
        this.config.loginAllowlist = [login]
        this.logger.info('hub-bot github: loginAllowlist resolved from gh auth → %s', login)
      }
    } catch (error) {
      this.logger.warn('hub-bot github: could not resolve the gh login (%s) — all authors record-only until configured', error?.message ?? error)
    }
    return this.config.loginAllowlist
  }

  /** One full polling cycle over every enabled repo. */
  async pollAll() {
    const totals = { triggered: 0, dropped: 0, terminated: 0 }
    if (this.config.enabled !== true) return { ...totals, disabled: true }
    for (const repoCfg of (this.config.repos ?? []).filter(r => r.enabled !== false)) {
      try {
        const result = await this.pollRepo(repoCfg)
        totals.triggered += result.triggered ?? 0
        totals.dropped += result.dropped ?? 0
        totals.terminated += result.terminated ?? 0
        delete this.lastErrors[repoCfg.repo]
      } catch (error) {
        this.lastErrors[repoCfg.repo] = String(error?.message ?? error)
        this.logger.warn('hub-bot github: poll %s failed: %s', repoCfg.repo, error?.message ?? error)
      }
    }
    this.#saveWatermarks()
    return totals
  }

  /** One repo cycle: watermark bootstrap OR (new items → comments → closures). */
  async pollRepo(repoCfg) {
    const repo = repoCfg.repo
    const wm = this.#watermarkFor(repo)
    const items = JSON.parse(String(await this.gh(['api', 'repos/' + repo + '/issues?state=all&sort=created&direction=desc&per_page=30'])))
    if (!wm.initialized) {
      // 水位线: first contact records ONLY the newest number — 历史存量不触发 (spec 验收第一条).
      wm.initialized = true
      wm.maxNumber = items.reduce((max, item) => Math.max(max, item.number ?? 0), 0)
      wm.commentsSince = this.now()
      this.#saveWatermarks()
      return { triggered: 0, initialized: true }
    }
    let triggered = 0, dropped = 0, terminated = 0
    const fresh = items.filter(item => (item.number ?? 0) > wm.maxNumber).sort((a, b) => a.number - b.number)
    for (const item of fresh) {
      const result = await this.handleIssueEvent(item, repoCfg)
      if (result.routed) triggered++
      if (result.dropped) dropped++
    }
    if (items.length > 0) wm.maxNumber = items.reduce((max, item) => Math.max(max, item.number ?? 0), wm.maxNumber)
    // 评论: 停 / @mention / 跟进归属 (since the watermark's comment horizon).
    let comments = []
    try {
      comments = JSON.parse(String(await this.gh(['api', 'repos/' + repo + '/issues/comments?since=' + wm.commentsSince + '&per_page=50'])))
    } catch (error) {
      this.logger.warn('hub-bot github: comments poll %s failed: %s', repo, error?.message ?? error)
    }
    for (const c of comments.filter(c => (c.id ?? 0) > wm.maxCommentId).sort((a, b) => a.id - b.id)) {
      const result = await this.handleCommentEvent(c, repoCfg)
      if (result.terminated) terminated++
      wm.maxCommentId = Math.max(wm.maxCommentId, c.id ?? 0)
    }
    wm.commentsSince = this.now()
    // 源头关闭即终止.
    const closures = await this.checkClosures(repoCfg)
    terminated += closures.terminated.length
    this.#saveWatermarks()
    return { triggered, dropped, terminated }
  }

  /** Trigger row id conventions: router rows github:<repo>:<kind>:<n>; plugin drop records github-drop:<repo>:<n>[/c<id>]. */
  #refFor(repo, kind, number) {
    return 'github:' + repo + ':' + kind + ':' + number
  }

  #getTrigger(id) {
    const raw = this.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  #insertDrop(row) {
    this.store.db.prepare('INSERT INTO trigger (id, value, at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(row), row.at)
    return row
  }

  /** The ticket produced from a triggerRef, or undefined (票面权威: tickets carry triggerId). */
  ticketByRef(ref) {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all().map(raw => JSON.parse(String(raw.value)))
    return rows.find(t => t.triggerId === ref)
  }

  /** One issue/PR list item normalized. */
  normalizeIssue(item, repoCfg) {
    return {
      repo: repoCfg.repo,
      number: item.number,
      kind: item.pull_request ? 'pr' : 'issue',
      title: item.title ?? '',
      body: typeof item.body === 'string' ? item.body : '',
      author: item.user?.login ?? 'unknown',
      labels: (item.labels ?? []).map(l => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
      state: item.state ?? 'open',
      url: item.html_url ?? ('https://github.com/' + repoCfg.repo + '/issues/' + item.number),
    }
  }

  /**
   * One new Issue/PR: Policy → ack intent (issues) → route to the L2 repo owner. Idempotent on the
   * triggerRef (重启/重轮询不重放).
   */
  async handleIssueEvent(item, repoCfg) {
    const norm = this.normalizeIssue(item, repoCfg)
    if (!norm.number) return { dropped: 'malformed' }
    const ref = this.#refFor(norm.repo, norm.kind, norm.number)
    if (this.#getTrigger(ref)) return { deduped: true, ticketId: this.ticketByRef(ref)?.id ?? null }
    const dropId = 'github-drop:' + norm.repo + ':' + norm.number
    const existingDrop = this.#getTrigger(dropId)
    if (existingDrop) return { deduped: true, dropped: existingDrop.dropped }
    const at = this.now()
    const drop = (reason) => {
      this.#insertDrop({ id: dropId, kind: 'github-dropped', repo: norm.repo, number: norm.number, itemKind: norm.kind, author: norm.author, title: norm.title, dropped: reason, at })
      return { dropped: reason }
    }
    if (norm.labels.includes('bot:ignore')) return drop('bot-ignore')
    if (!(this.config.loginAllowlist ?? []).includes(norm.author)) return drop('not-allowlisted')
    // ack 一句话回 Issue (先存后做): the recorded intent is posted by deliverReplies with the badge.
    if (norm.kind === 'issue') {
      insertOutbox(this.store, {
        ticketId: null, kind: 'reply', to: 'github:' + norm.repo + ':' + norm.number,
        body: '已受理，处理中。\n\n' + DSH_BADGE, state: 'recorded', requestId: 'hub-bot-github-ack-' + norm.repo + '-' + norm.number,
      })
    }
    const ownerId = this.#ensureRepoOwner(repoCfg)
    const authorization = { actor: norm.author, source: 'github', addressing: 'direct', messageId: norm.url, at }
    const message = norm.kind === 'pr' ? this.#prText(norm) : this.#issueText(norm)
    const receipt = await this.router.routeToOwner({ ownerId, message, triggerRef: ref, authorization })
    return { routed: true, ticketId: receipt.ticketId, ownerId }
  }

  /** The repo owner row must exist before routing (identity ids make this idempotent). */
  #ensureRepoOwner(repoCfg) {
    const ownerId = 'repo-' + repoCfg.workspace
    if (!this.registry.get(ownerId)) this.registry.create({ kind: 'repo', workspace: repoCfg.workspace, cwd: repoCfg.cwd })
    return ownerId
  }

  #issueText(norm) {
    return GITHUB_SOURCE_MARK + norm.repo + '#' + norm.number + '] 新 Issue（作者 ' + norm.author + '）：' + norm.title
      + '\n' + norm.url
      + '\n\n' + (norm.body || '(无正文)').slice(0, 1500)
      + '\n\n处理链（本人 Issue = 显式请求豁免，全程无需确认）：ack 已由插件代发 → worktree 修复 → gh pr create 提 PR（永不直推主分支；合并永远由人）→ 提 PR 后经汇报链通知用户审核（验收对象是 PR）。'
      + '对本 Issue 的回复用 reply_source to=\'github:' + norm.repo + ':' + norm.number + '\'。'
      + '你在 GitHub 的一切产出（评论、回复、PR 描述）结尾必须带 dsh-badge：' + DSH_BADGE
  }

  #prText(norm) {
    return GITHUB_SOURCE_MARK + norm.repo + '#' + norm.number + '] 新 PR（作者 ' + norm.author + '）：' + norm.title
      + '\n' + norm.url
      + '\n\n' + (norm.body || '(无描述)').slice(0, 1500)
      + '\n\n初审：给出摘要与风险点（改动面、兼容性、测试缺口）；review 意见用 reply_source to=\'github:' + norm.repo + ':' + norm.number + '\' 回到该 PR（修复并验证的评论静默处理，拒绝给一句理由）。合并永远由人。'
      + '产出结尾必须带 dsh-badge：' + DSH_BADGE
  }

  /**
   * One issue/PR comment: 停 → 终止任务并通知; @mention → Trigger (mention 寻址); 其余归入已有任务
   * (follow-up, 不产生新 Trigger); 非白名单与未跟踪的一律只记录。
   */
  async handleCommentEvent(c, repoCfg) {
    const issueNumber = Number(String(c.issue_url ?? '').split('/').pop())
    if (!issueNumber) return { dropped: 'malformed' }
    const author = c.user?.login ?? 'unknown'
    const body = typeof c.body === 'string' ? c.body : ''
    const at = this.now()
    const dropId = 'github-drop:' + repoCfg.repo + ':' + issueNumber + '/c' + c.id
    if (this.#getTrigger(dropId)) return { deduped: true }
    if (!(this.config.loginAllowlist ?? []).includes(author)) {
      this.#insertDrop({ id: dropId, kind: 'github-dropped', repo: repoCfg.repo, number: issueNumber, commentId: c.id, author, dropped: 'not-allowlisted', at })
      return { dropped: 'not-allowlisted' }
    }
    if (body.trim() === '停') {
      const terminated = this.#terminateBySource(repoCfg.repo, issueNumber, '评论喊停')
      return terminated ? { terminated } : this.#recordUntracked(dropId, repoCfg, issueNumber, c, 'stop-without-task')
    }
    const ticket = this.ticketByRef(this.#refFor(repoCfg.repo, 'issue', issueNumber)) ?? this.ticketByRef(this.#refFor(repoCfg.repo, 'pr', issueNumber))
    const mentionHandle = this.config.mentionHandle
    if (mentionHandle && body.includes(mentionHandle)) {
      const text = GITHUB_SOURCE_MARK + repoCfg.repo + '#' + issueNumber + '] 评论提及（作者 ' + author + '）：' + body.slice(0, 1000)
        + '\n' + (c.html_url ?? '')
      if (ticket && !['done', 'failed'].includes(ticket.stage)) {
        const receipt = await this.router.routeToOwner({ ownerId: ticket.owner, ticketId: ticket.id, message: text })
        return { followedUp: receipt.ticketId }
      }
      const ownerId = this.#ensureRepoOwner(repoCfg)
      const ref = 'github:' + repoCfg.repo + ':comment:' + c.id
      if (this.#getTrigger(ref)) return { deduped: true }
      const authorization = { actor: author, source: 'github', addressing: 'mention', messageId: c.html_url ?? null, at }
      const receipt = await this.router.routeToOwner({ ownerId, message: text, triggerRef: ref, authorization })
      return { routed: true, ticketId: receipt.ticketId }
    }
    if (ticket && !['done', 'failed'].includes(ticket.stage)) {
      const text = GITHUB_SOURCE_MARK + repoCfg.repo + '#' + issueNumber + '] 新评论（作者 ' + author + '）：' + body.slice(0, 1000)
      const receipt = await this.router.routeToOwner({ ownerId: ticket.owner, ticketId: ticket.id, message: text })
      return { followedUp: receipt.ticketId }
    }
    return this.#recordUntracked(dropId, repoCfg, issueNumber, c, 'untracked-comment')
  }

  #recordUntracked(dropId, repoCfg, issueNumber, c, reason) {
    this.#insertDrop({ id: dropId, kind: 'github-dropped', repo: repoCfg.repo, number: issueNumber, commentId: c.id, author: c.user?.login ?? 'unknown', dropped: reason, at: this.now() })
    return { dropped: reason }
  }

  /**
   * 源头关闭即终止: fail the associated task (terminal — 让位于人; a human message can still release it) and
   * notify the chief through the unified reply channel. Returns the ticketId or null when nothing was running.
   */
  #terminateBySource(repo, number, why) {
    const ticket = this.ticketByRef(this.#refFor(repo, 'issue', number)) ?? this.ticketByRef(this.#refFor(repo, 'pr', number))
    if (!ticket || ['done', 'failed'].includes(ticket.stage)) return null
    this.router.tasks.fail({ ticketId: ticket.id, reason: '源头' + why + '：github ' + repo + '#' + number + '（让位于人）' })
    // 双轴审查 P1-1（死信修复）: 寻址 dsh:session:chief + state queued，OutboxRunner 真实投递到 chief 会话。
    insertOutbox(this.store, {
      ticketId: ticket.id, kind: 'reply', to: 'dsh:session:chief', state: 'queued',
      body: '[hub-bot github ' + repo + '#' + number + '] 源头' + why + '，任务 ' + ticket.id + ' 已终止（让位于人）。',
    })
    return ticket.id
  }

  /**
   * Closure sweep: every triggered item whose ticket is still live gets re-fetched; issue closed / PR merged
   * or closed → terminate + notify. Per-item fetches only touch tracked tickets (small set).
   */
  async checkClosures(repoCfg) {
    const repo = repoCfg.repo
    const live = this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(t => typeof t.triggerId === 'string' && t.triggerId.startsWith('github:' + repo + ':') && !['done', 'failed'].includes(t.stage))
    const terminated = []
    for (const ticket of live) {
      const parts = ticket.triggerId.split(':')
      const kind = parts[2]
      const number = Number(parts[3])
      if (!number) continue
      try {
        const item = JSON.parse(String(await this.gh(['api', 'repos/' + repo + '/issues/' + number])))
        if (item.state !== 'closed') continue
        let why = '已关闭'
        if (kind === 'pr') {
          const pr = JSON.parse(String(await this.gh(['api', 'repos/' + repo + '/pulls/' + number])))
          why = pr.merged_at ? '已合并' : '已关闭未合并'
        }
        const id = this.#terminateBySource(repo, number, why)
        if (id) terminated.push(id)
      } catch (error) {
        this.logger.warn('hub-bot github: closure check %s#%s failed: %s', repo, number, error?.message ?? error)
      }
    }
    return { terminated }
  }

  /**
   * The recorded-reply channel (同飞书机制): posts recorded github reply intents as real issue comments —
   * the badge is code-appended when the body lacks it — and only real delivery earns state 'sent'.
   */
  async deliverReplies() {
    // 双轴审查 P1-2: 通道无关驱动在 outbox.js；这里只留通道差异（地址解析、badge 补齐、gh 实投）。
    return deliverRecordedReplies({
      store: this.store, logger: this.logger, now: this.now,
      channel: 'github', prefix: 'github:', maxAttempts: MAX_GITHUB_ATTEMPTS,
      parseTarget: to => {
        const target = to.slice('github:'.length)
        const cut = target.lastIndexOf(':')
        const repo = target.slice(0, cut)
        const number = Number(target.slice(cut + 1))
        return repo && number ? { repo, number } : null
      },
      prepareBody: body => body.includes('powered_by-dsh') ? body : body + '\n\n' + DSH_BADGE,
      send: async ({ repo, number }, body) => {
        await this.gh(['api', '-X', 'POST', 'repos/' + repo + '/issues/' + number + '/comments', '-f', 'body=' + body])
      },
    })
  }
}
