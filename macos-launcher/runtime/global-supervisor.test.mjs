import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NAVIGATION_PORT, startGlobalSupervisor } from './global-supervisor.mjs'
import { isPrivateIPv4, localAddresses } from './lan-gateway.mjs'

const privateLanHost = () => [...localAddresses()].find(address =>
  address !== '127.0.0.1' && address !== 'localhost' && isPrivateIPv4(address))

test('navigation uses the configured fixed port', () => {
  assert.equal(NAVIGATION_PORT, 33080)
})

test('all clients share one global engine and legacy catalog data stays untouched', async t => {
  const base = await mkdtemp('/private/tmp/dsh-global-test-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const data = join(base, 'data')
  await mkdir(data)
  const legacy = JSON.stringify([{ id: 'old', name: 'project', path: data }])
  await writeFile(join(data, 'catalogs.json'), legacy)
  const started = [], stopped = []
  let ready, reentrant
  const supervisor = await startGlobalSupervisor({ dataRoot: data,
    host: '127.0.0.1', port: 0, password: 'secret', allowLanSettings: true,
    attachDesktop: ({ globalRoot, signal, onReady, allowLanSettings }) => {
      assert.equal(allowLanSettings, true)
      started.push(globalRoot)
      ready = () => onReady({ url: 'http://127.0.0.1:40123/' })
      return new Promise(resolve => signal.addEventListener('abort', () => { stopped.push(globalRoot); resolve() }, { once: true }))
    } })
  t.after(() => supervisor.close())
  supervisor.onState((global) => {
    if (global.state === 'starting' && !reentrant) reentrant = supervisor.openGlobal()
  })
  const opens = Array.from({ length: 10 }, () => supervisor.openGlobal())
  for (let i = 0; i < 50 && !ready; i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(started.length, 1)
  ready()
  const urls = await Promise.all([...opens, reentrant])
  assert.deepEqual([...new Set(urls)], ['http://127.0.0.1:40123/'])
  assert.deepEqual(started, [join(data, 'global')])
  assert.equal(supervisor.catalogs, undefined)
  assert.equal(supervisor.global().id, undefined)
  assert.equal(supervisor.global().path, undefined)
  for (const method of ['createCatalog', 'attachCatalog', 'openCatalog', 'stopCatalog']) assert.equal(supervisor[method], undefined)
  await supervisor.stopGlobal()
  assert.deepEqual(stopped, [join(data, 'global')])
  assert.equal(await readFile(join(data, 'catalogs.json'), 'utf8'), legacy)
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

test('authenticated navigation only opens the global engine and rotates its password', async t => {
  const base = await mkdtemp('/private/tmp/dsh-global-auth-')
  t.after(() => rm(base, { recursive: true, force: true }))
  let launched = 0, rotated
  const supervisor = await startGlobalSupervisor({ dataRoot: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret', attachDesktop: ({ signal, onReady, onGateway }) => {
      launched++
      onGateway({ setPassword(value) { rotated = value } })
      onReady({ url: 'http://127.0.0.1:40123/' })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  const endpoint = new URL('global/open', supervisor.url)
  const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' }
  assert.equal((await fetch(endpoint, { method: 'POST', headers: formHeaders })).status, 401)
  const login = await fetch(new URL('login', supervisor.url), { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }) })
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  const html = await (await fetch(supervisor.url, { headers: { cookie } })).text()
  assert.match(html, /全局实例/)
  assert.doesNotMatch(html, /Catalog|返回列表|catalog\//)
  assert.equal((html.match(/<button>/g) ?? []).length, 1)
  for (const path of ['catalog/open/old', 'catalog/create', 'catalog/attach']) {
    assert.equal((await fetch(new URL(path, supervisor.url), { method: 'POST', headers: { ...formHeaders, cookie } })).status, 404)
  }
  assert.equal(launched, 0)
  await supervisor.openGlobal()
  const jump = await fetch(endpoint, { method: 'POST', redirect: 'manual', headers: { ...formHeaders, cookie } })
  assert.equal(jump.headers.get('location'), 'http://127.0.0.1:40123/')
  assert.equal(launched, 1)
  supervisor.setPassword('new-secret')
  assert.equal(rotated, 'new-secret')
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...formHeaders, cookie } })).status, 401)
})

