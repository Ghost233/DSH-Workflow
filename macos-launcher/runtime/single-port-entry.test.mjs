import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGlobalSupervisor } from './global-supervisor.mjs'
import { isPrivateIPv4, localAddresses } from './lan-gateway.mjs'

test('one wildcard port handles login, Desktop authentication and repeated cookie access', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-single-port-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let exchanges = 0
  const backend = http.createServer((request, response) => {
    if (request.url === '/?token=private-fixture') {
      exchanges++
      response.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth=fixture; HttpOnly; Path=/' })
      response.end()
    } else if (request.headers.cookie?.includes('dsh-auth=fixture')) {
      response.end('<html>existing Desktop backend</html>')
    } else { response.writeHead(401); response.end('authentication required') }
  })
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => backend.close(resolve)))
  const backendPort = backend.address().port
  const directory = join(root, 'global/.dsh-workflow/desktop')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'desktop-host.json'), JSON.stringify({ schema: 1, lease: 'fixture',
    pid: process.pid, url: `http://127.0.0.1:${backendPort}/?token=private-fixture`, runtimeVersion: 'fixture' }), { mode: 0o600 })
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '0.0.0.0', port: 0, password: 'fixture-password',
    onDesktopNeeded: () => assert.fail('an already running Desktop must not be launched again') })
  t.after(() => supervisor.close())
  const base = supervisor.localUrl
  assert.equal(new URL(await supervisor.openGlobal()).port, String(supervisor.port))
  assert.equal(supervisor.global().gatePort, supervisor.port)
  assert.equal(supervisor.global().webPort, backendPort)
  const loginPage = await (await fetch(base)).text()
  assert.match(loginPage, /输入访问密码/)
  assert.doesNotMatch(loginPage, /全局实例|private-fixture|global\/open/)
  const forged = await fetch(base, { headers: { cookie: 'dsh-workflow-gate=forged' } })
  assert.match(await forged.text(), /输入访问密码/)
  const login = await fetch(new URL('login', base), { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'fixture-password' }) })
  assert.equal(login.status, 303)
  assert.equal(login.headers.get('location'), '/', 'login must stay on the same origin and never reveal the Host token')
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('dsh-workflow-gate='))?.split(';', 1)[0]
  assert.ok(cookie)
  for (let i = 0; i < 3; i++) {
    const page = await fetch(base, { headers: { cookie } })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /existing Desktop backend/)
  }
  assert.equal(exchanges, 1)
  const forgedHost = await new Promise((resolve, reject) => {
    const request = http.get(base, { headers: { host: `evil.example:${supervisor.port}` } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)) })
    request.on('error', reject)
  })
  assert.equal(forgedHost, 403)
  assert.equal((await fetch(base, { headers: { origin: 'http://evil.example' } })).status, 403)
  const lan = [...localAddresses()].find(address => isPrivateIPv4(address))
  if (lan) {
    const lanUrl = `http://${lan}:${supervisor.port}/`
    assert.match(await (await fetch(lanUrl)).text(), /输入访问密码/)
    assert.ok(supervisor.lanUrls.includes(lanUrl))
  }
  assert.ok(supervisor.lanUrls.every(url => !url.includes('0.0.0.0')))
  supervisor.setPassword('rotated-password')
  assert.match(await (await fetch(base, { headers: { cookie } })).text(), /输入访问密码/)
  await supervisor.close()
  assert.equal(backend.listening, true)
})
