import test from 'node:test'
import assert from 'node:assert/strict'
import { terminalForPrompt } from '../src/dsh-execution.mjs'

test('terminalForPrompt binds a durable Owner inbox dispatch to its terminal turn', () => {
  const events = [
    { type: 'agent/inbox/spliced', seq: 3, data: { target: 'next-turn', start: 0,
      inserted: [{ id: 'owner-prompt', role: 'user', content: [] }] } },
    { type: 'turn/start', seq: 4, data: { turn: 1 } },
    { type: 'agent/inbox/spliced', seq: 5, data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
    { type: 'turn/end', seq: 7, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'parent' } } } },
  ]

  assert.equal(terminalForPrompt(events, 'owner-prompt'), events[3])
  assert.equal(terminalForPrompt(events, 'another-prompt'), undefined)
})

test('terminalForPrompt retains direct user-message binding for reused sessions', () => {
  const events = [
    { type: 'turn/start', seq: 10, data: { turn: 2 } },
    { type: 'user/message', seq: 11, data: { id: 'review-prompt' } },
    { type: 'turn/end', seq: 12, data: { turn: 2, reason: { kind: 'stop' } } },
  ]

  assert.equal(terminalForPrompt(events, 'review-prompt'), events[2])
})
