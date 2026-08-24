import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, normalize, relative, sep } from 'node:path'
import { changedFiles, head, verifyCommitSha } from './git.mjs'

export const MEMORY_DIRECTORY = '.owner-memory'
export const MEMORY_SOURCE_DIRECTORY = '.sources'
export const MEMORY_CATALOG_FILE = '.catalog.json'
export const MEMORY_CURATOR_CONTRACT = 'DSH_OWNER_MEMORY_CURATOR_V1'
export const MEMORY_REVIEW_CONTRACT = 'DSH_OWNER_MEMORY_REVIEW_V1'
export const OWNER_WORKLOG_CONTRACT = 'DSH_OWNER_WORKLOG_V1'

const MEMORY_TYPES = new Set(['architecture', 'interface', 'decision', 'procedure', 'concept', 'history'])
const OWNER_ID = /^[a-z][a-z0-9_-]{0,63}$/u
const MEMORY_ID = /^[a-z0-9][a-z0-9._:-]{0,199}$/iu
const SENSITIVE_CONTENT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[a-z0-9_-]{16,}|\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[a-z0-9_./+=-]{12,}/iu
const WORKLOG_NOTE_TYPES = new Set(['完成', '结论', '下一步', '阻塞'])
const MAX_WORKLOG_NOTES = 16
const MAX_WORKLOG_NOTE_LENGTH = 240
const MAX_MEMORY_SUMMARY_LENGTH = 240
const MAX_MEMORY_CONTENT_LENGTH = 720

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 必须是非空字符串`)
  return value.trim()
}

function conciseText(value, field, maximum) {
  const result = requiredText(value, field).replace(/\s+/gu, ' ')
  if (result.length > maximum) throw new Error(`${field} 不能超过 ${maximum} 个字符`)
  if (SENSITIVE_CONTENT.test(result)) throw new Error(`${field} 疑似包含密钥、令牌、密码或私钥，不能进入 Owner 记忆`)
  return result
}

function textList(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  return [...new Set(value.map((item, index) => requiredText(item, `${field}[${index}]`)))]
}

function repositoryPath(value, field) {
  const raw = requiredText(value, field).replaceAll('\\', '/').replace(/^\.\//u, '')
  if (/[\0\r\n]/u.test(raw)) throw new Error(`${field} 不能包含控制字符`)
  const cleaned = normalize(raw).replaceAll(sep, '/')
  if (cleaned === '.' || cleaned.startsWith('/') || cleaned === '..' || cleaned.startsWith('../')) {
    throw new Error(`${field} 必须是仓库相对路径：${value}`)
  }
  return cleaned
}

function repositoryPaths(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是路径数组`)
  const result = [...new Set(value.map((item, index) => repositoryPath(item, `${field}[${index}]`)))]
  for (const path of result) {
    if (path === '.git' || path.startsWith('.git/')
      || path === '.dsh-workflow' || path.startsWith('.dsh-workflow/')
      || path === MEMORY_DIRECTORY || path.startsWith(`${MEMORY_DIRECTORY}/`)) {
      throw new Error(`${field} 不能引用运行时或记忆管理路径：${path}`)
    }
  }
  return result
}

function ownerIds(value, field) {
  const result = textList(value, field)
  for (const ownerId of result) {
    if (!OWNER_ID.test(ownerId)) throw new Error(`${field} 包含无效 Owner 编号：${ownerId}`)
  }
  return result
}

function memoryIds(value, field) {
  const result = textList(value, field)
  for (const id of result) {
    if (!MEMORY_ID.test(id)) throw new Error(`${field} 包含无效记忆编号：${id}`)
  }
  return result
}

function memoryType(value, field) {
  const result = requiredText(value, field)
  if (!MEMORY_TYPES.has(result)) throw new Error(`${field} 不受支持：${result}`)
  return result
}

function worklogNote(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`worklog.notes[${index}] 必须是对象`)
  }
  const type = requiredText(raw.type, `worklog.notes[${index}].type`)
  if (!WORKLOG_NOTE_TYPES.has(type)) throw new Error(`worklog.notes[${index}].type 不受支持：${type}`)
  return { type, text: conciseText(raw.text, `worklog.notes[${index}].text`, MAX_WORKLOG_NOTE_LENGTH) }
}

