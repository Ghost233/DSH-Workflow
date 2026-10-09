import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

// Command-seam fixture: preserve the shell source, replacing only its absolute
// open executable with a private recorder. This does not execute an App or SDK.
async function shellFixture(t, platform = 'Darwin', arch = 'arm64') {
  const root = await mkdtemp(join(tmpdir(), 'daily-workflow-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const distribution = join(root, 'distribution'), caller = join(root, 'caller'), bin = join(root, 'bin')
  const launcher = join(distribution, '.build/Owned Fixture.app'), receipt = join(root, 'receipt.json')
  await Promise.all([mkdir(caller), mkdir(bin), mkdir(join(launcher, 'Contents/Resources/workflow/macos-launcher/runtime'), { recursive: true }),
    mkdir(join(launcher, 'Contents/Resources/desktop/DeepSeek Harness.app'), { recursive: true })])
  for (const name of ['global-supervisor.mjs', 'prepare-desktop.mjs']) await writeFile(join(launcher, 'Contents/Resources/workflow/macos-launcher/runtime', name), '')
  await writeFile(join(bin, 'uname'), `#!/bin/sh\ncase "$1" in -s) printf '%s\\n' '${platform}' ;; -m) printf '%s\\n' '${arch}' ;; *) exit 2 ;; esac\n`, { mode: 0o755 })
  const recorder = join(bin, 'record-open')
  const record = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),home:process.env.HOME,dshHome:process.env.DSH_HOME}));\n`
  await writeFile(recorder, record, { mode: 0o755 })
  await writeFile(join(bin, 'node'), record, { mode: 0o755 })
  const source = await readFile(resolve('start-dsh-workflow.sh'), 'utf8')
  assert.equal(source.split('/usr/bin/open').length, 2)
  await writeFile(join(distribution, 'start-dsh-workflow.sh'), source.replace('/usr/bin/open', JSON.stringify(recorder)))
  const run = (args = []) => spawnSync('/bin/bash', [join(distribution, 'start-dsh-workflow.sh'), ...args], {
    cwd: caller, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 5000,
  })
  return { run, receipt, launcher, caller }
}

test('daily shell rejects unsupported platforms before any launch command', async t => {
  for (const [platform, arch] of [['Linux', 'aarch64'], ['MINGW64_NT', 'x86_64'], ['Darwin', 'x86_64']]) {
    const f = await shellFixture(t, platform, arch), result = f.run()
    assert.equal(result.status, 1, `${platform}/${arch}: ${result.stderr}`)
    assert.match(result.stderr, /macOS ARM64/)
    await assert.rejects(readFile(f.receipt), { code: 'ENOENT' })
  }
})


test('macOS ARM64 daily shell delegates once with no arguments and preserves caller settings', async t => {
  const f = await shellFixture(t), result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(f.receipt, 'utf8')), {
    args: ['-a', f.launcher, 'dsh-workflow://open-global'], cwd: await realpath(f.caller),
    home: process.env.HOME, ...(process.env.DSH_HOME === undefined ? {} : { dshHome: process.env.DSH_HOME }),
  })
})


test('daily shell rejects arguments before launching a host', () => {
  const result = spawnSync('/bin/bash', [resolve('start-dsh-workflow.sh'), '--help'], {
    encoding: 'utf8', timeout: 5000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /无需参数/)
})


test('supervised Web readiness publishes its official URL without changing saved profile settings', () => {
  const entries = [{ id: 'web-runtime', name: '@deepseek-ai/dsh-web-app', config: { printUrl: false, openBrowser: false } }]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot: resolve('.'), catalogRoot: '/global' })
  assert.deepEqual(entries, before)
  const { composeEntries } = createRequire(resolve('deepseek-harness/apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
  const actual = composeEntries([[{ insert: entries }], patches]).find(row => row.id === 'web-runtime')
  assert.deepEqual(actual.config, { printUrl: true, openBrowser: false })
})
