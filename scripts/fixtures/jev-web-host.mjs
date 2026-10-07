import '../harness-test-loader.mjs'
import { mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { randomUUID } from 'node:crypto'
import { hostPackageMap } from '../project-plugins.mjs'
import { installProjectResolver } from '../project-plugin-resolver.mjs'
import { composeKernelLaunch } from '../kernel-launch-composition.mjs'
import { configuredWebPort, launchCatalogRoot } from '../kernel-web-launch.mjs'
import { ensureObservationProfile } from '../observation-profile.mjs'

const project = resolve('.')
const anchor = join(project, 'deepseek-harness/apps/cli/package.json')
const req = createRequire(anchor)
const { boot, initProfile, loadProfile, composeEntries } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')
const { assembleContextFor } = req('@deepseek-ai/dsh-agent')
const { LlmAdapter, createUserMessage } = req('@deepseek-ai/dsh-llm')

const t = { mock }
await (async () => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-web-composition-'))
  const home = join(root, 'home'), profileDir = join(home, 'profiles/web')
  const instanceId = randomUUID()
  const saved = Object.fromEntries(['DSH_HOME', 'DSH_PROFILE', 'DSH_OWNER_WORKFLOW_CATALOG_ROOT', 'DSH_OWNER_WORKFLOW_HOST_INSTANCE'].map(key => [key, process.env[key]]))
  let ctx, handle, creator, standard, hooks
  let releaseOwner, ownerRequest
  const notices = [], childProcess = req('node:child_process'), originalExecFile = childProcess.execFile
  t.mock.method(childProcess, 'execFile', (command, args, ...rest) => {
    if (command !== '/usr/bin/osascript') return originalExecFile(command, args, ...rest)
    notices.push(args.at(-1))
    rest.find(value => typeof value === 'function')?.(null, '', '')
  })
  syncBuiltinESMExports()
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
    await ensureObservationProfile({ profile: loadProfile('dsh', 'web', anchor, home), anchor, catalogRoot: root })
    const original = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    hooks = installProjectResolver({ directory: root, anchor, hostPackages: hostPackageMap(anchor), packages: {
      'dsh-owner-workflow': project,
      'dsh-workflow-matt-panel': join(project, 'matt-skills-panel-plugin/package'),
    } })
    const base = join(profileDir, 'cordis.yml'); await writeFile(base, '[]\n')
    const start = async () => {
      const profile = loadProfile('dsh', 'web', anchor, home)
      const layers = [...profile.layers.map(layer => layer.patches), profile.patches]
      assert.equal(configuredWebPort(composeEntries(profile.layers.map(layer => layer.patches))), 3080)
      const entries = composeEntries(layers)
      const presetPlugins = req('@deepseek-ai/dsh-app-boot').loadOverlayPatches('dsh', join(project, 'owner-workflow-plugin/kernel-presets/owner-workflow/agent.cordis.yml'))
      const projectPatches = composeKernelLaunch(entries, { projectRoot: project, catalogRoot: root, presetPlugins })
      return boot('ukr-native-web', base, [...layers.flat(), ...projectPatches], context => {
        context.provide('profileContext', { name: 'web', dir: profile.dir, patchPath: profile.patchPath,
          installAnchor: anchor, cwd: root, home, startedBundles: profile.layers.map(layer => layer.packageName),
          overlays: projectPatches, telemetryDisabledEnv: undefined })
        provideCmdline(context, { args: [], exit: () => {} })
      })
    }
    ctx = await start()
    class OwnerAdapter extends LlmAdapter {
      resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model }) }
      async *stream(options) {
        ownerRequest = options
        await new Promise(resolve => { releaseOwner = resolve })
        yield { type: 'text-delta', index: 0, text: 'Owner fixture finished' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['jev-owner-fixture'], new OwnerAdapter())
    const response = await fetch(`http://127.0.0.1:${ctx.webServer.port}/owner-workflow/api/health`)
    const health = await response.json()
    assert.equal(response.status, 200, JSON.stringify(health))
    assert.equal(health.instanceId, instanceId)
    assert.deepEqual(health.components, { owner: 'ready' })
    const monitorResponse = await fetch(`http://127.0.0.1:${ctx.webServer.port}/agent-monitor/api/status`)
    assert.equal(monitorResponse.status, 200)
    const monitorStatus = await monitorResponse.json()
    assert.deepEqual(monitorStatus.alerts, [])
    assert.equal(typeof monitorStatus.semanticAvailable, 'boolean')
    assert.equal(monitorStatus.directory, join(root, '.dsh-workflow/agent-monitor'))
    handle = await ctx.agents.create({ sessionId: 'web-kernel-root', meta: { cwd: root },
      agentOptions: { provider: 'jev-owner-fixture', model: 'fixture' },
      setup: async child => { await ctx.agentPresets.mount(child, 'owner-workflow') } })
    assert.ok(ctx.tools.get('workflow_start', handle.agent))
    assert.equal(ctx.permissionPresets.current(handle.agent.session), 'review-only')
    creator = await ctx.agents.create({ sessionId: 'web-creator', meta: { cwd: root },
      setup: async child => { await ctx.agentPresets.mount(child, 'cordis') } })
    standard = await ctx.agents.create({ sessionId: 'web-standard', meta: { cwd: root },
      setup: async child => { await ctx.agentPresets.mount(child, 'standard') } })
    assert.ok(ctx.tools.get('cordis_inspect_list', creator.agent), 'Creator retains its native tools')
    const creatorPrompt = await ctx.systemPrompt.assemble(assembleContextFor(creator.agent))
    assert.ok(creatorPrompt.sections.some(section => section.name === 'workflow:creator-jev-design'))
    for (const agent of [handle.agent, standard.agent]) {
      const prompt = await ctx.systemPrompt.assemble(assembleContextFor(agent))
      assert.equal(prompt.sections.some(section => section.name === 'workflow:creator-jev-design'), false)
    }
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), original)
    await ctx.settings.update('workflow-agent-monitor', { checkIntervalMs: 10, noOutputThreshold: 2 })
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Owner observation fixture' }] }))
    const deadline = Date.now() + 3000
    while (!ctx.agentMonitor.snapshot().alerts.some(alert => alert.agentId === handle.agent.id && alert.kind === 'no-output')) {
      if (Date.now() > deadline) throw new Error('Owner no-output alert was not observed')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(ownerRequest.signal.aborted, false)
    releaseOwner()
    await handle.agent.whenIdle()
    await ctx.agentMonitor.flush()
    const ownerAlert = ctx.agentMonitor.snapshot().alerts.find(alert => alert.agentId === handle.agent.id && alert.kind === 'no-output')
    assert.equal(typeof ownerAlert.recoveredAt, 'number')
    assert.ok((await ctx.agentMonitor.journal()).some(record => record.agentId === handle.agent.id))
    if (process.platform === 'darwin') assert.ok(notices.some(message => message.includes(handle.agent.id)))
    await ctx.settings.update('workflow-jev-center', { engines: [{
      url: 'http://127.0.0.1:9', upstreamModel: 'fixture', modelName: 'quick',
      credentialRef: 'JEV_RESTART_FIXTURE_KEY', enabled: false, timeoutMs: 5000,
    }] })
    assert.equal(ctx.jevCenter.describe()[0].modelName, 'quick')
    await ctx.settings.update('workflow-agent-monitor', { checkIntervalMs: 90_000, noOutputThreshold: 7 })
    const graph = ctx.clientModules.graph()
    assert.equal(graph.entries.some(entry => /synapse/i.test(entry.id)), false)
    for (const id of ['dsh-owner-workflow']) {
      assert.ok(graph.entries.some(entry => entry.id === id), `Missing actual browser client: ${id}`)
    }
    await standard.dispose(); standard = undefined
    await creator.dispose(); creator = undefined
    await handle.dispose(); handle = undefined
    await ctx.fiber.dispose(); ctx = undefined
    const savedProfile = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    assert.equal(await ensureObservationProfile({ profile: loadProfile('dsh', 'web', anchor, home), anchor, catalogRoot: root }), false)
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), savedProfile)
    ctx = await start()
    assert.equal(ctx.jevCenter.describe()[0].modelName, 'quick')
    const restored = await fetch(`http://127.0.0.1:${ctx.webServer.port}/agent-monitor/api/status`).then(response => response.json())
    assert.equal(restored.configuration.value.checkIntervalMs, 90_000)
    assert.equal(restored.configuration.value.noOutputThreshold, 7)
    assert.equal(restored.directory, join(root, '.dsh-workflow/agent-monitor'))
    const restoredPatches = req('@deepseek-ai/dsh-app-boot').loadOverlayPatches('dsh', join(profileDir, 'cordis.patch.yml'))
    assert.deepEqual(restoredPatches.filter(row => custom.some(original => original.id === row.id)), custom)
  } finally {
    releaseOwner?.()
    await standard?.dispose(); await creator?.dispose(); await handle?.dispose(); await ctx?.fiber.dispose(); hooks?.deregister()
    t.mock.restoreAll(); syncBuiltinESMExports()
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value
    await rm(root, { recursive: true, force: true })
  }
})()
