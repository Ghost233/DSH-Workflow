import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

test('native macOS escaped descendant does not turn managed-range exit into source write closure', { timeout: 45_000 }, async () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./fixtures/kernel-process-range-probe.mjs', import.meta.url))],
    { env, timeout: 40_000, maxBuffer: 256 * 1024 })
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.equal(result.status, 'scoped_receipt_confirmed')
  assert.equal(result.managedRangeStopped, true)
  assert.equal(result.claimsAllWritersStopped, false)
  assert.equal(result.terminationScope, 'dsh-managed-range')
  assert.equal(result.sandbox, 'full')
  assert.equal(result.helperFinished, true)
  if (process.platform === 'darwin') assert.equal(result.escapedWriter, true, 'Must exercise the actual macOS fallback limitation')
})