/** 创建仅服务于当前未完成任务的短期工作记忆；它不进入 Owner 长期知识页。 */
export function createOwnerWorklog({ taskId, title, ownerId }) {
  return {
    contract: OWNER_WORKLOG_CONTRACT,
    taskId: conciseText(taskId, 'worklog.taskId', 120),
    title: conciseText(title, 'worklog.title', 160),
    ownerId: ownerIds([ownerId], 'worklog.ownerId')[0],
    status: 'active',
    notes: [],
  }
}

export function normalizeOwnerWorklog(raw, expected = {}) {
  if (raw === undefined) return createOwnerWorklog(expected)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Owner 临时记忆必须是对象')
  if (raw.contract !== OWNER_WORKLOG_CONTRACT) throw new Error(`Owner 临时记忆契约不受支持：${String(raw.contract)}`)
  const result = createOwnerWorklog({
    taskId: raw.taskId,
    title: raw.title,
    ownerId: raw.ownerId,
  })
  if (expected.taskId !== undefined && result.taskId !== expected.taskId) throw new Error('Owner 临时记忆 taskId 与当前任务不一致')
  if (expected.ownerId !== undefined && result.ownerId !== expected.ownerId) throw new Error('Owner 临时记忆 ownerId 与当前 Owner 不一致')
  if (!['active', 'sealed'].includes(raw.status)) throw new Error(`Owner 临时记忆状态不受支持：${String(raw.status)}`)
  if (!Array.isArray(raw.notes) || raw.notes.length > MAX_WORKLOG_NOTES) {
    throw new Error(`Owner 临时记忆 notes 必须是最多 ${MAX_WORKLOG_NOTES} 项的数组`)
  }
  return { ...result, status: raw.status, notes: raw.notes.map(worklogNote) }
}

/** Owner 只允许追加简短工作结论，不能把临时记忆变成逐行开发流水账。 */
export function appendOwnerWorklogNote(raw, note, expected = {}) {
  const worklog = normalizeOwnerWorklog(raw, expected)
  if (worklog.status !== 'active') throw new Error('已封存的 Owner 临时记忆不能继续追加')
  if (worklog.notes.length >= MAX_WORKLOG_NOTES) throw new Error(`Owner 临时记忆最多保留 ${MAX_WORKLOG_NOTES} 条简短记录`)
  const normalized = worklogNote(note, worklog.notes.length)
  if (worklog.notes.some(item => item.type === normalized.type && item.text === normalized.text)) return worklog
  return { ...worklog, notes: [...worklog.notes, normalized] }
}

export function worklogPromptSnapshot(raw, expected = {}) {
  const worklog = normalizeOwnerWorklog(raw, expected)
  return {
    taskId: worklog.taskId,
    title: worklog.title,
    notes: worklog.notes,
  }
}

export function normalizeMemoryUpdates(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('memory_updates 必须是数组')
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`memory_updates[${index}] 必须是对象`)
    }
    const files = repositoryPaths(item.files, `memory_updates[${index}].files`)
    if (files.length === 0) throw new Error(`memory_updates[${index}].files 不能为空，长期记忆必须保留代码来源`)
    const title = requiredText(item.title, `memory_updates[${index}].title`)
    const summary = requiredText(item.summary, `memory_updates[${index}].summary`)
    if (SENSITIVE_CONTENT.test(`${title}\n${summary}`)) throw new Error(`memory_updates[${index}] 疑似包含敏感凭据，不能进入长期记忆提议`)
    return {
      type: memoryType(item.type, `memory_updates[${index}].type`),
      title,
      summary,
      files,
      ownerIds: ownerIds(item.ownerIds, `memory_updates[${index}].ownerIds`),
      supersedes: memoryIds(item.supersedes, `memory_updates[${index}].supersedes`),
      derivedFrom: memoryIds(item.derivedFrom, `memory_updates[${index}].derivedFrom`),
    }
  })
}

