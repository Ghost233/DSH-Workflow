import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

test('test selection fails before any test runs when a file is absent, duplicated or a directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-test-entry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const marker = join(root, 'executed'), selected = join(root, 'selected.test.mjs')
  await writeFile(selected, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'ran')`)
  for (const second of [join(root, 'missing.test.mjs'), selected, root]) {
    const result = spawnSync(process.execPath, [new URL('./run-workflow-tests.mjs', import.meta.url).pathname, selected, second], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.error, undefined)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /ENOENT|Duplicate test files|not a regular file/)
    await assert.rejects(access(marker), { code: 'ENOENT' })
  }
})
