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
