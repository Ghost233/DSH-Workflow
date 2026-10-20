import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, lstat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { serviceRequest, serviceSocket, serviceDirectory } from './service-control.mjs'
import { webSocket, webDirectory } from './web-control.mjs'
import { listenManagerControl } from './manager-control.mjs'

async function fixture(t, role) {
  const root = await mkdtemp('/private/tmp/dsh-control-recovery-'), resources = join(root, 'resources')
  await mkdir(resources)
  const socket = role === 'service' ? serviceSocket(root) : webSocket(root)
  const directory = role === 'service' ? serviceDirectory(root) : webDirectory(root)
  const record = join(directory, 'manager.json')
  const args = role === 'service' ? [root, resources, join(root, 'home')] : [root]
  const script = role === 'service' ? 'service-manager.mjs' : 'global-supervisor.mjs'
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { stdio: 'ignore' })
  const exited = new Promise(accept => child.once('close', accept))
  t.after(async () => {
    child.kill('SIGTERM')
    try {
      const current = JSON.parse(await readFile(record, 'utf8'))
      if (current.pid !== child.pid && current.pid !== process.pid) process.kill(current.pid, 'SIGTERM')
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        const current = JSON.parse(await readFile(record, 'utf8'))
        if (current.pid === process.pid) break
        try { process.kill(current.pid, 0) } catch (error) { if (error.code === 'ESRCH') break; throw error }
      } catch (error) { if (error.code === 'ENOENT') break; throw error }
      await delay(25)
      if (attempt === 199) assert.fail('Owned recovery manager did not close')
    }
    await exited
    await rm(dirname(socket), { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  })
  for (let attempt = 0; ; attempt++) {
    try { await serviceRequest(socket, { type: 'status' }, 1000); await readFile(record); break }
    catch (error) { if (attempt === 199) throw error; await delay(10) }
  }
  child.kill('SIGKILL')
  await exited
  await assert.rejects(serviceRequest(socket, { type: 'status' }), { code: 'ECONNREFUSED' })
  assert.equal(JSON.parse(await readFile(record, 'utf8')).pid, child.pid)
  const cli = fileURLToPath(new URL(role === 'service' ? 'service-cli.mjs' : 'web-cli.mjs', import.meta.url))
  const request = async body => {
    const cliChild = spawn(process.execPath, [cli, root, resources, join(root, 'home')], {
      env: { ...process.env, DSH_LAUNCH_PASSWORD: 'owned-control-recovery-test' }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    cliChild.stdout.on('data', value => { stdout += value })
    cliChild.stderr.on('data', value => { stderr += value })
    cliChild.stdin.end(JSON.stringify(body) + '\n')
    const code = await new Promise((accept, reject) => { cliChild.once('error', reject); cliChild.once('close', accept) })
    return { code, reply: JSON.parse(stdout), stderr }
  }
  return { root, socket, record, directory, oldPid: child.pid, request }
}

test('a refused socket with a live recorded PID is never reclaimed', async t => {
  const owned = await fixture(t, 'service')
  const content = JSON.stringify({ pid: process.pid, protocol: 1 }) + '\n'
  await writeFile(owned.record, content)
  const inode = (await lstat(owned.socket)).ino
  const server = createServer()
  assert.equal(await listenManagerControl(server, { directory: owned.directory, socketPath: owned.socket }), null)
  assert.equal(server.listening, false)
  assert.equal(await readFile(owned.record, 'utf8'), content)
  assert.equal((await lstat(owned.socket)).ino, inode)
})

test('an invalid ownership record fails before publishing a control socket', async t => {
  const root = await mkdtemp('/private/tmp/dsh-control-invalid-')
  const socketPath = serviceSocket(root), directory = serviceDirectory(root)
  await mkdir(join(directory, 'manager.json'), { recursive: true, mode: 0o700 })
  t.after(async () => { await rm(dirname(socketPath), { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  const server = createServer()
  await assert.rejects(listenManagerControl(server, { directory, socketPath }), /Unsafe DSH manager record/)
  assert.equal(server.listening, false)
  await assert.rejects(lstat(socketPath), { code: 'ENOENT' })
  assert.equal((await lstat(join(directory, 'manager.json'))).isDirectory(), true)
})

for (const role of ['service', 'web']) {
  test(`${role} status reports stopped after a real manager SIGKILL leaves a refused socket`, async t => {
    const owned = await fixture(t, role)
    for (const type of ['status', 'logs']) {
      const result = await owned.request({ type })
      assert.equal(result.code, 0, JSON.stringify(result))
      assert.equal(result.reply.ok, true)
      assert.equal(result.reply.value[role].state, 'stopped')
    }
  })

  test(`${role} concurrent starts recover the dead manager and preserve its control evidence`, async t => {
    const owned = await fixture(t, role)
    const request = role === 'service' ? { type: 'authorize-notifications' } : { type: 'start-web', port: 0 }
    const results = await Promise.all([owned.request(request), owned.request(request)])
    for (const result of results) assert.equal(result.code, 0, JSON.stringify(result))
    const pid = JSON.parse(await readFile(owned.record, 'utf8')).pid
    assert.notEqual(pid, owned.oldPid)
    const response = await serviceRequest(owned.socket, { type: 'status' })
    assert.equal(response[role].state, role === 'service' ? 'stopped' : 'running')
    const { readdir } = await import('node:fs/promises')
    const backups = (await readdir(owned.directory)).filter(name => name.startsWith('manager.json.stale-'))
    assert.equal(backups.length, 1)
    assert.equal(JSON.parse(await readFile(join(owned.directory, backups[0]), 'utf8')).pid, owned.oldPid)
    const socketBackups = (await readdir('/private/tmp')).filter(name => name.startsWith(dirname(owned.socket).split('/').at(-1) + '.stale-'))
    assert.equal(socketBackups.length, 1)
    const backup = join('/private/tmp', socketBackups[0])
    assert.equal((await lstat(join(backup, 'control.sock'))).isSocket(), true)
    t.after(() => rm(backup, { recursive: true, force: true }))
  })
}
