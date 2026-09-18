import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPluginVersions } from './plugin-versions.mjs'

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const owned = new Set(['dsh-owner-workflow', 'dsh-sol-efficiency', 'dsh-approve-for-me-workflow'])

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

async function runProfileUpdate({ resources, home, candidates }) {
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
  await execute([cli, 'plugin', '--profile', 'web', 'add', ...candidates.map(row => `${row.name}@${row.latest}`), '--save-exact'])
  await execute([cli, '--profile', 'web', '--dump-config'])
}

/** Update eligible profile packages on disk. Never restart or alter packaged plugins. */
export async function updateProfilePlugins({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  check = checkPluginVersions, run = runProfileUpdate } = {}) {
  const resources = resolve(resourcesRoot)
  const profile = join(home, 'profiles/web')
  const report = await check({ resourcesRoot: resources, home })
  const available = updateCandidates(report)
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
    if (!process.argv[2]) throw new Error('Usage: plugin-update.mjs RESOURCES')
    process.stdout.write(JSON.stringify(await updateProfilePlugins({ resourcesRoot: process.argv[2] })) + '\n')
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }
}
