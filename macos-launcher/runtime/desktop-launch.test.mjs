import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchDesktopWeb, readDesktopHost } from './desktop-launch.mjs'

test('the remote gate reuses the Desktop server and closing it leaves Desktop alive', async t => {
  const globalRoot = await mkdtemp(join(tmpdir(), 'desktop-attach-'))
  t.after(() => rm(globalRoot, { recursive: true, force: true }))
  const directory = join(globalRoot, '.dsh-workflow/desktop')
  await mkdir(directory, { recursive: true })
  let requests = 0
  const server = http.createServer((_req, res) => { requests++; res.end('same Desktop Host') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const port = server.address().port
  await writeFile(join(directory, 'desktop-host.json'), JSON.stringify({ schema: 1, lease: 'fixture',
    pid: process.pid, url: `http://127.0.0.1:${port}/?token=fixture`, runtimeVersion: '0.2.1-alpha.1' }), { mode: 0o600 })
  const controller = new AbortController()
  const ready = Promise.withResolvers()
  const task = launchDesktopWeb({ globalRoot, gatewayHost: '127.0.0.1', gatewayPort: 0, password: 'test-password',
    signal: controller.signal, onReady: (state, url) => ready.resolve({ state, url }) })
  t.after(async () => { controller.abort(); await task })
  const { state, url } = await ready.promise
  assert.equal(state.desktopPid, process.pid)
  assert.equal(state.port, port)
  const login = await fetch(new URL('login', url), { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ password: 'test-password' }) })
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  assert.equal(await (await fetch(url, { headers: { cookie } })).text(), 'same Desktop Host')
  assert.equal(requests, 1)
  controller.abort(); await task
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'same Desktop Host')
  assert.equal((await readDesktopHost(directory)).pid, process.pid)
})
