import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sourceIdentity } from './harness-runtime.mjs'

const exec = promisify(execFile)

test('GitHub build inputs must match the pinned package, clean checkout and lockfile', async t => {
  const root = await mkdtemp(join(tmpdir(), 'harness-source-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) => exec('git', ['-C', root, ...args])
  const packageName = '@deepseek-ai/dsh', version = '0.2.2-rc.3'
  const lock = 'fixture-lock\n'
  await mkdir(join(root, 'apps/cli'), { recursive: true })
  await writeFile(join(root, 'apps/cli/package.json'), JSON.stringify({ name: packageName, version }))
  await writeFile(join(root, 'pnpm-lock.yaml'), lock)
  await git('init', '-q')
  await git('add', '.')
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture source')

  const commit = (await git('rev-parse', 'HEAD')).stdout.trim()
  const expected = { source: 'github', package: packageName, version, commit }
  const identity = await sourceIdentity(root, expected)
  assert.equal(identity.commit, commit)
  assert.equal(identity.version, version)
  assert.equal(identity.lockSha256, createHash('sha256').update(lock).digest('hex'))
  await assert.rejects(sourceIdentity(root, { ...expected, commit: 'a'.repeat(40) }), /Unsupported Harness/)

  await writeFile(join(root, 'pnpm-lock.yaml'), 'changed lock\n')
  await assert.rejects(sourceIdentity(root, expected), /tracked changes/)
})
