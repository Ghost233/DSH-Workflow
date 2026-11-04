import { constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { privateDirectory } from './service-control.mjs'
import { dedicatedPrepare } from './superagent-dedicated-repository.mjs'

const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const missing = promise => promise.catch(error => { if (error.code !== 'ENOENT') throw error })
const registry = dataRoot => join(resolve(dataRoot), 'superagent-projects')
const fields = ['name', 'repository', 'githubLogin', 'ghConfigDir', 'ghExecutable', 'feishuConfigDir', 'feishuProfile', 'larkExecutable',
  'localProjectDir', 'executionRoot', 'prepare', 'baseBranch', 'deploymentMode', 'authorName', 'authorEmail', 'githubAllowed', 'feishuChatId', 'feishuAllowedId']

export function projectDirectory(dataRoot, id) {
  if (id === 'legacy') return join(resolve(dataRoot), 'superagent')
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('无效的 Superagent 项目标识。')
  return join(registry(dataRoot), id)
}

async function directory(value, label) {
  if (!value) return ''
  if (!isAbsolute(value)) throw new Error(`${label}必须是绝对路径。`)
  const path = await realpath(value)
  if (!(await lstat(path)).isDirectory()) throw new Error(`${label}不是目录。`)
  return path
}

const overlaps = (a, b) => {
  const path = relative(a, b)
  return path === '' || path !== '..' && !path.startsWith('../') && !isAbsolute(path)
}

async function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效的 Superagent 项目配置。')
  const result = {}
  for (const key of fields) {
    const value = input[key] ?? ''
    if (typeof value !== 'string' || value.includes('\0') || value.length > (key === 'prepare' ? 16_384 : 4096)) throw new Error(`无效的项目字段：${key}`)
    result[key] = key === 'prepare' ? value : value.trim()
  }
  if (!result.name || result.name.length > 100) throw new Error('请填写项目名称。')
  if (result.deploymentMode && result.deploymentMode !== 'dedicated') throw new Error('Superagent 部署方式无效。')
  if (result.repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(result.repository)) throw new Error('GitHub 仓库应填写 owner/name。')
  if (result.githubLogin && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(result.githubLogin)) throw new Error('GitHub 账号名称无效。')
  if (result.githubAllowed && result.githubAllowed.split(/[,\s]+/).some(value => value && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value))) throw new Error('允许发起任务的 GitHub 账号无效。')
  if (result.feishuChatId && !/^oc_[A-Za-z0-9]+$/.test(result.feishuChatId)) throw new Error('飞书群标识无效。')
  if (result.feishuAllowedId && !/^ou_[A-Za-z0-9]+$/.test(result.feishuAllowedId)) throw new Error('飞书用户标识无效。')
  for (const [key, label] of [['ghConfigDir', 'GitHub 账号目录'], ['feishuConfigDir', '飞书机器人目录'],
    ['localProjectDir', '本地项目目录'], ['executionRoot', '执行目录']]) result[key] = await directory(result[key], label)
  result.extraWritableRoots = await normalizeWritableRoots(input.extraWritableRoots === undefined ? [] : input.extraWritableRoots)
  if (result.localProjectDir && result.executionRoot
    && (overlaps(result.localProjectDir, result.executionRoot) || overlaps(result.executionRoot, result.localProjectDir))) {
    throw new Error('执行目录不能与本地项目目录重叠。')
  }
  if ([result.githubLogin, result.authorName, result.authorEmail].some(value => /[\r\n]/.test(value))) throw new Error('账号和提交身份不能包含换行。')
  if (Boolean(result.authorName) !== Boolean(result.authorEmail)) throw new Error('提交作者姓名和邮箱需要一起填写。')
  if (input.executionEnabled !== undefined && typeof input.executionEnabled !== 'boolean') throw new Error('执行开关无效。')
  result.executionEnabled = input.executionEnabled === true
  if (input.preserveLegacyPolicy !== undefined && typeof input.preserveLegacyPolicy !== 'boolean') throw new Error('旧实例权限设置无效。')
  result.preserveLegacyPolicy = input.preserveLegacyPolicy === true
  if (input.policyManaged !== undefined) {
    if (typeof input.policyManaged !== 'boolean') throw new Error('接单设置管理开关无效。')
    result.policyManaged = input.policyManaged
  }
  for (const [key, values] of [['feishuListen', ['mentions', 'all']], ['acceptMode', ['observe', 'auto']]]) {
    if (input[key] !== undefined) {
      if (!values.includes(input[key])) throw new Error('消息接收或接单方式无效。')
      result[key] = input[key]
    }
  }
  if (input.acceptRules !== undefined) {
    if (!Array.isArray(input.acceptRules) || input.acceptRules.length > 30 || input.acceptRules.some(rule => !rule
      || !/^[a-zA-Z0-9_-]{1,80}$/.test(rule.id ?? '') || typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100
      || typeof rule.enabled !== 'boolean' || typeof rule.instruction !== 'string' || !rule.instruction.trim() || rule.instruction.length > 2000)
      || new Set(input.acceptRules.map(rule => rule.id)).size !== input.acceptRules.length) throw new Error('接单规则无效。')
    result.acceptRules = input.acceptRules.map(({ id, name, enabled, instruction }) => ({ id, name: name.trim(), enabled, instruction: instruction.trim() }))
  }
  if (result.policyManaged && result.acceptMode === 'auto' && !result.acceptRules?.some(rule => rule.enabled)) throw new Error('自动接单需要至少一条启用的规则。')
  if (result.executionEnabled && (!result.repository || !result.githubLogin || !result.ghConfigDir
    || !result.localProjectDir || !result.executionRoot || !result.prepare.trim())) {
    throw new Error('开启任务前请填写仓库、GitHub 账号、本地项目、执行目录和准备命令。')
  }
  return result
}

