import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopStatus } from './desktop-status.mjs'

test('backend observations use its own lease and never report unavailable health as stopped', async () => {
  const readHost = async () => ({ lease: 'desktop-lease', url: 'http://127.0.0.1:12345/?token=private' })
  const health = await desktopStatus('/private/tmp/test', { readHost,
    request: async (url, options) => {
      if (url.pathname === '/') {
        assert.equal(options.redirect, 'manual')
        return { headers: { getSetCookie: () => ['auth=fixture; HttpOnly'] } }
      }
      assert.equal(url.pathname, '/api/pluginManager/listPlugins')
      assert.equal(url.search, '')
      assert.equal(options.headers.cookie, 'auth=fixture')
      const body=JSON.parse(options.body); assert.equal(body.method,'pluginManager/listPlugins'); return { ok:true, json:async()=>({type:'server-response',rpcId:body.rpcId,result:{ok:true,value:[]}}) } } })
  assert.equal(health.state, 'running')
  assert.equal(health.instanceId, 'desktop-lease')
  assert.equal(health.ready, true)
  assert.ok(Number.isFinite(Date.parse(health.observedAt)))
  assert.ok(!JSON.stringify(health).includes('private'))
  const unavailable = await desktopStatus('/private/tmp/test', { readHost,
    request: async () => { throw new Error('health unavailable') } })
  assert.equal(unavailable.state, 'running')
  assert.equal(unavailable.ready, null)
  const failed = await desktopStatus('/private/tmp/test', { readHost,
    request: async () => { throw new Error('Failed http://127.0.0.1/?token=private') } })
  assert.ok(!JSON.stringify(failed).includes('private'))
  const gone = await desktopStatus('/private/tmp/test', { readHost: async () => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' }) } })
  assert.equal(gone.state, 'stopped')
})
