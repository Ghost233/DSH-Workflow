import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdtemp, mkdir, symlink, readFile, rm, writeFile, rename, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {dshReadiness} from '../../scripts/dsh-readiness.mjs'
import { createHash } from 'node:crypto'
import { sealPluginPayload } from './plugin-payload.mjs'
import { startupPluginResults } from './startup-plugins.mjs'
import { copyProjectIntegration } from '../project-resources.mjs'

const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
const cliDirectory = process.env.DSH_WEB_TEST_RUNTIME_ROOT || process.env.DSH_SERVICE_TEST_RESOURCES
  ? join(process.env.DSH_WEB_TEST_RUNTIME_ROOT ?? process.env.DSH_SERVICE_TEST_RESOURCES, 'node_modules/@deepseek-ai/dsh')
  : join(source, 'apps/cli')
const anchor = join(cliDirectory, 'package.json'), req = createRequire(anchor)
const { boot, loadProfile, loadOverlayPatches, createRuntimeResolution, PluginPackages } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('packaged project profile serves authenticated official DSH readiness using its declared local package map', { timeout: 30_000 }, async t => {
  const runtime = JSON.parse(await readFile(resolve('dsh-runtime.json'), 'utf8'))
  const sdkLock = JSON.parse(await readFile(resolve('macos-launcher/package-lock.json'), 'utf8')).packages
  const root = await mkdtemp(join(tmpdir(), 'packaged-dsh-ready-'))
  const resourcesRoot = join(root, 'resources'), workflow = join(resourcesRoot, 'workflow')
  const desktopRuntimeRoot = resourcesRoot, home = join(root, 'home'), globalRoot = join(root, 'global')
  await mkdir(resourcesRoot, { recursive: true })
  // The launcher installs its pinned SDK under Resources/node_modules; copied plugins resolve peers from that ancestor.
  const sdk = await createRuntimeResolution({ installAnchor: anchor })
  for (const entry of sdk.entries) {
    const target = join(resourcesRoot, 'node_modules', entry.name)
    await mkdir(join(target, '..'), { recursive: true })
    await symlink(entry.packageDir, target)
  }
  // Native SDK package artifacts are fixed external runtime inputs; no source resolver or own-package alias is injected.
  await copyProjectIntegration(resolve('.'), workflow)
  await cp(resolve('macos-launcher/package-lock.json'), join(resourcesRoot, 'package-lock.json'))
  // User MCP endpoints are unrelated foreign work, absent from the CI input under diagnosis.
  await writeFile(join(workflow, 'project-mcp.json'), '[]\n')
  const delivered = { package: 'workflow-owned-delivery-fixture', version: '1.2.3', source: 'git',
    repository: 'https://github.com/owned/delivery-fixture', commit: 'c'.repeat(40), startup: true }
  const payloadPackage = join(resourcesRoot, 'plugins/node_modules', delivered.package)
  await mkdir(payloadPackage, { recursive: true })
  const deliveredManifest = { name: delivered.package, version: delivered.version, type: 'module',
    exports: { '.': './host.mjs', './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [], immediately: true } } }
  await writeFile(join(payloadPackage, 'package.json'), JSON.stringify(deliveredManifest))
  await writeFile(join(payloadPackage, 'host.mjs'), `export const name='workflow-owned-delivery-fixture'; export function apply(ctx){ctx.provide('workflowOwnedDeliveryFixture', {version:'1.2.3'})}`)
  await writeFile(join(payloadPackage, 'client.js'), 'export function apply(){}')
  await writeFile(join(payloadPackage, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'owned-delivery-fixture', name: delivered.package }] }]))
  const pluginConfig = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [delivered] })
  await writeFile(join(workflow, 'project-plugins.json'), pluginConfig)
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, harnessVersion: runtime.version,
    registry: 'https://registry.npmjs.org/', manifestSha256: createHash('sha256').update(pluginConfig).digest('hex'),
    plugins: [{ package: delivered.package, version: delivered.version, commit: delivered.commit, metadata: deliveredManifest }] }))
  await sealPluginPayload(resourcesRoot, [{ ...delivered, archiveSha256: 'd'.repeat(64) }])
  const { prepareDesktopProfile } = await import(pathToFileURL(join(workflow, 'macos-launcher/runtime/desktop-profile.mjs')))
  const prepared = await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  // An owned import canary under a retired package name exercises legacy bundle removal.
  const retired = join(prepared.profile, 'node_modules/billion-context'), retiredImport = join(root, 'retired-imported')
  await mkdir(retired, { recursive: true })
  await writeFile(join(retired, 'package.json'), JSON.stringify({ name: 'billion-context', version: '0.0.0',
    type: 'module', main: './index.mjs', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(retired, 'index.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(retiredImport)}, 'imported'); export function apply(){}`)
  await writeFile(join(retired, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'bili-native', name: 'billion-context' }] }]))
  const legacyManifestPath = join(prepared.profile, 'package.json')
  const legacyManifest = JSON.parse(await readFile(legacyManifestPath, 'utf8'))
  legacyManifest.dependencies['billion-context'] = `file:${retired}`
  legacyManifest.dsh.profile.bundles.push('billion-context')
  await writeFile(legacyManifestPath, JSON.stringify(legacyManifest))
  const saved = { home: process.env.DSH_HOME, agents: process.env.DSH_AGENTS_HOME, osHome: process.env.HOME }
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = join(root, 'agents')
  process.env.HOME = root
  let ctx, starting, disposing
  t.after(async () => {
    await starting?.catch(() => {})
    await disposing?.catch(() => {})
    await ctx?.fiber.dispose()
    for (const [key, value] of [['DSH_HOME', saved.home], ['DSH_AGENTS_HOME', saved.agents], ['HOME', saved.osHome]]) {
      value === undefined ? delete process.env[key] : process.env[key] = value
    }
    await rm(root, { recursive: true, force: true })
  })
  await writeFile(join(prepared.profile, 'cordis.patch.yml'), JSON.stringify([
    { insert: [
      { id: 'matt-skills-board', name: '/previous location/matt-skills-panel-plugin/package/lib/index.js', config: { savedPanelSetting: true, ghAccount: false } },
      { id: 'matt-panel-tools', name: 'previous-panel/tools', config: { savedToolSetting: true } },
      { id: 'mattpocock-skills-zh', name: 'previous-skills', config: { providerName: 'mattpocock-skills-zh', includeDefaultRoots: false, customSkillDirs: [join(workflow, 'vendor/mattpocock-skills-zh/skills')] } },
      { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } },
    ] },
    { id: 'matt-skills-board', name: '/previous location/matt-skills-panel-plugin/package/lib/index.js', config: { savedPanelSetting: true, ghAccount: false } },
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
    { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
  ]))
  await writeFile(join(prepared.profile, 'cordis.yml'), '[]\n')
  await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  let profile = loadProfile('dsh', 'desktop', anchor, home)
  const overlay = () => loadOverlayPatches('dsh', prepared.overlay)
  const entries = profile
  const { composeEntries } = req('@deepseek-ai/dsh-app-boot')
  const effective = composeEntries([...entries.layers.map(layer => layer.patches), entries.patches, overlay()])
  assert.equal(effective.find(row => row.id === 'bili-native')?.disabled, true)
  assert.equal(effective.filter(row => row.id === 'matt-skills-board').length, 1)
  assert.equal(effective.find(row => row.id === 'matt-skills-board').name, pathToFileURL(join(workflow, 'matt-skills-panel-plugin/package/lib/index.js')).href)
  assert.deepEqual(effective.find(row => row.id === 'matt-skills-board').config, { savedPanelSetting: true, ghAccount: false })
  assert.equal(effective.find(row => row.id === 'matt-panel-tools').name,
    pathToFileURL(join(workflow, 'matt-skills-panel-plugin/package/deck/registration/agent-row.js')).href)
  assert.equal(effective.find(row => row.id === 'mattpocock-skills-zh').name, '@deepseek-ai/dsh-skill-filesystem')
  assert.deepEqual(effective.find(row => row.id === 'user-kept-plugin'), { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } })
  const startHost = () => {
    starting = (async () => {
    t.signal.throwIfAborted()
    const resolution = await createRuntimeResolution({ installAnchor: anchor, profile })
    t.signal.throwIfAborted()
    const readyListeners = new Set()
    const overlays = overlay()
    ctx = await boot('packaged-dsh-ready', join(prepared.profile, 'cordis.yml'),
      [...profile.layers.flatMap(layer => layer.patches), ...profile.patches, ...overlays], async c => {
    c.provide('profileContext', { name: 'desktop', dir: profile.dir, patchPath: profile.patchPath, installAnchor: anchor,
      cwd: globalRoot, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays })
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
  await assert.rejects(readFile(retiredImport), { code: 'ENOENT' }, 'retired package must not be imported by the real Host')
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
  assert.equal(ctx.get('workflowOwnedDeliveryFixture')?.version, delivered.version)
  const actualPlugin = (await startupPluginResults({ resourcesRoot, url: baseUrl(ctx) })).find(row => row.package === delivered.package)
  assert.equal(actualPlugin.state, 'loaded', JSON.stringify(actualPlugin))
  assert.equal(actualPlugin.actualVersion, delivered.version)
  assert.equal(actualPlugin.source, await realpath(payloadPackage))
  const unresolved = report.rows.find(row => row.moduleName === 'user-choice')
  assert.equal(unresolved.current, null)
  assert.equal(unresolved.expected, null)
  assert.equal(unresolved.status, 'unknown', 'unresolved disabled user choices must remain unknown rather than claim a fixed version')
  const sdkRow = report.rows.find(row => row.package === '@deepseek-ai/dsh-host-plugin-inventory')
  assert.ok(sdkRow, 'the actual readonly inventory package is resolved by this Host')
  assert.equal(sdkRow.expected, sdkLock['node_modules/@deepseek-ai/dsh-host-plugin-inventory'].version, 'SDK fixed versions must come from the packaged npm lock')
  const presetRow = report.rows.find(row => row.scope === 'Agent 预设 cordis' && row.moduleName === '@deepseek-ai/dsh-plugin-manager/tools')
  assert.ok(presetRow, 'the versions page must retain the effective agent-preset scope from official inventory')
  assert.equal(presetRow.enabled, false)
  assert.equal(presetRow.current, sdkLock['node_modules/@deepseek-ai/dsh-plugin-manager'].version)
  assert.equal(presetRow.expected, sdkLock['node_modules/@deepseek-ai/dsh-plugin-manager'].version)
  const inventoryRow = report.rows.find(row => row.entryId?.endsWith(':workflow-delivery-inventory'))
  assert.ok(inventoryRow?.source?.includes(workflow), 'inventory must resolve from the actual staged project')
  assert.equal(inventoryRow.fiberPhase, 'active')
  assert.equal(inventoryRow.updatable, false)
  assert.ok(!report.rows.some(row => /:(workflow-agent-monitor|workflow-project-coordination)$/.test(row.entryId ?? '')))
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
  assert.equal(manifest.dependencies['dsh-workflow'], undefined)
  assert.equal(manifest.dependencies['dsh-workflow-matt-panel'], undefined)
  assert.ok(ctx.tools.get('deck_context'), 'the named Matt tools package registers its public tool')
  assert.match((await ctx.skills.get('spec-delivery')).content, /spawn_teammate/, 'the real Host loads the native DSH team skill')
  const browserPlugin = report.rows.find(row => row.package === 'dsh-workflow-browser-harness')
  assert.equal(browserPlugin.current, '0.1.0')
  assert.equal(browserPlugin.expected, '0.1.0')
  const browserSkill = await ctx.skills.get('browser-harness')
  assert.match(browserSkill.content, /references\/SKILL.md/)
  assert.equal((await ctx.skills.list()).filter(skill => skill.name === 'browser-harness').length, 1)
  const browserResponse = await fetch(new URL('/api/browserHarness/inspect', baseUrl(ctx)), {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal: t.signal,
    body: JSON.stringify({ type: 'client-request', rpcId: 'browser-inspect', method: 'browserHarness/inspect', payload: { args: {} } }),
  })
  const browserInspection = await browserResponse.json()
  assert.equal(browserResponse.status, 200, JSON.stringify(browserInspection))
  assert.equal(browserInspection.result?.ok, true, JSON.stringify(browserInspection))
  assert.equal(browserInspection.result.value.actualScope, 'dsh-shell')
  assert.ok(['installed', 'missing', 'error'].includes(browserInspection.result.value.state))
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
  await prepareDesktopProfile({ resourcesRoot: movedResources, desktopRuntimeRoot: movedResources, globalRoot, home })
  profile = loadProfile('dsh', 'desktop', anchor, home)
  const movedWorkflow = join(movedResources, 'workflow')
  const movedManifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.deepEqual(movedManifest.userMetadata, { keep: 'same-home' })
  assert.equal(movedManifest.dependencies['dsh-workflow'], undefined)
  assert.equal(movedManifest.dependencies['dsh-workflow-matt-panel'], undefined)
  assert.equal(await realpath(join(prepared.profile, 'node_modules', delivered.package)),
    await realpath(join(movedResources, 'plugins/node_modules', delivered.package)))
  const movedEntries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, overlay()])
  assert.deepEqual(movedEntries.find(row => row.id === 'matt-skills-board').config, { savedPanelSetting: true, ghAccount: false })
  assert.deepEqual(movedEntries.find(row => row.id === 'user-kept-plugin'), { id: 'user-kept-plugin', name: 'user-choice', disabled: true, config: { keep: true } })
  await startHost()
  t.signal.throwIfAborted()
  const movedLogin = await fetch(baseUrl(ctx), { redirect: 'manual', headers: { connection: 'close' }, signal: t.signal })
  const movedCookie = movedLogin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await movedLogin.text()
  t.signal.throwIfAborted()
  assert.equal((await dshReadiness(baseUrl(ctx), { cookie: movedCookie, signal: t.signal, request: observedInventory })).ready, true)
  assert.equal(ctx.get('workflowOwnedDeliveryFixture')?.version, delivered.version, 'the relocated Host must actually execute the shipped plugin')
  assert.equal(ctx.get('jevCenter'), undefined)
  assert.equal(ctx.get('agentMonitor'), undefined, 'the disabled project agent monitor stays unloaded after moving resources')
  assert.ok(ctx.tools.get('deck_context'))
  assert.ok((await ctx.skills.list()).some(skill => skill.name === 'implement-spec'), 'moved Host still loads the managed Chinese skill directory')
  assert.match((await ctx.skills.get('spec-delivery')).content, /team_task_create/, 'moved Host still loads the native DSH team skill')
  assert.match((await ctx.skills.get('browser-harness')).content, /references\/SKILL.md/)
  assert.deepEqual(await readFile(join(movedWorkflow, 'browser-harness-plugin/skills/browser-harness/references/SKILL.md')),
    await readFile(resolve('vendor/browser-harness/SKILL.md')), 'relocation keeps original skill bytes')
})