async function validateProjectRoots(dataRoot, config, id) {
  const conflicts = (a, b) => a && b && (overlaps(a, b) || overlaps(b, a))
  const extra = config.extraWritableRoots ?? []
  const station = await realpath(dataRoot)
  const common = (await getCommonWritableRoots(dataRoot)).roots
  if (extra.some(root => overlaps(root, homedir()) || conflicts(root, station)
    || [config.localProjectDir, config.executionRoot, config.ghConfigDir, config.feishuConfigDir].some(path => conflicts(root, path)))) {
    throw new Error('额外可写目录不能与 Station、账号或项目目录重叠。')
  }
  if (common.some(root => [config.localProjectDir, config.executionRoot, config.ghConfigDir, config.feishuConfigDir].some(path => conflicts(root, path)))) {
    throw new Error('公共可写目录不能与项目或账号目录重叠。')
  }
  if (extra.some(root => common.some(shared => root !== shared && conflicts(root, shared)))) {
    throw new Error('项目可写目录不能与公共可写目录嵌套。')
  }
  for (const other of await listSuperagentProjects(dataRoot)) {
    if (other.id === id) continue
    if (other.error) throw new Error('其他 Superagent 项目配置不可读取，无法确认目录隔离。')
    if (config.ghConfigDir && config.ghConfigDir === other.ghConfigDir && config.githubLogin && other.githubLogin
      && config.githubLogin.toLowerCase() !== other.githubLogin.toLowerCase()) {
      throw new Error('不同 GitHub 账号需要使用各自独立的 gh 配置目录。')
    }
    if (conflicts(config.executionRoot, other.executionRoot)
      || conflicts(config.executionRoot, other.localProjectDir) || conflicts(config.localProjectDir, other.executionRoot)) {
      throw new Error('任务目录不能与其他项目的任务目录或本地项目重叠。')
    }
    if (extra.some(root => [other.localProjectDir, other.executionRoot, other.ghConfigDir, other.feishuConfigDir].some(path => conflicts(root, path)))
      || (other.extraWritableRoots ?? []).some(root => [config.localProjectDir, config.executionRoot, config.ghConfigDir, config.feishuConfigDir].some(path => conflicts(root, path)))) {
      throw new Error('额外可写目录不能与其他项目或账号目录重叠。')
    }
  }
}

async function normalizeWritableRoots(roots) {
  if (!Array.isArray(roots) || roots.length > 50
    || roots.some(path => typeof path !== 'string' || !path || path.includes('\0') || path.length > 4096)) {
    throw new Error('额外可写目录无效。')
  }
  return [...new Set(await Promise.all(roots.map(path => directory(path, '额外可写目录'))))]
}

