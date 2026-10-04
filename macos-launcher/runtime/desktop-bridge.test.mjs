import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from './desktop-bridge.mjs'

test('desktop readiness keeps its token private and disposal cannot remove a newer Host lease', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-bridge-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let ready, dispose
  apply({ connection: { authenticatedUrl: url => `${url}/?token=fixture` }, webServer: { port: 40321 },
    appReady: { onReady(fn) { ready = fn; return () => {} } },
    effect(fn) { dispose = fn() }, logger: { error(error) { throw error } } },
  { directory, runtimeVersion: '0.2.1-alpha.1' })
  ready()
  const path = join(directory, 'desktop-host.json')
  let receipt
  for (let attempt = 0; attempt < 50 && !receipt; attempt++) {
    try { receipt = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error; await new Promise(resolve => setTimeout(resolve, 5)) }
  }
  assert.equal(receipt.pid, process.pid)
  assert.equal(receipt.runtimeVersion, '0.2.1-alpha.1')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  await writeFile(path, JSON.stringify({ ...receipt, lease: 'newer-host' }))
  await dispose()
  assert.equal(JSON.parse(await readFile(path, 'utf8')).lease, 'newer-host')
})
