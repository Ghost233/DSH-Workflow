import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serviceNotification } from './service-notification.mjs'
import { bundleServiceNotifications } from '../service-notifications.mjs'

const execute = promisify(execFile)

test('the real helper reports its own undecided permission and does not submit a fault notification', async t => {
  const resources = await mkdtemp(join(tmpdir(), 'service-notification-native-'))
  t.after(() => rm(resources, { recursive: true, force: true }))
  const native = fileURLToPath(new URL('../native/service-notifications/', import.meta.url))
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const app = join(resources, 'DSH Service Notifications.app')
  const contents = join(app, 'Contents')
  await bundleServiceNotifications(root, resources)
  const bundleIdentifier = `com.ghostagent.dsh-workflow.service-notifications.test-${randomUUID().toLowerCase()}`
  const plist = (await readFile(join(native, 'Info.plist'), 'utf8'))
    .replace('com.ghostagent.dsh-workflow.service-notifications', bundleIdentifier)
  await writeFile(join(contents, 'Info.plist'), plist)
  await execute('codesign', ['--force', '--sign', '-', app])
  const { stderr: signature } = await execute('codesign', ['--display', '--verbose=4', app])
  const { stdout: buildVersion } = await execute('xcrun', ['vtool', '-show-build', join(contents, 'MacOS/DSH Service Notifications')])
  assert.match(buildVersion, /minos 14\.0(?:\s|$)/)
  const sha256 = value => createHash('sha256').update(value).digest('hex')
  const sourceSha256 = sha256(await readFile(join(native, 'main.swift')))
  const executableSha256 = sha256(await readFile(join(contents, 'MacOS/DSH Service Notifications')))
  const settings = await serviceNotification(resources, 'status')
  assert.equal(settings.available, true, JSON.stringify(settings))
  assert.equal(settings.bundleIdentifier, bundleIdentifier)
  assert.equal(settings.authorization.status, 'notDetermined')
  assert.equal(settings.authorizationRequest.state, 'not-requested')
  assert.equal(settings.submission.state, 'not-attempted')
  const faultId = `fault-${randomUUID()}`
  const notification = await serviceNotification(resources, 'notify', faultId)
  assert.equal(notification.bundleIdentifier, bundleIdentifier)
  assert.equal(notification.faultId, faultId)
  assert.equal(notification.authorization.status, 'notDetermined')
  assert.equal(notification.authorizationRequest.state, 'not-requested')
  assert.equal(notification.submission.state, 'not-attempted')
  assert.match(notification.message, /尚未授权/)
  const delivered = await serviceNotification(resources, 'delivered', faultId)
  assert.equal(delivered.delivery.state, 'not-observed')
  assert.equal(delivered.faultId, faultId)
  console.log(JSON.stringify({ nativeNotificationEvidence: { sourceSha256, executableSha256, signature, buildVersion,
    settings, notification, delivered } }))
})
