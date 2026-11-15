/* hub-bot 面板 (#73): 静态壳 + token 参数 + 纯 REST 消费 devApi — 无构建链、不依赖 DSH 内部。
 * 面板原则（spec「观测性」）: 安静默认、诚实状态（计数 = 列表长度）、一概念一位置、破坏性动作需确认。 */
'use strict'

const API = '/hub-bot/api/'
const REFRESH_MS = 5000

/* ---------- token ---------- */
function readToken() {
  const url = new URL(location.href)
  const fromUrl = url.searchParams.get('token')
  if (fromUrl) {
    sessionStorage.setItem('hub-bot-token', fromUrl)
    url.searchParams.delete('token')
    history.replaceState(null, '', url.pathname)
    return fromUrl
  }
  return sessionStorage.getItem('hub-bot-token') ?? ''
}
let token = readToken()

async function api(route, opts = {}) {
  const res = await fetch(API + route, {
    method: opts.method ?? 'GET',
    headers: { 'x-hub-bot-token': token, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) {
    sessionStorage.removeItem('hub-bot-token')
    showTokenGate('token 无效，请重新输入。')
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(body.error ?? ('HTTP ' + res.status))
  return body
}

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value)
  }
  for (const child of children) node.append(child)
  return node
}
const text = value => document.createTextNode(String(value ?? ''))
const esc = value => String(value ?? '')
const fmtTime = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}
const shortId = id => (id ?? '').slice(0, 12)

/* ---------- 三问 ---------- */
const STAGE_ORDER = ['person/confirm', 'person/answer', 'person/review', 'blocked', 'failed', 'working', 'queued', 'idle', 'done', 'canceled']
const NEEDS_ME = new Set(['person/confirm', 'person/answer', 'person/review', 'blocked', 'failed'])

function healthProblems(health) {
  const items = []
  const feishu = health.feishu ?? {}
  if (feishu.enabled && feishu.credentialState !== 'ok') items.push('飞书凭据' + (feishu.credentialState === 'missing' ? '缺失' : '无效') + ' — 到设置页重新扫码')
  if (feishu.enabled && feishu.credentialState === 'ok' && feishu.connected === false) items.push('飞书长连接未建立')
  const gh = health.github ?? {}
  if (gh.enabled && gh.lastPollError) items.push('GitHub 轮询最近失败：' + gh.lastPollError)
  const ob = health.outbox ?? {}
  if (ob.failed > 0) items.push(ob.failed + ' 条投递失败')
  if (ob.systemProblems > 0) items.push(ob.systemProblems + ' 条系统级问题（outbox）')
  for (const r of ob.retrying ?? []) items.push('投递重试中：' + shortId(r.ticketId ?? r.id) + '（第 ' + r.attempts + ' 次）' + (r.lastError ? ' — ' + r.lastError : ''))
  return items
}

function renderHealth(health) {
  const box = $('#health')
  const items = healthProblems(health)
  box.replaceChildren()
  // 安静默认: 健康时不占空间
  box.hidden = items.length === 0
  for (const item of items) box.append(el('div', { class: 'health-item' }, text('⚠ ' + item)))
}

function detailRow(label, value) {
  return el('div', { class: 'detail-row' }, el('span', { class: 'detail-label' }, text(label)), el('span', {}, text(value)))
}

