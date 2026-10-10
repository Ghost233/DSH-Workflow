import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPluginVersions } from './plugin-versions.mjs'
import { readPluginConfiguration, savePluginConfiguration, assertProfilePluginVersions } from './plugin-configuration.mjs'

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const packageNamePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i
const owned = new Set(['dsh-workflow', 'dsh-mattpocock-skills-deck', 'dsh-workflow-matt-panel'])

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

/** Only npm-hosted Web-profile plugins may change independently of the packaged DSH/App. */
export function updateCandidates(report) {
  return report.rows.filter(row => ['DSH Web profile', 'DSH Desktop profile'].includes(row.source) && row.status === 'newer'
    && !row.name.startsWith('@deepseek-ai/') && !owned.has(row.name)
    && typeof row.latest === 'string' && versionPattern.test(row.latest))
}

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
  await savePluginConfiguration(home, list)
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

/** Update eligible profile packages on disk. Never restart or alter packaged plugins. */
export async function updateProfilePlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  profileName = existsSync(join(resourcesRoot, 'desktop/DeepSeek Harness.app')) ? 'desktop' : 'web',
  only, check = checkPluginVersions, run = runProfileUpdate } = {}) {
  const selection = only === undefined ? undefined : new Set(only)
  if (selection !== undefined && (selection.size === 0 || [...selection].some(name => !packageNamePattern.test(name)))) {
    throw new Error('Invalid plugin selection')
  }
  const resources = resolve(resourcesRoot)
  const profile = join(home, 'profiles', profileName)
  const config = await readPluginConfiguration(resources, home)
  await assertProfilePluginVersions(profile, config)
  const report = await check({ resourcesRoot: resources, home, profileName })
  const available = updateCandidates(report).filter(row => selection === undefined || selection.has(row.name))
  if (available.length === 0) return { checkedAt: report.checkedAt, updated: [], failedChecks: report.rows.filter(row => row.status === 'error').length }
  const profileManifest = await readJson(join(profile, 'package.json'))
  const enabled = new Set(profileManifest.dsh?.profile?.bundles ?? [])
  const candidates = available.filter(row => enabled.has(row.name))
  if (candidates.length === 0) return { checkedAt: report.checkedAt, updated: [], failedChecks: report.rows.filter(row => row.status === 'error').length }
  if (config) await savePluginConfiguration(home, config)
  const before = new Map(await Promise.all(candidates.map(async row => [row.name, await installedVersion(profile, row.name)])))
  let failure
  try { await run({ resources, home, candidates, profileName }) }
  catch (error) { failure = String(error.message ?? error).slice(-1000) }
  const manifest = await readJson(join(profile, 'package.json'))
  const updated = []
  for (const row of candidates) {
    const actual = await installedVersion(profile, row.name)
    if (actual && before.get(row.name) !== actual) updated.push({ name: row.name, from: before.get(row.name) ?? null, to: actual })
    if (!failure && (actual !== row.latest || manifest.dependencies?.[row.name] !== row.latest || !manifest.dsh?.profile?.bundles?.includes(row.name))) {
      failure = `DSH 未完整启用更新后的插件：${row.name}`
    }
  }
  if (config) {
    for (const item of config.plugins) {
      const row = candidates.find(row => row.name === item.package)
      if (row && await installedVersion(profile, row.name) === row.latest
        && manifest.dependencies?.[row.name] === row.latest) item.version = row.latest
    }
    await savePluginConfiguration(home, config)
    try { await assertProfilePluginVersions(profile, config, new Map(config.plugins.filter(item => profileManifest.dependencies?.[item.package] !== undefined).map(item => [item.package, item.version]))) }
    catch (error) { failure = [failure, error.message].filter(Boolean).join('；') }
  }
  return { checkedAt: report.checkedAt, updated, failedChecks: report.rows.filter(row => row.status === 'error').length,
    ...(failure ? { error: failure } : {}) }
}

/** Explicitly apply edited configuration to selected packages; never reconcile unrelated drift. */
export async function synchronizeProfilePlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  profileName = existsSync(join(resourcesRoot, 'desktop/DeepSeek Harness.app')) ? 'desktop' : 'web',
  only, run = runProfileUpdate } = {}) {
  const resources = resolve(resourcesRoot)
  const config = await readPluginConfiguration(resources, home)
  if (!config || !only?.length || only.some(name => !config.plugins.some(item => item.package === name))) {
    throw new Error('同步需要通过 --only 指定统一配置中的插件')
  }
  const selected = new Set(only)
  const profile = join(home, 'profiles', profileName)
  await assertProfilePluginVersions(profile, { ...config, plugins: config.plugins.filter(item => !selected.has(item.package)) })
  await savePluginConfiguration(home, config)
  const candidates = config.plugins.filter(item => selected.has(item.package)).map(item => ({ name: item.package, latest: item.version }))
  await run({ resources, home, candidates, profileName, registry: config.registry, synchronize: true })
  await assertProfilePluginVersions(profile, config)
  const manifest = await readJson(join(profile, 'package.json'))
  for (const row of candidates) {
    if (await installedVersion(profile, row.name) !== row.latest || manifest.dependencies?.[row.name] !== row.latest
      || !manifest.dsh?.profile?.bundles?.includes(row.name)) throw new Error(`插件同步未完成：${row.name}`)
  }
  return { synchronized: candidates.map(row => ({ name: row.name, version: row.latest })) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
