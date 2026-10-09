import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, symlink, readFile, rm, writeFile, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareDesktopProfile } from './desktop-profile.mjs'

test('Desktop retains the user profile and loads one local board', async t => {
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
  const userPatch = [{ id: 'web-runtime', config: { openBrowser: false, printUrl: false } }]
  await writeFile(join(web, 'cordis.patch.yml'), JSON.stringify(userPatch))
  const args = { resourcesRoot, desktopRuntimeRoot, globalRoot, home }
  const first = await prepareDesktopProfile(args)
  const manifestBefore = await readFile(join(first.profile, 'package.json'), 'utf8')
  assert.ok(JSON.parse(manifestBefore).dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'))
  assert.equal(await readFile(join(first.profile, 'cordis.patch.yml'), 'utf8'), JSON.stringify(userPatch))
  const patches = JSON.parse(await readFile(join(first.bundle, 'cordis.patch.yml'), 'utf8'))
  const inserts = patches.flatMap(p => p.insert ?? [])
  assert.equal(inserts.filter(p => p.id === 'workflow-jev-center' && p.name === 'dsh-workflow/jev-center').length, 1)
  assert.equal(inserts.filter(p => p.id === 'workflow-agent-monitor' && p.name === 'dsh-workflow/agent-monitor').length, 1)
  assert.equal(inserts.filter(p => p.id === 'matt-skills-board').length, 1)
  assert.ok(inserts.find(p => p.id === 'matt-skills-board').name.includes('/matt-skills-panel-plugin/package/lib/index.js'))
  await prepareDesktopProfile(args)
  assert.equal(await readFile(join(first.profile, 'package.json'), 'utf8'), manifestBefore)
  const stampPath = join(first.bundle, 'integration.json')
  const oldIdentity = JSON.parse(await readFile(stampPath, 'utf8'))
  delete oldIdentity.hostInstance
  await writeFile(stampPath, JSON.stringify(oldIdentity))
  await writeFile(join(first.bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'workflow-desktop-health-instance', name: '/old-health-adapter.mjs' }] }]))
  await prepareDesktopProfile(args)
  const refreshed = JSON.parse(await readFile(join(first.bundle, 'cordis.patch.yml'), 'utf8'))
  assert.equal(refreshed.flatMap(p => p.insert ?? []).some(row => row.id === 'workflow-desktop-health-instance'), false)
  assert.equal(await readFile(join(first.profile, 'package.json'), 'utf8'), manifestBefore)
})

