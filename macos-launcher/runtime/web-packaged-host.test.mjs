import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, symlink, readFile, rm, writeFile, rename, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {dshReadiness} from '../../scripts/dsh-readiness.mjs'
import { createHash } from 'node:crypto'
import { sealPluginPayload } from './plugin-payload.mjs'
import { startupPluginResults } from './startup-plugins.mjs'
import { copyProjectIntegration } from '../project-resources.mjs'
import { authenticatedHostUrl } from './station-bridge.mjs'

async function checkRepositoryGh(ctx, root, signal) {
  const main = join(root, 'main repo'), nested = join(main, 'nested repo')
  const profileDir = join(root, 'config', 'gh-profiles')
  const previousConfigHome = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = join(root, 'config')
  const handles = []
  try {
    for (const [directory, login] of [[main, 'MainAccount'], [nested, 'NestedAccount']]) {
      await mkdir(directory, { recursive: true })
      await mkdir(join(profileDir, login), { recursive: true })
      execFileSync('git', ['init', '--quiet', directory])
      await writeFile(join(directory, '.gitignore'), '/.ghswitch\n')
      await writeFile(join(directory, '.ghswitch'), login + '\n')
      handles.push(await ctx.agents.create({ sessionId: 'station-gh-' + login, meta: { cwd: directory },
        setup: scope => ctx.agentPresets.mount(scope, 'standard').then(() => undefined),
      }))
    }
    let callId = 0
    const run = async (agent, name, args) => {
      const batch = await ctx.tools.execute({ agent, signal, calls: [
        { type: 'tool_call', id: 'station-gh-' + ++callId, name, arguments: JSON.stringify(args) },
      ] })
      const { result } = batch.results[0]
      assert.equal(result.isError, false, JSON.stringify(result))
      return result.value
    }
    const [mainAgent, nestedAgent] = handles.map(handle => handle.agent)
    const policy = { mode: 'workspace-write', workspaceRoot: main }
    const spec = ctx.shell.resolve({ command: 'true', workdir: nested, sandboxPolicy: policy,
      dshEnv: { DSH_SHELL: '1', DSH_SESSION_ID: mainAgent.id },
    })
    assert.deepEqual(spec.sandboxPolicy, policy)
    assert.equal(spec.workdir, nested)
    assert.equal(spec.env.GH_CONFIG_DIR, join(profileDir, 'MainAccount'))
    // The test runner can already be confined by macOS, which prohibits nested sandbox-exec.
    for (const { agent } of handles) ctx.permissionPresets.set(agent.session, 'danger-full-access')
    const command = 'printenv GH_CONFIG_DIR || printf unset'
    const args = { command, description: 'Inspect fixture GitHub profile', workdir: nested }
    const [mainResult, nestedResult] = await Promise.all([
      run(mainAgent, 'bash', args), run(nestedAgent, 'bash', args),
    ])
    assert.equal(mainResult.exitCode, 0, JSON.stringify(mainResult))
    assert.equal(nestedResult.exitCode, 0, JSON.stringify(nestedResult))
    assert.equal(mainResult.stdout.text.trim(), join(profileDir, 'MainAccount'))
    assert.equal(nestedResult.stdout.text.trim(), join(profileDir, 'NestedAccount'))
    const bg = await run(mainAgent, 'bash', { ...args, run_in_background: true })
    assert.equal(bg.kind, 'background')
    const output = await run(mainAgent, 'job_output', { job_id: bg.jobId, wait: true })
    assert.match(JSON.stringify(output), /MainAccount/)
    assert.doesNotMatch(JSON.stringify(output), /NestedAccount/)
    execFileSync('git', ['-C', main, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '--allow-empty', '-m', 'Fixture'])
    const worktree = join(root, 'linked worktree')
    execFileSync('git', ['-C', main, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', worktree])
    const linked = await ctx.agents.create({ sessionId: 'station-gh-worktree', meta: { cwd: worktree } })
    handles.push(linked)
    const linkedSpec = ctx.shell.resolve({ command: 'true', dshEnv: { DSH_SHELL: '1', DSH_SESSION_ID: linked.agent.id } })
    assert.equal(linkedSpec.env.GH_CONFIG_DIR, join(profileDir, 'MainAccount'))
    execFileSync('git', ['-C', main, 'add', '--force', '--', '.ghswitch'])
    const tracked = await run(mainAgent, 'bash', args)
    assert.equal(tracked.exitCode, 0, JSON.stringify(tracked))
    assert.equal(tracked.stdout.text.trim(), process.env.GH_CONFIG_DIR ?? 'unset')
  } finally {
    await Promise.all(handles.map(handle => handle.dispose()))
    if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousConfigHome
  }
}

const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
const cliDirectory = process.env.DSH_WEB_TEST_RUNTIME_ROOT || process.env.DSH_SERVICE_TEST_RESOURCES
  ? join(process.env.DSH_WEB_TEST_RUNTIME_ROOT ?? process.env.DSH_SERVICE_TEST_RESOURCES, 'node_modules/@deepseek-ai/dsh')
  : join(source, 'apps/cli')
const anchor = join(cliDirectory, 'package.json'), req = createRequire(anchor)
const { boot, loadProfile, loadOverlayPatches, createRuntimeResolution, PluginPackages } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('packaged project profile serves authenticated official DSH readiness using its declared local package map', { timeout: 30_000 }, async t => {
  const runtime = JSON.parse(await readFile(resolve('dsh-runtime.json'), 'utf8'))
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
      { id: 'workflow-browser-harness-skills', name: '@deepseek-ai/dsh-skill-filesystem', config: {
        providerName: 'workflow-browser-harness', includeDefaultRoots: false, customSkillDirs: [join(workflow, 'browser-harness-plugin/skills')],
      } },
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
  assert.deepEqual(effective.find(row => row.id === 'matt-skills-board'), {
    id: 'matt-skills-board', name: pathToFileURL('/previous location/matt-skills-panel-plugin/package/lib/index.js').href,
    disabled: true, config: { savedPanelSetting: true, ghAccount: false },
  })
  assert.equal(effective.find(row => row.id === 'matt-panel-tools').disabled, true)
  assert.equal(effective.find(row => row.id === 'workflow-browser-harness-skills').disabled, true)
  assert.equal(effective.find(row => row.id === 'mattpocock-skills-zh')?.disabled, true, 'the old Matt skill provider stays disabled')
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
  const baseUrl = authenticatedHostUrl
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
  const bridge = health.plugins.find(row => row.entryId?.endsWith(':dsh-station-bridge'))
  assert.equal(bridge?.fiberPhase, 'active')
  assert.match(bridge.moduleName, /macos-launcher\/runtime\/station-bridge\.mjs$/)
  assert.ok(ctx.get('workflowHostInstance'), 'the bridge publishes the Host identity')
  const bash = health.plugins.find(row => row.entryId?.endsWith(':station-gh-bash-sandbox'))
  assert.equal(bash?.fiberPhase, 'active')
  assert.match(bash.moduleName, /macos-launcher\/runtime\/station-gh-bash\.mjs$/)
  await checkRepositoryGh(ctx, root, t.signal)
  assert.ok(!health.plugins.some(row => /:(workflow-delivery-inventory|workflow-browser-harness(?:-skills)?|workflow-agent-monitor|workflow-project-coordination)$/.test(row.entryId ?? '') && row.enabled))
  assert.equal(ctx.get('workflowOwnedDeliveryFixture')?.version, delivered.version)
  const actualPlugin = (await startupPluginResults({ resourcesRoot, profile: prepared.profile, entries: health.plugins }))
    .find(row => row.package === delivered.package)
  assert.equal(actualPlugin.state, 'loaded', JSON.stringify(actualPlugin))
  assert.equal(actualPlugin.installedVersion, delivered.version)
  assert.equal(actualPlugin.installedSource, await realpath(payloadPackage))
  const beforeMutationProbe = await readFile(join(prepared.profile, 'package.json'))
  for (const [method, args] of [['pluginManager/installBundle', { spec: '' }], ['pluginManager/removeBundle', { name: 's07-not-installed' }], ['workflowDelivery/list', {}], ['browserHarness/inspect', {}]]) {
    const response = await fetch(new URL(`/api/${method}`, baseUrl(ctx)), {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal: t.signal,
      body: JSON.stringify({ type: 'client-request', rpcId: `s07-${method}`, method, payload: { args } }),
    })
    const body = await response.text()
    assert.equal(response.status, 404, `removed endpoint must be unavailable: ${method}: ${body}`)
  }
  assert.deepEqual(await readFile(join(prepared.profile, 'package.json')), beforeMutationProbe)
  const manifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['dsh-workflow'], undefined)
  assert.equal(manifest.dependencies['dsh-workflow-matt-panel'], undefined)
  assert.equal(ctx.tools.get('deck_context'), undefined, 'the retired Matt tools are not registered')
  assert.ok(ctx.get('agentTeams'), 'DSH supplies the official Agent Team service through its base bundle')
  assert.ok(!(await ctx.skills.list()).some(skill => ['mattpocock-skills-zh', 'dsh-workflow-skills'].includes(skill.provider)), 'Station does not mount its former bundled skill providers')
  assert.ok(!(await ctx.skills.list()).some(skill => skill.name === 'browser-harness'))
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
  const movedManifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.deepEqual(movedManifest.userMetadata, { keep: 'same-home' })
  assert.equal(movedManifest.dependencies['dsh-workflow'], undefined)
  assert.equal(movedManifest.dependencies['dsh-workflow-matt-panel'], undefined)
  assert.equal(await realpath(join(prepared.profile, 'node_modules', delivered.package)),
    await realpath(join(movedResources, 'plugins/node_modules', delivered.package)))
  const movedEntries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, overlay()])
  assert.deepEqual(movedEntries.find(row => row.id === 'matt-skills-board').config, { savedPanelSetting: true, ghAccount: false })
  assert.equal(movedEntries.find(row => row.id === 'matt-skills-board').disabled, true)
  const legacyBrowser = movedEntries.find(row => row.id === 'workflow-browser-harness-skills')
  assert.equal(legacyBrowser.disabled, true)
  assert.deepEqual(legacyBrowser.config.customSkillDirs, [join(workflow, 'browser-harness-plugin/skills')])
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
  assert.equal(ctx.tools.get('deck_context'), undefined, 'the retired Matt tools stay unloaded after moving resources')
  assert.ok(!(await ctx.skills.list()).some(skill => ['mattpocock-skills-zh', 'dsh-workflow-skills'].includes(skill.provider)), 'moving Station does not restore retired skill providers')
  assert.ok(!(await ctx.skills.list()).some(skill => skill.name === 'browser-harness'))
})
