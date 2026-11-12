import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readdir, symlink, readFile, rm, writeFile, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareDesktopProfile } from './desktop-profile.mjs'
import { webProfileBundles } from './profile-templates.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'station-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), home = join(root, 'home'), globalRoot = join(root, 'global')
  const desktopRuntimeRoot = join(root, 'runtime'), workflow = join(resourcesRoot, 'workflow')
  const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
  const artifact = process.env.DSH_SERVICE_TEST_RESOURCES
  if (artifact) {
    await mkdir(desktopRuntimeRoot)
    await symlink(join(artifact, 'node_modules'), join(desktopRuntimeRoot, 'node_modules'))
  } else {
    await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
    await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  }
  await mkdir(workflow, { recursive: true })
  await symlink(resolve('project-mcp.json'), join(workflow, 'project-mcp.json'))
  const anchor = join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), boot = require('@deepseek-ai/dsh-app-boot')
  const profile = join(home, 'profiles/desktop'), web = join(home, 'profiles/web')
  const args = { resourcesRoot, desktopRuntimeRoot, globalRoot, home }
  const prepare = () => prepareDesktopProfile(args)
  const init = (directory = profile) => boot.initProfile(directory, webProfileBundles(require, boot))
  const entries = ({ overlay }) => {
    const loaded = boot.loadProfileDirectory('dsh', profile, anchor)
    return boot.composeEntries([...loaded.layers.map(layer => layer.patches), loaded.patches, boot.loadOverlayPatches('dsh', overlay)])
  }
  return { root, workflow, profile, web, prepare, init, entries }
}

test('Station keeps the copied Web profile and rebuilds its own overlay without registering a local bundle', async t => {
  const f = await fixture(t)
  f.init(f.web)
  const userPatch = JSON.stringify([
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { insert: [{ id: 'bili-native', name: 'billion-context', config: { keep: true } }] },
  ])
  await writeFile(join(f.web, 'cordis.patch.yml'), userPatch)
  const prepared = await f.prepare()
  const manifestPath = join(f.profile, 'package.json'), patchPath = join(f.profile, 'cordis.patch.yml')
  const before = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(before)
  for (const name of ['dsh-workflow', 'dsh-workflow-matt-panel', 'dsh-workflow-desktop']) {
    assert.equal(manifest.dependencies[name], undefined)
    assert.ok(!manifest.dsh.profile.bundles.includes(name))
  }
  const check = () => {
    const rows = f.entries(prepared)
    assert.deepEqual(rows.find(row => row.id === 'bili-native'),
      { id: 'bili-native', name: 'billion-context', disabled: true, config: { keep: true } })
    assert.ok(!rows.some(row => ['workflow-jev-center', 'workflow-agent-monitor', 'workflow-project-coordination'].includes(row.id)))
    const boards = rows.filter(row => row.id === 'matt-skills-board')
    assert.equal(boards.length, 1)
    assert.equal(boards[0].name, pathToFileURL(join(f.workflow, 'matt-skills-panel-plugin/package/lib/index.js')).href)
    assert.equal(rows.find(row => row.id === 'workflow-mcp-codegraph').config.command, 'codegraph')
  }
  check()
  await writeFile(prepared.overlay, JSON.stringify([{ insert: [{ id: 'old-station-entry', name: 'old-station' }] }]))
  await writeFile(join(prepared.bundle, 'integration.json'), '{}')
  await f.prepare()
  check()
  assert.ok(!f.entries(prepared).some(row => row.id === 'old-station-entry'))
  assert.equal(await readFile(manifestPath, 'utf8'), before)
  assert.equal(await readFile(patchPath, 'utf8'), userPatch)
})

