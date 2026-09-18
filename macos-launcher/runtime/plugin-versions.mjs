import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org/'
const owned = [
  ['dsh-owner-workflow', 'owner-workflow-plugin'],
  ['dsh-sol-efficiency', 'sol-efficiency-plugin'],
  ['dsh-approve-for-me-workflow', 'approve-for-me-workflow-plugin'],
]
const agentTeams = [
  '@deepseek-ai/dsh-experimental-agent-team-profile',
  '@deepseek-ai/dsh-experimental-agent-team-web-profile',
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

async function installedVersion(profile, name) {
  const manifest = await jsonFile(join(profile, 'node_modules', ...name.split('/'), 'package.json'))
  return manifest?.name === name && typeof manifest.version === 'string' ? manifest.version : undefined
}

export async function checkPluginVersions({ resourcesRoot, home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  fetchLatest = async name => {
    const response = await fetch(new URL(encodeURIComponent(name), registry), {
      headers: { accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(7000),
    })
    if (!response.ok) throw new Error(`npm registry HTTP ${response.status}`)
    const metadata = await response.json()
    if (metadata.name !== name || typeof metadata['dist-tags']?.latest !== 'string') {
      throw new Error('npm registry metadata is incomplete')
    }
    return metadata['dist-tags'].latest
  } } = {}) {
  const resources = resolve(resourcesRoot)
  const workflow = join(resources, 'workflow')
  const rows = []
  const profile = join(home, 'profiles', 'web')
  const profileManifest = await jsonFile(join(profile, 'package.json'))
  for (const [name, spec] of Object.entries(profileManifest?.dependencies ?? {})) {
    if (!packageName(name) || typeof spec !== 'string') continue
    const current = await installedVersion(profile, name)
    const local = /^(?:file:|link:|workspace:|git\+|https?:|\.\.?\/|\/)/.test(spec)
    rows.push({ source: 'DSH Web profile', name, current: current ?? (exactVersion(spec) ? spec : null),
      latest: null, status: local ? 'local' : 'pending',
      note: local ? '本地或 Git 依赖；不按 npm latest 判断' : current ? '当前已安装版本' : '未找到已安装包；仅显示声明版本' })
  }
  for (const name of profileManifest?.dsh?.profile?.bundles ?? []) {
    if (typeof name !== 'string' || rows.some(row => row.name === name)) continue
    if (!packageName(name)) {
      rows.push({ source: 'DSH Web profile Bundle', name, current: null, latest: null,
        status: 'local', note: '路径型 Bundle；不按 npm latest 判断' })
      continue
    }
    const bundled = name.startsWith('@deepseek-ai/dsh-')
    const manifest = bundled ? await jsonFile(join(resources, 'node_modules', ...name.split('/'), 'package.json')) : undefined
    const current = manifest?.name === name ? manifest.version : await installedVersion(profile, name)
    rows.push({ source: bundled ? 'DSH 内置 Bundle' : 'DSH Web profile Bundle', name,
      current: current ?? null, latest: null, status: bundled ? 'coupled' : 'pending',
      note: bundled ? '随打包的 DSH 更新，不能单独升级' : 'profile Bundle；未在 dependencies 声明' })
  }

  const projectManifestPath = join(workflow, 'project-plugins.json')
  const projectManifestBytes = existsSync(projectManifestPath) ? await readFile(projectManifestPath) : undefined
  const projectManifest = projectManifestBytes ? JSON.parse(projectManifestBytes) : undefined
  const projectLock = await jsonFile(join(workflow, 'project-plugins.lock.json'))
  const lockMatches = projectManifestBytes && projectLock?.manifestSha256 === createHash('sha256').update(projectManifestBytes).digest('hex')
  for (const item of projectManifest?.plugins ?? []) {
    if (!packageName(item.package)) continue
    const pinned = projectLock?.plugins?.find(row => row.package === item.package)?.version
    rows.push({ source: '项目插件锁定清单（打包快照）', name: item.package,
      current: typeof pinned === 'string' ? pinned : null, latest: null,
      status: projectManifest.registry === registry ? 'pending' : 'unsupported',
      note: projectManifest.registry !== registry ? '非 npm 公共 registry，未查询'
        : lockMatches ? '与打包时清单一致' : '锁定清单缺失或与打包时配置不一致' })
  }

  for (const [name, directory] of owned) {
    const manifest = await jsonFile(join(workflow, directory, 'package.json'))
    if (manifest?.name === name) rows.push({ source: 'App 内置自研插件', name, current: manifest.version,
      latest: null, status: 'bundled', note: '随 App 构建更新，不在运行中替换' })
  }
  for (const name of agentTeams) {
    if (rows.some(row => row.name === name)) continue
    const manifest = await jsonFile(join(resources, 'node_modules', ...name.split('/'), 'package.json'))
    if (manifest?.name === name) rows.push({ source: 'DSH 版本绑定插件', name, current: manifest.version,
      latest: null, status: 'coupled', note: '与当前 DSH 版本绑定；不能单独升级' })
  }

  const pending = rows.filter(row => row.status === 'pending')
  const latestByName = new Map()
  await Promise.all(pending.map(async row => {
    if (!latestByName.has(row.name)) latestByName.set(row.name, Promise.resolve().then(() => fetchLatest(row.name)))
    try {
      row.latest = await latestByName.get(row.name)
      const comparison = row.current ? compareVersions(row.current, row.latest) : null
      row.status = comparison === -1 ? 'newer' : comparison === 0 ? 'current'
        : comparison === 1 ? 'ahead' : 'unknown'
    } catch (error) { row.status = 'error'; row.note = String(error.message).slice(0, 180) }
  }))
  return { checkedAt: new Date().toISOString(), rows }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: plugin-versions.mjs RESOURCES')
    process.stdout.write(JSON.stringify(await checkPluginVersions({ resourcesRoot: process.argv[2] })) + '\n')
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  }
}
