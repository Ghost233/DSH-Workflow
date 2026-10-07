import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdtemp, mkdir, symlink, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const source = process.env.DSH_BUILT_SOURCE_ROOT ?? resolve('deepseek-harness')
const anchor = join(source, 'apps/cli/package.json'), req = createRequire(anchor)
const { boot, loadProfile, createRuntimeResolution, PluginPackages } = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

test('packaged project profile serves authenticated Owner health using its declared local package map', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'packaged-owner-health-'))
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
  for (const path of ['owner-workflow-plugin', 'matt-skills-panel-plugin/package', 'vendor/mattpocock-skills-zh/skills']) {
    await cp(resolve(path), join(workflow, path), { recursive: true, filter: path => !/(?:^|\/)(?:test|tests|node_modules|\.git)(?:\/|$)/.test(path) })
  }
  await cp(resolve('package.json'), join(workflow, 'package.json'))
  // User MCP endpoints are unrelated foreign work, absent from the CI input under diagnosis.
  await writeFile(join(workflow, 'project-mcp.json'), '[]\n')
  await mkdir(join(workflow, 'scripts'), { recursive: true })
  for (const path of ['kernel-launch-composition.mjs', 'observation-profile.mjs']) {
    await cp(resolve('scripts', path), join(workflow, 'scripts', path))
  }
  await mkdir(join(workflow, 'macos-launcher/runtime'), { recursive: true })
  await cp(resolve('macos-launcher/runtime/desktop-profile.mjs'), join(workflow, 'macos-launcher/runtime/desktop-profile.mjs'))
  await cp(resolve('macos-launcher/runtime/desktop-bridge.mjs'), join(workflow, 'macos-launcher/runtime/desktop-bridge.mjs'))
  const { prepareDesktopProfile } = await import(pathToFileURL(join(workflow, 'macos-launcher/runtime/desktop-profile.mjs')))
  const prepared = await prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home })
  const saved = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let ctx
  t.after(async () => {
    await ctx?.fiber.dispose()
    saved === undefined ? delete process.env.DSH_HOME : process.env.DSH_HOME = saved
    await rm(root, { recursive: true, force: true })
  })
  await writeFile(join(prepared.profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
    { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
  ]))
  await writeFile(join(prepared.profile, 'cordis.yml'), '[]\n')
  const profile = loadProfile('dsh', 'desktop', anchor, home)
  const resolution = await createRuntimeResolution({ installAnchor: anchor, profile })
  const readyListeners = new Set()
  ctx = await boot('packaged-owner-health', join(prepared.profile, 'cordis.yml'), [...profile.layers.flatMap(layer => layer.patches), ...profile.patches], async c => {
    c.provide('profileContext', { name: 'desktop', dir: profile.dir, patchPath: profile.patchPath, installAnchor: anchor,
      cwd: globalRoot, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays: [] })
    provideCmdline(c, { args: [], exit: () => {}, ready: { onReady: listener => {
      readyListeners.add(listener); return () => readyListeners.delete(listener)
    } } })
    await c.plugin(PluginPackages, { resolution })
  })
  for (const listener of readyListeners) listener()
  const baseUrl = c => c.connection.authenticatedUrl(`http://127.0.0.1:${c.webServer.port}`)
  const login = await fetch(baseUrl(ctx), { redirect: 'manual', headers: { connection: 'close' } })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await login.text()
  const response = await fetch(new URL('/owner-workflow/api/health', baseUrl(ctx)), { headers: { cookie, connection: 'close' } })
  const body = await response.text()
  const signal = { status: response.status, contentType: response.headers.get('content-type'), location: response.headers.get('location'), body }
  assert.equal(response.status, 200, JSON.stringify(signal))
  const health = JSON.parse(body)
  assert.equal(health.ready, true, JSON.stringify(signal))
  assert.equal(health.components.owner, 'ready', JSON.stringify(signal))
  const manifest = JSON.parse(await readFile(join(prepared.profile, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['dsh-owner-workflow'], `file:${join(workflow, 'owner-workflow-plugin')}`)
  assert.equal(manifest.dependencies['dsh-workflow-matt-panel'], `file:${join(workflow, 'matt-skills-panel-plugin/package')}`)
  assert.ok(ctx.tools.get('deck_context'), 'the named Matt tools package registers its public tool')
  assert.ok(ctx.get('jevCenter'), 'the named JEV center package provides its public service')
  assert.ok(ctx.get('agentMonitor'), 'the named monitor package provides its public service')
})