function ticketDetails(t) {
  const box = el('div', { class: 'ticket-details' })
  if (t.authorization) box.append(detailRow('授权', t.authorization.actor + ' 经 ' + t.authorization.source + ' 于 ' + fmtTime(t.authorization.at)))
  if (t.trigger) box.append(detailRow('Trigger', shortId(t.trigger.id) + (t.trigger.kind ? ' (' + t.trigger.kind + ')' : '')))
  for (const a of t.assignments ?? []) box.append(detailRow('Assignment', a.state + ' · ' + fmtTime(a.startedAt) + (a.endedAt ? ' → ' + fmtTime(a.endedAt) : '') + (a.endedReason ? ' (' + a.endedReason + ')' : '')))
  if (t.report) {
    box.append(detailRow('报告', t.report.summary))
    if (t.report.sections) {
      box.append(detailRow('结果', t.report.sections.result))
      box.append(detailRow('变更', t.report.sections.changes))
      box.append(detailRow('验证', t.report.sections.verification))
      box.append(detailRow('风险', t.report.sections.risks))
    }
  }
  if (t.dirListing && t.dirListing.length) box.append(detailRow('目录', t.dirListing.join('  ')))
  box.append(detailRow('id', t.id))
  return box
}

function confirmActions(t) {
  const wrap = el('span', { class: 'row-actions' })
  const act = async resolution => {
    const label = resolution === 'confirm' ? '确认' : '拒绝'
    // 破坏性动作需确认 (spec 面板原则)
    if (!window.confirm(label + '任务 ' + shortId(t.id) + '？\n' + (t.pendingConfirm?.text ?? ''))) return
    await api('tickets/resolve', { method: 'POST', body: { ticketId: t.id, resolution } })
    await refresh()
  }
  wrap.append(
    el('button', { class: 'btn primary', onclick: () => void act('confirm').catch(showError) }, text('确认')),
    el('button', { class: 'btn danger', onclick: () => void act('reject').catch(showError) }, text('拒绝')),
  )
  return wrap
}

function ticketRow(t, { actions } = {}) {
  const row = el('div', { class: 'ticket-row' })
  const head = el('div', { class: 'ticket-head' })
  head.append(el('span', { class: 'owner-label' }, text(t.ownerLabel ?? t.owner)))
  head.append(el('span', { class: 'message', title: esc(t.message ?? '') }, text(t.message ?? '(无原文)')))
  if (t.recoveryPending) head.append(el('span', { class: 'badge' }, text('恢复中')))
  head.append(el('time', {}, text(fmtTime(t.updatedAt))))
  if (actions) head.append(actions)
  row.append(head)
  if (t.pendingConfirm) row.append(el('div', { class: 'pending-confirm' }, text('待确认：' + t.pendingConfirm.text)))
  if (t.question) row.append(el('div', { class: 'pending-confirm' }, text('等您回复：' + t.question.text)))
  row.append(el('details', {}, el('summary', {}, text('详情')), ticketDetails(t)))
  return row
}

function renderBoard(overview) {
  renderHealth(overview.health ?? {})
  const tickets = overview.tickets ?? []

  // Q1 有需要我的吗: person/* + blocked/failed — 每行直接给出它需要的动作
  const needs = tickets.filter(t => NEEDS_ME.has(t.stage))
  const needBox = $('#needs-me')
  needBox.replaceChildren()
  if (!needs.length) needBox.append(el('p', { class: 'quiet' }, text('没有 — 安静默认。')))
  for (const t of needs) {
    needBox.append(ticketRow(t, { actions: t.stage === 'person/confirm' ? confirmActions(t) : undefined }))
  }

  // Q2 什么状态: 按阶段分组, 组头计数 = 列表长度 (诚实状态)
  const groups = $('#by-stage')
  groups.replaceChildren()
  for (const stage of STAGE_ORDER) {
    const list = tickets.filter(t => t.stage === stage)
    if (!list.length) continue
    const text0 = list[0].stageText ?? stage
    const group = el('section', { class: 'stage-group' })
    group.append(el('h3', {}, text(text0 + ' '), el('span', { class: 'count' }, text(String(list.length)))))
    for (const t of list) group.append(ticketRow(t, { actions: t.stage === 'person/confirm' ? confirmActions(t) : undefined }))
    groups.append(group)
  }
  if (!groups.children.length) groups.append(el('p', { class: 'quiet' }, text('还没有任务。')))

  // Q3 结果在哪: 等验收票的产物与目录清单
  const review = tickets.filter(t => t.stage === 'person/review')
  const outBox = $('#outcomes')
  outBox.replaceChildren()
  if (!review.length) outBox.append(el('p', { class: 'quiet' }, text('没有等验收的任务。')))
  for (const t of review) outBox.append(ticketRow(t))
}

