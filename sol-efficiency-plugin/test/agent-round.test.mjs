import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runDemo } from './demo.mjs'

test('assembled agent round logs fusion and feeds the evidence receipt into the next model request', { timeout: 10000 }, async t => {
  const actual = await runDemo(t)
  const expected = JSON.parse(await readFile(new URL('./fixtures/transcript.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
})
