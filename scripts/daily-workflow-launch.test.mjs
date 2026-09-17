import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

test('daily shell delegates once to the unified host, preserving caller cwd and settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'daily-workflow-'))
  try {
    const distribution = join(root, 'distribution'), caller = join(root, 'caller'), bin = join(root, 'bin')
    await Promise.all([mkdir(distribution), mkdir(caller), mkdir(bin)])
    await copyFile(resolve('start-owner-workflow.sh'), join(distribution, 'start-owner-workflow.sh'))
    const receipt = join(root, 'receipt.json')
    await writeFile(join(bin, 'node'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),home:process.env.HOME,dshHome:process.env.DSH_HOME}));\n`, { mode: 0o755 })
    const result = spawnSync('/bin/bash', [join(distribution, 'start-owner-workflow.sh')], {
      cwd: caller, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 5000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), {
      args: [join(distribution, 'scripts/kernel-web-launch.mjs')], cwd: await realpath(caller),
      home: process.env.HOME, ...(process.env.DSH_HOME === undefined ? {} : { dshHome: process.env.DSH_HOME }),
    })
  } finally { await rm(root, { recursive: true, force: true }) }
})


test('daily shell rejects arguments before launching a host', () => {
  const result = spawnSync('/bin/bash', [resolve('start-owner-workflow.sh'), '--help'], {
    encoding: 'utf8', timeout: 5000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /无需参数/)
})
