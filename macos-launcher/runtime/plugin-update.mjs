import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPluginVersions } from './plugin-versions.mjs'

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const packageNamePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i
const owned = new Set(['dsh-owner-workflow', 'dsh-sol-efficiency'])

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

/** Only npm-hosted Web-profile plugins may change independently of the packaged DSH/App. */
export function updateCandidates(report) {
  return report.rows.filter(row => row.source === 'DSH Web profile' && row.status === 'newer'
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

async function runProfileUpdate({ resources, home, candidates, registry }) {
  const cli = join(resources, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  const pnpm = join(resources, 'node_modules/pnpm/bin/pnpm.mjs')
  const shim = join(resources, 'bin/pnpm')
  if (![cli, pnpm, shim].every(existsSync)) throw new Error('应用缺少 DSH 或 pnpm 更新运行时，请重新构建应用')
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
  await execute([cli, 'plugin', '--profile', 'web', 'add', ...candidates.map(row => `${row.name}@${row.latest}`), '--save-exact',
    ...(registry ? ['--registry', registry] : [])])
  await execute([cli, '--profile', 'web', '--dump-config'])
}

/** Add marked project plugins to the Web profile before its DSH engine starts. */
export async function ensureStartupPlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  run = runProfileUpdate } = {}) {
  const resources = resolve(resourcesRoot)
  const workflow = join(resources, 'workflow')
  const listBytes = await readFile(join(workflow, 'project-plugins.json'))
  const list = JSON.parse(listBytes)
  const lock = await readJson(join(workflow, 'project-plugins.lock.json'))
  const runtime = await readJson(join(workflow, 'dsh-runtime.json'))
  if (lock.schema !== 1 || lock.harnessVersion !== runtime.version || lock.registry !== list.registry
    || new URL(list.registry).protocol !== 'https:' || !Array.isArray(lock.plugins)
    || lock.plugins.length !== list.plugins.length
    || lock.manifestSha256 !== createHash('sha256').update(listBytes).digest('hex')) {
    throw new Error('Project plugin lock does not match the packaged manifest')
  }
  const profile = join(home, 'profiles/web')
  const result = { added: [], already: [], skipped: [] }
  for (const item of list.plugins.filter(row => row.startup === true)) {
    try {
      const pinned = lock.plugins.find(row => row.package === item.package)
      if (!packageNamePattern.test(item.package) || !pinned || !versionPattern.test(pinned.version)
        || pinned.metadata?.name !== item.package || pinned.metadata?.version !== pinned.version) {
        throw new Error('Missing or invalid published package pin')
      }
      const before = await readJson(join(profile, 'package.json')).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      const current = await installedVersion(profile, item.package)
      if (current && before?.dsh?.profile?.bundles?.includes(item.package)) {
        result.already.push({ name: item.package, version: current })
        continue
      }
      const target = current && versionPattern.test(current) ? current : pinned.version
      await run({ resources, home, candidates: [{ name: item.package, latest: target }], registry: list.registry })
      const after = await readJson(join(profile, 'package.json'))
      if (await installedVersion(profile, item.package) !== target
        || !after.dsh?.profile?.bundles?.includes(item.package)) throw new Error('DSH did not enable the selected plugin')
      result.added.push({ name: item.package, version: target })
    } catch (error) {
      result.skipped.push({ name: item.package, reason: String(error.message ?? error).slice(0, 500) })
    }
  }
  return result
}

/** Update eligible profile packages on disk. Never restart or alter packaged plugins. */
export async function updateProfilePlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  only, check = checkPluginVersions, run = runProfileUpdate } = {}) {
  const selection = only === undefined ? undefined : new Set(only)
  if (selection !== undefined && (selection.size === 0 || [...selection].some(name => !packageNamePattern.test(name)))) {
    throw new Error('Invalid plugin selection')
  }
  const resources = resolve(resourcesRoot)
  const profile = join(home, 'profiles/web')
  const report = await check({ resourcesRoot: resources, home })
  const available = updateCandidates(report).filter(row => selection === undefined || selection.has(row.name))
  if (available.length === 0) return { checkedAt: report.checkedAt, updated: [], failedChecks: report.rows.filter(row => row.status === 'error').length }
  const profileManifest = await readJson(join(profile, 'package.json'))
  const enabled = new Set(profileManifest.dsh?.profile?.bundles ?? [])
  const candidates = available.filter(row => enabled.has(row.name))
  if (candidates.length === 0) return { checkedAt: report.checkedAt, updated: [], failedChecks: report.rows.filter(row => row.status === 'error').length }
  const before = new Map(await Promise.all(candidates.map(async row => [row.name, await installedVersion(profile, row.name)])))
  let failure
  try { await run({ resources, home, candidates }) }
  catch (error) { failure = String(error.message ?? error).slice(-1000) }
  const manifest = await readJson(join(profile, 'package.json'))
  const updated = []
  for (const row of candidates) {
    const actual = await installedVersion(profile, row.name)
    if (actual && before.get(row.name) !== actual) updated.push({ name: row.name, from: before.get(row.name) ?? null, to: actual })
    if (!failure && (actual !== row.latest || !manifest.dsh?.profile?.bundles?.includes(row.name))) {
      failure = `DSH 未完整启用更新后的插件：${row.name}`
    }
  }
  return { checkedAt: report.checkedAt, updated, failedChecks: report.rows.filter(row => row.status === 'error').length,
    ...(failure ? { error: failure } : {}) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const onlyIndex = process.argv.indexOf('--only')
    const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1]?.split(',') : undefined
    if (!process.argv[2] || onlyIndex >= 0 && !only) {
      throw new Error('Usage: plugin-update.mjs RESOURCES [--only name1,name2]')
    }
    process.stdout.write(JSON.stringify(await updateProfilePlugins({ resourcesRoot: process.argv[2], only })) + '\n')
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }
}
