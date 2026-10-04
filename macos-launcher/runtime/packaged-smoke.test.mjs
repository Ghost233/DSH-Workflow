import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exercise the packaged navigation and its real gateway against one Desktop-owned server.
test('packaged single-port entry reuses the Desktop backend and never creates directory instances', {
  timeout: 15_000, skip: !process.env.DSH_MACOS_RESOURCES,
}, async t => {
  const root = await mkdtemp('/private/tmp/dsh-global-smoke-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const host = http.createServer((request, response) => {
    if (request.url === '/?token=fixture') { response.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth=fixture; HttpOnly; Path=/' }); response.end() }
    else if (request.url.startsWith('/catalog/')) { response.writeHead(404); response.end('not found') }
    else if (request.headers.cookie?.includes('dsh-auth=fixture')) response.end('one Desktop backend')
    else { response.writeHead(401); response.end('authentication required') }
  })
  await new Promise(resolve => host.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => host.close(resolve)))
  const port = host.address().port
  const directory = join(root, 'global/.dsh-workflow/desktop')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'desktop-host.json'), JSON.stringify({ schema: 1,
    lease: 'packaged-smoke', pid: process.pid, url: `http://127.0.0.1:${port}/?token=fixture`,
    runtimeVersion: '0.2.1-alpha.1' }), { mode: 0o600 })
  const module = join(process.env.DSH_MACOS_RESOURCES, 'workflow/macos-launcher/runtime/global-supervisor.mjs')
  const { startGlobalSupervisor } = await import(pathToFileURL(module).href)
  const password = randomBytes(24).toString('base64url')
  let desktopRequests = 0
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port: 0, password,
    onDesktopNeeded: () => desktopRequests++ })
  t.after(() => supervisor.close())
  const login = await fetch(new URL('login', supervisor.url), { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password }) })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  const entries = await Promise.all(Array.from({ length: 8 }, () => supervisor.openGlobal()))
  assert.equal(new Set(entries).size, 1)
  assert.equal(desktopRequests, 0)
  assert.equal(supervisor.global().webPort, port)
  assert.equal(supervisor.global().path, undefined)
  assert.equal(supervisor.catalogs, undefined)
  assert.equal(login.headers.get('location'), '/')
  const opened = await fetch(supervisor.url, { redirect: 'manual', headers: { cookie } })
  assert.equal(opened.status, 200)
  assert.equal(opened.headers.get('location'), null)
  assert.equal(await opened.text(), 'one Desktop backend')
  assert.equal(await (await fetch(entries[0], { headers: { cookie } })).text(), 'one Desktop backend')
  const legacy = await fetch(new URL('catalog/create', supervisor.url), { method: 'POST',
    headers: { cookie }, body: new URLSearchParams({ name: 'project' }) })
  assert.equal(legacy.status, 404)
  await supervisor.close()
  assert.equal(host.listening, true)
})
