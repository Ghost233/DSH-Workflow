import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

async function packagedModule(name) {
  const path = join(process.env.DSH_MACOS_RESOURCES, 'workflow', 'macos-launcher', 'runtime', name)
  return await import(pathToFileURL(path).href)
}

test('packaged DSH authenticates through the LAN gateway', { timeout: 60_000,
  skip: !process.env.DSH_MACOS_RESOURCES }, async () => {
  const root = await mkdtemp('/private/tmp/dsh-lan-smoke-')
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  const previousHome = process.env.DSH_HOME
  const previousPassword = process.env.DSH_LAUNCH_PASSWORD
  const password = randomBytes(24).toString('base64url')
  process.env.DSH_HOME = join(root, 'home')
  process.env.DSH_LAUNCH_PASSWORD = password
  let checked = false
  try {
    const { launchPackagedWeb } = await packagedModule('web-launch.mjs')
    await launchPackagedWeb({ resourcesRoot: process.env.DSH_MACOS_RESOURCES, workspace: root, port,
      gatewayHost: '127.0.0.1', gatewayPort: 0, signal: controller.signal, onReady: async state => {
        try {
          const direct = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })
          assert.equal(direct.status, 401)
          const page = await fetch(state.url)
          assert.equal(page.status, 200)
          const login = await fetch(new URL('/login', state.url), { method: 'POST', redirect: 'manual',
            headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) })
          assert.equal(login.status, 303)
          assert.match(login.headers.get('location') ?? '', /\?token=[A-Za-z0-9_-]+$/u)
          const gateCookie = login.headers.get('set-cookie')?.split(';', 1)[0]
          assert.ok(gateCookie)
          const exchange = await fetch(login.headers.get('location'), { redirect: 'manual', headers: { cookie: gateCookie } })
          assert.equal(exchange.status, 303)
          const dshCookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
          assert.ok(dshCookie)
          const index = await fetch(state.url, { headers: { cookie: `${gateCookie}; ${dshCookie}` } })
          assert.equal(index.status, 200)
          assert.match(await index.text(), /<html/iu)
          checked = true
        } finally { controller.abort() }
      } })
    assert.equal(checked, true, 'the packaged DSH gateway did not become ready')
  } finally {
    clearTimeout(timeout)
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousPassword === undefined) delete process.env.DSH_LAUNCH_PASSWORD
    else process.env.DSH_LAUNCH_PASSWORD = previousPassword
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged navigation lazily starts and stops a catalog DSH', { timeout: 90_000,
  skip: !process.env.DSH_MACOS_RESOURCES }, async () => {
  const root = await mkdtemp('/private/tmp/dsh-catalog-smoke-')
  const oldHome = process.env.DSH_HOME
  const oldPassword = process.env.DSH_LAUNCH_PASSWORD
  const password = randomBytes(24).toString('base64url')
  process.env.DSH_HOME = join(root, 'home')
  process.env.DSH_LAUNCH_PASSWORD = password
  let supervisor
  try {
    const { startCatalogSupervisor } = await packagedModule('catalog-supervisor.mjs')
    supervisor = await startCatalogSupervisor({ resourcesRoot: process.env.DSH_MACOS_RESOURCES,
      catalogBase: join(root, 'data'), host: '127.0.0.1', port: 0, password })
    const login = await fetch(new URL('login', supervisor.url), { method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ password }) })
    assert.equal(login.status, 303)
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(cookie)
    await supervisor.createCatalog('one')
    const list = JSON.parse(await readFile(join(root, 'data', 'catalogs.json'), 'utf8'))
    assert.equal(supervisor.catalogs()[0].state, 'stopped')
    const opened = await supervisor.openCatalog(list[0].id)
    assert.match(opened, /token=/u)
    assert.equal(supervisor.catalogs()[0].state, 'running')
    const exchange = await fetch(opened, { headers: { cookie }, redirect: 'manual' })
    assert.equal(exchange.status, 303)
    await supervisor.createCatalog('two')
    const two = JSON.parse(await readFile(join(root, 'data', 'catalogs.json'), 'utf8'))[1]
    const second = await supervisor.openCatalog(two.id)
    assert.notEqual(new URL(second).port, new URL(opened).port)
    const secondExchange = await fetch(second, { headers: { cookie }, redirect: 'manual' })
    assert.equal(secondExchange.status, 303)
    const dshCookie = secondExchange.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(dshCookie)
    await supervisor.stopCatalog(list[0].id)
    const stillRunning = await fetch(new URL('/', second), { headers: { cookie: `${cookie}; ${dshCookie}` } })
    assert.equal(stillRunning.status, 200, 'stopping the first catalog must leave the second available')
    await supervisor.stopCatalog(two.id)
  } finally {
    await supervisor?.close()
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    if (oldPassword === undefined) delete process.env.DSH_LAUNCH_PASSWORD
    else process.env.DSH_LAUNCH_PASSWORD = oldPassword
    await rm(root, { recursive: true, force: true })
  }
})