function normalizePagePath(value, field, pageOwnerIds, knownOwnerIds) {
  const path = repositoryPath(value, field)
  if (!path.endsWith('.md')) throw new Error(`${field} 必须指向 Markdown 文件：${path}`)
  if (path === 'index.md' || path === 'log.md') throw new Error(`${field} 不能覆盖运行时维护的索引或日志`)
  const [root, ownerId] = path.split('/')
  if (root === 'owners') {
    if (!knownOwnerIds.has(ownerId)) throw new Error(`${field} 指向不存在的 Owner：${ownerId}`)
    if (!pageOwnerIds.includes(ownerId)) throw new Error(`${field} 的 Owner 与 ownerIds 不一致：${ownerId}`)
    return path
  }
  if (!['interfaces', 'concepts', 'decisions'].includes(root)) {
    throw new Error(`${field} 只能位于 owners、interfaces、concepts 或 decisions 下：${path}`)
  }
  return path
}

export function normalizeCuratorResult(raw, plan) {
  if (raw?.contract !== MEMORY_CURATOR_CONTRACT) {
    throw new Error(`记忆整理结果契约不受支持：${String(raw?.contract)}`)
  }
  const knownOwnerIds = new Set(plan.owners.map(owner => owner.id))
  if (!Array.isArray(raw.pages)) throw new Error('记忆整理结果 pages 必须是数组')
  const paths = new Set()
  const pages = raw.pages.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`pages[${index}] 必须是对象`)
    }
    const pageOwnerIds = ownerIds(item.ownerIds, `pages[${index}].ownerIds`)
    if (pageOwnerIds.length === 0) throw new Error(`pages[${index}].ownerIds 不能为空，记忆页面必须可以路由到 Owner`)
    for (const ownerId of pageOwnerIds) {
      if (!knownOwnerIds.has(ownerId)) throw new Error(`pages[${index}] 引用了不存在的 Owner：${ownerId}`)
    }
    const path = normalizePagePath(item.path, `pages[${index}].path`, pageOwnerIds, knownOwnerIds)
    if (paths.has(path)) throw new Error(`记忆整理结果包含重复页面：${path}`)
    paths.add(path)
    const files = repositoryPaths(item.files, `pages[${index}].files`)
    if (files.length === 0) throw new Error(`pages[${index}].files 不能为空，记忆页面必须保留代码来源`)
    const title = conciseText(item.title, `pages[${index}].title`, 120)
    const summary = conciseText(item.summary, `pages[${index}].summary`, MAX_MEMORY_SUMMARY_LENGTH)
    const content = conciseText(item.content, `pages[${index}].content`, MAX_MEMORY_CONTENT_LENGTH)
    const tags = textList(item.tags, `pages[${index}].tags`)
    if (SENSITIVE_CONTENT.test(`${title}\n${summary}\n${content}\n${tags.join('\n')}`)) {
      throw new Error(`pages[${index}] 疑似包含密钥、令牌、密码或私钥，不能写入 Git 长期记忆`)
    }
    return {
      id: item.id === undefined ? undefined : memoryIds([item.id], `pages[${index}].id`)[0],
      path,
      type: memoryType(item.type, `pages[${index}].type`),
      title,
      summary,
      content,
      ownerIds: pageOwnerIds,
      tags,
      files,
      supersedes: memoryIds(item.supersedes, `pages[${index}].supersedes`),
      derivedFrom: memoryIds(item.derivedFrom, `pages[${index}].derivedFrom`),
    }
  })
  const summary = conciseText(raw.summary, 'memory.summary', MAX_MEMORY_SUMMARY_LENGTH)
  for (const page of pages) {
    const id = pageId(page)
    if (page.supersedes.includes(id) || page.derivedFrom.includes(id)) {
      throw new Error(`记忆页面 ${page.path} 不能在 supersedes 或 derivedFrom 中引用自身：${id}`)
    }
  }
  return {
    contract: MEMORY_CURATOR_CONTRACT,
    summary,
    pages,
  }
}

export function normalizeMemoryReview(raw) {
  if (raw?.contract !== MEMORY_REVIEW_CONTRACT) {
    throw new Error(`记忆审查结果契约不受支持：${String(raw?.contract)}`)
  }
  const status = requiredText(raw.status, 'memory_review.status')
  if (!['passed', 'needs_revision'].includes(status)) throw new Error(`记忆审查状态不受支持：${status}`)
  return {
    contract: MEMORY_REVIEW_CONTRACT,
    status,
    summary: requiredText(raw.summary, 'memory_review.summary'),
    issues: textList(raw.issues, 'memory_review.issues'),
  }
}

