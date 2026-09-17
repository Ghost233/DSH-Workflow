import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, join, resolve } from 'node:path'
import {
  assertOwnerScopesDisjoint,
  normalizeOwner,
  normalizeRelativePath,
} from './model.mjs'
import {
  OWNER_COLLECTION_DIRECTORY,
  OWNER_CONFIGURATION_DIRECTORY,
  OWNER_DESCRIPTOR_FILE,
  OWNER_MEMORY_DIRECTORY,
} from './project-layout.mjs'

const execFileAsync = promisify(execFile)
const ROOT = OWNER_CONFIGURATION_DIRECTORY
const CONFIG = 'config.json'
const OWNERS = OWNER_COLLECTION_DIRECTORY
const CONTRACT = 'DSH_OWNER_REGISTRY_V1'
const PROPOSAL = 'DSH_OWNER_REGISTRY_PROPOSAL_V1'
const LOCK_CONTRACT = 'DSH_OWNER_REGISTRY_LOCK_V1'
const TRANSACTION_CONTRACT = 'DSH_OWNER_REGISTRY_TRANSACTION_V1'
const LOCK_OWNER = 'owner.json'
const LOCK_TRANSACTION = 'transaction.json'
const LOCK_STALE_GRACE_MS = 30_000
const LOCK_ATTEMPTS = 500
const AUTOMATA_STATE_LIMIT = 20_000
const MAX_BATCH_OPERATIONS = 64
const OTHER_SYMBOL = Symbol('非字面路径字符')
const OWNER_STATUS = 'active'
const OWNER_DIRECTORY_ID = /^[a-z][a-z0-9_-]{0,63}$/u
const DEFAULT_CONFIG = Object.freeze({
  contract: CONTRACT,
  version: 1,
  managedRoots: ['**'],
  parallel: 4,
  profiles: {},
})

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function text(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 必须是非空字符串`)
  return value.trim()
}

function list(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`)
  const result = value.map((item, index) => text(item, `${field}[${index}]`))
  if (new Set(result).size !== result.length) throw new Error(`${field} 不能包含重复项`)
  return result
}

function safeMarkdown(value) {
  return text(value, 'Owner 文本')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/gu, character => (
      `&#${character.codePointAt(0)};`
    ))
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, character => (
      `&#${character.codePointAt(0)};`
    ))
    .replace(/^ +/gmu, indentation => '&#32;'.repeat(indentation.length))
}

function registryPath(root) { return join(root, ROOT) }
function ownersPath(root) { return join(root, ROOT, OWNERS) }
function configPath(root) { return join(root, ROOT, CONFIG) }
function ownerPath(root, ownerId) { return join(ownersPath(root), ownerId) }
function ownerDescriptorPath(root, ownerId) { return join(ownerPath(root, ownerId), OWNER_DESCRIPTOR_FILE) }

async function assertNoLink(path, label, { missingOk = false } = {}) {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink()) throw new Error(`${label} 不能是符号链接`)
    return entry
  } catch (error) {
    if (error?.code === 'ENOENT' && missingOk) return undefined
    throw error
  }
}

async function assertRegistryPaths(root, { missingOk = false } = {}) {
  const base = registryPath(root)
  await assertNoLink(base, 'Owner Registry 目录', { missingOk })
  await assertNoLink(ownersPath(root), 'Owner Registry owners 目录', { missingOk })
  await assertNoLink(configPath(root), 'Owner Registry config 文件', { missingOk })
}

async function git(root, args) {
  try { return String((await execFileAsync('git', args, { cwd: root, encoding: 'utf8' })).stdout ?? '').trim() }
  catch (error) { throw new Error('Git Registry 操作失败', { cause: error }) }
}

function normalizeRegistryOwner(raw) {
  const owner = normalizeOwner(raw)
  const status = text(raw.status ?? OWNER_STATUS, `owner(${owner.id}).status`)
  if (status !== OWNER_STATUS) throw new Error(`Owner ${owner.id} 的状态不受支持：${status}`)
  return {
    ...owner,
    status,
  }
}

function containedIn(root, candidate) {
  if (root === '**') return true
  return candidate.startsWith(root.slice(0, -2))
}

function checkManagedRoots(config, owners) {
  for (const owner of owners) for (const scope of owner.scope) {
    if (!config.managedRoots.some(root => containedIn(root, scope))) throw new Error(`Owner ${owner.id} 的 scope 超出受管根：${scope}`)
  }
}

function validateOwners(config, rawOwners) {
  const owners = rawOwners.map(normalizeRegistryOwner).sort((a, b) => a.id.localeCompare(b.id))
  if (new Set(owners.map(owner => owner.id)).size !== owners.length) throw new Error('Owner 编号重复')
  const byId = new Map(owners.map(owner => [owner.id, owner]))
  for (const owner of owners) if (owner.parentOwnerId !== undefined && !byId.has(owner.parentOwnerId)) throw new Error(`Owner ${owner.id} 引用了不存在的父 Owner`)
  const visiting = new Set(); const visited = new Set()
  const visit = owner => { if (visited.has(owner.id)) return; if (visiting.has(owner.id)) throw new Error('Owner 父级存在环'); visiting.add(owner.id); if (owner.parentOwnerId) visit(byId.get(owner.parentOwnerId)); visiting.delete(owner.id); visited.add(owner.id) }
  owners.forEach(visit)
  checkManagedRoots(config, owners)
  assertOwnerScopesDisjoint(owners)
  return owners
}

