import '../sol-efficiency-plugin/test/workspace-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { hostPackageMap } from './project-plugins.mjs'
import { installProjectResolver } from './project-plugin-resolver.mjs'
import { composeKernelLaunch } from './kernel-launch-composition.mjs'
import { configuredWebPort, launchCatalogRoot } from './kernel-web-launch.mjs'
import { composeApprovalPatches } from '../approve-for-me-workflow-plugin/compose-patch.mjs'

const project = resolve('.')
const anchor = join(project, 'deepseek-harness/apps/cli/package.json')
const req = createRequire(anchor)
const { boot, initProfile, loadProfile, composeEntries, healProfilesModuleFallback } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('source launcher chooses its catalog from the checkout, independent of the caller cwd', () => {
  assert.equal(launchCatalogRoot(project), resolve(project, '..'))
  assert.equal(launchCatalogRoot(join(project, 'fixtures', 'checkout')), join(project, 'fixtures'))
})

test('actual Web composition loads all three project components and the root preset without rewriting its fixture profile', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-web-composition-'))
  const home = join(root, 'home'), profileDir = join(home, 'profiles/web')
  const instanceId = randomUUID()
  const saved = Object.fromEntries(['DSH_HOME', 'DSH_PROFILE', 'DSH_OWNER_WORKFLOW_CATALOG_ROOT', 'DSH_OWNER_WORKFLOW_HOST_INSTANCE'].map(key => [key, process.env[key]]))
  let ctx, handle, hooks
  try {
    // These variables belong only to this node:test child and its disposable profile.
    Object.assign(process.env, { DSH_HOME: home, DSH_PROFILE: 'web', DSH_OWNER_WORKFLOW_CATALOG_ROOT: root, DSH_OWNER_WORKFLOW_HOST_INSTANCE: instanceId })
    initProfile(profileDir, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], 'startup')
    const custom = [
      { id: 'permission', config: { defaultPreset: 'review-only', presets: { 'review-only': { sandbox: 'read-only', approval: 'ask' }, 'workspace-write': { sandbox: 'workspace-write', approval: 'ask' } } } },
      { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
      { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
      { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
      { id: 'settings', config: { path: join(home, 'settings.yaml'), watch: false } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
    ]
    await writeFile(join(profileDir, 'cordis.patch.yml'), JSON.stringify(custom))
    const original = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    hooks = installProjectResolver({ directory: root, anchor, hostPackages: hostPackageMap(anchor), packages: {
      'dsh-owner-workflow': project, 'dsh-sol-efficiency': join(project, 'sol-efficiency-plugin'),
      'dsh-approve-for-me-workflow': join(project, 'approve-for-me-workflow-plugin'),
    } })
    await healProfilesModuleFallback({ installAnchor: anchor, home })
    const profile = loadProfile('dsh', 'web', anchor, home)
    const layers = [...profile.layers.map(layer => layer.patches), profile.patches]
    assert.equal(configuredWebPort(composeEntries(profile.layers.map(layer => layer.patches))), 3080)
    const entries = composeEntries(layers)
    const patches = [...layers.flat(), ...composeApprovalPatches(entries), ...composeKernelLaunch(entries, { projectRoot: project, catalogRoot: root })]
    const base = join(profileDir, 'cordis.yml'); await writeFile(base, '[]\n')
    ctx = await boot('ukr-native-web', base, patches, context => provideCmdline(context, { args: [], exit: () => {} }))
    const response = await fetch(`http://127.0.0.1:${ctx.webServer.port}/owner-workflow/api/health`)
    const health = await response.json()
    assert.equal(response.status, 200, JSON.stringify(health))
    assert.equal(health.instanceId, instanceId)
    assert.deepEqual(health.components, { owner: 'ready', sol: 'ready', approval: 'ready' })
    handle = await ctx.agents.create({ sessionId: 'web-kernel-root', meta: { cwd: root }, setup: async child => { await ctx.agentPresets.mount(child, 'owner-workflow') } })
    assert.ok(ctx.tools.get('workflow_start', handle.agent))
    assert.equal(ctx.permissionPresets.current(handle.agent.session), 'review-only')
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), original)
    const graph = ctx.clientModules.graph()
    assert.equal(graph.entries.some(entry => /synapse/i.test(entry.id)), false)
    for (const id of ['dsh-owner-workflow', 'dsh-sol-efficiency', 'dsh-approve-for-me-workflow']) {
      assert.ok(graph.entries.some(entry => entry.id === id), `Missing actual browser client: ${id}`)
    }
  } finally {
    await handle?.dispose(); await ctx?.fiber.dispose(); hooks?.deregister()
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value
    await rm(root, { recursive: true, force: true })
  }
})
