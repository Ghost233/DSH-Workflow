import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createInOriginalLayout } from '../src/tracker/rooms/markdown/create-layout.js'

for (const kind of ['map-ticket', 'issue']) test(`Markdown ${kind} preserves an existing macOS map directory containing a backslash`, async t => {
  const root = await fs.mkdtemp('/private/tmp/matt-create-layout-')
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const effort = 'Foo\\Bar'
  for (const name of [effort, 'Other']) {
    await fs.mkdir(path.join(root, '.scratch', name), { recursive: true })
    await fs.writeFile(path.join(root, '.scratch', name, 'map.md'), '## Destination\n\nA map.\n')
  }
  const ctx = { cwd: root, fs, platform: { os: 'darwin', path: path.posix, fs } }
  const result = await createInOriginalLayout(ctx, {}, { title: 'Example', parentKey: '00' }, kind, '')
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.effortId, effort)
  assert.equal(path.dirname(result.path), path.join(root, '.scratch', effort, 'issues'))
  assert.match(await fs.readFile(result.path, 'utf8'), /Example/)
})
