import '../sol-efficiency-plugin/test/workspace-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { prepare, releaseLock, pluginDirectory } from './project-plugins.mjs'
import { installProjectResolver } from './project-plugin-resolver.mjs'
import { target as harnessTarget } from './harness-runtime.mjs'

const project = resolve('.')
const anchor = join(project, 'deepseek-harness/apps/cli/package.json')
const req = createRequire(anchor)
const { boot, initProfile, loadProfile, healProfilesModuleFallback } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('real profile preparation replaces the legacy approval host and preserves custom permission and settings', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'project-native-approval-'))
  const home = join(root, 'home')
  const profileDir = join(home, 'profiles/web')
  const oldEnv = { DSH_HOME: process.env.DSH_HOME, DSH_PROFILE: process.env.DSH_PROFILE }
  let ctx, hooks
  try {
    process.env.DSH_HOME = home
    process.env.DSH_PROFILE = 'web'
    // Preparation requires the complete project-owned package inventory. These
    // real packages are resolved but this test mounts only the approval overlay.
    for (const name of ['owner-workflow-plugin', 'sol-efficiency-plugin', 'approve-for-me-workflow-plugin']) {
      await cp(join(project, name), join(root, name), { recursive: true, filter: path => !['node_modules', 'vendor', '.git'].includes(basename(path)) })
    }
    await cp(join(project, 'package.json'), join(root, 'package.json'))
    for (const name of ['owner-workflow-plugin/vendor', 'owner-workflow-plugin/node_modules']) await symlink(join(project, name), join(root, name))
    const manifest = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [] })
    await writeFile(join(root, 'project-plugins.json'), manifest)
    await writeFile(join(root, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, harnessVersion: harnessTarget.version,
      registry: 'https://registry.npmjs.org/', manifestSha256: createHash('sha256').update(manifest).digest('hex'), plugins: [] }))
    // Reuse the fixed official build's dependency, independent of any user
    // plugin cache. This test downloads and executes no external plugins.
    await mkdir(join(pluginDirectory(root), 'node_modules'), { recursive: true })
    await cp(join(project, 'deepseek-harness/node_modules/.pnpm/semver@7.8.5/node_modules/semver'), join(pluginDirectory(root), 'node_modules/semver'), { recursive: true, dereference: true })
    initProfile(profileDir, ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'], 'startup')
    const legacy = join(profileDir, 'node_modules/dsh-approve-for-me')
    await mkdir(legacy, { recursive: true })
    await writeFile(join(legacy, 'package.json'), JSON.stringify({ name: 'dsh-approve-for-me', type: 'module', main: 'index.js' }))
    await writeFile(join(legacy, 'index.js'), 'throw new Error("Legacy approval must never load")')
    const custom = [
      { id: 'permission', config: { defaultPreset: 'review-only', presets: {
        'review-only': { sandbox: 'read-only', approval: 'ask' },
        'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
      } } },
      { insert: [{ id: 'legacy-approval', name: 'dsh-approve-for-me', config: {
        mode: 'rules-only', rules: { commandPrefixes: [{ tool: 'shell', prefix: 'node --version' }], reviewerInstructions: 'Preserve profile base' },
      } }] },
      { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
      { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
      { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true },
      { id: 'session-title-llm', disabled: true },
      { id: 'settings', config: { path: join(home, 'settings.yaml'), watch: false } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
    ]
    await writeFile(join(profileDir, 'cordis.patch.yml'), JSON.stringify(custom))
    const original = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const state = await prepare(root, anchor, process.pid, { home, run: async () => { throw new Error('No third-party installation permitted') } })
    assert.deepEqual(state.installed.map(item => item.package).sort(), ['dsh-approve-for-me-workflow', 'dsh-owner-workflow', 'dsh-sol-efficiency'])
    hooks = installProjectResolver(state)
    await healProfilesModuleFallback({ installAnchor: anchor, home })
    const profile = loadProfile('dsh', 'web', anchor, home)
    const base = join(profileDir, 'cordis.yml')
    await writeFile(base, '[]\n')
    ctx = await boot('project-native-test', base,
      [...profile.layers.flatMap(layer => layer.patches), ...profile.patches, ...JSON.parse(await readFile(state.patch, 'utf8'))],
      context => provideCmdline(context, { args: [], exit: () => {} }))
    assert.deepEqual(ctx.permissionPresets.names, ['review-only','workspace-write','approve-for-me'])
    assert.equal(ctx.permissionPresets.defaultPreset, 'review-only')
    const section = ctx.settings.describe().filter(item => item.ns === 'approve-for-me')
    assert.equal(section.length, 1)
    assert.equal(section[0].value.rules.reviewerInstructions, 'Preserve profile base')
    assert.equal(section[0].value.mode, 'rules-only')
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), original)
    const graph = ctx.clientModules.graph()
    assert.ok(graph.entries.some(entry => entry.id === 'dsh-approve-for-me-workflow'))
    assert.equal(graph.entries.some(entry => entry.id === 'dsh-approve-for-me'), false)
    const handle = await ctx.agents.create({ sessionId: 'native-approval-default', meta: { cwd: root } })
    try { assert.equal(ctx.permissionPresets.current(handle.agent.session), 'review-only') }
    finally { await handle.dispose() }
  } finally {
    await ctx?.fiber.dispose()
    hooks?.deregister()
    await releaseLock(pluginDirectory(root), process.pid)
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(root, { recursive: true, force: true })
  }
})