/* ---------- 设置 ---------- */
function saveBar(section, collect) {
  const bar = el('div', { class: 'save-bar', hidden: '' })
  const save = el('button', { class: 'btn primary' }, text('保存'))
  const cancel = el('button', { class: 'btn' }, text('放弃'))
  save.addEventListener('click', async () => {
    save.disabled = true
    try {
      await api('settings', { method: 'POST', body: { [section]: collect() } })
      await refresh()
    } catch (error) {
      showError(error)
    } finally {
      save.disabled = false
    }
  })
  cancel.addEventListener('click', () => void refresh())
  bar.append(save, cancel)
  return bar
}

function watchDirty(bar, ...inputs) {
  const dirty = () => { bar.hidden = false }
  for (const input of inputs) input.addEventListener('input', dirty)
}

function listField(value) {
  const area = el('textarea', { rows: '3', spellcheck: 'false' })
  area.value = (value ?? []).join('\n')
  return area
}
const readList = area => area.value.split('\n').map(s => s.trim()).filter(Boolean)

function renderSettings(view) {
  const page = $('#settings')
  page.replaceChildren()

  // 飞书 bot 管理块（唯一总 bot）：三态——已绑定（名片+连接+权限，二维码收起）/ 未绑定（预告+权限+扫码）/ 失效。
  const feishu = view.feishu ?? {}
  const fs = feishu.status ?? {}
  const fSection = el('section', { class: 'setting-block' })
  fSection.append(el('h3', {}, text('飞书 bot')))
  if (feishu.enabled !== true) {
    fSection.append(el('p', { class: 'status-line' }, text('入口关闭（profile 里 feishu.enabled=false）')))
    page.append(fSection)
  } else {
    const bound = fs.credentialState === 'ok' && fs.bot
    const invalid = fs.credentialState === 'invalid'
    // bot 名片：绑定后展示真实身份；未绑定预告将创建的身份
    const card = el('div', { class: 'bot-card' + (bound ? '' : ' bot-card--ghost') })
    card.append(el('div', { class: 'bot-name' }, text(fs.bot?.name ?? fs.preset?.name ?? 'DSH 中枢 Bot')))
    card.append(el('div', { class: 'quiet small' }, text(fs.bot?.desc ?? fs.preset?.desc ?? '')))
    if (bound) {
      card.append(el('div', { class: 'quiet small' }, text('App ID：' + (fs.bot.appIdMasked ?? '—') + (fs.bot.boundAt ? ' · 绑定于 ' + String(fs.bot.boundAt).slice(0, 16).replace('T', ' ') : ''))))
      const conn = fs.bot.connected ? '长连接已建立' : '长连接未建立'
      card.append(el('div', { class: 'small ' + (fs.bot.connected ? 'ok-text' : 'warn-text') }, text('● ' + conn)))
    }
    fSection.append(card)
    if (invalid) fSection.append(el('p', { class: 'warn-text small' }, text('凭据无效——请重新扫码绑定。')))
    // 权限申明（明文）：绑定前告知将申请什么，绑定后展示已授权什么
    const permTitle = bound ? '已申明权限' : '将申明的权限（扫码时一次确认）'
    const permList = el('ul', { class: 'perm-list' })
    for (const p of fs.permissions ?? []) permList.append(el('li', {}, el('code', {}, text(p.key)), text(' — ' + p.label)))
    fSection.append(el('p', { class: 'small' }, text(permTitle)), permList)
    // 二维码只在未绑定且注册流 pending 时出现
    if (!bound && fs.qr && fs.qr.url) {
      const qrBox = el('div', { class: 'qr-box' })
      try {
        const qr = qrcode(0, 'M'); qr.addData(fs.qr.url); qr.make()
        const img = el('img', { class: 'qr-img', alt: '飞书授权二维码' })
        img.src = qr.createDataURL(6, 8)
        qrBox.append(img)
      } catch { qrBox.append(text('二维码生成失败，请用下方链接')) }
      fSection.append(qrBox)
      fSection.append(el('p', { class: 'hint' }, text('用手机飞书 App「扫一扫」扫上方二维码（桌面浏览器打开授权页无效）。用户码 ' + String(fs.qr.url).match(/user_code=([^&]+)/)?.[1] + '，有效期 ' + Math.round((fs.qr.expireIn ?? 3600) / 60) + ' 分钟。')))
      fSection.append(el('p', {}, el('a', { href: fs.qr.url, target: '_blank' }, text('（手机上点我直接打开）'))))
    }
    // 操作按钮：未绑定=开始扫码绑定；已绑定=重新注册（覆盖凭据，需确认）
    const scanBtn = el('button', { class: 'btn' }, text(bound ? '重新注册（覆盖现有凭据）' : (fs.registration === 'pending' ? '重新生成二维码' : '开始扫码绑定')))
    scanBtn.addEventListener('click', async () => {
      if (bound && !confirm('重新注册会创建新应用并覆盖现有凭据，当前绑定即失效。继续？')) return
      scanBtn.disabled = true
      try { await api('feishu/register', { method: 'POST', body: {} }); setTimeout(() => void refresh(), 2000) }
      catch (error) { showError(error); scanBtn.disabled = false }
    })
    fSection.append(scanBtn)
    fSection.append(el('p', { class: 'hint' }, text('授权边界在飞书侧：应用的可用范围与可见成员由飞书管理后台配置——能与 bot 说话的人即已授权。')))
    page.append(fSection)
  }

  // GitHub
  const github = view.github ?? {}
  const gSection = el('section', { class: 'setting-block' })
  gSection.append(el('h3', {}, text('GitHub')))
  const gEnabled = el('input', { type: 'checkbox' })
  gEnabled.checked = github.enabled === true
  const gInterval = el('input', { type: 'number', min: '30', step: '1', style: 'width:7em' })
  gInterval.value = String(Math.round((github.intervalMs ?? 300000) / 1000))
  const gList = listField(github.loginAllowlist)
  gSection.append(el('label', { class: 'inline' }, gEnabled, text(' 轮询监听')))
  gSection.append(el('label', {}, text('轮询间隔（秒，最小 30）')), gInterval)
  gSection.append(el('label', {}, text('login 白名单（每行一个；空 = 启动时解析为本人）')), gList)
  // 监听清单跟随 owner 注册表（只读）：注册了 repo 负责人即自动监听其 origin 仓库，无需在此配置。
  const followed = github.followed ?? []
  if (followed.length) {
    const repoTable = el('table', { class: 'repo-table' })
    repoTable.append(el('tr', {}, el('th', {}, text('监听中（跟随负责人注册表）')), el('th', {}, text('负责人'))))
    for (const f of followed) repoTable.append(el('tr', {}, el('td', {}, text(f.repo)), el('td', { class: 'quiet small' }, text(f.ownerId))))
    gSection.append(repoTable)
  } else {
    gSection.append(el('p', { class: 'hint' }, text('暂无监听仓库——向总管说「为 <仓库> 建负责人」后自动开始监听其 origin。')))
  }
  const resolveErrors = Object.entries(github.resolveErrors ?? {})
  if (resolveErrors.length) gSection.append(el('p', { class: 'hint' }, text('解析失败：' + resolveErrors.map(([k, v]) => k + ' ' + v).join('；'))))
  const gBar = saveBar('github', () => ({
    enabled: gEnabled.checked,
    intervalMs: Number(gInterval.value) * 1000,
    loginAllowlist: readList(gList),
  }))
  gSection.append(gBar)
  watchDirty(gBar, gEnabled, gInterval, gList)
  page.append(gSection)

  // 并发
  const cSection = el('section', { class: 'setting-block' })
  cSection.append(el('h3', {}, text('并发')))
  const slots = el('input', { type: 'number', min: '1', step: '1', style: 'width:5em' })
  slots.value = String(view.concurrency?.slotsPerOwner ?? 3)
  cSection.append(el('label', {}, text('每负责人执行槽（working 上限）')), slots)
  const cBar = saveBar('concurrency', () => ({ slotsPerOwner: Number(slots.value) }))
  cSection.append(cBar)
  watchDirty(cBar, slots)
  page.append(cSection)

  // 安全 (危险命令黑名单 — 命中转确认, spec「Policy」安全兜底)
  const secSection = el('section', { class: 'setting-block' })
  secSection.append(el('h3', {}, text('安全')))
  secSection.append(el('p', { class: 'status-line' }, text('命中黑名单的注入不直接执行：票转等您确认，确认后才注入（三问页可裁决）。留空 = 关闭兜底。')))
  const secList = listField(view.security?.dangerousPatterns)
  secSection.append(el('label', {}, text('危险命令黑名单（每行一个模式，大小写不敏感子串匹配）')), secList)
  const secBar = saveBar('security', () => ({ dangerousPatterns: readList(secList) }))
  secSection.append(secBar)
  watchDirty(secBar, secList)
  page.append(secSection)

  // 汇报
  const rSection = el('section', { class: 'setting-block' })
  rSection.append(el('h3', {}, text('定时汇报')))
  const rAuto = el('input', { type: 'checkbox' })
  rAuto.checked = view.reporting?.auto === true
  const rInterval = el('input', { type: 'number', min: '1', step: '1', style: 'width:7em' })
  rInterval.value = String(Math.round((view.reporting?.intervalMs ?? 60000) / 1000))
  rSection.append(el('label', { class: 'inline' }, rAuto, text(' 定时汇总自动汇报')))
  rSection.append(el('label', {}, text('间隔（秒）')), rInterval)
  const rBar = saveBar('reporting', () => ({ auto: rAuto.checked, intervalMs: Number(rInterval.value) * 1000 }))
  rSection.append(rBar)
  watchDirty(rBar, rAuto, rInterval)
  page.append(rSection)
}