test('Desktop migrates a cached stage-one bundle-only profile without changing user dependencies, patches or metadata', async t => {
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const boot = createRequire(join(source, 'apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
  const root = await mkdtemp(join(tmpdir(), 'desktop-profile-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), home = join(root, 'home'), globalRoot = join(root, 'global')
  const desktopRuntimeRoot = join(root, 'runtime'), web = join(home, 'profiles/web')
  await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  await mkdir(resourcesRoot)
  await symlink(resolve('.'), join(resourcesRoot, 'workflow'))
  boot.initProfile(web, boot.PROFILE_TEMPLATES.web.bundles)
  const userManifest = JSON.parse(await readFile(join(web, 'package.json'), 'utf8'))
  userManifest.dependencies['user-kept-addon'] = 'file:/user/kept-addon'
  userManifest.userMetadata = { chosenWorkspace: 'keep-this' }
  await writeFile(join(web, 'package.json'), JSON.stringify(userManifest))
  const patch = '- id: user-kept-addon\n  disabled: true\n  name: user-kept-addon\n'
  await writeFile(join(web, 'cordis.patch.yml'), patch)
  const args = { resourcesRoot, desktopRuntimeRoot, globalRoot, home }
  const prepared = await prepareDesktopProfile(args)
  const packages = {
    'dsh-workflow': join(resourcesRoot, 'workflow'),
    'dsh-workflow-matt-panel': join(resourcesRoot, 'workflow/matt-skills-panel-plugin/package'),
  }
  const old = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  for (const name of Object.keys(packages)) {
    delete old.dependencies[name]
    await rm(join(prepared.profile, 'node_modules', name))
  }
  await writeFile(join(prepared.profile, 'package.json'), JSON.stringify(old))
  const stamp = JSON.parse(await readFile(join(prepared.bundle, 'integration.json'), 'utf8'))
  delete stamp.localPackages
  await writeFile(join(prepared.bundle, 'integration.json'), JSON.stringify(stamp))
  await prepareDesktopProfile(args)
  const migrated = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  for (const [name, target] of Object.entries(packages)) {
    assert.equal(migrated.dependencies[name], `file:${target}`)
    assert.equal(await readlink(join(prepared.profile, 'node_modules', name)), target)
  }
  assert.equal(migrated.dependencies['user-kept-addon'], 'file:/user/kept-addon')
  assert.deepEqual(migrated.userMetadata, { chosenWorkspace: 'keep-this' })
  assert.equal(await readFile(join(prepared.profile, 'cordis.patch.yml'), 'utf8'), patch)
  const stable = await readFile(join(prepared.profile, 'package.json'), 'utf8')
  await prepareDesktopProfile(args)
  assert.equal(await readFile(join(prepared.profile, 'package.json'), 'utf8'), stable)
})

for (const packageName of ['dsh-workflow', 'dsh-workflow-matt-panel']) test(`cached preparation refuses a foreign ${packageName} link and keeps its data`, async t => {
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const root = await mkdtemp(join(tmpdir(), 'desktop-foreign-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), desktopRuntimeRoot = join(root, 'runtime'), globalRoot = join(root, 'global'), home = join(root, 'home')
  await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  await mkdir(resourcesRoot); await symlink(resolve('.'), join(resourcesRoot, 'workflow'))
  const args = { resourcesRoot, desktopRuntimeRoot, globalRoot, home }
  const prepared = await prepareDesktopProfile(args)
  const foreign = join(root, 'foreign'); await mkdir(foreign)
  await writeFile(join(foreign, 'keep.txt'), 'foreign data')
  const link = join(prepared.profile, 'node_modules', packageName)
  await rm(link); await symlink(foreign, link)
  const before = await readFile(join(prepared.profile, 'package.json'), 'utf8')
  const stamp = await readFile(join(prepared.bundle, 'integration.json'), 'utf8')
  await assert.rejects(prepareDesktopProfile(args), /owned by another installation/)
  assert.equal(await readlink(link), foreign)
  assert.equal(await readFile(join(foreign, 'keep.txt'), 'utf8'), 'foreign data')
  assert.equal(await readFile(join(prepared.profile, 'package.json'), 'utf8'), before)
  assert.equal(await readFile(join(prepared.bundle, 'integration.json'), 'utf8'), stamp)
})

test('initial Desktop keeps copied Web links already pointing to the same owned packages', async t => {
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const boot = createRequire(join(source, 'apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
  const root = await mkdtemp(join(tmpdir(), 'desktop-copied-own-link-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), desktopRuntimeRoot = join(root, 'runtime'), globalRoot = join(root, 'global'), home = join(root, 'home')
  await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  await mkdir(resourcesRoot); await symlink(resolve('.'), join(resourcesRoot, 'workflow'))
  const web = join(home, 'profiles/web'); boot.initProfile(web, boot.PROFILE_TEMPLATES.web.bundles)
  const target = join(resourcesRoot, 'workflow')
  const manifest = JSON.parse(await readFile(join(web, 'package.json'), 'utf8'))
  manifest.dependencies['dsh-workflow'] = `file:${target}`
  await writeFile(join(web, 'package.json'), JSON.stringify(manifest))
  await mkdir(join(web, 'node_modules'), { recursive: true })
  await symlink(target, join(web, 'node_modules/dsh-workflow'))
  const prepared = await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  assert.equal(await readlink(join(prepared.profile, 'node_modules/dsh-workflow')), target)
  assert.equal(JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8')).dependencies['dsh-workflow'], `file:${target}`)
})
