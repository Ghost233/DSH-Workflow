import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLoginShellEnvironment } from './login-shell.mjs'

test('login shell adds user tools without replacing Station-owned environment', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'station-login-shell-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const shell = join(dir, 'shell')
  await writeFile(shell, '#!/bin/sh\nprintf "startup output\\n"\nexport PATH="/fixture/bin:$PATH" STATION_FIXTURE=found DSH_HOME=/incorrect\nexec /bin/sh -c "$2"\n')
  await chmod(shell, 0o700)
  const result = await readLoginShellEnvironment({ HOME: dir, PATH: '/usr/bin:/bin', DSH_HOME: '/protected' }, { shells: [shell] })
  assert.equal(result.environment.STATION_FIXTURE, 'found')
  assert.match(result.environment.PATH, /^\/fixture\/bin:/)
  assert.equal(result.environment.DSH_HOME, '/protected')
  assert.deepEqual(result.failures, [])
})

test('a stalled login shell is stopped and the inherited environment survives', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'station-login-timeout-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const shell = join(dir, 'shell')
  await writeFile(shell, '#!/bin/sh\nexec /bin/sleep 30\n'); await chmod(shell, 0o700)
  const result = await readLoginShellEnvironment({ HOME: dir, PATH: '/usr/bin:/bin' }, { shells: [shell], timeoutMs: 200 })
  assert.equal(result.environment.PATH, '/usr/bin:/bin')
  assert.equal(result.failures[0].reason, 'timeout')
})
