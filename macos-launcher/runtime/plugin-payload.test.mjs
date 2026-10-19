import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readlink, rename, cp, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { createRequire } from 'node:module'
import { sealPluginPayload, verifyPluginPayload, deployPluginPayload } from './plugin-payload.mjs'
import { copyProjectIntegration } from '../project-resources.mjs'
import { prepareDesktopProfile } from './desktop-profile.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workflow-plugin-payload-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), profile = join(root, 'profile')
  const item = { package: 'workflow-owned-fixture', version: '1.2.3', source: 'git',
    repository: 'https://github.com/owned/fixture', commit: 'a'.repeat(40), startup: true }
  const config = { registry: 'https://registry.npmjs.org/', plugins: [item] }
  const workflow = join(resources, 'workflow'), target = join(resources, 'plugins/node_modules', item.package)
  await mkdir(workflow, { recursive: true }); await mkdir(target, { recursive: true }); await mkdir(profile)
  const bytes = JSON.stringify(config)
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.2.1-rc.2' }))
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, registry: config.registry,
    harnessVersion: '0.2.1-rc.2', manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    plugins: [{ package: item.package, version: item.version, commit: item.commit, metadata: { name: item.package, version: item.version } }] }))
  await writeFile(join(resources, 'project-layer.json'), '{}')
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: item.package, version: item.version,
    main: './host.mjs', exports: { '.': './host.mjs', './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } }))
  await writeFile(join(target, 'host.mjs'), 'export function apply() {}\n')
  await writeFile(join(target, 'client.js'), 'export function apply() {}\n')
  await writeFile(join(target, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'owned-fixture', name: item.package }] }]))
  const provenance = [{ ...item, archiveSha256: 'b'.repeat(64) }]
  return { root, resources, profile, target, item, provenance }
}

test('a manifest alone cannot pass the release payload gate; changed, missing and extra members fail', async t => {
  const f = await fixture(t)
  await assert.rejects(verifyPluginPayload(f.resources), /payload|交付/i)
  await sealPluginPayload(f.resources, f.provenance)
  await verifyPluginPayload(f.resources)
  await verifyPluginPayload(relative(process.cwd(), f.resources))
  const path = join(f.target, 'client.js'), before = await readFile(path)
  await writeFile(path, 'changed after packaging')
  await assert.rejects(verifyPluginPayload(f.resources), /content|内容/i)
  await writeFile(path, before); await rm(path)
  await assert.rejects(verifyPluginPayload(f.resources), /content|内容/i)
  await writeFile(path, before); await writeFile(join(f.target, 'unexpected.js'), 'extra')
  await assert.rejects(verifyPluginPayload(f.resources), /content|内容/i)
})

test('sealing refuses an omitted startup plugin, a wrong Git commit and missing client output', async t => {
  const f = await fixture(t)
  await assert.rejects(sealPluginPayload(f.resources, []), /plugin|插件/i)
  await assert.rejects(sealPluginPayload(f.resources, [{ ...f.provenance[0], commit: 'c'.repeat(40) }]), /source|来源/i)
  await rm(join(f.target, 'client.js'))
  await assert.rejects(sealPluginPayload(f.resources, f.provenance), /client|入口/i)
})

