import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isProfilePlugin } from '../../agent-observation-plugin/src/delivery-manifest.mjs'
import { readPluginConfiguration } from './plugin-configuration.mjs'
import { compareVersions, exactVersion, isRegistryDependency } from './plugin-versions.mjs'
import { redact } from './service-control.mjs'

export function validatePluginUpdates(targets) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 100
    || targets.some(target => !isRegistryDependency(target?.name, '') || !exactVersion(target.version))
    || new Set(targets.map(target => target.name)).size !== targets.length) {
    throw new Error('请选择有效的插件更新版本')
  }
}

export async function updateProfilePlugins({ resources, home, targets }) {
  validatePluginUpdates(targets)
  const config = await readPluginConfiguration(resources)
  if (config?.npmStartup !== 'profile') throw new Error('当前应用未启用 DSH profile 插件管理')
  const installAnchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(installAnchor)
  const { runProfilePnpm } = require('@deepseek-ai/dsh-plugin-manager/operations')
  const { withFileLock } = require('@deepseek-ai/dsh-atomic-write')
  const dir = join(home, 'profiles/desktop')
  const profilePath = join(dir, 'package.json')
  return withFileLock(profilePath, async () => {
    const results = []
    for (const { name, version } of targets) {
      try {
        const profile = JSON.parse(await readFile(profilePath, 'utf8'))
        const pinned = config.plugins.find(item => item.package === name)
        const packagePath = join(dir, 'node_modules', name, 'package.json')
        const installed = JSON.parse(await readFile(packagePath, 'utf8'))
        if (pinned && !isProfilePlugin(config, pinned) || name.startsWith('@deepseek-ai/dsh-')
          || !isRegistryDependency(name, profile.dependencies?.[name]) || installed.name !== name || !installed.dsh?.bundle) {
          throw new Error('仅可更新当前 DSH profile 里从 npm 安装的插件')
        }
        if (compareVersions(version, installed.version) !== 1) {
          results.push({ name, version: installed.version, status: 'skipped', message: '已安装相同或更新的版本' })
          continue
        }
        const result = await runProfilePnpm({ profile: 'desktop', dir, home, cwd: dir, installAnchor },
          ['add', `${name}@${version}`, '--save-exact', '--ignore-scripts', `--registry=${config.registry}`], {
            command: join(resources, 'bin/pnpm'), execution: 'service', env: { CI: 'true', DSH_HOME: home },
            activateNewBundles: false, expected: { name, version }, outputBytes: 4096,
            idleTimeoutMs: 90_000, lookupTimeoutMs: 60_000,
          })
        if (result.exitCode !== 0 || result.timedOut) {
          throw new Error(redact(result.output?.trim().slice(-750) || 'DSH 包管理更新失败'))
        }
        const after = JSON.parse(await readFile(packagePath, 'utf8'))
        if (after.name !== name || after.version !== version) throw new Error('更新后的安装版本与请求不一致')
        results.push({ name, version, status: 'updated' })
      } catch (error) {
        results.push({ name, version, status: 'failed', message: redact(error.message) })
      }
    }
    return results
  }, { waitMs: 120_000 })
}
