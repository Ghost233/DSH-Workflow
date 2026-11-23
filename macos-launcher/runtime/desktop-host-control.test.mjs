import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopConnection } from './desktop-host-control.mjs'

test('Desktop uses the current Host boot data and receives a cookie without the browser entry token', async t => {
  const peer = { id: 'owner' }
  const inputUrl = 'http://127.0.0.1:32100/?token=private-bootstrap-token'
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    assert.equal(String(input), inputUrl)
    assert.equal(options.redirect, 'manual')
    return new Response(null, { status: 302, headers: { 'set-cookie': 'dsh-auth=desktop-cookie; HttpOnly' } })
  })
  const ctx = {
    webServer: { port: 32100, collectIndexInjections(scope) {
      assert.equal(scope, peer)
      return [{ kind: 'global', name: '__DSH_BOOT__', value: {} }]
    } },
    connection: { authentication: { authenticate(request) {
      assert.equal(request.headers.cookie, 'dsh-auth=desktop-cookie')
      assert.equal(request.headers.host, '127.0.0.1:32100')
      return { peer }
    } } },
    emit(_service, _event, _origin, entries) { entries.push({ open: true, url: inputUrl }) },
    get: () => undefined,
  }
  assert.deepEqual(await desktopConnection(ctx), {
    url: 'http://127.0.0.1:32100/',
    authenticationCookie: 'dsh-auth=desktop-cookie',
    injections: [{ kind: 'global', name: '__DSH_BOOT__', value: {} }],
    platformSession: null,
  })
  ctx.connection.authentication.authenticate = () => ({ rejection: 401 })
  await assert.rejects(desktopConnection(ctx), /认证失败/)
})
