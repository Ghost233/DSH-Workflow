import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, symlink, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareDesktopProfile } from './desktop-profile.mjs'

test('Desktop retains the user profile and loads one local board and the editable SoL entry', async t => {
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const boot = createRequire(join(source, 'apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
  const root = await mkdtemp(join(tmpdir(), 'desktop-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), home = join(root, 'home'), globalRoot = join(root, 'global')
  const desktopRuntimeRoot = join(root, 'runtime')
  await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  await mkdir(resourcesRoot)
  await symlink(resolve('.'), join(resourcesRoot, 'workflow'))
  const web = join(home, 'profiles/web')
  boot.initProfile(web, boot.PROFILE_TEMPLATES.web.bundles)
  const userPatch = [{ insert: [{ id: 'sol-efficiency', name: 'dsh-sol-efficiency', config: {
    actionFusion: { enabled: true }, evidenceReducer: { enabled: false },
  } }] }]
  await writeFile(join(web, 'cordis.patch.yml'), JSON.stringify(userPatch))
  const args = { resourcesRoot, desktopRuntimeRoot, globalRoot, home }
  const first = await prepareDesktopProfile(args)
  const manifestBefore = await readFile(join(first.profile, 'package.json'), 'utf8')
  assert.ok(JSON.parse(manifestBefore).dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'))
  assert.equal(await readFile(join(first.profile, 'cordis.patch.yml'), 'utf8'), JSON.stringify(userPatch))
  const patches = JSON.parse(await readFile(join(first.bundle, 'cordis.patch.yml'), 'utf8'))
  assert.ok(patches.some(p => p.id === 'sol-efficiency' && p.name.endsWith('/sol-efficiency-plugin/index.js')))
  const inserts = patches.flatMap(p => p.insert ?? [])
  assert.equal(inserts.filter(p => p.id === 'matt-skills-board').length, 1)
  assert.ok(inserts.find(p => p.id === 'matt-skills-board').name.includes('/vendor/dsh-mattpocock-skills-deck/package/lib/index.js'))
  assert.equal(inserts.filter(p => p.id === 'kernel-sol').length, 0)
  await prepareDesktopProfile(args)
  assert.equal(await readFile(join(first.profile, 'package.json'), 'utf8'), manifestBefore)
})