function normalizeConfig(raw) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) }
  if (config.contract !== CONTRACT || config.version !== 1) throw new Error('Owner Registry 配置契约或版本不支持')
  config.managedRoots = list(config.managedRoots, 'managedRoots').map(normalizeRelativePath)
  if (new Set(config.managedRoots).size !== config.managedRoots.length) throw new Error('managedRoots 不能包含规范化后重复项')
  for (const root of config.managedRoots) {
    if (root !== '**' && !/^(?:[^/*?]+\/)+\*\*$/u.test(root)) {
      throw new Error(`managedRoots 只支持 ** 或字面目录/**：${root}`)
    }
  }
  if (!Number.isSafeInteger(config.parallel) || config.parallel < 1 || config.parallel > 8) throw new Error('parallel 必须是 1-8')
  if (config.profiles === null || typeof config.profiles !== 'object' || Array.isArray(config.profiles)) throw new Error('profiles 必须是对象')
  return { contract: CONTRACT, version: 1, managedRoots: [...config.managedRoots].sort(), parallel: config.parallel, profiles: config.profiles }
}

function normalizeRegistry(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Owner Registry 必须是对象')
  }
  const config = normalizeConfig(raw.config)
  const rawOwners = raw.owners ?? []
  if (!Array.isArray(rawOwners)) throw new Error('Owner Registry owners 必须是数组')
  const owners = validateOwners(config, rawOwners)
  return { contract: CONTRACT, config, owners }
}

function ownerMetadata(owner, { includeStatus = true, legacyExclude = false } = {}) {
  return {
    id: owner.id,
    name: owner.name,
    description: owner.description,
    scope: owner.scope,
    ...(legacyExclude
      ? { exclude: owner.declaredExclude }
      : { declaredExclude: owner.declaredExclude, managedExclude: owner.managedExclude }),
    parentOwnerId: owner.parentOwnerId ?? null,
    ...(includeStatus ? { status: owner.status } : {}),
  }
}

function ownerMarkdown(owner, options) {
  const frontmatter = canonical(ownerMetadata(owner, options))
  return `---\nregistry: ${frontmatter}\n---\n# ${safeMarkdown(owner.name)}\n\n${safeMarkdown(owner.description)}\n`
}

function parseOwnerMarkdown(content) {
  const match = /^---\nregistry:\s*(.+)\n---/u.exec(content)
  if (match === null) throw new Error('Owner Markdown 缺少 registry 前置元数据')
  let owner
  try { owner = JSON.parse(match[1]) } catch (error) {
    throw new Error('Owner Markdown 前置元数据不是有效 JSON', { cause: error })
  }
  if (owner?.parentOwnerId === null) delete owner.parentOwnerId
  const normalized = normalizeRegistryOwner(owner)
  const hasStatus = Object.hasOwn(owner, 'status')
  const accepted = hasStatus
    ? [ownerMarkdown(normalized)]
    : [
        ownerMarkdown(normalized, { includeStatus: false }),
        ownerMarkdown(normalized, { includeStatus: false, legacyExclude: true }),
      ]
  if (!accepted.includes(content)) throw new Error('Owner Markdown 正文不符合 Registry 规范')
  return { owner: normalized, needsMigration: !hasStatus }
}

async function writeAtomic(path, content, { mode = 0o600 } = {}) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode })
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function writeRegistry(directory, registry) {
  const ownerDirectory = join(directory, OWNERS)
  await mkdir(ownerDirectory, { recursive: true, mode: 0o700 })
  await writeAtomic(join(directory, CONFIG), `${JSON.stringify(registry.config, null, 2)}\n`)
  for (const owner of registry.owners) {
    const ownerRoot = join(ownerDirectory, owner.id)
    await mkdir(ownerRoot, { recursive: true, mode: 0o700 })
    await writeAtomic(join(ownerRoot, OWNER_DESCRIPTOR_FILE), ownerMarkdown(owner))
  }
}

async function copyOwnerMemory(base, transaction) {
  const sourceOwners = join(base, OWNERS)
  if (!existsSync(sourceOwners)) return
  for (const entry of await readdir(sourceOwners, { withFileTypes: true })) {
    if (!entry.isDirectory() || !OWNER_DIRECTORY_ID.test(entry.name)) continue
    const sourceOwner = join(sourceOwners, entry.name)
    const sourceMemory = join(sourceOwner, OWNER_MEMORY_DIRECTORY)
    if (!existsSync(sourceMemory)) continue
    const memoryEntry = await assertNoLink(sourceMemory, `Owner ${entry.name} 长期记忆目录`)
    if (!memoryEntry.isDirectory()) throw new Error(`Owner ${entry.name} 长期记忆路径必须是目录`)
    const targetOwner = join(transaction, OWNERS, entry.name)
    await mkdir(targetOwner, { recursive: true, mode: 0o700 })
    await cp(sourceMemory, join(targetOwner, OWNER_MEMORY_DIRECTORY), {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    })
  }
}

async function registryIndexEntries(root) {
  const output = await git(root, ['ls-files', '--stage', '-z', '--', ROOT])
  if (output === '') return []
  return output.split('\0').filter(Boolean).map(record => {
    const separator = record.indexOf('\t')
    const [mode, object, stageText] = record.slice(0, separator).split(' ')
    const stage = Number(stageText)
    if (separator < 0 || !/^\d{6}$/u.test(mode) || !/^[0-9a-f]+$/u.test(object) || !Number.isInteger(stage)) {
      throw new Error('Git Registry 索引条目格式无效')
    }
    return { mode, object, stage, path: record.slice(separator + 1) }
  })
}

async function registryIndexPaths(root) {
  return [...new Set((await registryIndexEntries(root)).map(entry => entry.path))]
}

function registryFiles(registry) {
  return [
    join(ROOT, CONFIG),
    ...registry.owners.map(owner => join(ROOT, OWNERS, owner.id, OWNER_DESCRIPTOR_FILE)),
  ]
}

function isDeletedOwnerMarkdown(root, path, allowed) {
  if (allowed.has(path) || existsSync(join(root, path))) return false
  const prefix = `${ROOT}/${OWNERS}/`
  if (!path.startsWith(prefix)) return false
  const segments = path.slice(prefix.length).split('/')
  return (segments.length === 1 && segments[0].endsWith('.md'))
    || (segments.length === 2 && OWNER_DIRECTORY_ID.test(segments[0]) && segments[1] === OWNER_DESCRIPTOR_FILE)
}

function isOwnerMemoryPath(path) {
  const prefix = `${ROOT}/${OWNERS}/`
  if (!path.startsWith(prefix)) return false
  const [ownerId, directory, ...rest] = path.slice(prefix.length).split('/')
  return OWNER_DIRECTORY_ID.test(ownerId) && directory === OWNER_MEMORY_DIRECTORY && rest.some(Boolean)
}

async function stageRegistry(root, registry) {
  const files = registryFiles(registry)
  const allowed = new Set(files)
  const tracked = await registryIndexPaths(root)
  const deleted = tracked.filter(path => isDeletedOwnerMarkdown(root, path, allowed))
  const invalid = tracked.filter(path => (
    !allowed.has(path) && !deleted.includes(path) && !isOwnerMemoryPath(path)
  ))
  if (invalid.length > 0) throw new Error(`Git Registry 索引包含白名单外的已跟踪路径：${invalid.join(', ')}`)
  if (deleted.length > 0) await git(root, ['update-index', '--force-remove', '--', ...deleted])
  await git(root, ['add', '--', ...files])
  const actual = (await registryIndexPaths(root)).filter(path => !isOwnerMemoryPath(path)).sort()
  const expected = [...allowed].sort()
  if (canonical(actual) !== canonical(expected)) throw new Error('Git Registry 索引未形成正式文件闭集')
}

async function snapshotRegistryIndex(root) {
  const entries = await registryIndexEntries(root)
  if (entries.some(entry => entry.stage !== 0)) throw new Error('Owner Registry 存在未解决的 Git 索引冲突')
  const rawPath = await git(root, ['rev-parse', '--git-path', 'index'])
  if (rawPath === '') throw new Error('Git Registry 无法定位索引文件')
  const path = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath)
  const entry = await assertNoLink(path, 'Git 索引文件', { missingOk: true })
  if (entry === undefined) return { existed: false, data: null, mode: 0o600, sha256: null }
  if (!entry.isFile()) throw new Error('Git 索引路径必须是普通文件')
  const bytes = await readFile(path)
  return {
    existed: true,
    data: bytes.toString('base64'),
    mode: entry.mode & 0o777,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function restoreRegistryIndex(root, snapshot) {
  const rawPath = await git(root, ['rev-parse', '--git-path', 'index'])
  if (rawPath === '') throw new Error('Git Registry 无法定位索引文件')
  const path = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath)
  await assertNoLink(path, 'Git 索引文件', { missingOk: true })
  if (snapshot?.existed === false) {
    await rm(path, { force: true })
    if (existsSync(path)) throw new Error('Git Registry 索引未恢复到不存在状态')
    return
  }
  if (snapshot?.existed !== true || typeof snapshot.data !== 'string'
    || !Number.isInteger(snapshot.mode) || typeof snapshot.sha256 !== 'string') {
    throw new Error('Git Registry 索引快照格式无效')
  }
  const bytes = Buffer.from(snapshot.data, 'base64')
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) {
    throw new Error('Git Registry 索引快照摘要无效')
  }
  await writeAtomic(path, bytes, { mode: snapshot.mode })
  const restored = await readFile(path)
  if (!restored.equals(bytes)) {
    throw new Error('Git Registry 索引未恢复到调用前完整状态')
  }
}

function userBoundaryError(error, fallback) {
  if (error?.code !== undefined || error instanceof SyntaxError || error instanceof TypeError
    || error instanceof RangeError) {
    return new Error(fallback, { cause: error })
  }
  if (typeof error?.message === 'string' && /\p{Script=Han}/u.test(error.message)) return error
  return new Error(fallback, { cause: error })
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

async function registryLockState(lock) {
  let entry
  try {
    entry = await lstat(lock)
  } catch (error) {
    // A prior holder may remove the directory after this contender's mkdir
    // observed EEXIST but before inspection starts. That hand-off is ordinary
    // contention; retry acquisition without re-running the Registry read.
    if (error?.code === 'ENOENT') return 'missing'
    throw error
  }
  try {
    const metadata = JSON.parse(await readFile(join(lock, LOCK_OWNER), 'utf8'))
    if (metadata?.contract !== LOCK_CONTRACT || typeof metadata.token !== 'string'
      || !Number.isSafeInteger(metadata.pid) || metadata.pid < 1) {
      return Date.now() - entry.mtimeMs >= LOCK_STALE_GRACE_MS ? 'stale' : 'active'
    }
    return processIsAlive(metadata.pid) ? 'active' : 'stale'
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    return Date.now() - entry.mtimeMs >= LOCK_STALE_GRACE_MS ? 'stale' : 'active'
  }
}

function transactionDirectoryName(kind, token) {
  return `${ROOT}-${kind}-${token}`
}

function validTransactionDirectory(name, kind) {
  return typeof name === 'string'
    && new RegExp(`^\\${ROOT}-${kind}-[A-Za-z0-9-]+$`, 'u').test(name)
}

function validateIndexSnapshot(snapshot) {
  if (snapshot?.existed === false && snapshot.data === null && snapshot.sha256 === null) return snapshot
  if (snapshot?.existed !== true || typeof snapshot.data !== 'string'
    || !Number.isInteger(snapshot.mode) || typeof snapshot.sha256 !== 'string') {
    throw new Error('Owner Registry 恢复记录中的 Git 索引快照无效')
  }
  const bytes = Buffer.from(snapshot.data, 'base64')
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) {
    throw new Error('Owner Registry 恢复记录中的 Git 索引摘要无效')
  }
  return snapshot
}

function validateTransactionRecord(raw) {
  if (raw?.contract !== TRANSACTION_CONTRACT || typeof raw.token !== 'string'
    || typeof raw.baseExisted !== 'boolean'
    || !['prepared', 'base-moved', 'replacement-installed', 'indexing', 'committed'].includes(raw.phase)) {
    throw new Error('Owner Registry 崩溃恢复记录格式无效')
  }
  if (raw.transactionName !== null && !validTransactionDirectory(raw.transactionName, 'transaction')) {
    throw new Error('Owner Registry 崩溃恢复事务目录无效')
  }
  if (raw.backupName !== null && !validTransactionDirectory(raw.backupName, 'backup')) {
    throw new Error('Owner Registry 崩溃恢复备份目录无效')
  }
  validateIndexSnapshot(raw.indexSnapshot)
  return raw
}

async function recoverTransactionRecord(root, raw) {
  const record = validateTransactionRecord(raw)
  const base = registryPath(root)
  const transaction = record.transactionName === null ? undefined : join(root, record.transactionName)
  const backup = record.backupName === null ? undefined : join(root, record.backupName)
  if (record.phase === 'committed') {
    if (transaction !== undefined) await rm(transaction, { recursive: true, force: true })
    if (backup !== undefined) await rm(backup, { recursive: true, force: true })
    return
  }
  if (record.baseExisted) {
    if (backup !== undefined && existsSync(backup)) {
      const backupEntry = await assertNoLink(backup, 'Owner Registry 崩溃备份目录')
      if (!backupEntry.isDirectory()) throw new Error('Owner Registry 崩溃备份必须是目录')
      if (existsSync(base)) await rm(base, { recursive: true, force: true })
      await rename(backup, base)
    } else if (!existsSync(base)) {
      throw new Error('Owner Registry 崩溃恢复缺少正式目录与备份目录')
    }
  } else if (existsSync(base)) {
    await rm(base, { recursive: true, force: true })
  }
  if (transaction !== undefined) await rm(transaction, { recursive: true, force: true })
  await restoreRegistryIndex(root, record.indexSnapshot)
}

async function recoverOrphanDirectories(root) {
  const entries = await readdir(root)
  const backups = entries.filter(name => validTransactionDirectory(name, 'backup'))
  const transactions = entries.filter(name => validTransactionDirectory(name, 'transaction'))
  if (backups.length > 1) throw new Error('Owner Registry 存在多个崩溃备份，拒绝自动选择')
  const base = registryPath(root)
  if (backups.length === 1) {
    const backup = join(root, backups[0])
    const backupEntry = await assertNoLink(backup, 'Owner Registry 孤立备份目录')
    if (!backupEntry.isDirectory()) throw new Error('Owner Registry 孤立备份必须是目录')
    if (existsSync(base)) await rm(base, { recursive: true, force: true })
    await rename(backup, base)
  }
  for (const name of transactions) await rm(join(root, name), { recursive: true, force: true })
}

async function recoverInterruptedState(root) {
  const staleLocks = (await readdir(root)).filter(name => name.startsWith(`${ROOT}.lock-stale-`))
  for (const name of staleLocks) {
    const journal = join(root, name, LOCK_TRANSACTION)
    if (!existsSync(journal)) continue
    let record
    try { record = JSON.parse(await readFile(journal, 'utf8')) } catch (error) {
      throw new Error('Owner Registry 崩溃恢复记录不是有效 JSON', { cause: error })
    }
    await recoverTransactionRecord(root, record)
  }
  await recoverOrphanDirectories(root)
  for (const name of staleLocks) await rm(join(root, name), { recursive: true, force: true })
}

function lockContext(lock, token) {
  const journal = join(lock, LOCK_TRANSACTION)
  return {
    async begin(record) {
      await writeAtomic(journal, `${JSON.stringify({ ...record, contract: TRANSACTION_CONTRACT })}\n`)
    },
    async update(patch) {
      let current
      try { current = JSON.parse(await readFile(journal, 'utf8')) } catch (error) {
        throw new Error('Owner Registry 事务记录无法更新', { cause: error })
      }
      await writeAtomic(journal, `${JSON.stringify({ ...current, ...patch })}\n`)
    },
    async clear() { await rm(journal, { force: true }) },
    async active() { return existsSync(journal) },
    token,
  }
}

async function withLock(root, operation) {
  const lock = join(root, `${ROOT}.lock`)
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    let acquired = false
    try {
      await mkdir(lock, { mode: 0o700 })
      acquired = true
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const state = await registryLockState(lock)
      if (state === 'missing') continue
      if (state === 'stale') {
        try {
          await rename(lock, join(root, `${ROOT}.lock-stale-${randomUUID()}`))
        } catch (renameError) {
          if (!['ENOENT', 'EEXIST'].includes(renameError?.code)) throw renameError
        }
      }
    }
    if (!acquired) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
      continue
    }
    const token = randomUUID()
    const context = lockContext(lock, token)
    try {
      await writeFile(join(lock, LOCK_OWNER), `${JSON.stringify({
        contract: LOCK_CONTRACT,
        token,
        pid: process.pid,
        createdAt: new Date().toISOString(),
      })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await recoverInterruptedState(root)
      return await operation(context)
    } finally {
      if (existsSync(lock)) {
        if (await context.active().catch(() => true)) {
          await rename(lock, join(root, `${ROOT}.lock-stale-${randomUUID()}`)).catch(() => undefined)
        } else {
          await rm(lock, { recursive: true, force: true }).catch(() => undefined)
        }
      }
    }
  }
  throw new Error('Owner Registry 正在被其他批准操作修改')
}

async function loadRegistryUnlocked(root, { withMigration = false } = {}) {
  await assertRegistryPaths(root)
  let config
  try { config = JSON.parse(await readFile(configPath(root), 'utf8')) } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Owner Registry 配置不是有效 JSON', { cause: error })
    throw error
  }
  const owners = []
  let needsMigration = false
  for (const entry of await readdir(ownersPath(root), { withFileTypes: true })) {
    const path = join(ownersPath(root), entry.name)
    await assertNoLink(path, `Owner 文件 ${entry.name}`)
    let descriptor
    let pathOwnerId
    if (entry.isFile() && entry.name.endsWith('.md')) {
      descriptor = path
      pathOwnerId = entry.name.slice(0, -'.md'.length)
      needsMigration = true
    } else if (entry.isDirectory() && OWNER_DIRECTORY_ID.test(entry.name)) {
      descriptor = ownerDescriptorPath(root, entry.name)
      pathOwnerId = entry.name
      const descriptorEntry = await assertNoLink(descriptor, `Owner ${entry.name} 描述文件`, { missingOk: true })
      if (descriptorEntry === undefined) continue
      if (!descriptorEntry.isFile()) throw new Error(`Owner ${entry.name} 描述路径必须是文件`)
    } else {
      continue
    }
    const parsed = parseOwnerMarkdown(await readFile(descriptor, 'utf8'))
    if (parsed.owner.id !== pathOwnerId) {
      throw new Error(`Owner 文件夹 ${pathOwnerId} 与描述中的 id ${parsed.owner.id} 不一致`)
    }
    owners.push(parsed.owner)
    needsMigration ||= parsed.needsMigration
  }
  const registry = normalizeRegistry({ config, owners })
  return withMigration ? { registry, needsMigration } : registry
}

async function rollbackInstalledRegistry(root, record, context) {
  const errors = []
  try { await recoverTransactionRecord(root, record) } catch (error) { errors.push(error) }
  if (errors.length === 0) {
    await context.clear()
    return
  }
  throw new AggregateError(errors, 'Owner Registry 回滚不完整')
}

async function installRegistry(root, registry, context, { baseExisted }) {
  const token = randomUUID()
  const transactionName = transactionDirectoryName('transaction', token)
  const backupName = baseExisted ? transactionDirectoryName('backup', token) : null
  const transaction = join(root, transactionName)
  const backup = backupName === null ? undefined : join(root, backupName)
  const base = registryPath(root)
  const indexSnapshot = await snapshotRegistryIndex(root)
  const record = {
    contract: TRANSACTION_CONTRACT,
    token,
    baseExisted,
    transactionName,
    backupName,
    phase: 'prepared',
    indexSnapshot,
  }
  await context.begin(record)
  try {
    await writeRegistry(transaction, registry)
    if (baseExisted) await copyOwnerMemory(base, transaction)
    if (baseExisted) {
      await rename(base, backup)
      record.phase = 'base-moved'
      await context.update({ phase: record.phase })
    }
    await rename(transaction, base)
    record.phase = 'replacement-installed'
    await context.update({ phase: record.phase })
    await stageRegistry(root, registry)
    const result = await loadRegistryUnlocked(root)
    if (canonical(result) !== canonical(registry)) {
      throw new Error('Owner Registry 落盘结果与事务目标不一致')
    }
    await context.update({ phase: 'committed' })
    record.phase = 'committed'
    try {
      if (backup !== undefined) await rm(backup, { recursive: true, force: true })
      await context.clear()
    } catch {
      // 已提交记录保留在锁目录中，下一位读者会完成无损清理。
    }
    return result
  } catch (error) {
    if (record.phase === 'committed') throw error
    try {
      await rollbackInstalledRegistry(root, record, context)
    } catch (rollbackError) {
      const backupStatus = backup !== undefined && existsSync(backup) ? `；备份保留在 ${backup}` : ''
      throw new AggregateError([error, rollbackError], `Owner Registry 回滚不完整${backupStatus}`)
    }
    throw error
  } finally {
    await rm(transaction, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function stageRegistryTransaction(root, registry, context) {
  const indexSnapshot = await snapshotRegistryIndex(root)
  const record = {
    contract: TRANSACTION_CONTRACT,
    token: randomUUID(),
    baseExisted: true,
    transactionName: null,
    backupName: null,
    phase: 'indexing',
    indexSnapshot,
  }
  await context.begin(record)
  try {
    await stageRegistry(root, registry)
    record.phase = 'committed'
    await context.update({ phase: record.phase })
    await context.clear()
  } catch (error) {
    try {
      await restoreRegistryIndex(root, indexSnapshot)
      await context.clear()
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Owner Registry Git 索引回滚不完整')
    }
    throw error
  }
}

export async function ensureRegistry(root) {
  try {
    return await withLock(root, async context => {
      const base = registryPath(root)
      await assertNoLink(base, 'Owner Registry 目录', { missingOk: true })
      if (!existsSync(base)) {
        const registry = normalizeRegistry({ config: DEFAULT_CONFIG, owners: [] })
        return installRegistry(root, registry, context, { baseExisted: false })
      }
      const { registry, needsMigration } = await loadRegistryUnlocked(root, { withMigration: true })
      if (needsMigration) return installRegistry(root, registry, context, { baseExisted: true })
      await stageRegistryTransaction(root, registry, context)
      return registry
    })
  } catch (error) {
    throw userBoundaryError(error, '无法初始化 Owner Registry')
  }
}

export async function loadRegistry(root) {
  try {
    return await withLock(root, async () => loadRegistryUnlocked(root))
  } catch (error) {
    throw userBoundaryError(error, '无法读取 Owner Registry')
  }
}

/** Missing is distinct from corrupt; proposal preview must never create files. */
export async function readRegistryForProposal(root) {
  try { await lstat(registryPath(root)) }
  catch (error) {
    if (error.code === 'ENOENT') return { exists: false, registry: normalizeRegistry({ config: DEFAULT_CONFIG, owners: [] }) }
    throw error
  }
  return { exists: true, registry: await loadRegistry(root) }
}

function find(owners, id) { const owner = owners.find(item => item.id === id); if (!owner) throw new Error(`找不到 Owner：${id}`); return owner }

function newAutomatonState(states) {
  const id = states.length
  states.push({ epsilon: [], transitions: [] })
  return id
}

function addEpsilon(states, from, to) { states[from].epsilon.push(to) }

function addTransition(states, from, to, type, value) {
  states[from].transitions.push({ to, type, ...(value === undefined ? {} : { value }) })
}

function appendSegment(states, current, segment) {
  for (const character of segment) {
    if (character === '*') {
      const next = newAutomatonState(states)
      addEpsilon(states, current, next)
      addTransition(states, current, current, 'nonSlash')
      current = next
    } else if (character === '?') {
      const next = newAutomatonState(states)
      addTransition(states, current, next, 'nonSlash')
      current = next
    } else {
      const next = newAutomatonState(states)
      addTransition(states, current, next, character === '/' ? 'slash' : 'literal', character === '/' ? undefined : character)
      current = next
    }
  }
  return current
}

function appendLiteral(states, current, character) {
  const next = newAutomatonState(states)
  addTransition(states, current, next, character === '/' ? 'slash' : 'literal', character === '/' ? undefined : character)
  return next
}

function appendAnySegmentWithSeparatorRepeat(states, current) {
  const end = newAutomatonState(states)
  addEpsilon(states, current, end)
  const segment = newAutomatonState(states)
  addTransition(states, current, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  const afterSlash = newAutomatonState(states)
  addTransition(states, segment, afterSlash, 'slash')
  addEpsilon(states, afterSlash, current)
  return end
}

function appendSlashSegmentRepeat(states, current) {
  const end = newAutomatonState(states)
  addEpsilon(states, current, end)
  const segmentStart = newAutomatonState(states)
  addTransition(states, current, segmentStart, 'slash')
  const segment = newAutomatonState(states)
  addTransition(states, segmentStart, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  addEpsilon(states, segment, end)
  addEpsilon(states, segment, current)
  return end
}

function appendSlashSegmentOneOrMore(states, current) {
  const end = newAutomatonState(states)
  const segmentStart = newAutomatonState(states)
  addTransition(states, current, segmentStart, 'slash')
  const segment = newAutomatonState(states)
  addTransition(states, segmentStart, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  addEpsilon(states, segment, end)
  addEpsilon(states, segment, current)
  return end
}

function appendAnySegmentsOneOrMore(states, current) {
  const segment = newAutomatonState(states)
  addTransition(states, current, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  return appendSlashSegmentRepeat(states, segment)
}

function compileGlob(pattern) {
  const normalized = normalizeRelativePath(pattern).split('/')
  const segments = normalized.filter((segment, index) => (
    segment !== '**' || index === 0 || normalized[index - 1] !== '**'
  ))
  const states = []
  const start = newAutomatonState(states)
  let current = start
  if (segments.length === 1 && segments[0] === '**') {
    current = appendAnySegmentsOneOrMore(states, current)
  } else {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === '**') {
        if (index === 0) current = appendAnySegmentWithSeparatorRepeat(states, current)
        else if (index === segments.length - 1) current = appendSlashSegmentOneOrMore(states, current)
        else current = appendSlashSegmentRepeat(states, current)
      } else {
        if (index > 0 && !(segments[0] === '**' && index === 1)) current = appendLiteral(states, current, '/')
        current = appendSegment(states, current, segment)
      }
    }
  }
  return { states, start, end: current }
}

function epsilonClosure(automaton, initial) {
  const result = new Set(initial)
  const pending = [...result]
  while (pending.length > 0) {
    const state = pending.pop()
    for (const next of automaton.states[state].epsilon) {
      if (result.has(next)) continue
      result.add(next)
      pending.push(next)
    }
  }
  return result
}

function transitionMatches(transition, symbol) {
  if (transition.type === 'slash') return symbol === '/'
  if (transition.type === 'nonSlash') return symbol !== '/'
  return symbol !== OTHER_SYMBOL && symbol === transition.value
}

function move(automaton, states, symbol) {
  const result = new Set()
  for (const state of states) {
    for (const transition of automaton.states[state].transitions) {
      if (transitionMatches(transition, symbol)) result.add(transition.to)
    }
  }
  return result
}

function pathValidityAfter(validity, symbol) {
  if (validity === 3) return 3
  if (symbol === '/') return validity === 1 ? 2 : 3
  return 1
}

function automataAlphabet(patterns) {
  const literals = new Set()
  for (const pattern of patterns) {
    for (const character of normalizeRelativePath(pattern)) {
      if (character !== '/' && character !== '*' && character !== '?') literals.add(character)
    }
  }
  return ['/', ...literals, OTHER_SYMBOL]
}

function subsetKey(subset) { return [...subset].sort((left, right) => left - right).join(',') }

function buildGlobDfa(pattern, alphabet) {
  const automaton = compileGlob(pattern)
  const states = []
  const byKey = new Map()
  const pending = []
  function getState(validity, subset) {
    const key = `${validity}:${subsetKey(subset)}`
    const existing = byKey.get(key)
    if (existing !== undefined) return existing
    if (states.length >= AUTOMATA_STATE_LIMIT) throw new Error(`glob 自动机状态超过限制：${pattern}`)
    const index = states.length
    states.push({
      accepting: validity === 1 && subset.has(automaton.end),
      subset,
      validity,
      transitions: new Map(),
    })
    byKey.set(key, index)
    pending.push(index)
    return index
  }
  const start = getState(0, epsilonClosure(automaton, [automaton.start]))
  while (pending.length > 0) {
    const index = pending.shift()
    const state = states[index]
    for (const symbol of alphabet) {
      const validity = pathValidityAfter(state.validity, symbol)
      const subset = validity === 3
        ? new Set()
        : epsilonClosure(automaton, move(automaton, state.subset, symbol))
      state.transitions.set(symbol, getState(validity, subset))
    }
  }
  return { states, start }
}

function exactCoverage(sources, targets) {
  const owners = [...sources, ...targets]
  const patterns = [...new Set(owners.flatMap(owner => [...owner.scope, ...owner.exclude]))]
  const alphabet = automataAlphabet(patterns)
  const dfas = patterns.map(pattern => buildGlobDfa(pattern, alphabet))
  const patternIndex = new Map(patterns.map((pattern, index) => [pattern, index]))
  const indexedOwners = owners.map(owner => ({
    scope: owner.scope.map(pattern => patternIndex.get(pattern)),
    exclude: owner.exclude.map(pattern => patternIndex.get(pattern)),
  }))
  const sourceOwners = indexedOwners.slice(0, sources.length)
  const targetOwners = indexedOwners.slice(sources.length)
  function sideAllows(side, state) {
    return side.some(owner => (
      owner.scope.some(index => dfas[index].states[state[index]].accepting)
      && !owner.exclude.some(index => dfas[index].states[state[index]].accepting)
    ))
  }
  const start = dfas.map(dfa => dfa.start)
  const pending = [start]
  const visited = new Set([start.join(',')])
  while (pending.length > 0) {
    const state = pending.shift()
    if (sideAllows(sourceOwners, state) !== sideAllows(targetOwners, state)) return false
    for (const symbol of alphabet) {
      const next = dfas.map((dfa, index) => dfa.states[state[index]].transitions.get(symbol))
      const key = next.join(',')
      if (visited.has(key)) continue
      if (visited.size >= AUTOMATA_STATE_LIMIT) throw new Error('glob 有效范围等值自动机状态超过限制')
      visited.add(key)
      pending.push(next)
    }
  }
  return true
}

function applyOperation(registry, operation) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new Error('Owner Registry operation 必须是对象')
  }
  const reason = text(operation?.reason, 'operation.reason')
  const owners = registry.owners.map(owner => ({ ...owner, scope: [...owner.scope], exclude: [...owner.exclude] }))
  let affected = []
  if (operation.type === 'add') { const owner = normalizeRegistryOwner(operation.owner); if (owners.some(item => item.id === owner.id)) throw new Error('Owner 已存在'); owners.push(owner); affected = [owner.id] }
  else if (operation.type === 'remove') { const owner = find(owners, text(operation.ownerId, 'remove.ownerId')); if (owners.some(item => item.parentOwnerId === owner.id)) throw new Error('不能移除仍有子 Owner 的 Owner'); owners.splice(owners.indexOf(owner), 1); affected = [owner.id] }
  else if (operation.type === 'transfer') {
    const source = find(owners, text(operation.fromOwnerId, 'transfer.fromOwnerId')); const target = find(owners, text(operation.toOwnerId, 'transfer.toOwnerId'))
    if (source.id === target.id) throw new Error('转交源与目标不能相同')
    const scope = list(operation.scope, 'transfer.scope')
    const before = [source, target].map(owner => ({ ...owner, scope: [...owner.scope], exclude: [...owner.exclude] }))
    source.declaredExclude = [...new Set([...source.declaredExclude, ...scope])]
    source.exclude = [...new Set([...source.declaredExclude, ...source.managedExclude])]
    target.scope = [...new Set([...target.scope, ...scope])]
    if (!exactCoverage(before, [source, target])) throw new Error('转交必须保持源与目标 Owner 的有效范围守恒')
    affected = [source.id, target.id]
  } else if (operation.type === 'split') {
    const source = find(owners, text(operation.ownerId, 'split.ownerId'))
    if (!Array.isArray(operation.owners)) throw new Error('split.owners 必须是数组')
    const children = operation.owners.map(normalizeRegistryOwner)
    if (children.length < 2 || new Set(children.map(owner => owner.id)).size !== children.length) throw new Error('拆分结果必须是至少两个不重复 Owner')
    if (!exactCoverage([source], children)) throw new Error('拆分范围必须保持来源 Owner 的有效范围')
    owners.splice(owners.indexOf(source), 1, ...children); affected = [source.id, ...children.map(owner => owner.id)]
  } else if (operation.type === 'merge') {
    const ids = list(operation.ownerIds, 'merge.ownerIds'); if (ids.length < 2) throw new Error('合并至少需要两个不同 Owner')
    const sources = ids.map(id => find(owners, id)); const owner = normalizeRegistryOwner(operation.owner)
    if (owners.some(item => item.id === owner.id && !ids.includes(owner.id))) throw new Error('合并目标 Owner 已存在')
    if (!exactCoverage(sources, [owner])) {
      throw new Error('合并范围必须保持全部来源 Owner 的有效范围')
    }
    owners.splice(0, owners.length, ...owners.filter(item => !ids.includes(item.id)), owner); affected = [...ids, owner.id]
  } else throw new Error(`不支持的 Owner Registry 操作：${String(operation?.type)}`)
  return { registry: normalizeRegistry({ config: registry.config, owners }), reason, affected }
}

function applyOperations(registry, operation) {
  if (operation?.type !== 'batch') return applyOperation(registry, operation)
  if (!Array.isArray(operation.operations)) throw new Error('batch.operations 必须是数组')
  if (operation.operations.length === 0) throw new Error('batch.operations 不能为空')
  if (operation.operations.length > MAX_BATCH_OPERATIONS) {
    throw new Error(`batch.operations 最多包含 ${MAX_BATCH_OPERATIONS} 项变更`)
  }
  let current = registry
  const reasons = []
  const affected = []
  for (const [index, item] of operation.operations.entries()) {
    if (item?.type === 'batch') throw new Error(`batch.operations[${index}] 不能嵌套 batch`)
    const result = applyOperation(current, item)
    current = result.registry
    reasons.push(result.reason)
    affected.push(...result.affected)
  }
  const reason = operation.reason === undefined
    ? `一次性提交 ${operation.operations.length} 项 Owner Registry 变更：${reasons.join('；')}`
    : text(operation.reason, 'batch.reason')
  return { registry: current, reason, affected }
}

function proposalPayload(proposal) {
  return {
    contract: PROPOSAL,
    operation: proposal.operation,
    ...(proposal.operation === 'batch' && Array.isArray(proposal.operations)
      ? { operations: proposal.operations }
      : {}),
    reason: proposal.reason,
    before: proposal.before,
    after: proposal.after,
    affectedOwnerIds: proposal.affectedOwnerIds,
  }
}

export function proposeRegistryChange(registry, operation) {
  try {
    const before = normalizeRegistry(registry)
    const { registry: after, reason, affected } = applyOperations(before, operation)
    const proposal = {
      contract: PROPOSAL,
      operation: operation.type,
      ...(operation.type === 'batch' ? { operations: structuredClone(operation.operations) } : {}),
      reason,
      before,
      after,
      affectedOwnerIds: [...new Set(affected)],
    }
    return Object.freeze({ ...proposal, digest: digest(proposal) })
  } catch (error) {
    throw userBoundaryError(error, '无法生成 Owner Registry 提案')
  }
}

export async function applyApprovedRegistryChange(root, proposal) {
  try {
    if (proposal?.contract !== PROPOSAL || typeof proposal.approvedDigest !== 'string'
      || proposal.approvedDigest !== proposal.digest) {
      throw new Error('Owner Registry 提案 digest 未获批准')
    }
    return await withLock(root, async context => {
      const current = await loadRegistryUnlocked(root)
      if (digest(proposal.before) !== digest(current)) throw new Error('Owner Registry 快照已变化')
      const expected = proposalPayload(proposal)
      if (digest(expected) !== proposal.digest) throw new Error('Owner Registry 提案已被篡改')
      const normalizedAfter = normalizeRegistry(proposal.after)
      await assertRegistryPaths(root)
      return installRegistry(root, normalizedAfter, context, { baseExisted: true })
    })
  } catch (error) {
    throw userBoundaryError(error, '无法应用已批准的 Owner Registry 提案')
  }
}

export async function installApprovedRegistrySnapshot(root, {
  before,
  after,
  approvedDigest,
}) {
  try {
    if (typeof approvedDigest !== 'string' || approvedDigest.trim() === '') {
      throw new Error('Owner Registry 快照缺少已批准摘要')
    }
    const normalizedBefore = normalizeRegistry(before)
    const normalizedAfter = normalizeRegistry(after)
    return await withLock(root, async context => {
      const current = await loadRegistryUnlocked(root)
      if (digest(normalizedBefore) !== digest(current)) throw new Error('Owner Registry 快照已变化')
      await assertRegistryPaths(root)
      return installRegistry(root, normalizedAfter, context, { baseExisted: true })
    })
  } catch (error) {
    throw userBoundaryError(error, '无法固定已批准的项目级 Owner Registry')
  }
}