async function markdownFiles(directory) {
  if (!existsSync(directory)) return []
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await markdownFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(path)
  }
  return result
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'mu'))
  if (match === null) return undefined
  try { return JSON.parse(match[1]) } catch { return match[1].trim() }
}

function sourcePaths(content) {
  const sources = []
  for (const match of content.matchAll(/^\s*-\s+path:\s*(.+)$/gmu)) {
    try { sources.push(JSON.parse(match[1])) } catch { sources.push(match[1].trim()) }
  }
  return sources.filter(value => typeof value === 'string')
}

async function loadMemoryCatalog(worktree) {
  const path = join(worktree, MEMORY_DIRECTORY, MEMORY_CATALOG_FILE)
  if (!existsSync(path)) return { contract: 'DSH_OWNER_MEMORY_CATALOG_V1', pages: {} }
  let parsed
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error('Owner 记忆目录的隐藏目录索引无法解析')
  }
  if (parsed?.contract !== 'DSH_OWNER_MEMORY_CATALOG_V1'
    || parsed.pages === null || typeof parsed.pages !== 'object' || Array.isArray(parsed.pages)) {
    throw new Error('Owner 记忆目录的隐藏目录索引契约不受支持')
  }
  return parsed
}

function pageMetadata(content, catalog, path) {
  const catalogEntry = catalog.pages?.[path]
  if (catalogEntry !== undefined) return catalogEntry
  // 兼容之前已写入 Git 的 frontmatter 页面；新页面的展示正文不再携带审计元数据。
  return {
    id: frontmatterValue(content, 'id'),
    owners: frontmatterValue(content, 'owners'),
    status: frontmatterValue(content, 'status') ?? 'verified',
    verifiedAtCommit: frontmatterValue(content, 'verified_at_commit'),
    sources: sourcePaths(content),
  }
}

function includeForOwners(path, content, selectedOwnerIds, metadata) {
  if (path.startsWith(`${MEMORY_SOURCE_DIRECTORY}/`)) return false
  if (selectedOwnerIds.length === 0) return true
  if (path === 'index.md' || selectedOwnerIds.some(ownerId => path.startsWith(`owners/${ownerId}/`))) return true
  if (['interfaces/', 'concepts/', 'decisions/'].some(prefix => path.startsWith(prefix))) {
    const pageOwnerIds = metadata.owners ?? frontmatterValue(content, 'owners')
    return Array.isArray(pageOwnerIds) && pageOwnerIds.some(ownerId => selectedOwnerIds.includes(ownerId))
  }
  return false
}

export async function loadMemorySnapshot(worktree, options = {}) {
  const directory = join(worktree, MEMORY_DIRECTORY)
  const files = await markdownFiles(directory)
  const catalog = await loadMemoryCatalog(worktree)
  const currentHead = await head(worktree, options.signal).catch(() => undefined)
  const maxBytes = Math.max(8_192, Number(options.maxBytes ?? 96 * 1024))
  const documents = []
  const selectedOwnerIds = [...new Set([
    ...(Array.isArray(options.ownerIds) ? options.ownerIds : []),
    ...(options.ownerId === undefined ? [] : [options.ownerId]),
  ])]
  let consumed = 0
  let selectedCount = 0
  const digestParts = []
  const changeCache = new Map()
  for (const absolute of files.sort()) {
    const path = relative(directory, absolute).replaceAll(sep, '/')
    const content = await readFile(absolute, 'utf8')
    const metadata = pageMetadata(content, catalog, path)
    if (!includeForOwners(path, content, selectedOwnerIds, metadata)) continue
    selectedCount += 1
    let computedStatus = metadata.status ?? 'verified'
    const verifiedAtCommit = metadata.verifiedAtCommit
    const sources = Array.isArray(metadata.sources) ? metadata.sources : sourcePaths(content)
    if (computedStatus !== 'superseded' && currentHead !== undefined && typeof verifiedAtCommit === 'string' && sources.length > 0) {
      if (!changeCache.has(verifiedAtCommit)) {
        changeCache.set(verifiedAtCommit, verifyCommitSha(worktree, verifiedAtCommit, options.signal)
          .then(commit => changedFiles(worktree, commit, currentHead, options.signal))
          .catch(() => undefined))
      }
      const changed = await changeCache.get(verifiedAtCommit)
      if (changed === undefined) computedStatus = 'unknown'
      else if (sources.some(source => changed.includes(source))) computedStatus = 'stale'
    }
    digestParts.push(`${path}\0${computedStatus}\0${content}`)
    const bytes = Buffer.byteLength(content, 'utf8')
    if (consumed + bytes > maxBytes) continue
    consumed += bytes
    documents.push({ path, computedStatus, content })
  }
  const digest = createHash('sha256')
    .update(digestParts.join('\0'))
    .digest('hex')
  return { directory: MEMORY_DIRECTORY, digest, documents, truncated: selectedCount > documents.length }
}