/** Read the shared grant without creating a configuration for existing installations. */
export async function getCommonWritableRoots(dataRoot) {
  const parent = registry(dataRoot), file = join(parent, 'common-writable-roots.json')
  const info = await missing(lstat(file))
  if (!info) return { revision: 0, roots: [] }
  await privateDirectory(parent, { create: false })
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.nlink !== 1 || (info.mode & 0o077)) {
    throw new Error('公共可写目录配置的权限不安全。')
  }
  const value = JSON.parse(await readFile(file, 'utf8'))
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.roots) || value.roots.length > 50
    || value.roots.some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) {
    throw new Error('公共可写目录配置无效。')
  }
  return { revision: value.revision, roots: value.roots }
}

async function validateCommonRoots(dataRoot, roots) {
  const station = await realpath(dataRoot)
  const conflicts = (a, b) => a && b && (overlaps(a, b) || overlaps(b, a))
  const projects = await listSuperagentProjects(dataRoot)
  if (projects.some(project => project.error)) throw new Error('其他 Superagent 项目配置不可读取，无法确认目录保护。')
  if (projects.some(project => project.extraWritableRoots !== undefined && !Array.isArray(project.extraWritableRoots))) {
    throw new Error('项目可写目录配置无效。')
  }
  if (roots.some(root => overlaps(root, homedir()) || conflicts(root, station)
    || projects.some(project => [project.localProjectDir, project.executionRoot, project.ghConfigDir, project.feishuConfigDir]
      .some(path => conflicts(root, path))
      || (project.extraWritableRoots ?? []).some(path => root !== path && conflicts(root, path))))) {
    throw new Error('公共可写目录不能与 Station、账号或项目目录重叠。')
  }
}

/** The caller holds the registry lock and ensures all Superagent instances are stopped. */
export async function saveCommonWritableRoots(dataRoot, input) {
  if (!input || typeof input !== 'object' || !Number.isSafeInteger(input.revision)) throw new Error('公共可写目录配置无效。')
  const current = await getCommonWritableRoots(dataRoot)
  if (current.revision !== input.revision) throw new Error('公共可写目录已被更改，请刷新后重试。')
  const roots = await normalizeWritableRoots(input.roots)
  await validateCommonRoots(dataRoot, roots)
  const parent = registry(dataRoot)
  await privateDirectory(parent)
  const file = join(parent, 'common-writable-roots.json'), temp = join(parent, `common-roots.${randomUUID()}.tmp`)
  const result = { revision: current.revision + 1, roots }
  try {
    await writeFile(temp, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temp, file)
  } finally { await missing(unlink(temp)) }
  return result
}

/** Recheck the saved physical paths and project isolation before starting a sandbox. */
export async function extraWritableRootsForProject(dataRoot, project) {
  const roots = project.extraWritableRoots ?? []
  if (!Array.isArray(roots) || roots.some(path => typeof path !== 'string' || !isAbsolute(path))) throw new Error('额外可写目录无效。')
  const resolved = await Promise.all(roots.map(path => directory(path, '额外可写目录')))
  if (resolved.some((path, index) => path !== roots[index])) throw new Error('额外可写目录已改变，请重新选择。')
  const common = (await getCommonWritableRoots(dataRoot)).roots
  const resolvedCommon = await Promise.all(common.map(path => directory(path, '公共可写目录')))
  if (resolvedCommon.some((path, index) => path !== common[index])) throw new Error('公共可写目录已改变，请重新选择。')
  await validateCommonRoots(dataRoot, resolvedCommon)
  await validateProjectRoots(dataRoot, { ...project, extraWritableRoots: resolved }, project.id)
  return [...new Set([...resolvedCommon, ...resolved])]
}

async function readProject(dataRoot, id) {
  const path = projectDirectory(dataRoot, id)
  await privateDirectory(path, { create: false })
  const file = join(path, id === 'legacy' ? 'station-project.json' : 'project.json'), info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Superagent 项目配置的权限不安全。')
  const project = JSON.parse(await readFile(file, 'utf8'))
  if (project.id !== id || !Number.isSafeInteger(project.revision) || project.revision < 1) throw new Error('Superagent 项目配置无效。')
  return project
}

