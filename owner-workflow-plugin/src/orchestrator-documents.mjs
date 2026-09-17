import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { registerPlanningWriteJournal } from './planning-write-journal.mjs'

const ROOT_DOCUMENTS = ['CONTEXT.md', 'CONTEXT-MAP.md']
const DOCUMENT_DIRECTORIES = ['docs/adr', 'docs/specs']
const GOVERNANCE_FILES = new Set(['agents.md', 'claude.md', 'skill.md'])

export const ORCHESTRATOR_DOCUMENT_GUIDANCE = [
  '需求讨论、术语/ADR、Spec、Ticket 和进度文档由主线程直接维护；此文档入口不因保存文档启动 DAG 或追加实施确认。',
  `使用原生 write/edit；允许项目根目录的 ${ROOT_DOCUMENTS.join('、')}，以及 ${DOCUMENT_DIRECTORIES.map(path => `${path}/**/*.md`).join('、')}。优先使用绝对路径，在允许范围内沿用已有文档；write 会创建所需父目录，编辑前先读取现有文件。`,
  'Owner 工作流中的 Glob 必须指定项目相对的窄目录 path。项目根目录的已知文件（README、package、CONTEXT 等）逐个使用原生 read；不得以无 path 或 path="." 的 Glob 搜索根目录。只有先前的原生读取或已成功的窄范围搜索已确认目录存在时，才对 Ticket 使用 {pattern:"**/*.md",path:"docs/specs/<主题>/tickets"}、对 ADR 使用 {pattern:"**/*.md",path:"docs/adr"}；缺失的预期文档目录代表暂无记录，不要为了证明其缺失而发起 Glob。不得搜索 .dsh-workflow 或其子目录。',
  'grilling 本身没有固定落盘目录；domain-modeling 将术语写入 CONTEXT.md、架构决定写入 docs/adr/，多上下文索引用 CONTEXT-MAP.md。Ghost Matt Spec/Ticket 默认使用 docs/specs/<主题>/spec.md、docs/specs/<主题>/tickets/<编号>-<标题>.md 和 docs/specs/<主题>/progress.md；范围外的旧文档只作为读取来源，不自动扩展写入权限。',
  '准备进入 Owner DAG 时，目标 Spec 与每份 Ticket 必须从首次写入起使用严格的 DSH_PLANNING_DOCUMENT_V1 frontmatter：Spec 只能含 planning_document、document_kind=spec、document_id、document_revision、planning_declaration；Ticket 另含 spec_id、spec_revision 且 document_kind=ticket。planning_declaration 必须是一行 JSON：Spec 恰有 id、revision、acceptanceCriteria、contracts；Ticket 恰有 id、revision、spec、acceptanceCriteria、contracts、dependsOn、work。所有 id 与 revision 都是非空字符串（例如 "R1"，绝不能写数字 1）；contracts 的每项只能是 {"id":"...","revision":"..."}；Ticket 的 acceptanceCriteria 每项只能是 {"id":"AC-01","specId":"...","specRevision":"R1"}；Ticket 的 work 必须是 {"ready":[{"id":"implementation"}],"blocked":[]}，不能写成数组。将 Matt 的说明、来源、状态、讨论和正文保留在 Markdown body，不能添加任何额外 frontmatter 字段。每份 Ticket 的 Spec/AC/contract 引用必须和当前 Spec revision 精确一致，work 至少有一个 ready 或 blocked 项。',
  '按下面的形状逐字保留字段和 JSON 类型，再将示例字符串替换为本轮的稳定标识：Spec 的 frontmatter 是 ---\\nplanning_document: DSH_PLANNING_DOCUMENT_V1\\ndocument_kind: spec\\ndocument_id: SPEC-TOPIC\\ndocument_revision: R1\\nplanning_declaration: {"id":"SPEC-TOPIC","revision":"R1","acceptanceCriteria":["AC-01"],"contracts":[]}\\n---；Ticket 的 frontmatter 是 ---\\nplanning_document: DSH_PLANNING_DOCUMENT_V1\\ndocument_kind: ticket\\ndocument_id: T-01\\ndocument_revision: R1\\nspec_id: SPEC-TOPIC\\nspec_revision: R1\\nplanning_declaration: {"id":"T-01","revision":"R1","spec":{"id":"SPEC-TOPIC","revision":"R1"},"acceptanceCriteria":[{"id":"AC-01","specId":"SPEC-TOPIC","specRevision":"R1"}],"contracts":[],"dependsOn":[],"work":{"ready":[{"id":"implementation"}],"blocked":[]}}\\n---。',
  '若已有的本轮 Spec 或 Ticket 缺少上述 formal envelope，逐个先用原生 read 读取当前文件，再用原生 edit 在同一文件中插入或修正它；每次 edit 前都要重新 read。write 只可用于确认不存在的新文件，遇到现有文件绝不重试 write，也不用 Shell 或覆盖方式绕过 native create/CAS。后续 read→edit 会延续同一文件的 native provenance 链，不需要重置、删除或重新登记 journal。',
  '完成上述正式 Spec/Ticket 及可选 CONTEXT、ADR、progress 后，只调用零参数 workflow_planning_finalize。它从原生 write/edit 记录、当前 Git 基线和实际文件摘要构造 manifest、路径、SHA-256 与来源链；你不得手写或传入 manifest、chains、路径、摘要、Git 命令、提交信息或授权参数。Spec 同目录的 progress.md 与项目根目录的 CONTEXT-MAP.md 只是 supporting documents，不带该 frontmatter。',
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
  // The lock spans the actual native mutation and its provenance publication,
  // not only the intent check. Planning admission takes this same catalog lock.
  const sourceWrites = ctx.on('tools/execute', (actor, next) => {
    if (!runtime.withPlanningSourceWrite || !['write', 'edit'].includes(actor?.name)
      || !runtime.modeEnabledForActor(actor) || runtime.checkToolExecution(actor) !== undefined) return next()
    return runtime.withPlanningSourceWrite(actor.agent, next, actor.signal)
  }, { global: true, prepend: true })
  const guards = ['fs/write-intent', 'fs/edit-intent'].map(event => ctx.on(event, (target, actor, next) => {
    const sessionId = actor?.agent?.id ?? actor?.agent?.session?.header?.id
    if (!runtime.activeOwners.has(sessionId) && !runtime.agentRoles.has(sessionId)) {
      const decision = runtime.checkFilesystemWrite(target, actor, ctx)
      if (decision?.kind === 'deny') throw new Error(decision.reason)
    }
    return next()
  }, { global: true, prepend: true }))
  return [...guards, sourceWrites, ...journal]
}
