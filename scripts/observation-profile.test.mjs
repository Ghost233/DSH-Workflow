import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensureObservationProfile } from './observation-profile.mjs'

const anchor = resolve('deepseek-harness/apps/cli/package.json')
const req = createRequire(anchor)
const boot = req('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = req('@deepseek-ai/dsh-cmdline')

for (const disabled of [false, true]) test(`persisted observation names migrate through native composition and Host, disabled=${disabled}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'observation-native-migration-'))
  const home = join(root, 'home'), profileDir = join(home, 'profiles/web')
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let ctx
  t.after(async () => { await ctx?.fiber.dispose(); oldHome === undefined ? delete process.env.DSH_HOME : process.env.DSH_HOME = oldHome; await rm(root, { recursive: true, force: true }) })
  boot.initProfile(profileDir, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
  manifest.dependencies['dsh-workflow'] = `file:${resolve('.')}`
  await writeFile(join(profileDir, 'package.json'), JSON.stringify(manifest))
  await mkdir(join(profileDir, 'node_modules'), { recursive: true })
  await symlink(resolve('.'), join(profileDir, 'node_modules/dsh-workflow'))
  const center = { id: 'workflow-jev-center', name: 'previous-observation/jev-center', disabled, config: { engines: [] } }
  const monitor = { id: 'workflow-agent-monitor', name: 'previous-observation/agent-monitor', disabled,
    config: { directory: join(root, 'monitor'), jevModelName: 'saved-model', checkIntervalMs: 17 } }
  const user = { id: 'user-plugin', name: 'user-choice', disabled: true, config: { keep: true } }
  const patches = [
    { insert: [center, monitor, user] },
    { id: center.id, name: center.name, config: center.config },
    { id: monitor.id, name: monitor.name, config: monitor.config },
    { id: 'webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
    { id: 'settings', config: { path: join(root, 'settings.yaml'), watch: false } },
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
  ]
  await writeFile(join(profileDir, 'cordis.patch.yml'), JSON.stringify(patches))
  await writeFile(join(profileDir, 'cordis.yml'), '[]\n')
  await ensureObservationProfile({ profile: boot.loadProfile('dsh', 'web', anchor, home), anchor, catalogRoot: root, projectRoot: resolve('.') })
  const profile = boot.loadProfile('dsh', 'web', anchor, home)
  const layers = [...profile.layers.map(layer => layer.patches), profile.patches]
  const entries = boot.composeEntries(layers)
  for (const [before, name] of [[center, 'dsh-workflow/jev-center'], [monitor, 'dsh-workflow/agent-monitor']]) {
    const actual = entries.filter(row => row.id === before.id)
    assert.equal(actual.length, 1)
    assert.deepEqual(actual[0], { ...before, name })
  }
  assert.deepEqual(entries.find(row => row.id === user.id), user)
  const resolution = await boot.createRuntimeResolution({ installAnchor: anchor, profile })
  ctx = await boot.boot('observation-migration', join(profileDir, 'cordis.yml'), layers.flat(), async c => {
    c.provide('profileContext', { name: 'web', dir: profileDir, patchPath: profile.patchPath, installAnchor: anchor, cwd: root, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays: [] })
    provideCmdline(c, { args: [], exit: () => {}, ready: { onReady: listener => { listener(); return () => {} } } })
    await c.plugin(boot.PluginPackages, { resolution })
  })
  assert.equal(Boolean(ctx.get('jevCenter')), !disabled)
  assert.equal(Boolean(ctx.get('agentMonitor')), !disabled)
  if (!disabled) assert.equal(ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === 'workflow-agent-monitor').value.checkIntervalMs, 17)
  const saved = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
  assert.equal(await ensureObservationProfile({ profile, anchor, catalogRoot: root, projectRoot: resolve('.') }), false)
  assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), saved)
})