function slug(value) {
  return value.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80) || 'memory'
}

export function fallbackCuratorResult(stage, entries, plan) {
  const pages = []
  for (const entry of entries) {
    for (const [index, update] of (entry.report.memoryUpdates ?? []).entries()) {
      const pageOwnerIds = update.ownerIds.length > 0 ? update.ownerIds : [entry.owner.id]
      const root = update.type === 'interface' && pageOwnerIds.length > 1
        ? 'interfaces'
        : `owners/${pageOwnerIds[0]}`
      pages.push({
        path: `${root}/${slug(update.title)}-${index + 1}.md`,
        type: update.type,
        title: update.title,
        summary: update.summary,
        content: update.summary,
        ownerIds: pageOwnerIds,
        tags: [stage.id, update.type],
        files: update.files,
        supersedes: update.supersedes,
        derivedFrom: update.derivedFrom,
      })
    }
  }
  return normalizeCuratorResult({
    contract: MEMORY_CURATOR_CONTRACT,
    summary: pages.length > 0 ? `整理 ${pages.length} 条 Owner 长期记忆` : '本阶段没有需要新增的长期知识页面',
    pages,
  }, plan)
}

function pageId(page) {
  if (page.id !== undefined) return page.id
  const candidate = `memory.${page.path.replace(/\.md$/u, '').replaceAll('/', '.')}`
  if (MEMORY_ID.test(candidate)) return candidate
  return `memory.page.${createHash('sha256').update(page.path).digest('hex').slice(0, 16)}`
}

function nextCatalog(catalog, curator, context) {
  const pages = { ...(catalog.pages ?? {}) }
  const replacements = new Map()
  for (const page of curator.pages) {
    for (const id of page.supersedes) replacements.set(id, pageId(page))
  }
  for (const metadata of Object.values(pages)) {
    if (metadata !== null && typeof metadata === 'object' && replacements.has(metadata.id)) {
      metadata.status = 'superseded'
      metadata.supersededBy = replacements.get(metadata.id)
    }
  }
  for (const page of curator.pages) {
    pages[page.path] = {
      id: pageId(page),
      owners: page.ownerIds,
      status: 'verified',
      type: page.type,
      tags: page.tags,
      sources: page.files,
      verifiedAtCommit: context.verifiedAtCommit,
      supersedes: page.supersedes,
      derivedFrom: page.derivedFrom,
    }
  }
  return { contract: 'DSH_OWNER_MEMORY_CATALOG_V1', pages }
}

/**
 * Curator 可以正确判定“无需新页面”，但仍会重新核对既有页面引用的来源文件。
 * 此时仅刷新可机械验证的 verifiedAtCommit，不改写正文、Owner、来源或结论。
 */
