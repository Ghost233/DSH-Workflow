import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Actual Host/password transport acceptance belongs to the official SDK/native scenarios.
// This explicit artifact check rejects an old project layer before starting a gateway.
test('the final packaged Web entry retains one real access port and clearly reports an absent Host', { timeout: 15_000 }, async t => {
  const resources = process.env.DSH_MACOS_RESOURCES
  assert.ok(resources, 'Set DSH_MACOS_RESOURCES to the final candidate Wrapper resources; this check cannot be skipped')
  const directory = join(resources, 'workflow/macos-launcher/runtime')
  const digest = value => createHash('sha256').update(value).digest('hex')
  for (const name of ['global-supervisor.mjs', 'lan-gateway.mjs', 'web-cli.mjs', 'web-control.mjs']) {
    assert.equal(digest(await readFile(join(directory, name))), digest(await readFile(new URL(name, import.meta.url))),
      `packaged ${name} must match the current candidate`)
  }
  const root = await mkdtemp('/private/tmp/dsh-global-smoke-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const history = JSON.stringify([{ id: 'retained', path: root }])
  await writeFile(join(root, 'catalogs.json'), history)
  const { startGlobalSupervisor } = await import(pathToFileURL(join(directory, 'global-supervisor.mjs')).href)
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port: 0,
    password: randomBytes(24).toString('base64url') })
  t.after(() => supervisor.close())
  const instance = supervisor.global().instanceId
  const port = supervisor.port
  const entries = await Promise.all(Array.from({ length: 8 }, () => supervisor.openGlobal()))
  assert.equal(new Set(entries).size, 1)
  assert.equal(supervisor.global().instanceId, instance)
  assert.equal(supervisor.global().gatePort, port)
  assert.equal(supervisor.global().serviceInstanceId, null)
  assert.equal(supervisor.catalogs, undefined)
  const response = await fetch(supervisor.localUrl)
  assert.equal(response.status, 503)
  assert.match(await response.text(), /DSH 服务不可用/)
  assert.equal(await readFile(join(root, 'catalogs.json'), 'utf8'), history)
  await assert.rejects(stat(join(root, 'global/.dsh-workflow/service/manager.json')), { code: 'ENOENT' })
  await assert.rejects(stat(join(root, 'global/.dsh-workflow/desktop/desktop-host.json')), { code: 'ENOENT' })
  await supervisor.close()
  const check = net.createServer()
  await new Promise((accept, reject) => { check.once('error', reject); check.listen(port, '127.0.0.1', accept) })
  await new Promise(accept => check.close(accept))
})