test('Station retires the old local bundle and links with a backup, preserving unrelated profile data', async t => {
  const f = await fixture(t)
  f.init(f.profile)
  const path = join(f.profile, 'package.json'), patchPath = join(f.profile, 'cordis.patch.yml')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  const target = join(f.root, 'previous-installation')
  const retired = ['dsh-workflow', 'dsh-workflow-matt-panel', 'dsh-workflow-desktop', 'ghost-agent-sentinel']
  await mkdir(target)
  await mkdir(join(f.profile, 'node_modules'))
  await writeFile(join(target, 'keep.txt'), 'original files')
  for (const name of retired) {
    manifest.dependencies[name] = `file:${target}`
    await symlink(target, join(f.profile, 'node_modules', name))
  }
  manifest.dependencies['user-kept-addon'] = 'file:/user/kept-addon'
  manifest.dsh.profile.bundles.push('dsh-workflow-desktop')
  manifest.userMetadata = { chosenWorkspace: 'keep-this' }
  const text = JSON.stringify(manifest), patch = '# saved user configuration\n[]\n'
  await writeFile(path, text)
  await writeFile(patchPath, patch)
  await f.prepare()
  const after = await readFile(path, 'utf8'), updated = JSON.parse(after)
  assert.equal(updated.dependencies['user-kept-addon'], 'file:/user/kept-addon')
  assert.deepEqual(updated.userMetadata, manifest.userMetadata)
  const backups = join(f.profile, '.dsh-workflow/plugin-backups')
  const [backup] = await readdir(backups)
  assert.equal(await readFile(join(backups, backup, 'package.json'), 'utf8'), text)
  for (const name of retired) {
    assert.equal(updated.dependencies[name], undefined)
    assert.ok(!updated.dsh.profile.bundles.includes(name))
    assert.equal(await readlink(join(backups, backup, 'node_modules', name)), target)
    await assert.rejects(readlink(join(f.profile, 'node_modules', name)), { code: 'ENOENT' })
  }
  assert.equal(await readFile(join(target, 'keep.txt'), 'utf8'), 'original files')
  await f.prepare()
  assert.equal(await readFile(path, 'utf8'), after)
  assert.equal(await readFile(patchPath, 'utf8'), patch)
  assert.deepEqual(await readdir(backups), [backup])
})

test('Station preserves a real directory when a legacy dependency is not a symlink', async t => {
  const f = await fixture(t)
  f.init(f.profile)
  const name = 'dsh-workflow', path = join(f.profile, 'package.json')
  const target = join(f.profile, 'node_modules', name)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'keep.txt'), 'foreign data')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  manifest.dependencies[name] = `file:${target}`
  const before = JSON.stringify(manifest)
  await writeFile(path, before)
  await assert.rejects(f.prepare(), /expected a local package link/)
  assert.equal(await readFile(join(target, 'keep.txt'), 'utf8'), 'foreign data')
  assert.equal(await readFile(path, 'utf8'), before)
})

for (const disabled of [false, true]) test(`Station refreshes a later user MCP choice (disabled=${disabled})`, async t => {
  const f = await fixture(t)
  const prepared = await f.prepare(), patchPath = join(f.profile, 'cordis.patch.yml')
  const getCodeGraph = () => f.entries(prepared).filter(row => row.name === '@deepseek-ai/dsh-mcp-client' && row.config?.serverName === 'codegraph')
  const userRow = { id: 'user-codegraph', name: '@deepseek-ai/dsh-mcp-client', disabled,
    config: { serverName: 'codegraph', transport: 'stdio', command: '/user/codegraph', args: ['serve', '--mcp'] } }
  const userText = JSON.stringify([{ insert: [userRow] }])
  await writeFile(patchPath, userText)
  await f.prepare()
  assert.deepEqual(getCodeGraph(), [userRow])
  assert.equal(await readFile(patchPath, 'utf8'), userText)
  await writeFile(patchPath, '[]')
  await f.prepare()
  assert.deepEqual(getCodeGraph().map(row => row.id), ['workflow-mcp-codegraph'])
  assert.equal(await readFile(patchPath, 'utf8'), '[]')
})
