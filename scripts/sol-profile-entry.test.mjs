import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ensureSolProfileEntry } from './sol-profile-entry.mjs'
import { composeKernelLaunch } from './kernel-launch-composition.mjs'

test('SoL becomes one persistent editable Web profile entry without rewriting it again', async t => {
  const home = await mkdtemp(join(tmpdir(), 'sol-profile-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const anchor = new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url).pathname
  const boot = createRequire(anchor)('@deepseek-ai/dsh-app-boot')
  await ensureSolProfileEntry({ anchor, home })
  const profile = boot.loadProfile('dsh', 'web', anchor, home)
  assert.ok(boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
    .some(row => row.id === 'sol-efficiency' && row.name === 'dsh-sol-efficiency'))
  const before = await readFile(profile.patchPath, 'utf8')
  await ensureSolProfileEntry({ anchor, home })
  assert.equal(await readFile(profile.patchPath, 'utf8'), before)

  const entries = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
  const overlay = composeKernelLaunch(entries, { projectRoot: '/project', catalogRoot: '/catalog',
    presetPlugins: [{ id: 'owner-workflow', name: './plugin.mjs' }] })
  assert.equal(overlay.some(row => row.id === 'sol-efficiency' || row.id === 'kernel-sol'), false)
  await writeFile(profile.patchPath, `${before}- id: sol-efficiency\n  config:\n    actionFusion:\n      enabled: true\n`)
  const edited = boot.loadProfile('dsh', 'web', anchor, home)
  const active = boot.composeEntries([...edited.layers.map(layer => layer.patches), edited.patches, overlay])
    .find(row => row.id === 'sol-efficiency')
  assert.equal(active.config.actionFusion.enabled, true)
})
