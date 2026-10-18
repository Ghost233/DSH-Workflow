import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdtemp, mkdir, symlink, readFile, rm, writeFile, rename, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {dshReadiness} from '../../scripts/dsh-readiness.mjs'

const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
const anchor = join(source, 'apps/cli/package.json'), req = createRequire(anchor)
const { boot, loadProfile, createRuntimeResolution, PluginPackages } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('packaged project profile serves authenticated official DSH readiness using its declared local package map', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'packaged-dsh-ready-'))
  const resourcesRoot = join(root, 'resources'), workflow = join(resourcesRoot, 'workflow')
  const desktopRuntimeRoot = join(root, 'runtime'), home = join(root, 'home'), globalRoot = join(root, 'global')
  await mkdir(workflow, { recursive: true })
  // The launcher installs its pinned SDK under Resources/node_modules; copied plugins resolve peers from that ancestor.
  const sdk = await createRuntimeResolution({ installAnchor: anchor })
  for (const entry of sdk.entries) {
    const target = join(resourcesRoot, 'node_modules', entry.name)
    await mkdir(join(target, '..'), { recursive: true })
    await symlink(entry.packageDir, target)
  }
  await mkdir(join(desktopRuntimeRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  // Native SDK package artifacts are fixed external runtime inputs; no source resolver or own-package alias is injected.
  await symlink(join(source, 'apps/cli'), join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh'))
  for (const path of ['agent-observation-plugin', 'matt-skills-panel-plugin/package', 'vendor/mattpocock-skills-zh/skills', 'vendor/dsh-skills/skills']) {
    await cp(resolve(path), join(workflow, path), { recursive: true, filter: path => !/(?:^|\/)(?:test|tests|node_modules|\.git)(?:\/|$)/.test(path) })
  }
  for (const name of ['package.json', 'project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) {
    await cp(resolve(name), join(workflow, name))
  }
  await cp(resolve('macos-launcher/package-lock.json'), join(resourcesRoot, 'package-lock.json'))
  // User MCP endpoints are unrelated foreign work, absent from the CI input under diagnosis.
  await writeFile(join(workflow, 'project-mcp.json'), '[]\n')
  await mkdir(join(workflow, 'scripts'), { recursive: true })
  for (const path of ['dsh-launch-composition.mjs', 'dsh-delivery-policy.mjs', 'observation-profile.mjs']) {
    await cp(resolve('scripts', path), join(workflow, 'scripts', path))
  }
  await mkdir(join(workflow, 'macos-launcher/runtime'), { recursive: true })
  await cp(resolve('macos-launcher/runtime/plugin-configuration.mjs'), join(workflow, 'macos-launcher/runtime/plugin-configuration.mjs'))
  await cp(resolve('macos-launcher/runtime/desktop-profile.mjs'), join(workflow, 'macos-launcher/runtime/desktop-profile.mjs'))
  await cp(resolve('macos-launcher/runtime/startup-plugins.mjs'), join(workflow, 'macos-launcher/runtime/startup-plugins.mjs'))
  await cp(resolve('macos-launcher/runtime/desktop-bridge.mjs'), join(workflow, 'macos-launcher/runtime/desktop-bridge.mjs'))
  await cp(resolve('macos-launcher/runtime/stop-inspection.mjs'), join(workflow, 'macos-launcher/runtime/stop-inspection.mjs'))
  const { prepareDesktopProfile } = await import(pathToFileURL(join(workflow, 'macos-launcher/runtime/desktop-profile.mjs')))
  const prepared = await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  const saved = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let ctx, starting, disposing
  t.after(async () => {
    await starting?.catch(() => {})
    await disposing?.catch(() => {})
    await ctx?.fiber.dispose()
    saved === undefined ? delete process.env.DSH_HOME : process.env.DSH_HOME = saved
    await rm(root, { recursive: true, force: true })
  })
  await writeFile(join(prepared.profile, 'cordis.patch.yml'), JSON.stringify([
    { insert: [
      { id: 'matt-skills-board', name: '/previous location/matt-skills-panel-plugin/package/lib/index.js', config: { savedPanelSetting: true } },
      { id: 'matt-panel-tools', name: 'previous-panel/tools', config: { savedToolSetting: true } },
      { id: 'mattpocock-skills-zh', name: 'previous-skills', config: { providerName: 'mattpocock-skills-zh', includeDefaultRoots: false, customSkillDirs: [join(workflow, 'vendor/mattpocock-skills-zh/skills')] } },
      { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } },
    ] },
    { id: 'matt-skills-board', name: '/previous location/matt-skills-panel-plugin/package/lib/index.js', config: { savedPanelSetting: true } },
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
    { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
  ]))
  await writeFile(join(prepared.profile, 'cordis.yml'), '[]\n')
  await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  let profile = loadProfile('dsh', 'desktop', anchor, home)
  const entries = profile
  const { composeEntries } = req('@deepseek-ai/dsh-app-boot')
  const effective = composeEntries([...entries.layers.map(layer => layer.patches), entries.patches])
  assert.equal(effective.filter(row => row.id === 'matt-skills-board').length, 1)
  assert.equal(effective.find(row => row.id === 'matt-skills-board').name, pathToFileURL(join(workflow, 'matt-skills-panel-plugin/package/lib/index.js')).href)
  assert.deepEqual(effective.find(row => row.id === 'matt-skills-board').config, { savedPanelSetting: true })
  assert.equal(effective.find(row => row.id === 'matt-panel-tools').name, 'dsh-workflow-matt-panel/tools')
  assert.equal(effective.find(row => row.id === 'mattpocock-skills-zh').name, '@deepseek-ai/dsh-skill-filesystem')
  assert.deepEqual(effective.find(row => row.id === 'user-kept-plugin'), { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } })
  const startHost = () => {
    starting = (async () => {
    t.signal.throwIfAborted()
    const resolution = await createRuntimeResolution({ installAnchor: anchor, profile })
    t.signal.throwIfAborted()
    const readyListeners = new Set()
    ctx = await boot('packaged-dsh-ready', join(prepared.profile, 'cordis.yml'), [...profile.layers.flatMap(layer => layer.patches), ...profile.patches], async c => {
    c.provide('profileContext', { name: 'desktop', dir: profile.dir, patchPath: profile.patchPath, installAnchor: anchor,
      cwd: globalRoot, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays: [] })
    provideCmdline(c, { args: [], exit: () => {}, ready: { onReady: listener => {
      readyListeners.add(listener); return () => readyListeners.delete(listener)
    } } })
    await c.plugin(PluginPackages, { resolution })
  })
    t.signal.throwIfAborted()
    for (const listener of readyListeners) listener()
    })()
    return starting
  }
  await startHost()
  t.signal.throwIfAborted()
  const baseUrl = c => c.connection.authenticatedUrl(`http://127.0.0.1:${c.webServer.port}`)
  const login = await fetch(baseUrl(ctx), { redirect: 'manual', headers: { connection: 'close' }, signal: t.signal })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await login.text()
  t.signal.throwIfAborted()
  let inventoryReads = 0
  const observedInventory = async (url, options) => {
    const response = await fetch(url, options)
    const evidence = process.env.DSH_TEST_EVIDENCE_DIRECTORY
    if (evidence) {
      await mkdir(evidence, { recursive: true })
      await writeFile(join(evidence, `inventory-${++inventoryReads}.json`), JSON.stringify(await response.clone().json(), null, 2) + '\n')
    }
    return response
  }
  const health = await dshReadiness(baseUrl(ctx),{cookie, signal: t.signal, request: observedInventory})
  assert.equal(health.ready,true)
  assert.ok(health.plugins.length>0)
  const deliveryResponse = await fetch(new URL('/api/workflowDelivery/list', baseUrl(ctx)), {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal: t.signal,
    body: JSON.stringify({ type: 'client-request', rpcId: 's07-delivery', method: 'workflowDelivery/list', payload: { args: {} } }),
  })
  const deliveryText = await deliveryResponse.text()
  if (process.env.DSH_TEST_EVIDENCE_DIRECTORY) {
    await writeFile(join(process.env.DSH_TEST_EVIDENCE_DIRECTORY, 'delivery-response.json'), JSON.stringify({ status: deliveryResponse.status, body: deliveryText }, null, 2) + '\n')
  }
  assert.equal(deliveryResponse.status, 200, `the readonly settings page needs a public Host delivery report; received ${deliveryResponse.status}: ${deliveryText}`)
  const delivery = JSON.parse(deliveryText)
  assert.equal(delivery.result?.ok, true, `the readonly settings page needs the actual Host delivery report: ${JSON.stringify(delivery)}`)
  const report = delivery.result.value
  assert.equal(report.actualScope, 'runtime-resolution')
  const unresolved = report.rows.find(row => row.moduleName === 'user-choice')
  assert.equal(unresolved.current, null)
  assert.equal(unresolved.expected, null)
  assert.equal(unresolved.status, 'unknown', 'unresolved disabled user choices must remain unknown rather than claim a fixed version')
  const sdkRow = report.rows.find(row => row.package === '@deepseek-ai/dsh-host-plugin-inventory')
  assert.ok(sdkRow, 'the actual readonly inventory package is resolved by this Host')
  assert.equal(sdkRow.expected, '0.2.1-rc.2', 'SDK fixed versions must come from the packaged npm lock')
  const presetRow = report.rows.find(row => row.scope === 'Agent 预设 cordis' && row.moduleName === '@deepseek-ai/dsh-plugin-manager/tools')
  assert.ok(presetRow, 'the versions page must retain the effective agent-preset scope from official inventory')
  assert.equal(presetRow.enabled, false)
  assert.equal(presetRow.current, '0.2.1-rc.2')
  assert.equal(presetRow.expected, '0.2.1-rc.2')
  const ownRows = report.rows.filter(row => row.moduleName.startsWith('dsh-workflow/'))
  assert.deepEqual(ownRows.map(row => row.entryId).sort(), ['include:workflow-agent-monitor', 'include:workflow-delivery-inventory'])
  assert.equal(new Set(ownRows.map(row => row.source)).size, 1, 'all named project entries resolve from one existing package source')
  for (const moduleName of ['dsh-workflow/agent-monitor', 'dsh-workflow/delivery-inventory']) {
    const row = report.rows.find(row => row.moduleName === moduleName)
    assert.equal(row.current, '0.1.1', `${moduleName} actual package version`)
    assert.equal(row.expected, '0.1.1', `${moduleName} repository component pin`)
    assert.ok(row.source.includes(workflow), 'the package source must be the actual staged project')
    assert.equal(row.updatable, false)
  }
  const beforeMutationProbe = await readFile(join(prepared.profile, 'package.json'))
  for (const [method, args] of [['pluginManager/installBundle', { spec: '' }], ['pluginManager/removeBundle', { name: 's07-not-installed' }], ['workflowDelivery/installBundle', { spec: '' }]]) {
    const response = await fetch(new URL(`/api/${method}`, baseUrl(ctx)), {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal: t.signal,
      body: JSON.stringify({ type: 'client-request', rpcId: `s07-${method}`, method, payload: { args } }),
    })
    const body = await response.text()
    assert.equal(response.status, 404, `runtime package mutation must be unavailable: ${method}: ${body}`)
  }
  assert.deepEqual(await readFile(join(prepared.profile, 'package.json')), beforeMutationProbe)
  const manifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['dsh-workflow'], `file:${workflow}`)
  assert.equal(manifest.dependencies['dsh-workflow-matt-panel'], `file:${join(workflow, 'matt-skills-panel-plugin/package')}`)
  assert.ok(ctx.tools.get('deck_context'), 'the named Matt tools package registers its public tool')
  assert.match((await ctx.skills.get('spec-delivery')).content, /spawn_teammate/, 'the real Host loads the native DSH team skill')
  assert.equal(ctx.get('jevCenter'), undefined, 'the retired JEV center is not loaded')
  assert.equal(ctx.get('agentMonitor'), undefined, 'the disabled project agent monitor is not loaded')
  disposing = ctx.fiber.dispose()
  await disposing; ctx = undefined; disposing = undefined
  t.signal.throwIfAborted()
  const beforeMove = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  beforeMove.userMetadata = { keep: 'same-home' }
  await writeFile(join(prepared.profile, 'package.json'), JSON.stringify(beforeMove))
  const movedResources = join(root, 'moved resources')
  await rename(resourcesRoot, movedResources)
  await prepareDesktopProfile({ resourcesRoot: movedResources, desktopRuntimeRoot, globalRoot, home })
  profile = loadProfile('dsh', 'desktop', anchor, home)
  const movedWorkflow = join(movedResources, 'workflow')
  const movedManifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.deepEqual(movedManifest.userMetadata, { keep: 'same-home' })
  for (const [name, target] of [['dsh-workflow', movedWorkflow], ['dsh-workflow-matt-panel', join(movedWorkflow, 'matt-skills-panel-plugin/package')]]) {
    assert.equal(movedManifest.dependencies[name], `file:${target}`)
    assert.equal(await readlink(join(prepared.profile, 'node_modules', name)), target)
  }
  const movedEntries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
  assert.deepEqual(movedEntries.find(row => row.id === 'matt-skills-board').config, { savedPanelSetting: true })
  assert.deepEqual(movedEntries.find(row => row.id === 'user-kept-plugin'), { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } })
  await startHost()
  t.signal.throwIfAborted()
  const movedLogin = await fetch(baseUrl(ctx), { redirect: 'manual', headers: { connection: 'close' }, signal: t.signal })
  const movedCookie = movedLogin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await movedLogin.text()
  t.signal.throwIfAborted()
  assert.equal((await dshReadiness(baseUrl(ctx), { cookie: movedCookie, signal: t.signal, request: observedInventory })).ready, true)
  assert.equal(ctx.get('jevCenter'), undefined)
  assert.equal(ctx.get('agentMonitor'), undefined, 'the disabled project agent monitor stays unloaded after moving resources')
  assert.ok(ctx.tools.get('deck_context'))
  assert.ok((await ctx.skills.list()).some(skill => skill.name === 'implement-spec'), 'moved Host still loads the managed Chinese skill directory')
  assert.match((await ctx.skills.get('spec-delivery')).content, /team_task_create/, 'moved Host still loads the native DSH team skill')
})
