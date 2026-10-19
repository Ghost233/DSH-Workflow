import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { watchLauncherStatus } from './launcher-events.mjs'
import { serveManager } from './service-manager.mjs'
import { serveGlobalSupervisor } from './global-supervisor.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'
import { webSocket } from './web-control.mjs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

test('launcher subscriptions discover managers, push changes and reconnect from filesystem events', async () => {
  const root = await mkdtemp('/private/tmp/dsh-launcher-events-')
  const resources = join(root, 'resources')
  await mkdir(resources)
  const events = []
  let service, web, subscription
  const wait = async predicate => {
    const deadline = Date.now() + 2000
    while (!events.some(predicate) && Date.now() < deadline) await delay(5)
    assert.ok(events.some(predicate), JSON.stringify(events))
  }
  try {
    subscription = await watchLauncherStatus(root, event => events.push(event))
    assert.equal(events.filter(event => event.missing).length, 2)
    service = await serveManager({ dataRoot: root, resources, home: join(root, 'home') })
    web = await serveGlobalSupervisor({ dataRoot: root })
    await wait(event => event.source === 'service' && event.value?.service.state === 'stopped')
    await wait(event => event.source === 'web' && event.value?.web.state === 'stopped')
    await serviceRequest(serviceSocket(root), { type: 'notification-status' })
    await wait(event => event.value?.notificationAuthorization?.available === false)
    events.length = 0
    await delay(100)
    assert.equal(events.length, 0, 'no idle queries, heartbeats or reconnect timers')
    await web.close(); web = undefined
    await wait(event => event.source === 'web' && event.error)
    events.length = 0
    web = await serveGlobalSupervisor({ dataRoot: root })
    await wait(event => event.source === 'web' && event.value?.web.state === 'stopped')
    subscription.close(); subscription = undefined
    assert.equal((await serviceRequest(webSocket(root), { type: 'status' })).web.state, 'stopped')
    assert.equal((await serviceRequest(serviceSocket(root), { type: 'status' })).service.state, 'stopped')
  } finally {
    subscription?.close()
    await web?.close(); await service?.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('the launcher helper exits on stdin closure without stopping its managers', { timeout: 5000 }, async () => {
  const root = await mkdtemp('/private/tmp/dsh-launcher-helper-')
  let manager, child
  try {
    manager = await serveGlobalSupervisor({ dataRoot: root })
    child = spawn(process.execPath, [fileURLToPath(new URL('./launcher-events.mjs', import.meta.url)), root], { stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: child.stdout })
    const initial = new Promise(accept => lines.on('line', line => {
      const event = JSON.parse(line)
      if (event.source === 'web' && event.value?.web.state === 'stopped') accept()
    }))
    const exited = new Promise(accept => child.once('exit', code => accept(code)))
    await initial
    child.stdin.end()
    assert.equal(await exited, 0)
    lines.close()
    assert.equal((await serviceRequest(webSocket(root), { type: 'status' })).web.state, 'stopped')
  } finally {
    child?.kill('SIGTERM')
    await manager?.close()
    await rm(root, { recursive: true, force: true })
  }
})
