import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('Web Host starts the real DSH runtime, drains access and exits cleanly', { timeout: 60_000 }, async t => {
  const resources = process.env.DSH_WEB_TEST_RUNTIME_ROOT ?? process.env.DSH_SERVICE_TEST_RESOURCES
  if (!resources) throw new Error('Set DSH_WEB_TEST_RUNTIME_ROOT or DSH_SERVICE_TEST_RESOURCES to the candidate runtime')
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), boot = require('@deepseek-ai/dsh-app-boot')
  const templates = boot.PROFILE_TEMPLATES ?? require('@deepseek-ai/dsh-official-bundles').PROFILE_TEMPLATES
  const root = await mkdtemp(join(tmpdir(), 'station-web-host-test-'))
  const home = join(root, 'home'), profile = join(home, 'profiles/desktop'), receipt = join(root, 'receipt')
  await mkdir(home); boot.initProfile(profile, templates.web.bundles)
  const bridge = fileURLToPath(new URL('./desktop-bridge.mjs', import.meta.url))
  const patch = [{ id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { insert: [{ id: 'workflow-desktop-bridge', name: bridge, config: { directory: receipt, runtimeVersion: 'fixture' } }] }]
  await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify(patch))
  const child = spawn(process.execPath, ['--expose-internals', resolve('macos-launcher/runtime/web-host.mjs'), resources, profile, receipt], {
    env: { HOME: root, DSH_HOME: home, DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: tmpdir() }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let diagnostics = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostics += chunk.toString().replace(/token=[^\s&]+/g, 'token=[redacted]') })
  const messages = [], waiters = []
  child.on('message', message => { messages.push(message); for (const waiter of waiters.splice(0)) waiter() })
  const exited = new Promise(accept => child.once('exit', (code, signal) => accept({ code, signal })))
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited }
    await rm(root, { recursive: true, force: true })
  })
  const receive = async predicate => {
    const until = Date.now() + 30_000
    while (Date.now() < until) {
      const found = messages.find(predicate)
      if (found) return found
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Host exited: ${diagnostics}`)
      await Promise.race([new Promise(accept => waiters.push(accept)), new Promise(accept => setTimeout(accept, 50))])
    }
    throw new Error(`Host did not answer: ${diagnostics}`)
  }
  const ready = await receive(message => message.type === 'ready' || message.type === 'fatal')
  assert.equal(ready.type, 'ready', diagnostics)
  let saved
  for (let attempt = 0; attempt < 100 && !saved; attempt++) {
    try { saved = JSON.parse(await readFile(join(receipt, 'desktop-host.json'), 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      await new Promise(accept => setTimeout(accept, 50))
    }
  }
  assert.ok(saved, `Station did not publish a Host receipt: ${diagnostics}`)
  assert.equal(saved.pid, child.pid)
  assert.equal(saved.url, ready.url)
  const login = await fetch(ready.url, { redirect: 'manual' })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await login.text()
  assert.ok(cookie)
  const request = () => fetch(new URL('/api/pluginInventory/list', ready.url), { method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'pluginInventory/list', payload: { args: {} } }),
    signal: AbortSignal.timeout(5000) })
  assert.equal((await request()).status, 200)
  child.send({ type: 'update-tasks', action: 'lock', requestId: 1 })
  const locked = await receive(message => message.type === 'update-tasks' && message.requestId === 1)
  assert.equal(locked.error, undefined)
  assert.equal((await request()).status, 503)
  child.send({ type: 'update-tasks', action: 'unlock', requestId: 2 })
  const unlocked = await receive(message => message.type === 'update-tasks' && message.requestId === 2)
  assert.equal(unlocked.error, undefined)
  assert.equal((await request()).status, 200)
  child.send({ type: 'shutdown' })
  await receive(message => message.type === 'shutdown-complete')
  assert.deepEqual(await exited, { code: 0, signal: null })
})
