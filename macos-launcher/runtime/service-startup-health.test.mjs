import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { waitForInitialHostHealth } from './service-manager.mjs'

async function fixture(t, { firstLoginHangs = false, forbidden = false } = {}) {
  let logins = 0
  const server = createServer((request, response) => {
    if (request.method === 'GET') {
      logins++
      if (firstLoginHangs && logins === 1) return
      response.writeHead(200, { 'set-cookie': 'dsh=fixture; HttpOnly' }); response.end('ok'); return
    }
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const input = JSON.parse(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ type: 'server-response', rpcId: input.rpcId,
        result: { ok: true, value: { entries: [], managementAvailable: forbidden } } }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return { host: { url: `http://127.0.0.1:${server.address().port}/?token=fixture` }, get logins() { return logins } }
}

test('initial Host health retries a transient timeout within its existing startup deadline', { timeout: 6000 }, async t => {
  const service = await fixture(t, { firstLoginHangs: true })
  const result = await waitForInitialHostHealth(service.host, Date.now() + 5000, () => true)
  assert.equal(result.ready, true)
  assert.equal(service.logins, 2)
})

test('initial Host health never retries an invalid managed inventory', async t => {
  const service = await fixture(t, { forbidden: true })
  await assert.rejects(waitForInitialHostHealth(service.host, Date.now() + 5000, () => true), /受管版本策略/)
  assert.equal(service.logins, 1)
})

test('initial Host health stops at the existing startup deadline', { timeout: 3000 }, async t => {
  const service = await fixture(t, { firstLoginHangs: true })
  await assert.rejects(waitForInitialHostHealth(service.host, Date.now() + 200, () => true), /timeout/i)
  assert.equal(service.logins, 1)
})

test('initial Host health stops retrying when the owned Host exits', { timeout: 4000 }, async t => {
  const service = await fixture(t, { firstLoginHangs: true })
  let alive = true
  const timer = setTimeout(() => { alive = false }, 100)
  t.after(() => clearTimeout(timer))
  await assert.rejects(waitForInitialHostHealth(service.host, Date.now() + 5000, () => alive), /Host exited/)
  assert.equal(service.logins, 1)
})
