import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from "node:net"
import { once } from "node:events"
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

test('Web Host starts the real DSH runtime and exits cleanly', { timeout: 60_000 }, async t => {
  const resources = process.env.DSH_WEB_TEST_RUNTIME_ROOT ?? process.env.DSH_SERVICE_TEST_RESOURCES
  if (!resources) throw new Error('Set DSH_WEB_TEST_RUNTIME_ROOT or DSH_SERVICE_TEST_RESOURCES to the candidate runtime')
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), boot = require('@deepseek-ai/dsh-app-boot')
  const templates = boot.PROFILE_TEMPLATES ?? require('@deepseek-ai/dsh-official-bundles').PROFILE_TEMPLATES
  const root = await mkdtemp(join(tmpdir(), 'station-web-host-test-'))
  const home = join(root, 'home'), profile = join(home, 'profiles/desktop'), receipt = join(root, 'receipt')
  await mkdir(home); boot.initProfile(profile, templates.web.bundles)
  await mkdir(receipt, { mode: 0o700 })
  const reservation = createServer().listen(0, "127.0.0.1")
  await once(reservation, "listening")
  const { port: observationPort } = reservation.address()
  await new Promise(resolve => reservation.close(resolve))
  const fakeBearer = "z".repeat(43)
  await writeFile(join(receipt, "session-observation-mcp.json"), JSON.stringify({
    port: observationPort, bearer: fakeBearer, sessions: [{id:"unavailable-fixture",label:"Isolated fixture"}],
  }), { mode: 0o600 })
  const bridge = fileURLToPath(new URL('./station-bridge.mjs', import.meta.url))
  const lingering = join(root, 'lingering.mjs'), marker = join(root, 'lingering-loaded')
  await writeFile(lingering, `import { writeFileSync } from 'node:fs'
    export function apply() {
      writeFileSync(${JSON.stringify(marker)}, 'loaded')
      setInterval(() => {}, 60_000)
    }`)
  const patch = [{ id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { insert: [{ id: 'dsh-station-bridge', name: bridge, config: { directory: receipt, runtimeVersion: 'fixture' } },
      { id: 'lingering-test-resource', name: lingering }] }]
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
  assert.equal(await readFile(marker, 'utf8'), 'loaded')
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
  const mcp = (authorization = "Bearer " + fakeBearer) => fetch(
    "http://127.0.0.1:" + observationPort + "/mcp", {
      method:"POST", headers:{ authorization, "content-type":"application/json",
        accept:"application/json, text/event-stream" },
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"session_status"}}),
      signal:AbortSignal.timeout(2500),
    })
  assert.equal((await mcp("Bearer incorrect")).status,401)
  const projection = (await (await mcp()).json()).result.structuredContent
  assert.deepEqual(projection.sessions,[{label:"Isolated fixture",status:"unavailable"}])
  const toggle = async (enabled,requestId) => {
    child.send({type:'workflow-set-dot-tunnel',enabled,requestId})
    return await receive(message => message.type === 'workflow-set-dot-tunnel' && message.requestId === requestId)
  }
  const enabled = await toggle(true,1)
  assert.deepEqual(enabled.value,{enabled:true,state:'missing_tunnel_config',connected:null})
  assert.deepEqual(JSON.parse(await readFile(join(receipt,'station-dot-tunnel-preference.json'),'utf8')),{enabled:true})
  const tunnelDirectory = join(await realpath(root), 'fixture-tunnel')
  await mkdir(tunnelDirectory,{mode:0o700})
  // Pinned local stub ignores all arguments and cannot contact a remote control plane.
  const client = '#!/bin/sh\nexec /bin/sleep 120\n'
  await writeFile(join(tunnelDirectory,'tunnel-client'),client,{mode:0o700})
  await writeFile(join(tunnelDirectory,'runtime.key'),'synthetic-fixture',{mode:0o600})
  const pair = async (clientSha256,requestId,id='new-allowed-fixture',label='Paired fixture') => {
    child.send({type:'workflow-configure-dot-tunnel',requestId,pairing:{
      directory:tunnelDirectory,tunnelId:'tunnel_'+'a'.repeat(32),clientSha256,
      sessions:[{id,label}],
    }})
    return receive(message => message.type === 'workflow-configure-dot-tunnel' && message.requestId === requestId)
  }
  assert.match((await pair('b'.repeat(64),91)).error,/配对未确认/)
  const hash = createHash('sha256').update(client).digest('hex')
  assert.equal((await pair(hash,92)).value.state,'configured')
  const newConfig = JSON.parse(await readFile(join(receipt,'station-dot-pairing.json'),'utf8'))
  assert.deepEqual(newConfig.observation.sessions,[{id:'new-allowed-fixture',label:'Paired fixture'}])
  const pairedMcp = (cfg=newConfig,tool='session_status') => fetch('http://127.0.0.1:'+cfg.observation.port+'/mcp', {
    method:'POST',headers:{authorization:'Bearer '+cfg.observation.bearer,'content-type':'application/json',
      accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:tool}}),
    signal:AbortSignal.timeout(2500),
  })
  const running = await toggle(true,2)
  assert.deepEqual(running.value,{enabled:true,state:'client_running',connected:null})
  assert.match((await pair(hash,93)).error,/请先关闭隧道/)
  assert.deepEqual((await (await pairedMcp()).json()).result.structuredContent.sessions,
    [{label:'Paired fixture',status:'unavailable'}])
  const leases = async () => (await readdir(tunnelDirectory)).filter(name=>name.startsWith('synthetic-upstream-'))
  assert.equal((await leases()).length,1)
  assert.deepEqual((await toggle(true,3)).value,running.value)
  assert.equal((await leases()).length,1)
  child.send({type:'workflow-restart-dot-tunnel',requestId:4})
  const restarted = await receive(message => message.type === 'workflow-restart-dot-tunnel' && message.requestId === 4)
  assert.deepEqual(restarted.value,running.value)
  assert.equal((await leases()).length,1)
  assert.equal((await request()).status,200)
  const disabled = await toggle(false,5)
  assert.deepEqual(disabled.value,{enabled:false,state:'off',connected:null})
  assert.deepEqual(await leases(),[])
  assert.equal((await request()).status,200)
  assert.equal((await pairedMcp()).status,200)
  assert.match((await pair('b'.repeat(64),94,'denied-fixture','Invalid replacement')).error,/配对未确认/)
  assert.equal((await pairedMcp()).status,200)
  assert.equal((await pair(hash,95,'replacement-fixture','Replacement fixture')).value.state,'configured')
  const replacement = JSON.parse(await readFile(join(receipt,'station-dot-pairing.json'),'utf8'))
  assert.notEqual(replacement.observation.bearer,newConfig.observation.bearer)
  assert.equal((await toggle(true,6)).value.state,'client_running')
  const replacementResult = (await (await pairedMcp(replacement)).json()).result.structuredContent
  assert.deepEqual(replacementResult.sessions,[{label:'Replacement fixture',status:'unavailable'}])
  await assert.rejects(()=>pairedMcp())
  assert.equal((await request()).status,200)
  assert.equal(JSON.parse(await readFile(join(receipt,'desktop-host.json'),'utf8')).pid,saved.pid)
  child.send({ type: 'shutdown' })
  await receive(message => message.type === 'shutdown-complete')
  assert.deepEqual(await Promise.race([exited, delay(1500, 'Host stayed alive after its shutdown acknowledgement', { ref: false })]),
    { code: 0, signal: null })
  await assert.rejects(()=>pairedMcp(replacement))
})
