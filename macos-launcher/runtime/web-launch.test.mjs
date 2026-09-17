import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:net'
import { authenticatedUrl, launchPackagedWeb, portPatch } from './web-launch.mjs'

test('packaged port patch preserves the selected Web server configuration', () => {
  const entries = [{ id: 'server', name: '@deepseek-ai/dsh-host-webserver', config: { host: '127.0.0.1', port: 3080 } }]
  assert.deepEqual(portPatch(entries, 3081), { id: 'server', config: { host: '127.0.0.1', port: 3081 } })
  assert.equal(entries[0].config.port, 3080)
  assert.throws(() => portPatch(entries, 0), /Port/)
})

test('browser handoff reads only the upstream authenticated loopback URL', () => {
  assert.equal(authenticatedUrl('ready\ndsh web: http://127.0.0.1:3080/?token=abc\n'),
    'http://127.0.0.1:3080/?token=abc')
  assert.throws(() => authenticatedUrl('dsh web: http://example.com/?token=abc\n'), /Unexpected/)
  assert.throws(() => authenticatedUrl('dsh web: http://127.0.0.1:3080/\n'), /did not publish/)
})

test('an occupied port fails before reading the profile or packaged plugins', async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = server.address().port
    await assert.rejects(
      launchPackagedWeb({ resourcesRoot: '/nonexistent-resources', workspace: '/nonexistent-workspace', port }),
      /already in use/,
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
