import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { StationDesktopConnection } from './desktop-client.mjs'
import { SERVICE_PROTOCOL } from './service-control.mjs'

async function fixture(t, respond) {
  const directory = await mkdtemp('/private/tmp/dsh-desktop-client-')
  const socketPath = join(directory, 'control.sock')
  const server = createServer(socket => {
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk
      if (!buffer.endsWith('\n')) return
      const reply = respond(JSON.parse(buffer).type)
      if (reply) socket.end(JSON.stringify(reply) + '\n')
    })
  })
  server.listen(socketPath)
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })
  await once(server, 'listening')
  await chmod(socketPath, 0o600)

  const failures = [], sessions = []
  const client = new StationDesktopConnection(null, null, null, null, null,
    error => failures.push(error.message), null, null, session => sessions.push(session))
  Object.assign(client, { socket: socketPath, instanceId: 'shared-host', pid: 123 })
  const request = client.request.bind(client)
  t.mock.method(client, 'request', (type, _timeout) => request(type, 100))
  const polls = []
  const timer = setTimeout
  t.mock.method(globalThis, 'setTimeout', (callback, timeout, ...args) => {
    if (timeout !== 2500) return timer(callback, timeout, ...args)
    polls.push(callback)
    return timer(() => {}, 60_000).unref()
  })
  t.after(() => client.stop())
  return { client, failures, sessions, async poll() {
    assert.equal(polls.length, 1, 'keep exactly one poll scheduled')
    clearTimeout(client.timer)
    await polls.shift()()
  } }
}

const ok = value => ({ ok: true, value: { protocol: SERVICE_PROTOCOL, ...value } })
const timeoutReply = { ok: false, error: 'DSH 桌面请求超时。' }

for (const [name, sessionReply] of [['silent Station socket', null], ['Host timeout reply', timeoutReply]]) {
  test(`Desktop recovers from a ${name} followed by an unanswered status query`, async t => {
    let responsive = false
    const requests = []
    const nextSession = { userId: 'fixture' }
    const owned = await fixture(t, type => {
      requests.push(type)
      if (type === 'desktop-session') return responsive ? ok({ platformSession: nextSession }) : sessionReply
      return null
    })

    owned.client.watch()
    await owned.poll()
    assert.deepEqual(requests, ['desktop-session', 'status'])
    assert.deepEqual(owned.failures, [], 'a timeout cannot confirm that the Host has exited')
    assert.deepEqual(owned.sessions, [], 'retain the existing platform session while the Host is unreachable')

    responsive = true
    await owned.poll()
    assert.deepEqual(requests, ['desktop-session', 'status', 'desktop-session'])
    assert.deepEqual(owned.sessions, [nextSession], 'the same connection can refresh after the Host responds')
    assert.deepEqual(owned.failures, [])
  })
}

test('Desktop still reports a confirmed change of Host instance', async t => {
  const owned = await fixture(t, type => type === 'desktop-session' ? timeoutReply
    : ok({ service: { state: 'running', instanceId: 'replacement-host', pid: 124 } }))
  owned.client.watch()
  await owned.poll()
  assert.deepEqual(owned.failures, [timeoutReply.error])
  assert.equal(owned.client.closed, true)
})
