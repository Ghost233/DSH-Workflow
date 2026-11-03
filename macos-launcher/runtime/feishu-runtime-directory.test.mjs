import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { feishuRuntimeDirectory } from './feishu-runtime-directory.mjs'

test('a long bot configuration uses a short, reusable Unix socket path without moving its credentials', async t => {
  const root = await mkdtemp('/private/tmp/dsh-lark-long-')
  const directory = join(root, 'Application Support', 'DSH Workflow', 'superagent-feishu', '090aa304-ead2-4b22-b64b-a6919626f972')
  const app = 'cli_aa626702b7b8dc0d'
  await mkdir(join(directory, 'events', app), { recursive: true })
  await writeFile(join(directory, 'config.json'), 'untouched credentials')
  const long = join(directory, 'events', app, 'bus.sock')
  assert.ok(Buffer.byteLength(long) > 104)
  const short = await feishuRuntimeDirectory(directory)
  t.after(async () => { await rm(dirname(short), { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  assert.equal(await feishuRuntimeDirectory(directory), short)
  assert.equal(await readFile(join(short, 'config.json'), 'utf8'), 'untouched credentials')
  const socket = join(short, 'events', app, 'bus.sock')
  assert.ok(Buffer.byteLength(socket) < 104)
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve) })
  await new Promise(resolve => server.close(resolve))
  assert.equal(await readFile(join(directory, 'config.json'), 'utf8'), 'untouched credentials')
})

test('a foreign file at the short configuration entry is preserved and rejected', async t => {
  const root = await mkdtemp('/private/tmp/dsh-lark-alias-')
  const path = await feishuRuntimeDirectory(root)
  t.after(async () => { await rm(dirname(path), { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  await rm(path)
  await writeFile(path, 'preserve')
  await assert.rejects(feishuRuntimeDirectory(root), /不安全/)
  assert.equal(await readFile(path, 'utf8'), 'preserve')
})
