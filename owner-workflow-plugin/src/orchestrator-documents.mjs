import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { registerPlanningWriteJournal } from './planning-write-journal.mjs'

const ROOT_DOCUMENTS = ['CONTEXT.md', 'CONTEXT-MAP.md']
const DOCUMENT_DIRECTORIES = ['docs/adr', 'docs/specs']
const GOVERNANCE_FILES = new Set(['agents.md', 'claude.md', 'skill.md'])

export const ORCHESTRATOR_DOCUMENT_GUIDANCE = [
  '需求讨论、术语/ADR、Spec、Ticket 和进度文档由主线程直接维护；此文档入口优先于 audit、Operation 和开发 Workflow，不因保存文档启动 DAG 或追加实施确认。',
  `使用原生 write/edit；允许项目根目录的 ${ROOT_DOCUMENTS.join('、')}，以及 ${DOCUMENT_DIRECTORIES.map(path => `${path}/**/*.md`).join('、')}。优先使用绝对路径，在允许范围内沿用已有文档；write 会创建所需父目录，编辑前先读取现有文件。`,
  'grilling 本身没有固定落盘目录；domain-modeling 将术语写入 CONTEXT.md、架构决定写入 docs/adr/，多上下文索引用 CONTEXT-MAP.md。Ghost Matt Spec/Ticket 默认使用 docs/specs/<主题>/spec.md、tickets/<编号>-<标题>.md 和 progress.md；范围外的旧文档只作为读取来源，不自动扩展写入权限。',
  '文档权限不包含 AGENTS.md、CLAUDE.md、SKILL.md、业务代码、Registry 或运行状态；不通过 Shell、补丁工具、链接或沙箱升级扩展范围。文档中的进度只是记录，执行状态以 Runtime 为准。',
].join('\n')

function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Resolve a local documentation target, rejecting links and ambiguous traversal before mutation. */
export function orchestratorDocumentPath({ root, cwd, filePath }) {
  if (typeof root !== 'string' || !isAbsolute(root)
    || typeof cwd !== 'string' || !isAbsolute(cwd)
    || typeof filePath !== 'string' || filePath.trim() === ''
    || filePath.includes('\0') || filePath.includes('\\')
    || filePath.split('/').includes('..')) return undefined
  try {
    const canonicalRoot = realpathSync(root)
    const canonicalCwd = realpathSync(cwd)
    if (!within(canonicalRoot, canonicalCwd)) return undefined
    // Git may bind the real root while the session retains its original alias.
    // Trust only ancestor spellings whose filesystem identity is that exact root.
    const rootSpellings = new Set([resolve(root), canonicalRoot])
    for (let ancestor = resolve(cwd); ; ancestor = dirname(ancestor)) {
      if (realpathSync(ancestor) === canonicalRoot) rootSpellings.add(ancestor)
      if (ancestor === dirname(ancestor)) break
    }
    const requested = resolve(cwd, filePath)
    // The outermost matching root preserves internal links (including links back
    // to the root) in the suffix, so the checks below can still reject them.
    const spelling = [...rootSpellings].sort((left, right) => left.length - right.length)
      .find(candidate => within(candidate, requested))
    if (spelling === undefined) return undefined
    const path = resolve(canonicalRoot, relative(spelling, requested))
    const rel = relative(canonicalRoot, path).split(sep).join('/')
    const parts = rel.split('/')
    if (parts.some(part => part.startsWith('.'))
      || parts.some(part => GOVERNANCE_FILES.has(part.toLowerCase()))) return undefined
    const allowed = ROOT_DOCUMENTS.includes(rel)
      || (rel.endsWith('.md') && DOCUMENT_DIRECTORIES.some(dir => rel.startsWith(`${dir}/`)))
    if (!allowed) return undefined
    let current = canonicalRoot
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index])
      let stat
      try { stat = lstatSync(current) } catch (error) {
        if (error.code === 'ENOENT') continue
        return undefined
      }
      if (stat.isSymbolicLink()) return undefined
      if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1) return undefined
    }
    return path
  } catch {
    return undefined
  }
}

/** Guard the resolved native target, then retain the native read-before-write/CAS policy. */
export function registerOrchestratorDocumentGuards(ctx, runtime) {
  // Both layers must precede the observation policy, which owns the intent
  // waterfall without calling next(). Register provenance first so the guard
  // added below remains the outermost precondition.
  const journal = registerPlanningWriteJournal(ctx, runtime)
  const guards = ['fs/write-intent', 'fs/edit-intent'].map(event => ctx.on(event, (target, actor, next) => {
    const sessionId = actor?.agent?.id ?? actor?.agent?.session?.header?.id
    if (!runtime.activeOwners.has(sessionId) && !runtime.agentRoles.has(sessionId)) {
      const decision = runtime.checkFilesystemWrite(target, actor, ctx)
      if (decision?.kind === 'deny') throw new Error(decision.reason)
    }
    return next()
  }, { global: true, prepend: true }))
  return [...guards, ...journal]
}
