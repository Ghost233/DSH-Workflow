import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { serveManager } from './service-manager.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'
import { WorkflowDesktopConnection } from './desktop-client.mjs'

const exec = promisify(execFile)
const artifact = process.env.DSH_SERVICE_TEST_RESOURCES

test('daily service uses standalone Node and survives desktop client disconnects', {
  skip: artifact ? false : 'Requires frozen packaged resources for real Node Host acceptance', timeout: 60_000,
}, async t => {
  const root = await mkdtemp('/private/tmp/dsh-service-node-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data'), home = join(root, 'home')
  await mkdir(dataRoot, { mode: 0o700 })
  await exec(process.execPath, ['macos-launcher/flutter/tool/independent_service_resources.mjs', artifact, resources])
  const manager = await serveManager({ dataRoot, resources, home })
  assert.ok(manager)
  try {
    const socket = serviceSocket(dataRoot)
    const started = await serviceRequest(socket, { type: 'start-service', permissionMode: 'workspace-write' }, 45_000)
    assert.equal(started.service.ready, true)
    const receipt = JSON.parse(await readFile(join(dataRoot, 'global/.dsh-workflow/desktop/desktop-host.json'), 'utf8'))
    const executable = (await exec('/bin/ps', ['-ww', '-p', String(receipt.pid), '-o', 'comm='])).stdout.trim()
    assert.equal(await realpath(executable), await realpath(join(resources, 'node')), 'the automatic backend must not launch the Desktop application executable')
    const runtime = join(resources, 'desktop/DeepSeek Harness.app/Contents/Resources/app/dsh')
    for (let cycle = 0; cycle < 2; cycle++) {
      const client = new WorkflowDesktopConnection(null, runtime, null, null, { DSH_WORKFLOW_DATA_ROOT: dataRoot }, () => {})
      await client.start()
      await client.stop()
      const status = await serviceRequest(socket, { type: 'status' }, 5000)
      assert.equal(status.service.pid, started.service.pid)
      assert.equal(status.service.instanceId, started.service.instanceId)
      assert.equal(status.service.ready, true)
    }
  } finally { await manager.close() }
})
