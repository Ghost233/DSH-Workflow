import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { inferPlanningManifest } from './planning-references.mjs'
import { readPlanningWriteJournal } from './planning-write-journal.mjs'

const execFile = promisify(execFileCallback)

export class PlanningBundleError extends Error {
  constructor(code, detail = '') {
    super(`Planning bundle: ${code}${detail === '' ? '' : ` (${detail})`}`)
    this.name = 'PlanningBundleError'
    this.code = code
  }
}

function fail(code, detail) { throw new PlanningBundleError(code, detail) }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex') }

async function git(root, args, { allowExitOne = false } = {}) {
  try {
    const result = await execFile('git', args, {
      cwd: root,
      encoding: 'buffer',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
      maxBuffer: 4 * 1024 * 1024,
    })
    return { code: 0, stdout: Buffer.from(result.stdout) }
  } catch (error) {
    if (allowExitOne && error?.code === 1) return { code: 1, stdout: Buffer.from(error.stdout ?? '') }
    fail('GIT_READ_FAILED', args.join(' '))
  }
}

function gitText(result) { return result.stdout.toString('utf8').trim() }

function statusPaths(raw) {
  const fields = raw.split('\0').filter(Boolean)
  const paths = []
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index]
    if (entry.length < 4) fail('GIT_STATUS_INVALID')
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    if (path === '') fail('GIT_STATUS_INVALID')
    if (code.includes('R') || code.includes('C') || code.includes('D')) fail('UNSUPPORTED_WORKTREE_CHANGE', path)
    if (code !== '??' && code[0] !== ' ') fail('STAGED_CHANGES', path)
    if (path === '.dsh-workflow/.gitignore' || path.startsWith('.dsh-workflow/')) continue
    paths.push(path)
  }
  return paths.toSorted()
}

function terminalRecord(record, root, agentId, sessionId) {
  const prepared = record?.prepared
  const terminal = record?.terminal
  if (prepared?.call?.agentId !== agentId || prepared.call.sessionId !== sessionId
    || terminal?.status !== 'native-observed' || terminal.completeness !== 'complete') return undefined
  const path = prepared.target?.path
  const callId = prepared.call?.callId
  const observedAt = terminal.observedAt
  if (typeof path !== 'string' || path === '' || typeof callId !== 'string' || callId === ''
    || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) {
    fail('INVALID_WRITE_PROVENANCE')
  }
  const normalizedPath = isAbsolute(path) ? relative(root, path).split(sep).join('/') : path
  if (normalizedPath === '' || normalizedPath === '..' || normalizedPath.startsWith('../')) fail('INVALID_WRITE_PROVENANCE')
  return { path: normalizedPath, callId, observedAt, beforeSha256: prepared.before?.sha256 }
}

function parentPaths(parentSnapshot, root, baseline) {
  if (parentSnapshot === null || parentSnapshot === undefined) return []
  if (parentSnapshot?.contract !== 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1'
    || parentSnapshot.projectRoot !== root
    || parentSnapshot.codeBaseline?.sourceHead !== baseline.head
    || parentSnapshot.codeBaseline?.branch !== baseline.branch
    || parentSnapshot.source?.contract !== 'DSH_PLANNING_SOURCE_CHAIN_V1'
    || !Array.isArray(parentSnapshot.source.references?.tickets)
    || (parentSnapshot.source.references.supporting !== undefined
      && !Array.isArray(parentSnapshot.source.references.supporting))) {
    fail('PARENT_SNAPSHOT_MISMATCH')
  }
  const paths = [
    parentSnapshot.source.references.spec?.path,
    ...parentSnapshot.source.references.tickets.map(ticket => ticket?.document?.path),
    ...(parentSnapshot.source.references.supporting ?? []).map(document => document?.path),
  ]
  if (paths.some(path => typeof path !== 'string' || path === '') || new Set(paths).size !== paths.length) {
    fail('PARENT_SOURCE_INVALID')
  }
  return paths
}

/**
 * Freeze exactly the dirty planning documents created by the live root main
 * thread. It never infers a write from disk: every changed file must have a
 * complete native write journal chain from the requested Git baseline, while
 * unchanged files come only from one verified parent snapshot closure.
 */
