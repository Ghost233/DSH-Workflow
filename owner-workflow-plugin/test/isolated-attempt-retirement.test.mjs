import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertRetainedPathAvailable } from '../src/isolated-attempt-retirement.mjs'

test('historical retired command paths remain reserved', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-retained-path-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const retained = join(root, 'retained')
  await mkdir(retained)
  const state = { workflows: { wf: { attempts: { old: { quarantined: true, sourceAuthorityRetirement: {
    commands: [{ commandId: 'old-command', cwd: await realpath(retained) }],
  } } } } } }

  await assert.rejects(() => assertRetainedPathAvailable(state, retained), { code: 'EXECUTION_UNCONFIRMED' })
  await assert.rejects(() => assertRetainedPathAvailable(state, join(retained, 'child')), { code: 'EXECUTION_UNCONFIRMED' })
  await assertRetainedPathAvailable(state, join(root, 'unrelated'))
})

test('non-quarantined historical records do not reserve paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-retained-path-open-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const retained = join(root, 'retained')
  await mkdir(retained)
  const state = { workflows: { wf: { attempts: { old: { quarantined: false, sourceAuthorityRetirement: {
    commands: [{ commandId: 'settled-command', cwd: await realpath(retained) }],
  } } } } } }
  await assertRetainedPathAvailable(state, retained)
})
