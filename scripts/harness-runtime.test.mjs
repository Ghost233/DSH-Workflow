import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureBuild, checkBuild } from './harness-runtime.mjs'

const exec = promisify(execFile)
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness-build-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) => exec('git', ['-C', root, ...args])
  await mkdir(join(root, 'apps/cli'), { recursive: true })
  await writeFile(join(root, '.gitignore'), '**/lib/\n**/dist/\n.dsh-build/\n')
  await writeFile(join(root, 'pnpm-lock.yaml'), 'fixture-lock\n')
  await writeFile(join(root, 'apps/cli/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.5-rc.2' }))
  await git('init', '-q')
  await git('add', '.')
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture source')
  const expected = { package: '@deepseek-ai/dsh', version: '0.1.5-rc.2', commit: (await git('rev-parse', 'HEAD')).stdout.trim() }
  const calls = []
  const run = async (_root, args) => {
    calls.push(args)
    if (args[1] !== 'build') return
    for (const file of ['apps/cli/lib/bin.js','apps/web/dist/index.html','packages/client/ui-test/lib/client/index.js',
      'native/system/packages/system-darwin-arm64/bin/system.node']) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), 'built fixture\n')
    }
  }
  return { root, expected, run, calls, git }
}

test('verified build is reused; changed client artifacts and stale extra libraries force a clean rebuild', async t => {
  const f = await fixture(t)
  assert.equal((await ensureBuild(f.root, f)).rebuilt, true)
  assert.deepEqual(f.calls, [['install','--frozen-lockfile'],['run','clean'],['run','build']])
  assert.equal(await checkBuild(f.root, f.expected), true)
  assert.equal((await ensureBuild(f.root, f)).rebuilt, false)
  assert.equal(f.calls.length, 3)
  await writeFile(join(f.root, 'packages/client/ui-test/lib/client/index.js'), 'stale client')
  assert.equal(await checkBuild(f.root, f.expected), false)
  await ensureBuild(f.root, f)
  assert.equal(f.calls.length, 6)
  await writeFile(join(f.root, 'native/system/packages/system-darwin-arm64/bin/system.node'), 'stale native binary')
  assert.equal(await checkBuild(f.root, f.expected), false)
  await ensureBuild(f.root, f)
  assert.equal(f.calls.length, 9)
  await mkdir(join(f.root, 'packages/deleted/old/lib'), { recursive: true })
  await writeFile(join(f.root, 'packages/deleted/old/lib/index.js'), 'obsolete package')
  assert.equal(await checkBuild(f.root, f.expected), false)
})

test('dirty source and unsupported revision fail before installation or cleanup', async t => {
  const f = await fixture(t)
  await assert.rejects(ensureBuild(f.root, { ...f, expected: { ...f.expected, commit: 'a'.repeat(40) } }), /Unsupported Harness/)
  await writeFile(join(f.root, 'pnpm-lock.yaml'), 'user modification')
  await assert.rejects(ensureBuild(f.root, f), /tracked changes/)
  assert.equal(f.calls.length, 0)
  assert.equal(await readFile(join(f.root, 'pnpm-lock.yaml'), 'utf8'), 'user modification')
})

test('failed build and concurrent source modification cannot publish a successful build stamp', async t => {
  const f = await fixture(t)
  await assert.rejects(ensureBuild(f.root, { ...f, run: async (_root, args) => {
    if (args[1] === 'clean') throw new Error('fixture build failed')
  } }), /fixture build failed/)
  assert.equal(await checkBuild(f.root, f.expected), false)
  await assert.rejects(ensureBuild(f.root, { ...f, run: async (...args) => {
    await f.run(...args)
    if (args[1][1] === 'build') await writeFile(join(f.root, 'pnpm-lock.yaml'), 'concurrent source change')
  } }), /tracked changes/)
  await assert.rejects(readFile(join(f.root, '.dsh-build/owner-workflow-runtime.json')), /ENOENT/)
})

test('concurrent launchers cannot clean or build the same Harness at the same time', async t => {
  const f = await fixture(t)
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const first = ensureBuild(f.root, { ...f, run: async (...args) => {
    if (args[1][0] === 'install') { started.resolve(); await finish.promise }
    await f.run(...args)
  } })
  await started.promise
  try { await assert.rejects(ensureBuild(f.root, f), /being built/) }
  finally { finish.resolve() }
  await first
  assert.equal(f.calls.length, 3)
  assert.equal(await checkBuild(f.root, f.expected), true)
})
