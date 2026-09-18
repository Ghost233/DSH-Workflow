import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { NAVIGATION_PORT, startCatalogSupervisor } from './catalog-supervisor.mjs'

test('navigation uses the configured fixed port', () => {
  assert.equal(NAVIGATION_PORT, 33080)
})

function rawPost(port, path, headers, body = '') {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path, method: 'POST', headers }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.once('end', () => resolve({ status: response.statusCode, text }))
    })
    request.once('error', reject)
    request.end(body)
  })
}

test('catalogs are managed through the control API while the page only verifies and jumps', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-test-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const existing = join(base, 'existing')
  await mkdir(existing)
  const started = [], stopped = [], passwords = []
  let stateEvents = 0
  const supervisor = await startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret', launchInstance: ({ workspace, signal, onReady, password }) => {
      started.push(workspace)
      passwords.push(password)
      onReady({ url: `http://127.0.0.1:40123/?token=${started.length}` })
      return new Promise(resolve => signal.addEventListener('abort', () => { stopped.push(workspace); resolve() }, { once: true }))
    } })
  t.after(() => supervisor.close())
  supervisor.onState(() => { stateEvents += 1 })
  const baseURL = supervisor.url
  assert.equal(started.length, 0)
  const page = await fetch(baseURL)
  assert.match(await page.text(), /输入在 macOS App 中设置的内网密码/u)
  assert.equal((await fetch(`${baseURL}catalog/create`, { method: 'POST', body: new URLSearchParams({ name: 'alpha' }) })).status, 401)
  await supervisor.createCatalog('alpha')
  await supervisor.attachCatalog('old', existing)
  const saved = JSON.parse(await readFile(join(base, 'data', 'catalogs.json'), 'utf8'))
  assert.equal(saved.length, 2)
  assert.equal(saved[1].path, existing)
  assert.equal(started.length, 0, 'managing catalogs must not start DSH')
  assert.deepEqual(supervisor.catalogs().map(state => state.state), ['stopped', 'stopped'])
  const login = await fetch(`${baseURL}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const authorizedPage = await fetch(baseURL, { headers: { cookie } })
  const html = await authorizedPage.text()
  assert.match(html, /alpha/u)
  assert.match(html, /old/u)
  assert.doesNotMatch(html, /新建 Catalog|加入已有 Catalog|关闭引擎/u, 'the page must not offer management actions')
  const first = await supervisor.openCatalog(saved[0].id)
  assert.match(first, /token=1/u)
  assert.deepEqual(started, [saved[0].path])
  const running = supervisor.catalogs()[0]
  assert.equal(running.state, 'running')
  assert.ok(Number.isInteger(running.webPort) && running.webPort > 0, 'running state must expose the DSH port')
  assert.ok(Number.isInteger(running.gatePort) && running.gatePort > 0, 'running state must expose the LAN gateway port')
  const direct = await fetch(new URL(`catalog/open/${saved[0].id}`, baseURL), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(direct.status, 303)
  assert.match(direct.headers.get('location') ?? '', /token=1/u, 'a running engine is redirected to immediately')
  const jump = await fetch(new URL(`catalog/open/${saved[1].id}`, baseURL), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(jump.status, 303)
  assert.match(jump.headers.get('location') ?? '', /catalog\/wait\//u, 'a cold start must answer instantly with the wait page')
  let waitTarget
  for (let attempt = 0; attempt < 50 && !waitTarget; attempt++) {
    const waiting = await fetch(new URL(`catalog/wait/${saved[1].id}`, baseURL), { headers: { cookie }, redirect: 'manual' })
    if (waiting.status === 303) waitTarget = waiting.headers.get('location')
    else assert.match(await waiting.text(), /正在启动|启动失败/u)
    if (!waitTarget) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.match(waitTarget ?? '', /token=2/u, 'the wait page follows the engine into readiness')
  await supervisor.stopCatalog(saved[0].id)
  assert.deepEqual(stopped, [saved[0].path])
  assert.equal(supervisor.catalogs()[0].state, 'stopped')
  assert.equal(supervisor.catalogs()[1].state, 'running')
  await assert.rejects(supervisor.openCatalog('missing'), /Catalog 不存在/u)
  await assert.rejects(supervisor.createCatalog('   '), /名称不能为空/u)
  await assert.rejects(supervisor.attachCatalog('ok', 'relative/path'), /绝对路径/u)
  assert.ok(stateEvents >= 3, 'state changes must be published to subscribers')
  supervisor.setPassword('new-secret')
  assert.equal((await fetch(new URL(`catalog/open/${saved[1].id}`, baseURL), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })).status, 401, 'old navigation session must be revoked')
  assert.equal((await fetch(`${baseURL}login`, { method: 'POST', body: new URLSearchParams({ password: 'secret' }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 401)
  const relogin = await fetch(`${baseURL}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'new-secret' }) })
  assert.equal(relogin.status, 303)
  assert.deepEqual(passwords, ['secret', 'secret'], 'engines keep the password they were launched with')
  const newCookie = relogin.headers.get('set-cookie')?.split(';', 1)[0]
  await supervisor.stopCatalog(saved[1].id)
  const stoppedWait = await fetch(new URL(`catalog/wait/${saved[1].id}`, baseURL), { headers: { cookie: newCookie } })
  const stoppedText = await stoppedWait.text()
  assert.match(stoppedText, /重试/u)
  assert.doesNotMatch(stoppedText, /正在启动/u)
})

