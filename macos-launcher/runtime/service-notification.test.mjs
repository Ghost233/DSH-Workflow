import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serviceNotification } from './service-notification.mjs'

test('management can read that the notification helper is unavailable without claiming delivery', async t => {
  const resources = await mkdtemp(join(tmpdir(), 'service-notification-'))
  t.after(() => rm(resources, { recursive: true, force: true }))
  const result = await serviceNotification(resources, 'notify', 'fault-20261017-1')
  assert.equal(result.available, false)
  assert.equal(result.submission.state, 'not-attempted')
  assert.equal(result.delivery.state, 'unknown')
  assert.equal(result.error.code, 'ENOENT')
  assert.match(result.message, /通知助手不可用/)
})

test('a helper process failure leaves submission unknown when the request may have reached macOS', async t => {
  const resources = await mkdtemp(join(tmpdir(), 'service-notification-'))
  t.after(() => rm(resources, { recursive: true, force: true }))
  const directory = join(resources, 'DSH Service Notifications.app/Contents/MacOS')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'DSH Service Notifications'), '#!/bin/sh\nexit 1\n', { mode: 0o700 })
  const result = await serviceNotification(resources, 'notify', 'fault-20261017-2')
  assert.equal(result.available, false)
  assert.equal(result.submission.state, 'unknown')
  assert.equal(result.delivery.state, 'unknown')
})

test('a response for another fault cannot count as this fault being submitted or delivered', async t => {
  const resources = await mkdtemp(join(tmpdir(), 'service-notification-'))
  t.after(() => rm(resources, { recursive: true, force: true }))
  const directory = join(resources, 'DSH Service Notifications.app/Contents/MacOS')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'DSH Service Notifications'), '#!/bin/sh\ncat <<\'REPORT\'\n'
    + JSON.stringify({ available: true, command: 'notify', faultId: 'old-fault',
      submission: { state: 'submitted' }, delivery: { state: 'observed' } }) + '\nREPORT\n', { mode: 0o700 })
  const result = await serviceNotification(resources, 'notify', 'new-fault')
  assert.equal(result.available, false)
  assert.equal(result.submission.state, 'unknown')
  assert.equal(result.delivery.state, 'unknown')
  assert.match(result.error.message, /Invalid notification helper response/)
})

test('the helper runs as an application launched by LaunchServices', async t => {
  const resources = await mkdtemp(join(tmpdir(), 'service-notification-'))
  t.after(() => rm(resources, { recursive: true, force: true }))
  const contents = join(resources, 'DSH Service Notifications.app/Contents')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await writeFile(join(contents, 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<plist version="1.0"><dict><key>CFBundleExecutable</key><string>DSH Service Notifications</string>'
    + '<key>CFBundleIdentifier</key><string>com.ghostagent.dsh-workflow.notification-adapter-fixture</string>'
    + '<key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>\n')
  await writeFile(join(contents, 'MacOS/DSH Service Notifications'), '#!/bin/sh\n'
    + 'printf \'{"available":true,"command":"status","faultId":null,"submission":{"state":"not-attempted"},"delivery":{"state":"not-queried"},"parentPid":%s}\\n\' "$PPID"\n', { mode: 0o700 })
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await serviceNotification(resources, 'status')
    assert.equal(result.available, true, JSON.stringify(result))
    assert.ok(Number.isSafeInteger(result.parentPid))
    assert.notEqual(result.parentPid, process.pid, 'The helper was executed directly as a Node child')
  }
})
