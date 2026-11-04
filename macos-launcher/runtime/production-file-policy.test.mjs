import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneKnownDevelopmentFiles } from '../production-file-policy.mjs'

test('only audited test and benchmark trees are removed from staged production packages', async t => {
  const root = await mkdtemp(join(tmpdir(), 'production-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const modules = join(root, 'node_modules'), outside = join(root, 'outside')
  const put = async (path, text = 'keep') => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, text) }
  await put(join(modules, 'zod/package.json'), JSON.stringify({ name: 'zod', version: '4.4.3' }))
  await put(join(modules, 'zod/src/v3/tests/fixture.ts'))
  await put(join(modules, 'zod/src/v3/benchmarks/fixture.ts'))
  await put(join(modules, 'zod/src/v3/index.ts'))
  await put(join(modules, '@mixmark-io/domino/package.json'), JSON.stringify({ name: '@mixmark-io/domino', version: '2.2.0' }))
  await put(join(modules, '@mixmark-io/domino/test/fixture.html'))
  await put(join(modules, '@mixmark-io/domino/lib/index.js'))
  await put(join(modules, '@lezer/rust/package.json'), JSON.stringify({ name: '@lezer/rust', version: '1.0.3' }))
  await put(join(modules, '@lezer/rust/test/fixture.txt'))
  await put(join(modules, '@lezer/rust/dist/index.js'))
  await put(join(modules, 'node-pty/package.json'), JSON.stringify({ name: 'node-pty', version: '1.2.0-beta.15' }))
  await put(join(modules, 'node-pty/third_party/conpty/windows.cc'))
  await put(join(modules, 'node-pty/lib/index.js'))
  await put(join(modules, 'other/test/fixture.js'))
  await put(join(modules, 'other/node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: '9.0.0' }))
  await put(join(modules, 'other/node_modules/zod/src/tests/unknown.ts'))
  await put(join(modules, 'other/node_modules/node-pty/package.json'), JSON.stringify({ name: 'node-pty', version: '9.0.0' }))
  await put(join(modules, 'other/node_modules/node-pty/third_party/conpty/unknown.cc'))
  await put(join(outside, 'src/tests/user.ts'))
  await symlink(outside, join(modules, 'external'))
  assert.equal(await pruneKnownDevelopmentFiles(modules, { platform: 'darwin', arch: 'arm64' }), 5)
  for (const path of ['zod/src/v3/tests', 'zod/src/v3/benchmarks', '@mixmark-io/domino/test', '@lezer/rust/test', 'node-pty/third_party/conpty']) {
    await assert.rejects(access(join(modules, path)), { code: 'ENOENT' })
  }
  for (const path of ['zod/src/v3/index.ts', '@mixmark-io/domino/lib/index.js', '@lezer/rust/dist/index.js', 'node-pty/lib/index.js', 'other/test/fixture.js', 'other/node_modules/zod/src/tests/unknown.ts', 'other/node_modules/node-pty/third_party/conpty/unknown.cc']) {
    assert.equal(await readFile(join(modules, path), 'utf8'), 'keep')
  }
  assert.equal(await readFile(join(outside, 'src/tests/user.ts'), 'utf8'), 'keep')
})

test('the Windows terminal build inputs remain intact on non-macOS targets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'production-files-windows-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const modules = join(root, 'node_modules'), pkg = join(modules, 'node-pty')
  await mkdir(join(pkg, 'third_party/conpty'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'node-pty', version: '1.2.0-beta.15' }))
  await writeFile(join(pkg, 'third_party/conpty/windows.cc'), 'keep')
  assert.equal(await pruneKnownDevelopmentFiles(modules, { platform: 'win32', arch: 'x64' }), 0)
  assert.equal(await readFile(join(pkg, 'third_party/conpty/windows.cc'), 'utf8'), 'keep')
})