test('fresh and relocated installations use the sealed package without a registry or historical profile', async t => {
  const f = await fixture(t)
  await sealPluginPayload(f.resources, f.provenance)
  await writeFile(join(f.profile, 'package.json'), JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } }, custom: 'keep' }))
  await writeFile(join(f.profile, 'cordis.patch.yml'), '# user configuration\n[]\n')
  await deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile })
  const manifest = JSON.parse(await readFile(join(f.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies[f.item.package], `git+${f.item.repository}.git#${f.item.commit}`)
  assert.equal(manifest.custom, 'keep'); assert.deepEqual(manifest.dsh.profile.bundles, [], 'deployment must leave plugin mounting to the existing-entry-aware startup preparation')
  assert.equal(await readlink(join(f.profile, 'node_modules', f.item.package)), f.target)
  const moved = join(f.root, 'relocated resources'); await rename(f.resources, moved)
  await deployPluginPayload({ resourcesRoot: moved, profile: f.profile })
  assert.equal(await readlink(join(f.profile, 'node_modules', f.item.package)), join(moved, 'plugins/node_modules', f.item.package))
  const stable = await readFile(join(f.profile, 'package.json'), 'utf8')
  const repeated = await deployPluginPayload({ resourcesRoot: moved, profile: f.profile })
  assert.equal(repeated.changed, false); assert.equal(await readFile(join(f.profile, 'package.json'), 'utf8'), stable)
  assert.equal(await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8'), '# user configuration\n[]\n')
})

test('upgrades replace an old test link and preserve its target, unrelated packages and explicit user disable', async t => {
  const f = await fixture(t); await sealPluginPayload(f.resources, f.provenance)
  const old = join(f.root, 'old-test-package'); await mkdir(old)
  await writeFile(join(old, 'package.json'), JSON.stringify({ name: f.item.package, version: '0.0.1-dev.4' }))
  await mkdir(join(f.profile, 'node_modules')); await symlink(old, join(f.profile, 'node_modules', f.item.package))
  const before = { dependencies: { [f.item.package]: `link:${old}`, 'user-kept': 'file:/unchanged' },
    dsh: { profile: { bundles: ['user-kept', f.item.package] } } }
  await writeFile(join(f.profile, 'package.json'), JSON.stringify(before))
  const patch = '- id: owned-fixture\n  disabled: true\n  config: { saved: true }\n'
  await writeFile(join(f.profile, 'cordis.patch.yml'), patch)
  const result = await deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile })
  assert.equal(result.changed, true)
  assert.equal(await readlink(join(result.backup, 'node_modules', f.item.package)), old)
  assert.equal(JSON.parse(await readFile(join(old, 'package.json'))).version, '0.0.1-dev.4')
  assert.equal(await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8'), patch)
  assert.equal(JSON.parse(await readFile(join(f.profile, 'package.json'))).dependencies['user-kept'], 'file:/unchanged')
})

test('invalid delivery is rejected before changing the user profile', async t => {
  const f = await fixture(t); await sealPluginPayload(f.resources, f.provenance)
  const path = join(f.profile, 'package.json'), before = '{"custom":"preserve"}\n'
  await writeFile(path, before); await rm(join(f.target, 'host.mjs'))
  await assert.rejects(deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile }), /content|内容/i)
  assert.equal(await readFile(path, 'utf8'), before)
})

test('relative old package links remain readable in backup and retain their original text in the journal', async t => {
  const f = await fixture(t); await sealPluginPayload(f.resources, f.provenance)
  const old = join(f.root, 'old-package'), text = '../../old-package'
  await mkdir(old); await writeFile(join(old, 'kept.txt'), 'original data')
  await mkdir(join(f.profile, 'node_modules')); await symlink(text, join(f.profile, 'node_modules', f.item.package))
  await writeFile(join(f.profile, 'package.json'), '{"dependencies":{}}')
  const result = await deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile })
  assert.equal(await readFile(join(result.backup, 'node_modules', f.item.package, 'kept.txt'), 'utf8'), 'original data')
  const journal = JSON.parse(await readFile(join(result.backup, 'deployment.json'), 'utf8'))
  assert.equal(journal.changes[0].previousLink, text)
})

test('an installed directory is backed up intact with the original profile declaration', async t => {
  const f = await fixture(t); await sealPluginPayload(f.resources, f.provenance)
  const original = join(f.profile, 'node_modules', f.item.package)
  await mkdir(original, { recursive: true }); await writeFile(join(original, 'user-kept.txt'), 'keep old package data')
  const before = JSON.stringify({ dependencies: { [f.item.package]: '0.0.1' }, dsh: { profile: { bundles: [] } } })
  await writeFile(join(f.profile, 'package.json'), before)
  const result = await deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile })
  assert.equal(await readFile(join(result.backup, 'node_modules', f.item.package, 'user-kept.txt'), 'utf8'), 'keep old package data')
  assert.equal(await readFile(join(result.backup, 'package.json'), 'utf8'), before)
})

