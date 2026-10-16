import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceWriteKey, fileWriteKey, withFileWriter } from '../src/host/tracker/backends/markdown/write-queue.js'
import { createRunningMarkers } from '../src/host/runningMarkers.js'

test('the shared Markdown writer preserves distinct macOS files and workspace names', () => {
  const ctx = { cwd: '/Users/Matt/Workspace\\' }
  assert.equal(workspaceWriteKey(ctx), '/Users/Matt/Workspace\\')
  assert.equal(workspaceWriteKey({ cwd: '/Users/Matt//Workspace/' }), '/Users/Matt/Workspace')
  assert.notEqual(fileWriteKey(ctx, null, 'Ticket.md'), fileWriteKey(ctx, null, 'ticket.md'))
  assert.notEqual(fileWriteKey(ctx, null, 'a\\b.md'), fileWriteKey(ctx, null, 'a/b.md'))
  assert.notEqual(fileWriteKey(ctx, null, 'Ticket.md'), fileWriteKey({ cwd: ctx.cwd.toLowerCase() }, null, 'Ticket.md'))
})

test('concurrent Markdown updates retain both writes and a failure does not block the next write', async () => {
  const ctx = { cwd: '/workspace/queue-upgrade' }
  let text = ''
  const append = value => withFileWriter(ctx, null, 'ticket.md', async () => {
    const before = text
    await Promise.resolve()
    text = before + value
  })
  await Promise.all([append('first\n'), append('second\n')])
  assert.equal(text, 'first\nsecond\n')
  await assert.rejects(withFileWriter(ctx, null, 'ticket.md', async () => { throw new Error('write failed') }), /write failed/)
  await append('third\n')
  assert.equal(text, 'first\nsecond\nthird\n')
})

test('running markers fall back to Git while preserving a literal macOS directory suffix', async () => {
  const checked = [], probes = []
  const markers = createRunningMarkers({
    paths: ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD'],
    existsViaFs: async path => { checked.push(path); return null },
    runProbe: async name => { probes.push(name); return name === 'REBASE_HEAD' },
  })
  const result = await markers.read('/work/.git\\', {})
  assert.deepEqual(result, { ok: true, markers: { merging: false, rebasing: true, cherryPicking: false, reverting: false } })
  assert.equal(checked[0], '/work/.git\\/MERGE_HEAD')
  assert.deepEqual(probes, ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD'])
})

import { createSkillDoc } from '../src/host/skillDoc.js'
import { readRepoPermissions } from '../src/host/tracker/backends/github/repo-permissions.js'
import { halfOpenTrialIsDue, recordFailure } from '../src/shared/refresh/failure-window.js'

test('skill details use the registered Chinese provider and preserve the requested workspace', async () => {
  const calls = []
  const doc = createSkillDoc({ ctx: { get: () => ({ get: async (name, options) => {
    calls.push([name, options])
    return { name, content: '# 中文技能\n\n当前提供器的正文。', path: '/Users/Matt/技能\\/SKILL.md' }
  } }) } })
  const result = await doc.readDoc({ name: 'code-review', cwd: '/work/工程\\' })
  assert.equal(result.ok, true)
  assert.match(result.md, /当前提供器/)
  assert.equal(result.path, '/Users/Matt/技能\\/SKILL.md')
  assert.deepEqual(calls, [['code-review', { cwd: '/work/工程\\' }]])
  assert.deepEqual(await doc.readDoc({ name: '../secret' }), { ok: false, missing: true })
  assert.equal(calls.length, 1)
})

test('missing skills and an unavailable registry produce different detail outcomes', async () => {
  const missing = createSkillDoc({ ctx: { get: () => ({ get: async () => undefined }) } })
  const unavailable = createSkillDoc({ ctx: { get: () => undefined } })
  assert.deepEqual(await missing.readDoc({ name: 'code-review' }), { ok: false, missing: true })
  assert.deepEqual(await unavailable.readDoc({ name: 'code-review' }), { ok: false, missing: false })
})

test('permission reads share a request within a batch and preserve triage-only access', async () => {
  let calls = 0
  const client = { execGh: async () => { calls++; return { ok: true, data: { stdout: '{"push":false,"triage":true}' } } } }
  const batch = new Map()
  const result = await Promise.all([readRepoPermissions(client, 'owner/repo', {}, batch), readRepoPermissions(client, 'owner/repo', {}, batch)])
  assert.deepEqual(result, [{ push: false, triage: true }, { push: false, triage: true }])
  assert.equal(calls, 1)
  assert.equal(await readRepoPermissions({ execGh: async () => ({ ok: false }) }, 'owner/repo', {}), null)
})

test('failed refreshes reopen only after the backoff window', () => {
  const failed = recordFailure({ failures: 2 }, 1000)
  assert.deepEqual(failed, { failures: 3, windowStartedAt: 1000 })
  assert.equal(halfOpenTrialIsDue(failed, 1099, 100, 0), false)
  assert.equal(halfOpenTrialIsDue(failed, 1100, 100, 0), true)
})

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

test('detail UI isolates workspace results and offers retry when the provider is unavailable', async () => {
  const calls = []
  const context = vm.createContext({
    host: { call: async (_method, args) => { calls.push(args); return args.cwd === '/unavailable' ? { ok: false, missing: false } : { ok: true, md: args.cwd, path: args.cwd + '/SKILL.md' } } },
    tr: key => key, emit() {}, log() {}, setTimeout, clearTimeout,
  })
  const source = readFileSync(new URL('../src/client/views/skillDetail/PixelSkillOps.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
  vm.runInContext(transformSync(source, { loader: 'ts', target: 'es2020' }).code + '\nthis.open = pixelOpenDetail; this.cache = pixelDetailCache;', context)
  const first = { cwd: '/first' }, second = { cwd: '/second' }, unavailable = { cwd: '/unavailable' }
  context.open(first, 'code-review')
  await new Promise(resolve => setImmediate(resolve))
  context.open(second, 'code-review')
  await new Promise(resolve => setImmediate(resolve))
  context.open(unavailable, 'code-review')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(first.pixelDetail.mdEn, '/first')
  assert.equal(second.pixelDetail.mdEn, '/second')
  assert.equal(unavailable.pixelDetail.isMissing, false)
  assert.equal(unavailable.pixelDetail.phase, 'error')
  assert.deepEqual(calls.map(call => call.cwd), ['/first', '/second', '/unavailable'])
})
