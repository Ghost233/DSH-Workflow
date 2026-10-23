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

test('a service-only subscriber discovers a manager created immediately in a fresh data root', async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const root = await mkdtemp('/private/tmp/dsh-launcher-fresh-')
    const resources = join(root, 'resources'), events = []
    await mkdir(resources)
    let subscription, service
    try {
      subscription = await watchLauncherStatus(root, event => events.push(event), { serviceOnly: true })
      service = await serveManager({ dataRoot: root, resources, home: join(root, 'home') })
      const deadline = Date.now() + 2000
      while (!events.some(event => event.value?.service.state === 'stopped') && Date.now() < deadline) await delay(5)
      assert.ok(events.some(event => event.value?.service.state === 'stopped'), JSON.stringify(events))
      assert.equal(events.some(event => event.source === 'web'), false)
    } finally {
      subscription?.close()
      await service?.close()
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('closing during control socket recovery releases every watcher and exits naturally', async () => {
  const root = await mkdtemp('/private/tmp/dsh-control-closing-')
  const controlModule = new URL('./manager-control.mjs', import.meta.url).href
  const pathsModule = new URL('./service-control.mjs', import.meta.url).href
  const script = `
    import { createServer } from 'node:net'
    import { rm } from 'node:fs/promises'
    import { setTimeout as delay } from 'node:timers/promises'
    import { listenManagerControl } from ${JSON.stringify(controlModule)}
    import { serviceDirectory, serviceSocket } from ${JSON.stringify(pathsModule)}
    const root = process.argv[1], server = createServer(), socketPath = serviceSocket(root)
    const control = await listenManagerControl(server, { directory: serviceDirectory(root), socketPath })
    const listen = server.listen.bind(server)
    let resume
    const paused = new Promise(accept => {
      server.listen = (...args) => {
        const mask = process.umask()
        resume = () => {
          const previous = process.umask(mask)
          try { return listen(...args) } finally { process.umask(previous) }
        }
        accept()
        return server
      }
    })
    await delay(50)
    await rm(socketPath)
    await paused
    const closing = control.close()
    resume()
    await closing
    process.stdout.write('closed\\n')
  `
  let child, exited
  try {
    child = spawn(process.execPath, ['--input-type=module', '-e', script, root], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    exited = new Promise(accept => child.once('close', code => accept({ code })))
    const result = await Promise.race([exited, delay(2000, null, { ref: false })])
    assert.ok(result, `the closed manager must exit without a live watcher: ${stdout}${stderr}`)
    assert.equal(result.code, 0, stderr)
    assert.equal(stdout, 'closed\n')
  } finally {
    child?.kill('SIGTERM')
    await exited
    await rm(root, { recursive: true, force: true })
  }
})
