import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordSuperagentHost, releaseSuperagentHost, requireSuperagentHostStopped } from './superagent-host-lease.mjs'

test('a lost manager cannot make a live Host appear stopped', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-host-lease-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  recordSuperagentHost(root, process.pid, process.execPath)
  await assert.rejects(requireSuperagentHostStopped(root), /仍在退出/)
  await releaseSuperagentHost(root, process.pid + 1)
  await assert.rejects(requireSuperagentHostStopped(root), /仍在退出/)
  await releaseSuperagentHost(root, process.pid)
  await requireSuperagentHostStopped(root)
  await writeFile(join(root, 'station-host.json'), JSON.stringify({ pid: 2147483647, start: 'old', marker: 'old' }), { mode: 0o600 })
  await requireSuperagentHostStopped(root)
  await writeFile(join(root, 'station-host.json'), JSON.stringify({ pid: process.pid, start: 'old', marker: 'old' }), { mode: 0o600 })
  await requireSuperagentHostStopped(root)
})
