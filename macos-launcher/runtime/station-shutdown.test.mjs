import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { shutdownStation } from './station-shutdown.mjs'
import { stationManager } from './station-processes.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'
import { webSocket } from './web-control.mjs'

const artifact = process.env.DSH_SERVICE_TEST_RESOURCES
const runtime = fileURLToPath(new URL('./', import.meta.url))
function launch(script, args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.resume()
  return child
}
async function ready(socket) {
  for (let i = 0; i < 200; i++) {
    try { return await serviceRequest(socket, { type: 'status' }, 1000) }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
    await delay(25)
  }
  throw new Error('manager did not become ready')
}
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }

test('cancel keeps services running; confirmed exit reaps daily, Web and a detached helper', {
  skip: artifact ? false : 'Requires frozen packaged resources for actual shutdown acceptance', timeout: 120000,
}, async t => {
  const root = await mkdtemp('/private/tmp/dsh-station-exit-'), dataRoot = join(root, 'data'), resources = join(root, 'resources'), home = join(root, 'home')
  await mkdir(dataRoot, { mode: 0o700 })
  const workers = []
  t.after(async () => {
    for (const child of workers) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await Promise.all(workers.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) resolve()
      else child.once('close', resolve)
    })))
    await rm(root, { recursive: true, force: true })
  })
  const unrelated = launch('-e', ['setInterval(()=>{},1000)']); workers.push(unrelated)
  const foreign = join(root, 'foreign-manager'); await mkdir(foreign, { mode: 0o700 })
  await writeFile(join(foreign, 'manager.json'), JSON.stringify({ pid: unrelated.pid }), { mode: 0o600 })
  await assert.rejects(stationManager(foreign, 'service-manager.mjs', dataRoot), /身份不匹配/)
  assert.equal(alive(unrelated.pid), true)
  const stage = launch('macos-launcher/flutter/tool/independent_service_resources.mjs', [artifact, resources]); workers.push(stage)
  assert.equal(await new Promise(resolve => stage.once('close', resolve)), 0)
  const daily = launch(join(runtime, 'service-manager.mjs'), [dataRoot, resources, home]); workers.push(daily)
  await ready(serviceSocket(dataRoot))
  const started = await serviceRequest(serviceSocket(dataRoot), { type: 'start-service', permissionMode: 'workspace-write' }, 45000)
  assert.equal(started.service.ready, true)
  const script = join(root, 'global-supervisor.mjs')
  await writeFile(script, `
import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
import {serveGlobalSupervisor} from ${JSON.stringify(new URL('./global-supervisor.mjs', import.meta.url).href)};
const [dataRoot,root]=process.argv.slice(2);
const helper=spawn(process.execPath,['-e','const fs=require("node:fs");process.on("SIGTERM",()=>fs.writeFileSync(process.argv[1],"seen"));setInterval(()=>{},1000)',root+'/helper-term-seen'],{detached:true,stdio:'ignore'});
helper.unref();writeFileSync(root+'/helper.pid',String(helper.pid));
const supervisor=await serveGlobalSupervisor({dataRoot});
process.once('SIGTERM',()=>{void supervisor.close()});
`)
  const web = launch(script, [dataRoot, root]); workers.push(web)
  await ready(webSocket(dataRoot))
  await serviceRequest(webSocket(dataRoot), { type: 'start-web', password: 'isolated-quit-fixture', port: 0 }, 10000)
  const helperPid = Number(await readFile(join(root, 'helper.pid'), 'utf8'))
  t.after(() => {
    if (!alive(helperPid)) return
    let command
    try { command = execFileSync('/bin/ps', ['-ww', '-p', String(helperPid), '-o', 'command='], { encoding: 'utf8' }) }
    catch (error) { if (error.status === 1) return; throw error }
    if (command.includes(root + '/helper-term-seen')) process.kill(helperPid, 'SIGKILL')
  })
  let confirmation
  assert.equal(await shutdownStation({ dataRoot, confirm: async value => { confirmation = value; return false } }), false)
  assert.equal(confirmation.needsConfirmation, false)
  assert.deepEqual(confirmation.work, [])
  assert.equal((await serviceRequest(serviceSocket(dataRoot), { type: 'status' })).service.pid, started.service.pid)
  assert.equal((await serviceRequest(serviceSocket(dataRoot), { type: 'status' })).service.ready, true)
  assert.equal((await serviceRequest(webSocket(dataRoot), { type: 'status' })).web.state, 'running')
  assert.equal(alive(helperPid), true)
  await assert.rejects(readFile(join(root, 'helper-term-seen')), { code: 'ENOENT' })
  const exit = spawn(process.execPath, [join(runtime, 'station-shutdown.mjs'), dataRoot], { stdio: ['pipe', 'pipe', 'pipe'] })
  workers.push(exit); exit.stderr.resume()
  const events = []
  createInterface({ input: exit.stdout }).on('line', line => {
    const event = JSON.parse(line); events.push(event)
    if (event.type === 'inspection') exit.stdin.write(JSON.stringify({ confirmed: true }) + '\n')
  })
  // Keep the parent's stdin open: the helper must finish its own control stream.
  assert.equal(await new Promise(resolve => exit.once('close', resolve)), 0)
  assert.ok(events.some(event => event.type === 'result' && event.stopped === true))
  assert.equal(await readFile(join(root, 'helper-term-seen'), 'utf8'), 'seen', 'graceful termination is attempted before forcing an owned leftover')
  assert.equal(alive(unrelated.pid), true, 'an unrelated Node process must not be terminated')
  for (const pid of [daily.pid, web.pid, started.service.pid, helperPid]) assert.equal(alive(pid), false, `owned process ${pid} survived Station shutdown`)
})
