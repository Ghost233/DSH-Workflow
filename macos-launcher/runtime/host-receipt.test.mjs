import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDesktopHost } from './desktop-launch.mjs'

test('the shared Host receipt accepts only a private, live loopback identity', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'station-host-receipt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'desktop-host.json')
  const receipt = { schema: 1, lease: 'fixture', pid: process.pid, url: 'http://127.0.0.1:12345/?token=fixture', runtimeVersion: '0.2.2-rc.1' }
  await writeFile(file, JSON.stringify(receipt), { mode: 0o600 })
  assert.equal((await readDesktopHost(dir)).pid, process.pid)
  await chmod(file, 0o644)
  await assert.rejects(readDesktopHost(dir), /Unsafe/)
  await chmod(file, 0o600)
  await writeFile(file, JSON.stringify({ ...receipt, url: 'http://192.0.2.1:12345/?token=fixture' }))
  await assert.rejects(readDesktopHost(dir), /Invalid/)
})