function refreshCatalogVerification(catalog, context = {}) {
  const refreshedSources = new Set(repositoryPaths(
    context.refreshSources ?? [],
    'refreshSources',
  ))
  const verifiedAtCommit = context.verifiedAtCommit
  if (refreshedSources.size === 0 || typeof verifiedAtCommit !== 'string' || verifiedAtCommit.trim() === '') {
    return false
  }
  let changed = false
  for (const [path, metadata] of Object.entries(catalog.pages ?? {})) {
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error(`Owner 记忆目录包含无效页面元数据：${path}`)
    }
    if (metadata.status === 'superseded') continue
    const sources = repositoryPaths(metadata.sources, `catalog.pages[${path}].sources`)
    if (!sources.some(source => refreshedSources.has(source))) continue
    if (metadata.verifiedAtCommit === verifiedAtCommit && metadata.status === 'verified') continue
    metadata.verifiedAtCommit = verifiedAtCommit
    metadata.status = 'verified'
    changed = true
  }
  return changed
}

async function writeMemoryCatalog(worktree, catalog, validateTarget) {
  const path = join(worktree, MEMORY_DIRECTORY, MEMORY_CATALOG_FILE)
  await validateTarget?.(path)
  await mkdir(dirname(path), { recursive: true })
  await validateTarget?.(path)
  await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  return `${MEMORY_DIRECTORY}/${MEMORY_CATALOG_FILE}`
}

/**
 * 当前 Memory 是 Runtime 维护的编译产物。这里仅修复可机械判定的自引用，
 * 不猜测或改写任何页面正文、Owner、来源文件或长期结论。
 */
export async function repairMemoryCatalogSelfReferences(worktree, context = {}) {
  const catalog = await loadMemoryCatalog(worktree)
  let changed = false
  for (const [path, metadata] of Object.entries(catalog.pages)) {
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error(`Owner 记忆目录包含无效页面元数据：${path}`)
    }
    const id = memoryIds([metadata.id], `catalog.pages[${path}].id`)[0]
    for (const field of ['supersedes', 'derivedFrom']) {
      const current = memoryIds(metadata[field], `catalog.pages[${path}].${field}`)
      const next = current.filter(reference => reference !== id)
      if (next.length === current.length) continue
      metadata[field] = next
      changed = true
    }
  }
  if (!changed) return []
  return [await writeMemoryCatalog(worktree, catalog, context.validateTarget)]
}

/** 仅刷新已由当前阶段 Curator/Reviewer 重新核对过的既有页面验证基线。 */
export async function refreshMemoryCatalogVerification(worktree, context = {}) {
  const catalog = await loadMemoryCatalog(worktree)
  const verifiedAtCommit = await verifyCommitSha(
    worktree,
    requiredText(context.verifiedAtCommit, 'verifiedAtCommit'),
    context.signal,
  )
  if (!refreshCatalogVerification(catalog, { ...context, verifiedAtCommit })) return []
  return [await writeMemoryCatalog(worktree, catalog, context.validateTarget)]
}

export function renderMemoryPage(page, context) {
  const body = page.content === page.summary ? [page.summary] : [page.summary, page.content]
  return [`# ${page.title}`, '', ...body, ''].join('\n')
}

function sourceSegment(value, label) {
  const source = conciseText(value, label, 120)
  return source.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'memory'
}

function safeReportSummary(value) {
  if (typeof value !== 'string' || value.trim() === '' || SENSITIVE_CONTENT.test(value)) return undefined
  return conciseText(value, '任务最终摘要', MAX_WORKLOG_NOTE_LENGTH)
}

/** 将未完成任务的短期日志封存为编译源；正文只保留可读的功能结论。 */
export async function writeSealedOwnerWorklog(worktree, context) {
  const worklog = normalizeOwnerWorklog(context.worklog, {
    taskId: context.task.id,
    ownerId: context.owner.id,
  })
  const sourcePath = `${MEMORY_SOURCE_DIRECTORY}/${sourceSegment(context.workflowId, 'workflowId')}/${sourceSegment(context.task.id, 'taskId')}.md`
  const notes = worklog.notes.map(note => `- ${note.type}：${note.text}`)
  const finalSummary = safeReportSummary(context.report?.summary)
  if (finalSummary !== undefined && !worklog.notes.some(note => note.text === finalSummary)) {
    notes.push(`- 交付：${finalSummary}`)
  }
  for (const change of context.report?.changes ?? []) {
    const summary = safeReportSummary(change?.summary)
    if (summary !== undefined && !notes.some(note => note.endsWith(`：${summary}`))) notes.push(`- 变更：${summary}`)
  }
  if (notes.length === 0) notes.push('- 交付：本次任务没有留下需要长期解释的功能变化。')
  const path = join(worktree, MEMORY_DIRECTORY, sourcePath)
  await context.validateTarget?.(path)
  await mkdir(dirname(path), { recursive: true })
  await context.validateTarget?.(path)
  await writeFile(path, [`# ${worklog.title}`, '', ...notes, ''].join('\n'), 'utf8')
  return `${MEMORY_DIRECTORY}/${sourcePath}`
}