test('opening the global engine answers instantly and the wait page tracks starting, ready and failed', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-wait-')
  t.after(() => rm(base, { recursive: true, force: true }))
  let fireReady, fireFail
  const supervisor = await startGlobalSupervisor({ dataRoot: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret',
    attachDesktop: ({ onReady, signal }) => new Promise((resolve, reject) => {
      // attachDesktop may only resolve when the engine process exits, never on readiness.
      fireReady = () => onReady({ url: 'http://127.0.0.1:41999/?token=ready' })
      fireFail = () => reject(new Error('端口被占用'))
      signal.addEventListener('abort', () => resolve(), { once: true })
    }) })
  t.after(() => supervisor.close())
  const login = await fetch(`${supervisor.url}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  const open = await fetch(new URL('global/open', supervisor.url), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(open.status, 303)
  assert.match(open.headers.get('location') ?? '', /global\/wait/u)
  const starting = await fetch(new URL('global/wait', supervisor.url), { headers: { cookie } })
  const startingText = await starting.text()
  assert.match(startingText, /正在启动/u)
  assert.match(startingText, /global\/wait\.js/u, 'the wait page loads the streaming poller')
  assert.match(startingText, /class="term"/u, 'startup logs render in a terminal box')
  assert.match(starting.headers.get('content-security-policy') ?? '', /script-src 'self'/u)
  assert.equal((await fetch(new URL('global/wait.js', supervisor.url))).status, 200)
  const progress = await fetch(new URL('global/progress', supervisor.url), { headers: { cookie } })
  assert.equal(progress.status, 200)
  const snapshot = await progress.json()
  assert.equal(snapshot.state, 'starting')
  assert.ok(snapshot.notes.some(line => line.includes('准备启动')), 'milestones must stream while starting')
  fireFail()
  await new Promise(resolve => setTimeout(resolve, 50))
  const failedProgress = await (await fetch(new URL('global/progress', supervisor.url), { headers: { cookie } })).json()
  assert.equal(failedProgress.state, 'stopped')
  assert.equal(failedProgress.error, '端口被占用')
  const failed = await fetch(new URL('global/wait', supervisor.url), { headers: { cookie } })
  const failedText = await failed.text()
  assert.match(failedText, /启动失败/u)
  assert.match(failedText, /端口被占用/u)
  const retry = await fetch(new URL('global/open', supervisor.url), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(retry.status, 303, 'retrying after a failure must be possible')
  await new Promise(resolve => setTimeout(resolve, 50))
  fireReady()
  let ready
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    const response = await fetch(new URL('global/wait', supervisor.url), { headers: { cookie }, redirect: 'manual' })
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
  const supervisor = await startGlobalSupervisor({ dataRoot: join(base, 'data'),
    host: '127.0.0.1', port: 0, portRange: { min: 41200, max: 41209 }, password: 'secret',
    attachDesktop: ({ port, gatewayPort, onReady, signal }) => {
      assert.equal(port, undefined, 'Desktop owns the backend port')
      seen.push(gatewayPort)
      onReady({ port: 45678, url: `http://127.0.0.1:${gatewayPort}/` })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  await supervisor.openGlobal()
  await supervisor.openGlobal()
  assert.equal(seen.length, 1)
  for (const gatePort of seen) {
    assert.ok(gatePort >= 41200 && gatePort <= 41209, 'the exposed gateway port must stay inside the range')
  }
  assert.equal(new Set(seen).size, 1, 'repeated opens reuse the same exposed port')
  await assert.rejects(startGlobalSupervisor({ dataRoot: join(base, 'data-other'),
    host: '203.0.113.5', port: 0, password: 'secret' }), /不在本机网卡上/u)
  await assert.rejects(startGlobalSupervisor({ dataRoot: join(base, 'data-other'),
    host: '127.0.0.1', port: 0, portRange: { min: 80, max: 90 }, password: 'secret' }), /端口范围无效/u)
})

test('navigation dual-binds loopback and redirects engines to the visitor host', { skip: privateLanHost() === undefined }, async t => {
  const lanHost = privateLanHost()
  const base = await mkdtemp('/private/tmp/dsh-catalog-loop-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const supervisor = await startGlobalSupervisor({ dataRoot: join(base, 'data'),
    host: lanHost, port: 0, password: 'secret',
    attachDesktop: ({ onReady, signal }) => {
      onReady({ url: `http://${lanHost}:45678/?token=loop` })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  assert.equal(supervisor.localUrl, `http://127.0.0.1:${supervisor.port}/`)
  // The same navigation port answers on loopback.
  const login = await fetch(`http://127.0.0.1:${supervisor.port}/login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }) })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  await supervisor.openGlobal()
  // A LAN page offers the loopback entry for host settings; a loopback page does not.
  const lanHtml = await (await fetch(supervisor.url, { headers: { cookie } })).text()
  assert.match(lanHtml, /本机配置入口/u)
  assert.match(lanHtml, /http:\/\/127\.0\.0\.1:45678\/\?token=loop/u)
  const localHtml = await (await fetch(supervisor.localUrl, { headers: { cookie } })).text()
  assert.doesNotMatch(localHtml, /本机配置入口/u)
  // Opens and progress answers carry the requesting host so DSH settings stay loopback-only.
  const localOpen = await fetch(`http://127.0.0.1:${supervisor.port}/global/open`, { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(localOpen.status, 303)
  assert.equal(localOpen.headers.get('location'), 'http://127.0.0.1:45678/?token=loop')
  const lanOpen = await fetch(`${supervisor.url}global/open`, { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(lanOpen.status, 303)
  assert.equal(lanOpen.headers.get('location'), `http://${lanHost}:45678/?token=loop`)
  const progress = await (await fetch(`http://127.0.0.1:${supervisor.port}/global/progress`, { headers: { cookie } })).json()
  assert.equal(progress.url, 'http://127.0.0.1:45678/?token=loop')
  const lanProgress = await (await fetch(`${supervisor.url}global/progress`, { headers: { cookie } })).json()
  assert.equal(lanProgress.url, `http://${lanHost}:45678/?token=loop`)
})

test('navigation accepts opaque-origin browsers and explains rejected request sources', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-origin-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const supervisor = await startGlobalSupervisor({ dataRoot: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret', attachDesktop: () => new Promise(() => {}) })
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