test('opening a cold catalog answers instantly and the wait page tracks starting, ready and failed', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-wait-')
  t.after(() => rm(base, { recursive: true, force: true }))
  let fireReady, fireFail
  const supervisor = await startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret',
    launchInstance: ({ onReady, signal }) => new Promise((resolve, reject) => {
      // launchInstance may only resolve when the engine process exits, never on readiness.
      fireReady = () => onReady({ url: 'http://127.0.0.1:41999/?token=ready' })
      fireFail = () => reject(new Error('端口被占用'))
      signal.addEventListener('abort', () => resolve(), { once: true })
    }) })
  t.after(() => supervisor.close())
  await supervisor.createCatalog('alpha')
  const id = supervisor.catalogs()[0].id
  const login = await fetch(`${supervisor.url}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  const open = await fetch(new URL(`catalog/open/${id}`, supervisor.url), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(open.status, 303)
  assert.match(open.headers.get('location') ?? '', /catalog\/wait\//u)
  const starting = await fetch(new URL(`catalog/wait/${id}`, supervisor.url), { headers: { cookie } })
  const startingText = await starting.text()
  assert.match(startingText, /正在启动/u)
  assert.match(startingText, /catalog\/wait\.js/u, 'the wait page loads the streaming poller')
  assert.match(startingText, /class="term"/u, 'startup logs render in a terminal box')
  assert.match(starting.headers.get('content-security-policy') ?? '', /script-src 'self'/u)
  assert.equal((await fetch(new URL('catalog/wait.js', supervisor.url))).status, 200)
  const progress = await fetch(new URL(`catalog/progress/${id}`, supervisor.url), { headers: { cookie } })
  assert.equal(progress.status, 200)
  const snapshot = await progress.json()
  assert.equal(snapshot.state, 'starting')
  assert.ok(snapshot.notes.some(line => line.includes('准备启动')), 'milestones must stream while starting')
  fireFail()
  await new Promise(resolve => setTimeout(resolve, 50))
  const failedProgress = await (await fetch(new URL(`catalog/progress/${id}`, supervisor.url), { headers: { cookie } })).json()
  assert.equal(failedProgress.state, 'stopped')
  assert.equal(failedProgress.error, '端口被占用')
  const failed = await fetch(new URL(`catalog/wait/${id}`, supervisor.url), { headers: { cookie } })
  const failedText = await failed.text()
  assert.match(failedText, /启动失败/u)
  assert.match(failedText, /端口被占用/u)
  const retry = await fetch(new URL(`catalog/open/${id}`, supervisor.url), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(retry.status, 303, 'retrying after a failure must be possible')
  await new Promise(resolve => setTimeout(resolve, 50))
  fireReady()
  let ready
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    const response = await fetch(new URL(`catalog/wait/${id}`, supervisor.url), { headers: { cookie }, redirect: 'manual' })
    if (response.status === 303) ready = response.headers.get('location')
    else assert.match(await response.text(), /正在启动/u)
    if (!ready) await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.match(ready ?? '', /token=ready/u)
})

test('engine ports stay inside the configured range and foreign bind addresses are rejected', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-range-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const seen = []
  const supervisor = await startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data'),
    host: '127.0.0.1', port: 0, portRange: { min: 41200, max: 41209 }, password: 'secret',
    launchInstance: ({ port, gatewayPort, onReady, signal }) => {
      seen.push([port, gatewayPort])
      onReady({ url: `http://127.0.0.1:${port}/?token=${seen.length}` })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  await supervisor.createCatalog('alpha')
  await supervisor.createCatalog('beta')
  await supervisor.openCatalog(supervisor.catalogs()[0].id)
  await supervisor.openCatalog(supervisor.catalogs()[1].id)
  assert.equal(seen.length, 2)
  for (const [webPort, gatePort] of seen) {
    assert.ok(webPort >= 41200 && webPort <= 41209, 'the DSH port must stay inside the range')
    assert.ok(gatePort >= 41200 && gatePort <= 41209, 'the gateway port must stay inside the range')
  }
  assert.equal(new Set(seen.flat()).size, 4, 'the four allocated ports must be distinct')
  await assert.rejects(startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data-other'),
    host: '203.0.113.5', port: 0, password: 'secret' }), /不在本机网卡上/u)
  await assert.rejects(startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data-other'),
    host: '127.0.0.1', port: 0, portRange: { min: 80, max: 90 }, password: 'secret' }), /端口范围无效/u)
})

test('navigation accepts opaque-origin browsers and explains rejected request sources', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-origin-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const supervisor = await startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret', launchInstance: () => new Promise(() => {}) })
  t.after(() => supervisor.close())
  const port = supervisor.port
  const form = { 'content-type': 'application/x-www-form-urlencoded' }
  const password = new URLSearchParams({ password: 'secret' }).toString()
  // WebKit webviews and privacy modes submit the login form with the opaque origin "null".
  const opaque = await rawPost(port, '/login', { ...form, origin: 'null' }, password)
  assert.equal(opaque.status, 303)
  const foreign = await rawPost(port, '/login', { ...form, origin: 'http://evil.example' }, password)
  assert.equal(foreign.status, 403)
  assert.match(foreign.text, /Origin 与访问地址不一致/u)
  const crossSite = await rawPost(port, '/login', { ...form, 'sec-fetch-site': 'cross-site' }, password)
  assert.equal(crossSite.status, 403)
  assert.match(crossSite.text, /请求来自跨站页面/u)
  const forgedHost = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET',
      headers: { host: `evil.example:${port}` } }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.once('end', () => resolve({ status: response.statusCode, text }))
    })
    request.once('error', reject)
    request.end()
  })
  assert.equal(forgedHost.status, 403)
  assert.match(forgedHost.text, /访问地址不属于这台 Mac/u)
})
