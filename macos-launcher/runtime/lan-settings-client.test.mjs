import test from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { allowAuthenticatedLanSettings } from './lan-settings-client.mjs'

test('packaged settings client keeps loopback access and gates LAN access on the login marker', () => {
  const original = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";'
  const patched = allowAuthenticatedLanSettings(original)
  assert.notEqual(patched, original)
  assert.match(patched, /ctx\.remote\.\$host\.isLoopback \|\|/u)
  assert.match(patched, /document\.cookie\.split/u)
  assert.match(patched, /dsh-workflow-settings-access=1/u)
  const persistence = (isLoopback, cookie) => runInNewContext(`${patched} persistence`, {
    ctx: { remote: { $host: { isLoopback } } },
    ...(cookie === undefined ? {} : { document: { cookie } }),
  })
  assert.equal(persistence(true), 'host')
  assert.equal(persistence(false, ''), 'memory')
  assert.equal(persistence(false, 'dsh-workflow-settings-access=0'), 'memory')
  assert.equal(persistence(false, 'dsh-workflow-settings-access=1'), 'host')
  assert.throws(() => allowAuthenticatedLanSettings('different upstream code'), /Pinned DSH settings client/u)
  assert.throws(() => allowAuthenticatedLanSettings(`${original}${original}`), /Pinned DSH settings client/u)
})
