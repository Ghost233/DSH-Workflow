import test from 'node:test'
import assert from 'node:assert/strict'
import { lstatSync } from 'node:fs'
import { chmod, lstat, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { serveGlobalSupervisor } from './global-supervisor.mjs'
import { serviceRequest } from './service-control.mjs'
import { webDirectory, webSocket } from './web-control.mjs'

async function fixture() {
  const root = await mkdtemp('/private/tmp/dsh-web-control-test-')
  const socket = webSocket(root)
  return { root, socket, async cleanup() {
    await rm(dirname(socket), { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  } }
}

test('published Web control sockets accept immediate owner requests without transient unsafe permissions', async () => {
  const rejected = [], modes = [], cleanupErrors = []
  const mask = process.umask()
  for (let round = 0; round < 100; round++) {
    const owned = await fixture()
    let manager, published = false
    try {
      const creating = serveGlobalSupervisor({ dataRoot: owned.root }).finally(() => { published = true })
      while (!published) {
        try { modes.push(lstatSync(owned.socket).mode & 0o777) }
        catch (error) { if (error.code !== 'ENOENT') throw error }
        try { await serviceRequest(owned.socket, { type: 'status' }, 1000) }
        catch (error) { if (error.code !== 'ENOENT') rejected.push(error.message) }
      }
      manager = await creating
      assert.equal((await serviceRequest(owned.socket, { type: 'status' })).web.state, 'stopped')
      assert.equal((await lstat(owned.socket)).uid, process.getuid())
      await chmod(owned.socket, 0o644)
      await assert.rejects(serviceRequest(owned.socket, { type: 'status' }), /Unsafe DSH service socket/)
      await chmod(owned.socket, 0o600)
      const alias = join(owned.root, 'socket-link')
      await symlink(owned.socket, alias)
      await assert.rejects(serviceRequest(alias, { type: 'status' }), /Unsafe DSH service socket/)
    } finally {
      let deadline
      try { await Promise.race([manager?.close(), new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Web control close did not settle')), 1000)
      })]) }
      catch (error) { cleanupErrors.push(error.code || error.message) }
      finally { clearTimeout(deadline); await owned.cleanup() }
    }
  }
  assert.deepEqual(rejected, [], 'actual immediate requests must not encounter Unsafe socket or control timeout')
  assert.ok(modes.length > 0 && modes.every(mode => mode === 0o600), 'the actual socket is private from first publication')
  assert.equal(process.umask(), mask, 'creating a private socket preserves the caller process mask')
  assert.deepEqual(cleanupErrors, [], 'normal control cleanup must not leave errors or pending connections')
})

test('closing the actual Web control server removes its record and socket without an unlink error', async () => {
  const owned = await fixture()
  try {
    const manager = await serveGlobalSupervisor({ dataRoot: owned.root })
    const record = join(webDirectory(owned.root), 'manager.json')
    assert.equal(JSON.parse(await readFile(record, 'utf8')).pid, process.pid)
    await manager.close()
    await assert.rejects(lstat(owned.socket), { code: 'ENOENT' })
    await assert.rejects(lstat(record), { code: 'ENOENT' })
    await assert.rejects(lstat(dirname(owned.socket)), { code: 'ENOENT' })
  } finally { await owned.cleanup() }
})