test('a failed profile manifest write rolls back replaced package links', async t => {
  const f = await fixture(t); await sealPluginPayload(f.resources, f.provenance)
  const original = join(f.profile, 'node_modules', f.item.package), old = join(f.root, 'old-directory')
  const previousLink = '../../old-directory'
  await mkdir(old); await mkdir(join(f.profile, 'node_modules')); await symlink(previousLink, original)
  await mkdir(join(f.profile, '.dsh-workflow/plugin-backups'), { recursive: true })
  const before = '{"dependencies":{},"dsh":{"profile":{"bundles":[]}}}'
  await writeFile(join(f.profile, 'package.json'), before)
  await chmod(f.profile, 0o555)
  try {
    await assert.rejects(deployPluginPayload({ resourcesRoot: f.resources, profile: f.profile }), { code: 'EACCES' })
    assert.equal(await readlink(original), previousLink)
    assert.equal(await readFile(join(f.profile, 'package.json'), 'utf8'), before)
  } finally { await chmod(f.profile, 0o755) }
})

test('the actual desktop preparation deploys fresh payloads and removes stale automatic disables', async t => {
  const f = await fixture(t), inputs = join(f.root, 'delivery-inputs')
  await rename(join(f.resources, 'workflow'), inputs)
  await copyProjectIntegration(resolve('.'), join(f.resources, 'workflow'))
  for (const name of ['project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) {
    await cp(join(inputs, name), join(f.resources, 'workflow', name))
  }
  await writeFile(join(f.resources, 'workflow/project-mcp.json'), '[]\n')
  await sealPluginPayload(f.resources, f.provenance)
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const runtime = join(f.root, 'runtime'), globalRoot = join(f.root, 'global'), home = join(f.root, 'home')
  await mkdir(join(runtime, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(join(source, 'apps/cli'), join(runtime, 'node_modules/@deepseek-ai/dsh'))
  const args = { resourcesRoot: f.resources, desktopRuntimeRoot: runtime, globalRoot, home }
  const prepared = await prepareDesktopProfile(args)
  const boot = createRequire(join(source, 'apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
  const entries = () => {
    const profile = boot.loadProfileDirectory('dsh', prepared.profile, join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'))
    return boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
  }
  assert.equal(entries().find(row => row.id === 'owned-fixture').disabled, undefined)
  const path = join(prepared.bundle, 'cordis.patch.yml')
  const patches = JSON.parse(await readFile(path, 'utf8'))
  patches.push({ id: 'owned-fixture', disabled: true })
  await writeFile(path, JSON.stringify(patches))
  const stampPath = join(prepared.bundle, 'integration.json')
  const stamp = JSON.parse(await readFile(stampPath, 'utf8')); stamp.startupPlugins = 'old-rejected-test-package'
  await writeFile(stampPath, JSON.stringify(stamp))
  await prepareDesktopProfile(args)
  assert.equal(entries().find(row => row.id === 'owned-fixture').disabled, undefined)
  const userPatch = '- id: owned-fixture\n  disabled: true\n  config: { saved: true }\n'
  await writeFile(join(prepared.profile, 'cordis.patch.yml'), userPatch)
  await prepareDesktopProfile(args)
  assert.equal(entries().find(row => row.id === 'owned-fixture').disabled, true)
  assert.equal(await readFile(join(prepared.profile, 'cordis.patch.yml'), 'utf8'), userPatch)
  for (const id of ['custom-delivery-entry', 'owned-fixture']) {
    for (const disabled of [false, true]) {
      const custom = { id, name: f.item.package, disabled, config: { userChoice: 'keep' } }
      const patch = JSON.stringify([{ insert: [custom] }])
      await writeFile(join(prepared.profile, 'cordis.patch.yml'), patch)
      await prepareDesktopProfile(args)
      assert.deepEqual(entries().filter(row => row.name === f.item.package), [custom], 'manual mounts must remain unique and retain their enabled/disabled state')
      assert.equal(await readFile(join(prepared.profile, 'cordis.patch.yml'), 'utf8'), patch)
    }
  }
})
