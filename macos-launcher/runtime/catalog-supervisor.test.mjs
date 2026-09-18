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

test('navigation persists separate catalogs and starts/stops only the chosen engine', async t => {
  const base = await mkdtemp('/private/tmp/dsh-catalog-test-')
  t.after(() => rm(base, { recursive: true, force: true }))
  const existing = join(base, 'existing')
  await mkdir(existing)
  const started = [], stopped = [], passwords = []
  const supervisor = await startCatalogSupervisor({ resourcesRoot: base, catalogBase: join(base, 'data'),
    host: '127.0.0.1', port: 0, password: 'secret', launchInstance: ({ workspace, signal, onReady, password }) => {
      started.push(workspace)
      passwords.push(password)
      onReady({ url: `http://127.0.0.1:40123/?token=${started.length}` })
      return new Promise(resolve => signal.addEventListener('abort', () => { stopped.push(workspace); resolve() }, { once: true }))
    } })
  t.after(() => supervisor.close())
  const baseURL = supervisor.url
  assert.equal(started.length, 0)
  const page = await fetch(baseURL)
  assert.match(await page.text(), /输入在 macOS App 中设置的内网密码/u)
  assert.equal((await fetch(`${baseURL}catalog/create`, { method: 'POST', body: new URLSearchParams({ name: 'alpha' }) })).status, 401)
  const login = await fetch(`${baseURL}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'secret' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const post = async (route, data = {}) => fetch(new URL(route, baseURL), { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) })
  assert.equal((await post('catalog/create', { name: 'alpha' })).status, 303)
  assert.equal((await post('catalog/attach', { name: 'old', path: existing })).status, 303)
  const saved = JSON.parse(await readFile(join(base, 'data', 'catalogs.json'), 'utf8'))
  assert.equal(saved.length, 2)
  assert.equal(saved[1].path, existing)
  assert.notEqual(saved[0].path, saved[1].path)
  assert.equal(started.length, 0, 'creating a catalog must not start DSH')
  const first = await post(`catalog/open/${saved[0].id}`)
  assert.equal(first.status, 303)
  assert.match(first.headers.get('location') ?? '', /token=1/u)
  assert.deepEqual(started, [saved[0].path])
  assert.equal((await post(`catalog/stop/${saved[1].id}`)).status, 303)
  assert.deepEqual(stopped, [])
  const second = await post(`catalog/open/${saved[1].id}`)
  assert.equal(second.status, 303)
  assert.deepEqual(started, [saved[0].path, existing])
  assert.equal((await post(`catalog/stop/${saved[0].id}`)).status, 303)
  assert.deepEqual(stopped, [saved[0].path])
  supervisor.setPassword('new-secret')
  assert.equal((await post(`catalog/open/${saved[1].id}`)).status, 401, 'old navigation session must be revoked')
  assert.equal((await fetch(`${baseURL}login`, { method: 'POST', body: new URLSearchParams({ password: 'secret' }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 401)
  const relogin = await fetch(`${baseURL}login`, { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'new-secret' }) })
  assert.equal(relogin.status, 303)
  const newCookie = relogin.headers.get('set-cookie')?.split(';', 1)[0]
  const reopened = await fetch(new URL(`catalog/open/${saved[0].id}`, baseURL), { method: 'POST', redirect: 'manual',
    headers: { cookie: newCookie }, body: new URLSearchParams() })
  assert.equal(reopened.status, 303)
  assert.deepEqual(passwords, ['secret', 'secret', 'new-secret'])
})