export async function derivePlanningBundle({ root, cwd = root, agentId, sessionId, parentSnapshot = null } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof cwd !== 'string' || !isAbsolute(cwd)
    || typeof agentId !== 'string' || agentId === '' || typeof sessionId !== 'string' || sessionId === '') {
    fail('INVALID_INPUT')
  }
  const canonicalRoot = realpathSync(root)
  const [top, head, branch, staged, status] = await Promise.all([
    git(canonicalRoot, ['rev-parse', '--show-toplevel']),
    git(canonicalRoot, ['rev-parse', 'HEAD']),
    git(canonicalRoot, ['symbolic-ref', '--short', 'HEAD']),
    git(canonicalRoot, ['diff', '--cached', '--quiet'], { allowExitOne: true }),
    git(canonicalRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ])
  if (realpathSync(gitText(top)) !== canonicalRoot) fail('ROOT_MISMATCH')
  if (staged.code !== 0) fail('STAGED_CHANGES', 'index')
  const observedPaths = statusPaths(status.stdout.toString('utf8'))
  const inherited = parentSnapshot === null ? [] : [parentSnapshot.source.references.spec,
    ...parentSnapshot.source.references.tickets.map(ticket => ticket.document),
    ...(parentSnapshot.source.references.supporting ?? [])]
  const unchanged = new Set()
  for (const document of inherited) {
    const bytes = await readFile(join(canonicalRoot, document.path)).catch(() => null)
    if (bytes === null) fail('UNSUPPORTED_WORKTREE_CHANGE', document.path)
    if (bytes !== null && createHash('sha256').update(bytes).digest('hex') === document.sha256) unchanged.add(document.path)
  }
  const changedPaths = observedPaths.filter(path => !unchanged.has(path))
  if (changedPaths.length === 0) fail('NO_PLANNING_DOCUMENT_CHANGES')
  const baseline = { branch: gitText(branch), head: gitText(head) }
  if (baseline.branch === '' || !/^[a-f0-9]{40}$/u.test(baseline.head)) fail('INVALID_BASELINE')
  // A revision inherits only its workflow's immutable parent closure. This is
  // deliberately not a docs/ glob: unrelated historical Specs stay excluded.
  const paths = [...new Set([...parentPaths(parentSnapshot, canonicalRoot, baseline), ...changedPaths])].toSorted()

  const journal = await readPlanningWriteJournal({ root: canonicalRoot })
  const callsByPath = new Map()
  for (const record of journal.records) {
    const observed = terminalRecord(record, canonicalRoot, agentId, sessionId)
    if (observed === undefined || !changedPaths.includes(observed.path)) continue
    const calls = callsByPath.get(observed.path) ?? []
    calls.push(observed)
    callsByPath.set(observed.path, calls)
  }
  for (const path of changedPaths) {
    if (!callsByPath.has(path)) fail('UNTRACKED_PLANNING_CHANGE', path)
  }
  const chains = await Promise.all(changedPaths.map(async path => {
    const records = callsByPath.get(path).toSorted((left, right) => left.observedAt.localeCompare(right.observedAt) || left.callId.localeCompare(right.callId))
    const entry = gitText(await git(canonicalRoot, ['--literal-pathspecs', 'ls-tree', parentSnapshot?.codeBaseline.checkpointCommit ?? gitText(head), '--', path]))
    const object = entry ? /^(?:100644|100755) blob ([a-f0-9]{40,64})\t/.exec(entry)?.[1] : null
    if (entry && !object) fail('INVALID_BASELINE_DOCUMENT', path)
    const bytes = object ? (await git(canonicalRoot, ['cat-file', 'blob', object])).stdout : null
    const before = bytes === null ? null : createHash('sha256').update(bytes).digest('hex')
    // A later checkpoint starts a new native chain from its exact Git blob.
    // Retain earlier journal records as history, not as writes in this revision.
    const start = records.findLastIndex(record => record.beforeSha256 === before)
    if (start < 0) fail('MISSING_BASELINE_WRITE_CHAIN', path)
    return { path, callIds: records.slice(start).map(record => record.callId) }
  }))
  const inferred = await inferPlanningManifest({ root: canonicalRoot, cwd, paths })
  const request = {
    manifest: inferred.manifest,
    baseline,
    chains,
    ...(inferred.supporting.length === 0 ? {} : { supporting: inferred.supporting }),
  }
  return Object.freeze({
    id: `planning-finalize-${digest({ agentId, sessionId, ...request }).slice(0, 24)}`,
    ...request,
    reason: 'root main-thread planning bundle finalize',
  })
}
