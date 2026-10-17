import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { readPluginConfiguration, assertProfilePluginVersions, assertPackageMaintenanceResource } from './plugin-configuration.mjs'

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

/** Repository-delivered profiles have no independently replaceable runtime packages. */
export function updateCandidates() { return [] }

async function installedVersion(profile, name) {
  try {
    const manifest = await readJson(join(profile, 'node_modules', ...name.split('/'), 'package.json'))
    return manifest.name === name ? manifest.version : undefined
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function runProfileUpdate({ resources, home, candidates, registry, profileName = 'web', synchronize = false }) {
  const cli = join(resources, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  const runner = join(resources, 'workflow/macos-launcher/runtime/run-dsh.mjs')
  const pnpm = join(resources, 'node_modules/pnpm/bin/pnpm.mjs')
  const shim = join(resources, 'bin/pnpm')
  if (![cli, pnpm, shim, runner].every(existsSync)) throw new Error('应用缺少 DSH 或 pnpm 更新运行时，请重新构建应用')
  const execute = args => new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: resources, env: {
      ...process.env, DSH_HOME: home, PATH: `${join(resources, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
    }, stdio: ['ignore', 'pipe', 'pipe'] })
    let diagnostics = ''
    const collect = data => { diagnostics = (diagnostics + data.toString('utf8')).slice(-16_000) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept()
      : reject(new Error(`DSH 插件更新失败（${signal ?? code}）：${diagnostics.slice(-1000)}`)))
  })
  await execute([runner, resources, 'plugin', '--profile', profileName, 'add', ...candidates.map(row => `${row.name}@${row.latest}`), '--save-exact',
    ...(synchronize ? ['--workflow-sync'] : []),
    ...(registry ? ['--registry', registry] : [])])
  if (profileName !== 'desktop') await execute([cli, '--profile', profileName, '--dump-config'])
}

/** Add marked project plugins to the Web profile before its DSH engine starts. */
export async function ensureStartupPlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  run = runProfileUpdate } = {}) {
  const resources = resolve(resourcesRoot)
  const list = await readPluginConfiguration(resources, home)
  if (!list) throw new Error('Missing project plugin configuration')
  const profile = join(home, 'profiles/web')
  const result = { added: [], already: [], skipped: [] }
  await assertProfilePluginVersions(profile, list)
  for (const item of list.plugins.filter(row => row.startup === true)) {
    try {
      const before = await readJson(join(profile, 'package.json')).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      const current = await installedVersion(profile, item.package)
      if (current && before?.dsh?.profile?.bundles?.includes(item.package)) {
        result.already.push({ name: item.package, version: current })
        continue
      }
      const target = item.version
      await assertProfilePluginVersions(profile, list)
      assertPackageMaintenanceResource(resources)
      await run({ resources, home, candidates: [{ name: item.package, latest: target }], registry: list.registry })
      const after = await readJson(join(profile, 'package.json'))
      if (await installedVersion(profile, item.package) !== target
        || !after.dsh?.profile?.bundles?.includes(item.package)) throw new Error('DSH did not enable the selected plugin')
      await assertProfilePluginVersions(profile, list)
      result.added.push({ name: item.package, version: target })
    } catch (error) {
      result.skipped.push({ name: item.package, reason: String(error.message ?? error).slice(0, 500) })
    }
  }
  return result
}

/** Runtime package changes are delivered only through the repository DMG. */
export async function updateProfilePlugins() {
  throw new Error('运行端插件随本仓库正式 DMG 统一更新，请在启动器中检查应用更新。')
}

export const synchronizeProfilePlugins = updateProfilePlugins

if (import.meta.main) {
  try {
    const onlyIndex = process.argv.indexOf('--only')
    const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1]?.split(',') : undefined
    if (!process.argv[2] || onlyIndex >= 0 && !only) {
      throw new Error('Usage: plugin-update.mjs RESOURCES [--only name1,name2]')
    }
    const operation = process.argv.includes('--sync') ? synchronizeProfilePlugins : updateProfilePlugins
    process.stdout.write(JSON.stringify(await operation({ resourcesRoot: process.argv[2], only })) + '\n')
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }
}