/* ---------- boot ---------- */
function showError(error) {
  const bar = el('div', { class: 'toast error' }, text(String(error?.message ?? error)))
  document.body.append(bar)
  setTimeout(() => bar.remove(), 6000)
}

function showTokenGate(message) {
  $('#token-gate').hidden = false
  $('#board').hidden = true
  $('#settings').hidden = true
  const err = $('#token-error')
  err.hidden = !message
  if (message) err.textContent = message
}

async function refresh() {
  const [overview, settings] = await Promise.all([api('overview'), api('settings')])
  renderBoard(overview)
  renderSettings(settings)
  $('#refreshed').textContent = '刷新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function boot() {
  if (!token) { showTokenGate(); return }
  $('#token-gate').hidden = true
  $('#board').hidden = false
  $('#settings').hidden = true
  try {
    await refresh()
  } catch (error) {
    if (error.message !== 'unauthorized') showError(error)
    return
  }
  setInterval(() => void refresh().catch(() => {}), REFRESH_MS)
}

$('#token-form').addEventListener('submit', event => {
  event.preventDefault()
  token = $('#token-input').value.trim()
  sessionStorage.setItem('hub-bot-token', token)
  void boot()
})

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tab')) other.classList.toggle('is-active', other === tab)
    $('#board').hidden = tab.dataset.tab !== 'board'
    $('#settings').hidden = tab.dataset.tab !== 'settings'
  })
}

void boot()
