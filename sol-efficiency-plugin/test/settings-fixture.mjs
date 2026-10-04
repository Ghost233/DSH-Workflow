import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { initProfile, mountRootInclude, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import Hmr from '@deepseek-ai/dsh-hmr'

/** Exercise settings against the profile patch that DSH 0.2 actually persists. */
export async function mountSettingsProfile(ctx, home, configPath) {
  ctx.baseUrl = pathToFileURL(home + '/').href
  const dir = join(home, 'profile')
  initProfile(dir, ['sol-test-bundle'])
  const bundle = join(dir, 'node_modules/sol-test-bundle')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(home, 'package.json'), '{"name":"sol-test-installation"}\n')
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'sol-test-bundle', version: '1.0.0',
    dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: yaml.load(await readFile(configPath, 'utf8')) }]))
  const rootPath = join(dir, 'cordis.yml')
  await writeFile(rootPath, '[]\n')
  const profile = { name: 'sol-test', startedBundles: ['sol-test-bundle'], dir,
    patchPath: join(dir, 'cordis.patch.yml'), installAnchor: join(home, 'package.json'),
    cwd: home, home, overlays: [], telemetryDisabledEnv: undefined }
  ctx.provide('profileContext', profile)
  ctx.provide('appReady', { onReady(listener) { listener(); return () => {} } })
  await ctx.plugin(ConfigEditor)
  await ctx.plugin(Settings)
  const entry = await mountRootInclude(ctx, rootPath, readProfilePatches('sol-test', profile))
  await ctx.loader.await()
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 }).await()
  await ctx.hmr.runExclusive(async () => {})
  return { id: entry.id, settingsPath: profile.patchPath }
}