export async function getSuperagentProject(dataRoot, id) {
  if (id === 'legacy') {
    const owner = await missing(lstat(join(projectDirectory(dataRoot, id), 'profile-owner.json')))
    if (!owner?.isFile()) throw new Error('原有 Superagent 配置不存在。')
    const configured = await missing(lstat(join(projectDirectory(dataRoot, id), 'station-project.json')))
    if (configured) return { ...await readProject(dataRoot, id), legacy: true }
    return { id, name: '原有 Superagent', legacy: true }
  }
  return readProject(dataRoot, id)
}

export async function listSuperagentProjects(dataRoot) {
  const rows = []
  const legacy = await missing(lstat(join(projectDirectory(dataRoot, 'legacy'), 'profile-owner.json')))
  const configured = await missing(lstat(join(projectDirectory(dataRoot, 'legacy'), 'station-project.json')))
  if (legacy?.isFile() && configured) {
    try {
      const project = await getSuperagentProject(dataRoot, 'legacy')
      if (project.repository) rows.push(project)
    }
    catch (error) { rows.push({ id: 'legacy', name: '原有 Superagent', legacy: true, error: error.message }) }
  }
  const directory = registry(dataRoot), info = await missing(lstat(directory))
  if (!info) return rows
  await privateDirectory(directory, { create: false })
  for (const entry of (await readdir(directory)).sort()) {
    if (!idPattern.test(entry)) continue
    try { rows.push(await readProject(dataRoot, entry)) }
    catch (error) { rows.push({ id: entry, name: '配置不可读取', error: error.message }) }
  }
  return rows
}

