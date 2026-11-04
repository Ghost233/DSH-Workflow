import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { copyProjectIntegration } from '../project-resources.mjs'
import { serveManager } from './service-manager.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'

test('Station runs the packaged Web Host without Desktop and preserves an existing profile', { timeout: 60_000 }, async t => {
  const artifact = process.env.DSH_SERVICE_TEST_RESOURCES
  if (!artifact) throw new Error('DSH_SERVICE_TEST_RESOURCES must identify the packaged Web runtime')
  const root = await mkdtemp(join(tmpdir(), 'station-web-integration-'))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data'), home = join(root, 'home')
  await mkdir(resources); await mkdir(dataRoot, { mode: 0o700 })
  await copyProjectIntegration(resolve('.'), join(resources, 'workflow'))
  for (const name of ['node', 'node_modules', 'plugins', 'plugin-payload.json']) await symlink(join(artifact, name), join(resources, name))
  await cp(join(artifact, 'package.json'), join(resources, 'package.json'))
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json'), require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const templates = boot.PROFILE_TEMPLATES ?? require('@deepseek-ai/dsh-official-bundles').PROFILE_TEMPLATES
  const profile = join(home, 'profiles/desktop')
  await mkdir(profile, { recursive: true }); boot.initProfile(profile, templates.web.bundles)
  const userPatch = JSON.stringify([
    { id: 'workflow-mcp-codegraph', disabled: true },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { id: 'session-telemetry-otel', disabled: true }, { id: 'desktop-product-telemetry', disabled: true },
    { id: 'product-analytics', disabled: true }, { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
  ])
  await writeFile(join(profile, 'cordis.patch.yml'), userPatch)
  const shell = join(root, 'fixture-shell')
  await writeFile(shell, '#!/bin/sh\nexec /bin/sh -c "$2"\n'); await chmod(shell, 0o700)
  const manager = await serveManager({ dataRoot, resources, home, loginShells: [shell], loginEnvironment: {
    HOME: root, ZDOTDIR: root, DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
    TMPDIR: tmpdir(), PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  } })
  t.after(async () => { await manager?.close(); await rm(root, { recursive: true, force: true }) })
  assert.ok(manager)
  const socket = serviceSocket(dataRoot)
  const started = await serviceRequest(socket, { type: 'start-service', permissionMode: 'workspace-write' }, 45_000)
  assert.equal(started.service.ready, true)
  const runtime = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8'))
  const connected = await serviceRequest(socket, { type: 'connect-web', runtimeVersion: runtime.version })
  assert.equal(connected.connection.runtimeVersion, runtime.version)
  assert.equal(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'), userPatch)
  const loaded = started.logs.filter(row => row.text.startsWith('项目启动插件：')).map(row => JSON.parse(row.text.slice('项目启动插件：'.length)))
  assert.equal(loaded.length, 8)
  assert.ok(loaded.every(row => row.state === 'loaded'), JSON.stringify(loaded))
  const inspection = (await serviceRequest(socket, { type: 'inspect-stop', action: 'stop' })).stop
  assert.ok(inspection.operationId)
  const stopped = await serviceRequest(socket, { type: 'stop-service', operationId: inspection.operationId, confirmed: true }, 30_000)
  assert.equal(stopped.service.state, 'stopped')
})