function stageLogSection(context) {
  const marker = `${context.workflowId}:${context.stage.id}`
  const ownerSummaries = context.entries.map(entry => {
    const summary = entry.report.summary
    return `${entry.owner.id}：${SENSITIVE_CONTENT.test(summary) ? '[敏感摘要已省略]' : summary}`
  })
  return [
    `<!-- owner-memory-stage:${marker}:start -->`,
    `## ${context.stage.name}（${context.stage.id}）`,
    '',
    ...ownerSummaries.map(summary => `- ${summary}`),
    '',
    `<!-- owner-memory-stage:${marker}:end -->`,
  ].join('\n')
}

async function upsertStageLog(worktree, context) {
  const path = join(worktree, MEMORY_DIRECTORY, 'log.md')
  const header = '# Owner 记忆编译日志\n\n该文件由 Owner 工作流运行时按阶段维护，不接受 Owner 直接编辑。\n'
  const current = existsSync(path) ? await readFile(path, 'utf8') : header
  const section = stageLogSection(context)
  const marker = `${context.workflowId}:${context.stage.id}`
  const pattern = new RegExp(`<!-- owner-memory-stage:${marker}:start -->[\\s\\S]*?<!-- owner-memory-stage:${marker}:end -->`, 'u')
  const next = pattern.test(current)
    ? current.replace(pattern, section)
    : `${current.trimEnd()}\n\n${section}\n`
  await context.validateTarget?.(path)
  await mkdir(dirname(path), { recursive: true })
  await context.validateTarget?.(path)
  await writeFile(path, next, 'utf8')
  return `${MEMORY_DIRECTORY}/log.md`
}

async function rebuildIndex(worktree, validateTarget) {
  const directory = join(worktree, MEMORY_DIRECTORY)
  const files = (await markdownFiles(directory))
    .map(path => relative(directory, path).replaceAll(sep, '/'))
    .filter(path => !['index.md', 'log.md'].includes(path) && !path.startsWith(`${MEMORY_SOURCE_DIRECTORY}/`))
    .sort()
  const lines = ['# Owner 当前记忆', '', '这里仅保留当前有效且可复用的简短结论。', '']
  for (const path of files) {
    const content = await readFile(join(directory, path), 'utf8')
    const title = content.match(/^#\s+(.+)$/mu)?.[1] ?? basename(path, '.md')
    lines.push(`- [${title}](${path})`)
  }
  if (files.length === 0) lines.push('- 暂无长期知识页面。')
  lines.push('')
  await validateTarget?.(join(directory, 'index.md'))
  await mkdir(directory, { recursive: true })
  await validateTarget?.(join(directory, 'index.md'))
  await writeFile(join(directory, 'index.md'), lines.join('\n'), 'utf8')
  return `${MEMORY_DIRECTORY}/index.md`
}

export async function writeMemoryBundle(worktree, curator, context) {
  const catalog = nextCatalog(await loadMemoryCatalog(worktree), curator, context)
  refreshCatalogVerification(catalog, context)
  const written = []
  for (const page of curator.pages) {
    const path = join(worktree, MEMORY_DIRECTORY, page.path)
    await context.validateTarget?.(path)
    await mkdir(dirname(path), { recursive: true })
    await context.validateTarget?.(path)
    await writeFile(path, renderMemoryPage(page, context), 'utf8')
    written.push(`${MEMORY_DIRECTORY}/${page.path}`)
  }
  written.push(await writeMemoryCatalog(worktree, catalog, context.validateTarget))
  written.push(await upsertStageLog(worktree, { ...context, curator }))
  written.push(await rebuildIndex(worktree, context.validateTarget))
  return [...new Set(written)]
}