/** List account directories only; gh remains responsible for authentication. */
export async function listSuperagentGithubAccounts({ home = homedir(), configHome = process.env.XDG_CONFIG_HOME } = {}) {
  const base = isAbsolute(configHome ?? '') ? configHome : join(home, '.config')
  const directory = join(base, 'gh-profiles')
  const entries = await missing(readdir(directory, { withFileTypes: true }))
  if (!entries) return []
  return entries.filter(entry => entry.isDirectory() && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(entry.name))
    .map(entry => ({ login: entry.name, directory: join(directory, entry.name) })).sort((a, b) => a.login.localeCompare(b.login))
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`

/** Each ticket gets its own repository and task branch, without writing to the selected local project. */
export function guidedPrepare(repository, branch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || typeof branch !== 'string' || !branch || branch.length > 255) {
    throw new Error('请选择有效的仓库和分支。')
  }
  try { execFileSync('git', ['check-ref-format', '--branch', branch], { stdio: 'ignore' }) }
  catch { throw new Error('所选分支名称无效。') }
  return [
    'set -eu',
    `[ ! -e "$DSH_SUPERAGENT_DIR" ] || { echo '任务目录已存在' >&2; exit 1; }`,
    'git init -q -- "$DSH_SUPERAGENT_DIR"',
    `git -C "$DSH_SUPERAGENT_DIR" remote add origin ${quote(`https://github.com/${repository}.git`)}`,
    `base=${quote(`refs/heads/${branch}`)}`,
    'git -C "$DSH_SUPERAGENT_DIR" fetch --no-tags origin "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-$base}"',
    'git -C "$DSH_SUPERAGENT_DIR" checkout -b "agent/$DSH_SUPERAGENT_NAME" FETCH_HEAD',
  ].join('\n')
}

async function guidedConfiguration(work, input) {
  if (input.dedicated !== true) return { ...input, executionRoot: work, prepare: guidedPrepare(input.repository, input.baseBranch), executionEnabled: true }
  guidedPrepare(input.repository, input.baseBranch)
  const repo = join(work, 'repo'), tasks = join(work, 'tasks')
  await mkdir(repo, { mode: 0o700 }); await mkdir(tasks, { mode: 0o700 })
  await writeFile(join(work, 'station-workspace.json'), JSON.stringify({ repository: input.repository }), { flag: 'wx', mode: 0o600 })
  return { ...input, deploymentMode: 'dedicated', localProjectDir: repo, executionRoot: tasks,
    prepare: dedicatedPrepare(repo, input.baseBranch), executionEnabled: true }
}

async function guidedStorageParent(dataRoot, storageRoot) {
  if (!storageRoot) {
    const path = join(resolve(dataRoot), 'superagent-workspaces')
    await privateDirectory(path)
    return realpath(path)
  }
  const path = await directory(storageRoot, 'Superagent 存放目录')
  let inside = false
  try {
    inside = execFileSync('git', ['-C', path, 'rev-parse', '--is-inside-work-tree', '--is-inside-git-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').includes('true')
  } catch { /* A storage folder outside Git has no repository metadata. */ }
  if (inside) throw new Error('请选择日常 Git 工作区之外的 Superagent 专用存放目录。')
  return path
}

async function protectCommonWorkspace(dataRoot, work) {
  const roots = (await getCommonWritableRoots(dataRoot)).roots
  for (const root of roots) {
    if (await directory(root, '公共可写目录') !== root) throw new Error('公共可写目录已改变，请重新选择。')
    if (overlaps(root, work) || overlaps(work, root)) throw new Error('项目目录不能与公共可写目录重叠。')
  }
}

export async function createSuperagentProject(dataRoot, input, { beforeGuidedCreate } = {}) {
  let work
  try {
    if (input?.guided === true) {
      const parent = await guidedStorageParent(dataRoot, input.storageRoot)
      work = join(parent, randomUUID())
      await protectCommonWorkspace(dataRoot, work)
      await beforeGuidedCreate?.(work)
      await mkdir(work, { mode: 0o700 })
      input = await guidedConfiguration(work, input)
    }
    const config = await validate(input), id = randomUUID(), parent = registry(dataRoot), path = projectDirectory(dataRoot, id)
    config.preserveLegacyPolicy = false
    await validateProjectRoots(dataRoot, config, id)
    if (config.executionRoot && (await readdir(config.executionRoot)).length) throw new Error('新项目的任务目录必须为空，请选择独立空目录。')
    await privateDirectory(parent)
    await mkdir(path, { mode: 0o700 })
    const project = { id, revision: 1, ...config }
    await writeFile(join(path, 'project.json'), JSON.stringify(project, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    return project
  } catch (error) {
    if (work) await rmdir(work).catch(cleanup => { if (cleanup.code !== 'ENOENT') console.error('未能清理空任务目录。') })
    throw error
  }
}

export async function updateSuperagentProject(dataRoot, id, input) {
  const path = projectDirectory(dataRoot, id)
  await privateDirectory(path, { create: false })
  if (id === 'legacy') await getSuperagentProject(dataRoot, id)
  const lock = await open(join(path, 'station-project.lock'), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | 0x20, 0o600)
  const temporary = join(path, `project.${randomUUID()}.tmp`)
  let work, saved = false
  try {
    const file = join(path, id === 'legacy' ? 'station-project.json' : 'project.json')
    const info = await missing(lstat(file))
    if (!info && id !== 'legacy') throw new Error('Superagent 项目配置不存在，已保留目录。')
    const previous = info ? await readProject(dataRoot, id) : undefined
    if (input.revision !== undefined && input.revision !== previous?.revision) throw new Error('项目配置已被更改，请刷新后重试。')
    if (input.guided === true) {
      if (previous?.executionRoot || previous?.prepare) throw new Error('已有任务目录的项目不能重新生成任务配置，请新建项目。')
      const parent = await guidedStorageParent(dataRoot, input.storageRoot)
      work = join(parent, randomUUID())
      await protectCommonWorkspace(dataRoot, work)
      await mkdir(work, { mode: 0o700 })
      input = await guidedConfiguration(work, input)
    }
    const config = await validate({ ...input, extraWritableRoots: input.extraWritableRoots === undefined ? previous?.extraWritableRoots : input.extraWritableRoots })
    if (id !== 'legacy') config.preserveLegacyPolicy = false
    await validateProjectRoots(dataRoot, config, id)
    if (id !== 'legacy' && config.executionRoot && config.executionRoot !== previous?.executionRoot
      && (await readdir(config.executionRoot)).length) throw new Error('新任务目录必须为空，请选择独立空目录。')
    const project = { id, revision: (previous?.revision ?? 0) + 1, ...config, ...(id === 'legacy' ? { legacy: true } : {}) }
    if (!previous) {
      await writeFile(file, JSON.stringify(project, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      saved = true
      return project
    }
    await writeFile(temporary, JSON.stringify(project, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
    saved = true
    return project
  } finally {
    await missing(unlink(temporary))
    await lock.close()
    if (work && !saved) await rmdir(work).catch(error => { if (error.code !== 'ENOENT') console.error('未能清理空任务目录。') })
  }
}
