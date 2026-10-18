import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readPluginConfiguration } from './plugin-configuration.mjs'

const owned = [
  ['dsh-workflow', 'agent-observation-plugin'],
  ['dsh-workflow-matt-panel', 'matt-skills-panel-plugin/package'],
]
const agentTeams = [
  '@deepseek-ai/dsh-experimental-agent-team-profile',
]
const packageName = value => /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value)
const exactVersion = value => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)

async function jsonFile(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

/** A small, strict SemVer ordering for reporting only. No package install decisions use it. */
export function compareVersions(current, latest) {
  const parse = value => {
    if (!exactVersion(value)) return undefined
    const clean = value.split('+', 1)[0]
    const hyphen = clean.indexOf('-')
    const core = hyphen < 0 ? clean : clean.slice(0, hyphen)
    const prerelease = hyphen < 0 ? undefined : clean.slice(hyphen + 1)
    return { core: core.split('.').map(Number), prerelease: prerelease?.split('.') }
  }
  const a = parse(current), b = parse(latest)
  if (!a || !b) return null
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return Math.sign(a.core[i] - b.core[i])
  if (!a.prerelease && !b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    if (a.prerelease[i] === undefined) return -1
    if (b.prerelease[i] === undefined) return 1
    const x = a.prerelease[i], y = b.prerelease[i]
    if (x === y) continue
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    if (nx && ny) return Math.sign(Number(x) - Number(y))
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

function compatibleDshReleases(compatibility) {
  return Object.entries(compatibility?.dshReleases ?? {})
    .filter(([version, status]) => status === 'compatible' && exactVersion(version))
    .map(([version]) => version)
    .sort((a, b) => compareVersions(a, b) ?? 0)
}

export function declaredDshVersions(manifest) {
  if (!manifest) return '无法读取'
  const compatibility = manifest.dsh?.compatibility
  const range = compatibility?.dsh
  if (typeof range === 'string' && range.trim()) return range.trim()
  const releases = compatibleDshReleases(compatibility)
  return releases.length ? `${releases.join('、')}（明确标注）` : '未声明'
}

export function latestDeclaredDsh(manifest) {
  if (!manifest) return '无法读取'
  const compatibility = manifest.dsh?.compatibility
  const latest = compatibleDshReleases(compatibility).at(-1)
  if (typeof compatibility?.dsh === 'string' && compatibility.dsh.trim()) {
    return latest ? `未给精确最高版；逐版标注至 ${latest}` : '未给精确最高版'
  }
  return latest ? `${latest}（逐版标注）` : '未声明'
}

async function installedPackage(profile, name) {
  const manifest = await jsonFile(join(profile, 'node_modules', ...name.split('/'), 'package.json'))
  return manifest?.name === name && typeof manifest.version === 'string' ? manifest : undefined
}

/** Inspect local package files only; repository DMGs own version changes. */
export async function checkPluginVersions({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  profileName = existsSync(join(resourcesRoot, 'desktop/DeepSeek Harness.app')) ? 'desktop' : 'web' } = {}) {
  const resources = resolve(resourcesRoot)
  const workflow = join(resources, 'workflow')
  const rows = []
  const profile = join(home, 'profiles', profileName)
  const profileSource = profileName === 'desktop' ? 'DSH Desktop profile' : 'DSH Web profile'
  const profileManifest = await jsonFile(join(profile, 'package.json'))
  for (const [name, spec] of Object.entries(profileManifest?.dependencies ?? {})) {
    if (!packageName(name) || typeof spec !== 'string') continue
    let installed
    try { installed = await installedPackage(profile, name) }
    catch (error) {
      rows.push({ source: profileSource, name, current: null, latest: null, status: 'error',
        supportedDsh: '无法读取', latestSupportedDsh: '无法读取',
        note: `无法读取已安装插件：${String(error.message).slice(0, 180)}` })
      continue
    }
    const current = installed?.version
    const local = /^(?:file:|link:|workspace:|git\+|https?:|\.\.?\/|\/)/.test(spec)
    rows.push({ source: profileSource, name, current: current ?? null,
      latest: null, status: local ? 'local' : current ? 'installed' : 'unknown',
      supportedDsh: declaredDshVersions(installed),
      latestSupportedDsh: latestDeclaredDsh(installed),
      note: local ? '本地或 Git 依赖；随本仓库 DMG 更新' : current ? '实际安装版本；不查询 npm latest' : '未找到实际安装包；不把依赖声明当成实际版本' })
  }
  for (const name of profileManifest?.dsh?.profile?.bundles ?? []) {
    if (typeof name !== 'string' || rows.some(row => row.name === name)) continue
    if (!packageName(name)) {
      rows.push({ source: `${profileSource} Bundle`, name, current: null, latest: null,
        status: 'local', note: '路径型 Bundle；不按 npm latest 判断' })
      continue
    }
    const bundled = name.startsWith('@deepseek-ai/dsh-')
    const manifest = bundled ? await jsonFile(join(resources, 'node_modules', ...name.split('/'), 'package.json'))
      : await installedPackage(profile, name)
    const current = manifest?.name === name ? manifest.version : undefined
    rows.push({ source: bundled ? 'DSH 内置 Bundle' : `${profileSource} Bundle`, name,
      current: current ?? null, latest: null, status: bundled ? 'coupled' : current ? 'untracked' : 'unknown',
      ...(bundled ? {} : { supportedDsh: declaredDshVersions(manifest), latestSupportedDsh: latestDeclaredDsh(manifest) }),
      note: bundled ? '随打包的 DSH 更新，不能单独升级' : 'profile Bundle；未在 dependencies 声明' })
  }

  const projectManifestPath = join(workflow, 'project-plugins.json')
  const projectManifestBytes = existsSync(projectManifestPath) ? await readFile(projectManifestPath) : undefined
  const projectManifest = projectManifestBytes ? JSON.parse(projectManifestBytes) : undefined
  const projectLock = await jsonFile(join(workflow, 'project-plugins.lock.json'))
  const lockMatches = projectManifestBytes && projectLock?.manifestSha256 === createHash('sha256').update(projectManifestBytes).digest('hex')
  let configuration, configurationError
  try { configuration = await readPluginConfiguration(resources) }
  catch (error) { configurationError = error.message }
  const verifiedLock = lockMatches && configuration !== undefined
  const runtime = await jsonFile(join(workflow, 'dsh-runtime.json'))
  for (const item of projectManifest?.plugins ?? []) {
    if (!packageName(item.package)) continue
    const pinned = projectLock?.plugins?.find(row => row.package === item.package)
    rows.push({ source: '项目插件锁定清单（打包快照）', name: item.package,
      current: null, expected: verifiedLock && typeof pinned?.version === 'string' ? pinned.version : null, latest: null,
      supportedDsh: declaredDshVersions(verifiedLock ? pinned?.metadata : undefined),
      latestSupportedDsh: latestDeclaredDsh(verifiedLock ? pinned?.metadata : undefined),
      status: verifiedLock ? 'expected' : 'error',
      note: verifiedLock ? `仓库固定清单；来源 ${projectManifest.registry}；不代表已安装或已加载，随本仓库 DMG 更新`
        : `锁定清单无法验证：${configurationError ?? '与打包配置不一致'}` })
  }

  for (const [name, directory] of owned) {
    const manifest = await jsonFile(join(workflow, directory, 'package.json'))
    if (manifest?.name === name) {
      const panel = name === 'dsh-workflow-matt-panel'
      const upstream = panel ? await jsonFile(join(workflow, 'matt-skills-panel-plugin/upstream.json')) : undefined
      rows.push({ source: panel ? 'App 内置派生插件' : 'App 内置自研插件', name, current: manifest.version,
        expected: manifest.version, latest: null, status: 'bundled', note: panel ? `上游基准 ${upstream?.version ?? '未知'}；随 App 构建更新` : '随 App 构建更新，不在运行中替换' })
    }
  }
  const mattZh = await jsonFile(join(workflow, 'vendor/mattpocock-skills-zh/.codex-plugin/plugin.json'))
  if (mattZh?.name === 'mattpocock-skills-zh') rows.push({ source: 'App 内置中文技能', name: mattZh.name,
    current: mattZh.version, expected: mattZh.version, latest: null, status: 'bundled', supportedDsh: '未声明', latestSupportedDsh: '未声明',
    note: '启动时由 DSH 技能文件提供器加载；随 App 构建更新' })
  for (const name of agentTeams) {
    if (rows.some(row => row.name === name)) continue
    const manifest = await jsonFile(join(resources, 'node_modules', ...name.split('/'), 'package.json'))
    if (manifest?.name === name) rows.push({ source: 'DSH 版本绑定插件', name, current: manifest.version,
      expected: runtime?.version ?? null, latest: null, status: 'coupled', note: '与当前 DSH 版本绑定；随本仓库 DMG 更新' })
  }

  for (const row of rows) {
    row.updatable = false
    row.latest = null
    if (row.expected === undefined) row.expected = row.source === 'DSH 内置 Bundle' ? runtime?.version ?? null : null
    if (row.source !== profileSource) {
      if (row.current !== null && row.expected !== null && row.current !== row.expected) {
        row.status = 'drift'; row.note = `仓库固定 ${row.expected}，实际打包 ${row.current}；随本仓库 DMG 更新`
      }
      continue
    }
    const configuredTarget = configuration?.plugins?.find(item => item.package === row.name)?.version
    const target = configuredTarget
      ?? rows.find(item => item.name === row.name && item.status === 'bundled')?.expected
      ?? (row.name.startsWith('@deepseek-ai/dsh-') ? runtime?.version : undefined)
    row.expected = exactVersion(target) ? target : null
    const declared = profileManifest?.dependencies?.[row.name] ?? null
    row.declared = exactVersion(declared) ? declared : declared === null ? null
      : /^(?:file:|link:|workspace:)/.test(declared) ? '本地引用' : '非精确版本引用'
    if (row.status === 'error') continue
    if (row.expected) {
      const declarationMismatch = configuredTarget ? declared !== row.expected : exactVersion(declared) && declared !== row.expected
      row.status = row.current === null ? 'unknown' : row.current !== row.expected || declarationMismatch ? 'drift' : 'fixed'
      row.note = `仓库固定 ${row.expected}，依赖声明 ${row.declared ?? '缺失'}，实际安装 ${row.current ?? '未知'}；随本仓库 DMG 更新`
    } else if (configurationError) {
      row.status = 'unknown'; row.note = `实际安装 ${row.current ?? '未知'}；仓库固定值无法验证：${configurationError}`
    } else if (row.status === 'installed') {
      row.status = 'untracked'; row.note = '实际安装包未列入仓库固定清单；不查询 npm latest，不在运行端替换'
    }
  }
  return { checkedAt: new Date().toISOString(), rows, actualScope: 'installed-files', policy: '随本仓库 DMG 统一更新；本地盘点不代表已经在 Host 加载' }
}

if (import.meta.main) {
  try {
    if (!process.argv[2]) throw new Error('Usage: plugin-versions.mjs RESOURCES')
    process.stdout.write(JSON.stringify(await checkPluginVersions({ resourcesRoot: process.argv[2] })) + '\n')
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }
}
