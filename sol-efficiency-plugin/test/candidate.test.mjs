import test from 'node:test'
import assert from 'node:assert/strict'
import { candidateBody } from '../src/evidence-reducer.mjs'

const signal = new AbortController().signal
const inline = text => ({ text, truncated: false })

test('truncated output is reconstructed from the mounted filesystem before reduction', async () => {
  const seen = []
  const ctx = { fs: {
    async resolve(path) { seen.push(path); return path },
    async stat() { return { size: 13 } },
    async streamText() { return (async function* () { yield 'error: '; yield 'failed' })() },
  } }
  const body = await candidateBody(ctx, { stdout: { text: 'tail', truncated: true, spillPath: '/mounted/log' }, stderr: inline('') }, signal, 100)
  assert.equal(body, '[stdout]\nerror: failed\n[stderr]\n')
  assert.deepEqual(seen, ['/mounted/log'])
})

test('missing full output and oversized Unicode source are not reduced as complete logs', async () => {
  const missing = { stdout: { text: 'tail', truncated: true }, stderr: inline('') }
  assert.equal(await candidateBody({}, missing, signal, 100), undefined)
  const large = { stdout: inline('界'.repeat(50)), stderr: inline('') }
  assert.equal(await candidateBody({}, large, signal, 100), undefined)
})

test('a size-unknown spilled stream is stopped at the full UTF-8 byte budget', async () => {
  let consumed = 0
  const ctx = { fs: { async resolve() { return {} }, async stat() { return {} },
    async streamText() { return (async function* () { for (let i = 0; i < 20; i++) { consumed++; yield '界'.repeat(10) } })() },
  } }
  const body = await candidateBody(ctx, { stdout: { text: '', truncated: true, spillPath: '/log' }, stderr: inline('') }, signal, 100)
  assert.equal(body, undefined)
  assert.equal(consumed, 4)
})
