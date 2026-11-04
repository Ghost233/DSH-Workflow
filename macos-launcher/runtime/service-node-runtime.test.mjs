import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { serveManager } from './service-manager.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'

const exec = promisify(execFile)
const artifact = process.env.DSH_SERVICE_TEST_RESOURCES

test('daily Web service uses standalone Node and survives browser disconnects', {
  skip: artifact ? false : 'Requires frozen packaged resources for real Node Host acceptance', timeout: 60_000,
}, async t => {
  const root = await mkdtemp('/private/tmp/dsh-service-node-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data'), home = join(root, 'home')
  await mkdir(dataRoot, { mode: 0o700 })
  await exec(process.execPath, ['macos-launcher/flutter/tool/independent_service_resources.mjs', artifact, resources])
  const shell = join(root, 'fixture-shell')
  await writeFile(shell, '#!/bin/sh\nexec /bin/sh -c "$2"\n'); await chmod(shell, 0o700)
  const manager = await serveManager({ dataRoot, resources, home, loginShells: [shell], loginEnvironment: {
    HOME: root, ZDOTDIR: root, DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
    TMPDIR: '/private/tmp', PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  } })
  assert.ok(manager)
  try {
    const socket = serviceSocket(dataRoot)
    const started = await serviceRequest(socket, { type: 'start-service', permissionMode: 'workspace-write' }, 45_000)
    assert.equal(started.service.ready, true)
    const receipt = JSON.parse(await readFile(join(dataRoot, 'global/.dsh-workflow/desktop/desktop-host.json'), 'utf8'))
    const executable = (await exec('/bin/ps', ['-ww', '-p', String(receipt.pid), '-o', 'comm='])).stdout.trim()
    assert.equal(await realpath(executable), await realpath(join(resources, 'node')), 'the Web backend must use the bundled Node executable')
    const version = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8')).version
    for (let cycle = 0; cycle < 2; cycle++) {
      const { connection } = await serviceRequest(socket, { type: 'connect-web', runtimeVersion: version })
      const response = await fetch(connection.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
      assert.ok(response.status >= 200 && response.status < 400)
      await response.arrayBuffer()
      const status = await serviceRequest(socket, { type: 'status' }, 5000)
      assert.equal(status.service.pid, started.service.pid)
      assert.equal(status.service.instanceId, started.service.instanceId)
      assert.equal(status.service.ready, true)
    }
  } finally { await manager.close() }
})
