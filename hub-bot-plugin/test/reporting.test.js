/**
 * Reporting chain (issue #67): the L2's reports coalesce into ONE outward digest per wake per owner
 * (每次唤醒至多一条对外汇报), the digest text renders the four-segment report format verbatim from ticket
 * faces (汇报以票面为准), and the scheduled auto-summary reads stageText + face facts only.
 * Pure domain tests — store + injected clock, no DSH runtime.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { TaskBoard } from '../src/tasks.js'
import { recordReportFact, factLine, buildDigestText, buildAutoSummary, DIGEST_PREFIX, AUTO_SUMMARY_PREFIX } from '../src/reporting.js'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-reporting-'))
  const store = new Store(dir)
  const tasks = new TaskBoard({ store })
  return { store, tasks, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) } }
}

function seedTicket({ store, tasks }, stage = 'person/review', report = { summary: 'ok', at: '2026-11-15T00:00:00.000Z' }) {
  const id = 'tsk-' + crypto.randomUUID()
  const at = new Date().toISOString()
  store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(id, JSON.stringify({
    id, triggerId: 'trg-x', owner: 'repo-X', stage: 'idle', mechanism: 'inject', targetSession: 's',
    requestId: 'r', authorization: { actor: 'user', source: 'dsh', at }, createdAt: at, updatedAt: at, transitions: [],
  }))
  tasks.markDelivered(id)
  if (stage === 'person/review') tasks.report({ ticketId: id, summary: report.summary, sections: report.sections })
  return tasks.getTicket(id)
}

test('three reports in one wake coalesce into exactly one queued digest row per owner', () => {
  const { store, tasks, cleanup } = fixture()
  try {
    for (let i = 1; i <= 3; i++) recordReportFact(store, 'repo-X', seedTicket({ store, tasks }))
    const rows = store.db.prepare("SELECT value FROM outbox").all().map(r => JSON.parse(String(r.value)))
    const digests = rows.filter(r => r.kind === 'digest')
    assert.equal(digests.length, 1, 'one outward digest no matter how many reports landed this wake')
    assert.equal(digests[0].state, 'queued')
    assert.equal(digests[0].ownerId, 'repo-X')
    assert.equal(digests[0].bodyLines.length, 3)
    assert.match(digests[0].requestId, /^hub-bot-digest-/, 'the real sessionController.prompt requires a requestId')
  } finally { cleanup() }
})

test('a delivered digest closes the wake: the next report starts a fresh row', () => {
  const { store, tasks, cleanup } = fixture()
  try {
    const first = recordReportFact(store, 'repo-X', seedTicket({ store, tasks }))
    store.db.prepare('UPDATE outbox SET value = ? WHERE id = ?')
      .run(JSON.stringify({ ...first, state: 'sent' }), first.id)
    recordReportFact(store, 'repo-X', seedTicket({ store, tasks }))
    const digests = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value))).filter(r => r.kind === 'digest')
    assert.equal(digests.length, 2)
  } finally { cleanup() }
})

test('factLine renders the four segments 结果/变更/验证/风险 verbatim from the ticket face', () => {
  const { store, tasks, cleanup } = fixture()
  try {
    const ticket = seedTicket({ store, tasks }, 'person/review', {
      summary: '落地完成',
      sections: { result: '状态机落地', changes: 'tasks.js 重写', verification: '12 测试绿', risks: '无' },
      at: 'x',
    })
    const line = factLine(ticket)
    assert.match(line, /tsk-/)
    assert.match(line, /等您验收/, 'stageText 朗读')
    assert.match(line, /结果：状态机落地/)
    assert.match(line, /变更：tasks\.js 重写/)
    assert.match(line, /验证：12 测试绿/)
    assert.match(line, /风险：无/)
  } finally { cleanup() }
})

test('buildDigestText heads one merged message naming every reported ticket', () => {
  const { store, tasks, cleanup } = fixture()
  try {
    const a = seedTicket({ store, tasks })
    const b = seedTicket({ store, tasks })
    const text = buildDigestText({ ownerId: 'repo-X', bodyLines: [factLine(a), factLine(b)] })
    assert.ok(text.startsWith(DIGEST_PREFIX + 'repo-X'))
    assert.ok(text.includes(a.id) && text.includes(b.id))
  } finally { cleanup() }
})

test('buildAutoSummary lists only active stages with stageText + face detail; idle desks produce nothing', () => {
  const rows = [
    { id: 'tsk-1', stage: 'working', stageText: '进行中', detail: null },
    { id: 'tsk-2', stage: 'person/review', stageText: '等您验收', detail: '落地完成' },
    { id: 'tsk-3', stage: 'person/answer', stageText: '等您回复', detail: '用哪个 registry？' },
    { id: 'tsk-4', stage: 'done', stageText: '完成', detail: null },
    { id: 'tsk-5', stage: 'failed', stageText: '失败', detail: '会话丢失' },
  ]
  const text = buildAutoSummary(rows)
  assert.ok(text.startsWith(AUTO_SUMMARY_PREFIX))
  assert.match(text, /tsk-1.*进行中/)
  assert.match(text, /tsk-2.*等您验收.*落地完成/)
  assert.match(text, /tsk-3.*等您回复.*用哪个 registry？/)
  assert.ok(!text.includes('tsk-4'), 'done is not active — 只在结果可用或需要行动时说话')
  assert.ok(!text.includes('tsk-5'), 'failed tasks were already reported at failure time')
  assert.equal(buildAutoSummary([]), null)
  assert.equal(buildAutoSummary(rows.filter(r => r.stage === 'done')), null)
})
