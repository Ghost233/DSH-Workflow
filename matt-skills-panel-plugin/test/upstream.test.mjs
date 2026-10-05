import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { compareUpstream, prepareUpgrade } from '../scripts/compare-upstream.mjs'

const exec = promisify(execFile)

test('upgrade proposals retain local changes, report conflicts and never apply or advance the baseline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'matt-upgrade-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const upstream = join(root, 'upstream'), fork = join(root, 'fork')
  await Promise.all([mkdir(join(upstream, 'src'), { recursive: true }), mkdir(join(upstream, 'package'), { recursive: true }), mkdir(join(fork, 'src'), { recursive: true })])
  const git = async (...args) => (await exec('git', ['-C', upstream, ...args])).stdout.trim()
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'Upgrade Fixture')
  await git('config', 'user.email', 'upgrade@invalid')
  const baseText = 'left\none\ntwo\nthree\nfour\nright\n'
  await Promise.all([
    writeFile(join(upstream, 'src/clean.js'), baseText), writeFile(join(upstream, 'src/conflict.js'), 'base\n'),
    writeFile(join(upstream, 'src/removed.js'), 'retained\n'), writeFile(join(upstream, 'src/local-removed.js'), 'base\n'),
    writeFile(join(upstream, 'package/package.json'), JSON.stringify({ version: '1.0.0' })),
  ])
  await git('add', '.'); await git('commit', '-m', 'base')
  const baseline = JSON.stringify({ repository: 'fixture', commit: await git('rev-parse', 'HEAD'), version: '1.0.0', sourcePaths: ['src'] })
  await writeFile(join(fork, 'upstream.json'), baseline)
  const ours = baseText.replace('left', 'local-left')
  await Promise.all([writeFile(join(fork, 'src/clean.js'), ours), writeFile(join(fork, 'src/conflict.js'), 'local\n'), writeFile(join(fork, 'src/removed.js'), 'retained\n')])
  await Promise.all([
    writeFile(join(upstream, 'src/clean.js'), baseText.replace('right', 'new-right')), writeFile(join(upstream, 'src/conflict.js'), 'new\n'),
    rm(join(upstream, 'src/removed.js')), writeFile(join(upstream, 'src/local-removed.js'), 'changed\n'),
    writeFile(join(upstream, 'src/added.js'), 'added\n'), writeFile(join(upstream, 'package/package.json'), JSON.stringify({ version: '1.0.1' })),
  ])
  await git('add', '.'); await git('commit', '-m', 'next')
  const args = { forkRoot: fork, upstreamRoot: upstream, target: 'HEAD' }
  const compared = await compareUpstream(args)
  assert.equal(compared.changes.length, 5)
  assert.equal(compared.targetVersion, '1.0.1')
  const review = await prepareUpgrade(args)
  const byPath = Object.fromEntries(review.proposals.map(item => [item.path, item.resolution]))
  assert.equal(byPath['src/clean.js'], 'clean-merge')
  assert.equal(byPath['src/conflict.js'], 'conflict')
  assert.equal(byPath['src/removed.js'], 'review-deletion')
  assert.equal(byPath['src/local-removed.js'], 'local-removal')
  assert.equal(byPath['src/added.js'], 'new-file')
  assert.match(await readFile(join(review.reviewRoot, 'proposed/src/clean.js'), 'utf8'), /local-left[\s\S]*new-right/)
  assert.match(await readFile(join(review.reviewRoot, 'proposed/src/conflict.js'), 'utf8'), /<<<<<<< local/)
  assert.equal(await readFile(join(fork, 'src/clean.js'), 'utf8'), ours)
  assert.equal(await readFile(join(fork, 'src/conflict.js'), 'utf8'), 'local\n')
  assert.equal(await readFile(join(fork, 'src/removed.js'), 'utf8'), 'retained\n')
  await assert.rejects(readFile(join(fork, 'src/local-removed.js')), { code: 'ENOENT' })
  assert.equal(await readFile(join(fork, 'upstream.json'), 'utf8'), baseline)
})
