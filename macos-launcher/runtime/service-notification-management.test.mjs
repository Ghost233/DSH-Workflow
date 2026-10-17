import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const cli = fileURLToPath(new URL('./service-cli.mjs', import.meta.url))

test('management explicitly requests notification authorization without starting a Host and reads real helper unavailability', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-notification-management-'))
  const resources = join(root, 'resources')
  await mkdir(resources)
  const manager = join(root, 'global/.dsh-workflow/service/manager.json')
  t.after(async () => {
    try {
      const identity = JSON.parse(await readFile(manager, 'utf8'))
      process.kill(identity.pid, 'SIGTERM')
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await access(manager) } catch (error) { if (error.code === 'ENOENT') return; throw error }
        await delay(50)
      }
      assert.fail(`Owned manager did not exit; retained fixture ${root}`)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  })
  const request = async type => {
    const child = spawn(process.execPath, [cli, root, resources, join(root, 'home')], { stdio: ['pipe', 'pipe', 'pipe'] })
    const output = new Promise((accept, reject) => {
      let stdout = '', stderr = ''
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
      child.stdout.on('data', value => { stdout += value })
      child.stderr.on('data', value => { stderr += value })
      child.once('error', reject)
      child.once('close', code => accept({ code, stdout, stderr }))
    })
    child.stdin.end(JSON.stringify({ type }) + '\n')
    const result = await output
    return { ...result, reply: JSON.parse(result.stdout) }
  }
  const started = await request('authorize-notifications')
  assert.equal(started.code, 0, JSON.stringify(started))
  assert.equal(started.reply.ok, true)
  assert.equal(started.reply.value.service.state, 'stopped')
  let status
  for (let attempt = 0; attempt < 40; attempt++) {
    status = await request('status')
    assert.equal(status.code, 0, JSON.stringify(status))
    if (status.reply.value.notificationAuthorization?.available === false) break
    await delay(25)
  }
  const authorization = status.reply.value.notificationAuthorization
  assert.equal(authorization.available, false)
  assert.equal(authorization.command, 'authorize')
  assert.equal(authorization.error.code, 'ENOENT')
  assert.equal(authorization.submission.state, 'not-attempted')
  assert.equal(authorization.delivery.state, 'unknown')
  assert.match(JSON.stringify(status.reply.value.logs), /macOS 通知助手不可用/)
  assert.equal(status.reply.value.service.state, 'stopped')
  assert.equal(status.reply.value.service.pid, null)
  const refreshed = await request('notification-status')
  assert.equal(refreshed.code, 0, JSON.stringify(refreshed))
  assert.equal(refreshed.reply.value.notificationAuthorization.command, 'status')
  assert.equal(refreshed.reply.value.notificationAuthorization.error.code, 'ENOENT')
  assert.equal(refreshed.reply.value.service.state, 'stopped')
  assert.equal(refreshed.reply.value.service.pid, null)
  await assert.rejects(access(join(root, 'global/.dsh-workflow/desktop/desktop-host.json')), { code: 'ENOENT' })
  console.log(JSON.stringify({ managementNotificationEvidence: { root, authorization,
    refreshed: refreshed.reply.value.notificationAuthorization, hostStarted: false } }))
})
