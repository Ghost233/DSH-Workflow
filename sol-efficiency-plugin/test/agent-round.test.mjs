import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runDemo } from './demo.mjs'

test('assembled agent round logs fusion and feeds the evidence receipt into the next model request', { timeout: 10000 }, async t => {
  const actual = await runDemo(t)
  const expected = JSON.parse(await readFile(new URL('./fixtures/transcript.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
})

test('V3 managed cold read retains the complete nested dispatch chain inside the actual model turn', async t => {
  await runDemo(t, { inspect: async ({ ctx, handle, agent, events }) => {
    const starts = events.filter(event => event.type === 'tool/ptc-dispatch-start')
    const ends = events.filter(event => event.type === 'tool/ptc-dispatch')
    const outer = events.find(event => event.type === 'tool/call' && event.data.name === 'write_then_run')
    const turnEnd = events.find(event => event.type === 'turn/end')
    assert.equal(starts.length, 2)
    assert.equal(ends.length, 2)
    assert.equal(new Set(starts.map(event => event.data.subCallId)).size, 2)
    for (const start of starts) {
      const end = ends.find(event => event.data.subCallId === start.data.subCallId)
      assert.ok(outer.seq < start.seq && start.seq < end.seq && end.seq < turnEnd.seq)
      assert.equal(end.data.parentCallId, outer.data.callId)
      assert.equal(end.data.rootCallId, outer.data.callId)
      assert.equal(end.data.name, start.data.name)
      assert.deepEqual(end.data.arguments, start.data.arguments)
      assert.equal(end.data.isError, false)
    }
    assert.equal(events.some(event => event.type.startsWith('tool/code-dispatch')), false)
    await handle.dispose()
    assert.equal(ctx.agents.get(agent.id), undefined)
    const reader = await ctx.sessionPersistence.open(agent.id, 'read')
    try { assert.deepEqual((await reader.read()).events, events) }
    finally { await reader.close() }
  } })
})
