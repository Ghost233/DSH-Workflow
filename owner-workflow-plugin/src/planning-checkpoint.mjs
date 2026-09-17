import { execFile as execFileCallback } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { validatePlanningSourceChain } from './planning-source-chain.mjs'
import { RUNTIME_GITIGNORE_CONTENT } from './project-layout.mjs'

export const PLANNING_CHECKPOINT_JOURNAL_CONTRACT = 'DSH_PLANNING_CHECKPOINT_JOURNAL_V1'
export const PLANNING_CHECKPOINT_SNAPSHOT_CONTRACT = 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1'
export const PLANNING_CHECKPOINT_RESULT_CONTRACT = 'DSH_PLANNING_CHECKPOINT_RESULT_V1'

const execFile = promisify(execFileCallback)
const COMMIT = /^[a-f0-9]{40}$/u
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

export class PlanningCheckpointError extends Error {
  constructor(code, field, detail, options = {}) {
    super(`Planning checkpoint: ${code}${field === undefined ? '' : ` (${field}${detail === undefined ? '' : `: ${detail}`})`}`,
      options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'PlanningCheckpointError'
    this.code = code
    this.field = field
    this.detail = detail
    if (options.decision !== undefined) this.decision = clone(options.decision)
  }
}

function fail(code, field, detail, options) { throw new PlanningCheckpointError(code, field, detail, options) }

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function object(value, field, code = 'INVALID_REQUEST') {
  if (!isObject(value)) fail(code, field, 'expected plain object')
  return value
}

function exact(value, keys, field, code = 'INVALID_REQUEST') {
  const actual = Object.keys(object(value, field, code))
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    fail(code, field, 'unexpected fields')
  }
  return value
}

function text(value, field, { id = false, code = 'INVALID_REQUEST' } = {}) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, field, 'expected non-empty string')
  const result = value.trim()
  if (id && !IDENTIFIER.test(result)) fail(code, field, 'expected stable identifier')
  return result
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_REQUEST', 'value', 'expected finite JSON value')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  fail('INVALID_REQUEST', 'value', 'expected JSON value')
}

function digest(value) { return createHash('sha256').update(value).digest('hex') }
function same(left, right) { return canonical(left) === canonical(right) }
function deepFreeze(value) {
  if (Array.isArray(value)) for (const item of value) deepFreeze(item)
  else if (isObject(value)) for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}
function inside(root, path) {
  const part = relative(root, path)
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part))
}

function runtimeGitignorePath(root) {
  const directory = resolve(root, '.dsh-workflow')
  if (!inside(root, directory)) fail('INVALID_REQUEST', 'runtimeDirectory')
  const relativeDirectory = relative(root, directory).split(sep).join('/')
  return { directory: relativeDirectory, ignore: `${relativeDirectory}/.gitignore` }
}

function requestShape(value) {
  const requestKeys = ['id', 'manifest', 'baseline', 'source', 'reason', 'parentSnapshotId']
  const request = object(value, 'request')
  const keys = [...requestKeys,
    ...(Object.hasOwn(request, 'supporting') ? ['supporting'] : []),
    ...(Object.hasOwn(request, 'executionParent') ? ['executionParent'] : []),
  ]
  exact(value, keys, 'request')
  const id = text(value.id, 'request.id', { id: true })
  if (typeof value.reason !== 'string' || value.reason.trim() === '') fail('INVALID_REQUEST', 'request.reason')
  if (value.parentSnapshotId !== null) text(value.parentSnapshotId, 'request.parentSnapshotId', { id: true })
  exact(value.baseline, ['branch', 'head'], 'request.baseline')
  text(value.baseline.branch, 'request.baseline.branch')
  const head = text(value.baseline.head, 'request.baseline.head')
  if (!COMMIT.test(head)) fail('INVALID_REQUEST', 'request.baseline.head', 'expected full lowercase commit')
  exact(value.source, ['agentId', 'sessionId', 'chains'], 'request.source')
  text(value.source.agentId, 'request.source.agentId')
  text(value.source.sessionId, 'request.source.sessionId')
  if (!Array.isArray(value.source.chains) || value.source.chains.length === 0) fail('INVALID_REQUEST', 'request.source.chains')
  if (value.executionParent !== undefined) {
    exact(value.executionParent, ['workflowId', 'planRevision', 'planDigest', 'workflowBranch'], 'request.executionParent')
    text(value.executionParent.workflowId, 'request.executionParent.workflowId', { id: true })
    if (!Number.isSafeInteger(value.executionParent.planRevision) || value.executionParent.planRevision < 1) {
      fail('INVALID_REQUEST', 'request.executionParent.planRevision', 'expected positive integer')
    }
    if (!/^[a-f0-9]{64}$/u.test(value.executionParent.planDigest ?? '')) {
      fail('INVALID_REQUEST', 'request.executionParent.planDigest', 'expected sha256')
    }
    text(value.executionParent.workflowBranch, 'request.executionParent.workflowBranch')
  }
  return clone({ ...value, id, reason: value.reason.trim(), parentSnapshotId: value.parentSnapshotId })
}

async function git(root, args, { env = {}, allowExitOne = false } = {}) {
  try {
    const result = await execFile('git', args, {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_OPTIONAL_LOCKS: '0',
        ...env,
      },
    })
    return { code: 0, stdout: Buffer.from(result.stdout), stderr: Buffer.from(result.stderr) }
  } catch (error) {
    if (allowExitOne && Number(error?.code) === 1) {
      return { code: 1, stdout: Buffer.from(error.stdout ?? ''), stderr: Buffer.from(error.stderr ?? '') }
    }
    fail('GIT_FAILURE', args.join(' '), String(error?.stderr ?? error?.message ?? error).trim())
  }
}

function gitText(result) { return result.stdout.toString('utf8').trim() }

async function rootLocation(root, cwd) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof cwd !== 'string' || !isAbsolute(cwd)) fail('INVALID_ROOT', 'root')
  let actualRoot, actualCwd
  try { [actualRoot, actualCwd] = await Promise.all([realpath(root), realpath(cwd)]) } catch { fail('INVALID_ROOT', 'root') }
  if (!inside(actualRoot, actualCwd)) fail('ROOT_MISMATCH', 'cwd')
  const gitRoot = await realpath(gitText(await git(actualRoot, ['rev-parse', '--show-toplevel'])))
  if (gitRoot !== actualRoot) fail('ROOT_MISMATCH', 'root')
  const gitDirectory = await realpath(gitText(await git(actualRoot, ['rev-parse', '--absolute-git-dir'])))
  if (!inside(actualRoot, gitDirectory) && !inside(gitDirectory, actualRoot)) {
    // A linked worktree can legally have its git directory elsewhere. The
    // checkpoint state is still only placed at Git's exact resolved directory.
    // No path supplied by the caller controls it.
  }
  return { root: actualRoot, cwd: actualCwd, gitDirectory }
}

function pathsFor(gitDirectory, id) {
  const base = join(gitDirectory, 'dsh-planning-checkpoints')
  return {
    base,
    journals: join(base, 'journals'),
    snapshots: join(base, 'snapshots'),
    artifacts: join(base, 'artifacts'),
    journal: join(base, 'journals', `${id}.json`),
    snapshot: join(base, 'snapshots', `${id}.json`),
    artifact: join(base, 'artifacts', `${id}.index`),
  }
}

async function directory(path, root) {
  try {
    const current = await lstat(path)
    if (current.isSymbolicLink() || !current.isDirectory()) fail('STATE_PATH_UNSAFE', path)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(path, { recursive: false, mode: 0o700 })
    const created = await lstat(path)
    if (created.isSymbolicLink() || !created.isDirectory()) fail('STATE_PATH_UNSAFE', path)
  }
  let resolved
  try { resolved = await realpath(path) } catch { fail('STATE_PATH_UNSAFE', path) }
  if (!inside(root, resolved)) fail('STATE_PATH_UNSAFE', path)
}

async function existingDirectory(path, root) {
  let current
  try { current = await lstat(path) } catch (error) {
    if (error?.code === 'ENOENT') fail('STATE_CORRUPT', path, 'missing directory')
    fail('STATE_IO', path, error instanceof Error ? error.message : String(error))
  }
  if (current.isSymbolicLink() || !current.isDirectory()) fail('STATE_PATH_UNSAFE', path)
  let resolved
  try { resolved = await realpath(path) } catch { fail('STATE_PATH_UNSAFE', path) }
  if (!inside(root, resolved)) fail('STATE_PATH_UNSAFE', path)
}

async function ensureState(paths, gitDirectory) {
  await directory(paths.base, gitDirectory)
  await directory(paths.journals, gitDirectory)
  await directory(paths.snapshots, gitDirectory)
  await directory(paths.artifacts, gitDirectory)
}

async function stateExists(paths, gitDirectory) {
  try { await lstat(paths.base) } catch (error) {
    if (error?.code === 'ENOENT') return false
    fail('STATE_IO', paths.base, error instanceof Error ? error.message : String(error))
  }
  await existingDirectory(paths.base, gitDirectory)
  await existingDirectory(paths.journals, gitDirectory)
  await existingDirectory(paths.snapshots, gitDirectory)
  await existingDirectory(paths.artifacts, gitDirectory)
  return true
}

async function safeFile(path, { missing = false, allowHardlinks = false } = {}) {
  try {
    const first = await lstat(path)
    if (first.isSymbolicLink() || !first.isFile() || (!allowHardlinks && first.nlink !== 1)) fail('STATE_PATH_UNSAFE', path)
    const value = await readFile(path)
    const second = await lstat(path)
    if (second.isSymbolicLink() || !second.isFile() || (!allowHardlinks && second.nlink !== 1) || first.dev !== second.dev || first.ino !== second.ino) {
      fail('STATE_PATH_UNSAFE', path)
    }
    return value
  } catch (error) {
    if (missing && error?.code === 'ENOENT') return undefined
    if (error instanceof PlanningCheckpointError) throw error
    fail('STATE_IO', path, error instanceof Error ? error.message : String(error))
  }
}

async function hashFile(path, { missing = false, allowHardlinks = false } = {}) {
  const value = await safeFile(path, { missing, allowHardlinks })
  return value === undefined ? undefined : digest(value)
}

async function readJson(path, { missing = false } = {}) {
  const value = await safeFile(path, { missing })
  if (value === undefined) return undefined
  try { return JSON.parse(value.toString('utf8')) } catch { fail('STATE_CORRUPT', path) }
}

async function writeAtomic(path, value) {
  // dirname is not user-controlled; create beside destination so rename remains atomic.
  const directoryPath = path.slice(0, path.lastIndexOf(sep))
  const temporaryPath = join(directoryPath, `.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, `${canonical(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporaryPath, path)
  } catch (error) {
    if (error instanceof PlanningCheckpointError) throw error
    fail('STATE_IO', path, error instanceof Error ? error.message : String(error))
  } finally { await rm(temporaryPath, { force: true }).catch(() => undefined) }
}

async function writeOnce(path, value) {
  const prior = await readJson(path, { missing: true })
  if (prior !== undefined) {
    if (!same(prior, value)) fail('PERSISTED_VALUE_MISMATCH', path)
    return prior
  }
  const directoryPath = path.slice(0, path.lastIndexOf(sep))
  const temporaryPath = join(directoryPath, `.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, `${canonical(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await link(temporaryPath, path)
  } catch (error) {
    if (error?.code !== 'EEXIST') fail('STATE_IO', path, error instanceof Error ? error.message : String(error))
    const existing = await readJson(path)
    if (!same(existing, value)) fail('PERSISTED_VALUE_MISMATCH', path)
    return existing
  } finally { await rm(temporaryPath, { force: true }).catch(() => undefined) }
  return value
}

function documents(source) {
  return [
    { path: source.references.spec.path, sha256: source.references.spec.sha256 },
    ...source.references.tickets.map(ticket => ({ path: ticket.document.path, sha256: ticket.document.sha256 })),
    ...(source.references.supporting ?? []).map(document => ({ path: document.path, sha256: document.sha256 })),
  ]
}

function sourceDigest(source) { return digest(canonical(source)) }

function grantValue(value, field = 'authorization') {
  object(value, field, 'AUTHORIZATION_REFUSED')
  const id = text(value.id, `${field}.id`, { id: true, code: 'AUTHORIZATION_REFUSED' })
  if (typeof value.contract !== 'string' || value.contract.trim() === '') fail('AUTHORIZATION_REFUSED', `${field}.contract`)
  return { value: clone(value), id, digest: digest(canonical(value)) }
}

function bindingFor(location, request, source) {
  return {
    checkpointId: request.id,
    projectRoot: location.root,
    request: clone(request),
    source: clone(source),
    sourceDigest: sourceDigest(source),
    // Only native-journaled writes belong in this checkpoint's Git delta.
    // Inherited parent documents remain in the complete reference closure but
    // must not be rewritten or staged merely to carry them forward.
    selectedPaths: source.source.chains.map(item => item.path).toSorted(),
  }
}

function journalShape(value, field = 'journal') {
  exact(value, ['contract', 'id', 'binding', 'grant', 'phase', 'initialIndexSha256', 'commitInput', 'checkpointCommit', 'snapshotId', 'snapshotSha256'], field, 'STATE_CORRUPT')
  if (value.contract !== PLANNING_CHECKPOINT_JOURNAL_CONTRACT) fail('STATE_CORRUPT', `${field}.contract`)
  text(value.id, `${field}.id`, { id: true, code: 'STATE_CORRUPT' })
  object(value.binding, `${field}.binding`, 'STATE_CORRUPT')
  exact(value.grant, ['id', 'digest', 'value'], `${field}.grant`, 'STATE_CORRUPT')
  text(value.grant.id, `${field}.grant.id`, { id: true, code: 'STATE_CORRUPT' })
  if (!/^[a-f0-9]{64}$/u.test(value.grant.digest)) fail('STATE_CORRUPT', `${field}.grant.digest`)
  if (digest(canonical(value.grant.value)) !== value.grant.digest || value.grant.value?.id !== value.grant.id) fail('STATE_CORRUPT', `${field}.grant`)
  if (!['source-validated', 'commit-input', 'commit-proposed', 'ref-updated', 'index-synced', 'snapshot-persisted'].includes(value.phase)) {
    fail('STATE_CORRUPT', `${field}.phase`)
  }
  if (!/^[a-f0-9]{64}$/u.test(value.initialIndexSha256)) fail('STATE_CORRUPT', `${field}.initialIndexSha256`)
  if (value.commitInput !== null) object(value.commitInput, `${field}.commitInput`, 'STATE_CORRUPT')
  if (value.checkpointCommit !== null && !COMMIT.test(value.checkpointCommit)) fail('STATE_CORRUPT', `${field}.checkpointCommit`)
  if (value.snapshotId !== null) text(value.snapshotId, `${field}.snapshotId`, { id: true, code: 'STATE_CORRUPT' })
  if (value.snapshotSha256 !== null && !/^[a-f0-9]{64}$/u.test(value.snapshotSha256)) fail('STATE_CORRUPT', `${field}.snapshotSha256`)
  if (value.phase === 'source-validated' && (value.commitInput !== null || value.checkpointCommit !== null || value.snapshotId !== null || value.snapshotSha256 !== null)) {
    fail('STATE_CORRUPT', field, 'source-validated phase carries later artifacts')
  }
  if (value.phase === 'commit-input' && (value.commitInput === null || value.checkpointCommit !== null || value.snapshotId !== null || value.snapshotSha256 !== null)) {
    fail('STATE_CORRUPT', field, 'commit-input phase mismatch')
  }
  if (['commit-proposed', 'ref-updated', 'index-synced'].includes(value.phase)
    && (value.commitInput === null || value.checkpointCommit === null || value.snapshotId !== null || value.snapshotSha256 !== null)) {
    fail('STATE_CORRUPT', field, 'checkpoint phase mismatch')
  }
  if (value.phase === 'snapshot-persisted'
    && (value.commitInput === null || value.checkpointCommit === null || value.snapshotId === null || value.snapshotSha256 === null)) {
    fail('STATE_CORRUPT', field, 'snapshot phase mismatch')
  }
  return value
}

async function loadJournal(paths, id) {
  const value = await readJson(paths.journal, { missing: true })
  return value === undefined ? undefined : journalShape(value)
}

async function assertParentSnapshot(location, paths, parentSnapshotId) {
  if (parentSnapshotId === null) return null
  const names = await readdir(paths.journals)
  const matches = []
  for (const name of names) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._:-]*)\.json$/u.exec(name)
    if (match === null) fail('STATE_AMBIGUOUS', join(paths.journals, name))
    const journal = journalShape(await readJson(join(paths.journals, name)), `journal:${match[1]}`)
    if (journal.id !== match[1]) fail('STATE_CORRUPT', join(paths.journals, name))
    if (journal.phase === 'snapshot-persisted' && journal.snapshotId === parentSnapshotId) matches.push(journal)
  }
  if (matches.length !== 1) fail('PARENT_SNAPSHOT_MISSING', 'request.parentSnapshotId')
  const parent = matches[0]
  const snapshot = await readJson(join(paths.snapshots, `${parent.id}.json`), { missing: true })
  if (snapshot?.contract !== PLANNING_CHECKPOINT_SNAPSHOT_CONTRACT
    || snapshot.id !== parent.snapshotId
    || digest(canonical(snapshot)) !== parent.snapshotSha256
    || !same(snapshot, snapshotFor(location, parent))) {
    fail('PARENT_SNAPSHOT_MISSING', 'request.parentSnapshotId')
  }
  return snapshot
}

function assertParentContinuation(request, parent) {
  if (parent === null) return
  if (request.baseline.head !== parent.codeBaseline?.sourceHead
    || request.baseline.branch !== parent.codeBaseline?.branch) {
    fail('PARENT_BASELINE_MISMATCH', 'request.parentSnapshotId')
  }
}

async function pendingJournalIds(paths) {
  const names = await readdir(paths.journals)
  const pending = []
  for (const name of names) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._:-]*)\.json$/u.exec(name)
    if (match === null) fail('STATE_AMBIGUOUS', join(paths.journals, name))
    const journalPath = join(paths.journals, name)
    const journal = journalShape(await readJson(journalPath), `journal:${match[1]}`)
    if (journal.id !== match[1]) fail('STATE_CORRUPT', journalPath)
    if (journal.phase !== 'snapshot-persisted') pending.push(journal.id)
    else {
      const snapshotPath = join(paths.snapshots, `${journal.id}.json`)
      const snapshot = await readJson(snapshotPath, { missing: true })
      if (snapshot === undefined || snapshot.id !== journal.snapshotId || digest(canonical(snapshot)) !== journal.snapshotSha256) {
        fail('STATE_CORRUPT', snapshotPath)
      }
    }
  }
  return pending.toSorted()
}

async function assertNoOtherPendingCheckpoint(paths, checkpointId) {
  const other = (await pendingJournalIds(paths)).find(id => id !== checkpointId)
  if (other !== undefined) fail('ORIGINAL_CHECKPOINT_PENDING', 'checkpointId', other)
}

async function saveJournal(paths, prior, next) {
  if (!same(prior, next)) {
    const observed = await readJson(paths.journal)
    if (!same(observed, prior)) fail('JOURNAL_CONFLICT', paths.journal)
    await writeAtomic(paths.journal, next)
  }
  return next
}

async function assertLease(lease) {
  if (typeof lease?.assertLease !== 'function') fail('LEASE_REQUIRED', 'withLease')
  if (lease.signal?.aborted === true) fail('LEASE_ABORTED', 'withLease')
  await lease.assertLease(lease.signal)
  if (lease.signal?.aborted === true) fail('LEASE_ABORTED', 'withLease')
}

async function invokeFault(fault, stage, journal) {
  if (typeof fault === 'function') await fault(stage, clone(journal))
}

async function authorize(authorizer, location, request, source, journal, lease) {
  await assertLease(lease)
  let granted
  try {
    granted = await authorizer({
      root: location.root,
      request: clone(request),
      source: clone(source),
      authorizationId: journal?.grant?.id,
    })
  } catch (error) {
    if (error instanceof PlanningCheckpointError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    if (error?.decision?.contract === 'DSH_PLANNING_AUTHORIZATION_DECISION_V1'
      && ['revision_requested', 'rejected', 'cancelled'].includes(error.decision.outcome)) {
      fail('AUTHORIZATION_REFUSED', 'authorize', detail, { cause: error, decision: error.decision })
    }
    fail('AUTHORIZATION_REFUSED', 'authorize', detail, { cause: error })
  }
  await assertLease(lease)
  const grant = grantValue(granted)
  if (journal !== undefined && (grant.id !== journal.grant.id || grant.digest !== journal.grant.digest)) {
    fail('AUTHORIZATION_CHANGED', 'authorize')
  }
  return grant
}

async function repositoryState(location) {
  const [headResult, branchResult, staged, index] = await Promise.all([
    git(location.root, ['rev-parse', 'HEAD']),
    git(location.root, ['symbolic-ref', '--short', 'HEAD']),
    git(location.root, ['diff', '--cached', '--quiet'], { allowExitOne: true }),
    hashFile(join(location.gitDirectory, 'index'), { allowHardlinks: true }),
  ])
  return { head: gitText(headResult), branch: gitText(branchResult), staged: staged.code !== 0, indexSha256: index }
}

async function statusEntries(location) {
  const result = await git(location.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const fields = result.stdout.toString('utf8').split('\0').filter(Boolean)
  const entries = []
  for (let index = 0; index < fields.length; index += 1) {
    const raw = fields[index]
    if (raw.length < 4) fail('GIT_STATUS_INVALID', 'status')
    const code = raw.slice(0, 2)
    const path = raw.slice(3)
    if (path === '') fail('GIT_STATUS_INVALID', 'status')
    if (code.includes('R') || code.includes('C')) {
      const original = fields[++index]
      if (original === undefined) fail('GIT_STATUS_INVALID', 'status')
      entries.push({ code, path, original })
    } else entries.push({ code, path })
  }
  return entries
}

async function assertStatus(location, entries, selected, { awaitingIndex = false, runtimeMetadata } = {}) {
  for (const entry of entries) {
    if (entry.code === '??' && runtimeMetadata !== undefined && entry.path === runtimeMetadata.ignore) {
      const metadata = await readFile(join(location.root, runtimeMetadata.ignore), 'utf8').catch(() => undefined)
      if (metadata === RUNTIME_GITIGNORE_CONTENT) continue
    }
    if (!selected.has(entry.path)) fail('UNRELATED_WORKTREE_CHANGE', 'worktree', entry.path)
    if (entry.original !== undefined) fail('UNSUPPORTED_WORKTREE_CHANGE', 'worktree', entry.path)
    if (!awaitingIndex && entry.code !== '??' && entry.code[0] !== ' ') fail('STAGED_CHANGES', 'index', entry.path)
  }
}

async function assertSourceFiles(location, source) {
  for (const document of documents(source)) {
    const path = resolve(location.root, document.path)
    if (!inside(location.root, path)) fail('SOURCE_PATH_UNSAFE', document.path)
    let bytes
    try { bytes = await readFile(path) } catch { fail('FROZEN_SOURCE_CHANGED', document.path) }
    if (digest(bytes) !== document.sha256) fail('FROZEN_SOURCE_CHANGED', document.path)
  }
}

async function assertInitialState(location, request, source, journal, runtimeMetadata) {
  const current = await repositoryState(location)
  if (current.head !== request.baseline.head || current.branch !== request.baseline.branch) fail('BASELINE_CHANGED', 'baseline')
  if (current.staged) fail('STAGED_CHANGES', 'index')
  if (journal !== undefined && current.indexSha256 !== journal.initialIndexSha256) fail('INDEX_CHANGED', 'index')
  await assertSourceFiles(location, source)
  await assertStatus(location, await statusEntries(location), new Set(documents(source).map(item => item.path)), { runtimeMetadata })
}

async function assertBeforeRef(location, paths, request, source, journal, runtimeMetadata) {
  await assertInitialState(location, request, source, journal, runtimeMetadata)
  const parent = await assertParentSnapshot(location, paths, request.parentSnapshotId)
  assertParentContinuation(request, parent)
  const fresh = await validatePlanningSourceChain({
    root: location.root,
    cwd: location.cwd,
    manifest: request.manifest,
    baseline: request.baseline,
    sourceBaselineCommit: parent?.codeBaseline.checkpointCommit,
    source: request.source,
    supporting: request.supporting,
    parentSource: parent?.source,
  })
  if (sourceDigest(fresh) !== journal.binding.sourceDigest) fail('FROZEN_SOURCE_CHANGED', 'source')
}

async function assertAfterRefBeforeIndex(location, request, journal, runtimeMetadata) {
  const current = await repositoryState(location)
  if (current.head !== request.baseline.head || current.branch !== request.baseline.branch) fail('BASELINE_CHANGED', 'baseline')
  if (current.indexSha256 !== journal.initialIndexSha256) fail('INDEX_RECONCILIATION_REQUIRED', 'index')
  const ref = gitText(await git(location.root, ['rev-parse', '--verify', planningRef(request)]))
  if (ref !== journal.checkpointCommit) fail('CHECKPOINT_REF_CONFLICT', 'ref')
  await assertSourceFiles(location, journal.binding.source)
  await assertStatus(location, await statusEntries(location), new Set(documents(journal.binding.source).map(item => item.path)), { runtimeMetadata })
}

async function assertAfterIndex(location, request, journal, runtimeMetadata) {
  const current = await repositoryState(location)
  if (current.head !== request.baseline.head || current.branch !== request.baseline.branch || current.staged
    || current.indexSha256 !== journal.initialIndexSha256) {
    fail('CHECKPOINT_STATE_CHANGED', 'repository')
  }
  const ref = gitText(await git(location.root, ['rev-parse', '--verify', planningRef(request)]))
  if (ref !== journal.checkpointCommit) fail('CHECKPOINT_REF_CONFLICT', 'ref')
  await assertSourceFiles(location, journal.binding.source)
  await assertStatus(location, await statusEntries(location), new Set(documents(journal.binding.source).map(item => item.path)), { runtimeMetadata })
}

function planningRef(request) { return `refs/dsh/planning/${request.id}` }

async function planningRefCommit(location, request) {
  const ref = planningRef(request)
  const lines = gitText(await git(location.root, ['for-each-ref', '--format=%(refname) %(objectname)', '--', ref])).split('\n')
  return lines.find(line => line.startsWith(`${ref} `))?.slice(ref.length + 1) ?? null
}

async function resolvedIdentity(location) {
  const read = async field => {
    let stdout
    try { ({ stdout } = await execFile('git', ['var', field], { cwd: location.root, encoding: 'utf8', env: process.env })) }
    catch { fail('GIT_IDENTITY_REQUIRED', field) }
    const match = /^(.+) <([^<>\r\n]+)> \d+ [+-]\d{4}\s*$/u.exec(stdout)
    if (!match) fail('GIT_IDENTITY_REQUIRED', field)
    return { name: match[1], email: match[2] }
  }
  const [author, committer] = await Promise.all([read('GIT_AUTHOR_IDENT'), read('GIT_COMMITTER_IDENT')])
  return { author, committer }
}

/** Reject stale callers until the legacy tool export is removed at cutover. */
export async function configureDefaultPlanningGitIdentity() {
  throw new Error('Automatic Git identity configuration is disabled; use the existing author and committer identity')
}

async function prepareCommit(location, paths, request, journal, lease, runtimeGitignore) {
  if (journal.phase !== 'source-validated') return journal
  await assertLease(lease)
  await assertBeforeRef(location, paths, request, journal.binding.source, journal, runtimeGitignore)
  const parentSnapshot = await assertParentSnapshot(location, paths, request.parentSnapshotId)
  const commitParent = parentSnapshot?.codeBaseline.checkpointCommit ?? request.baseline.head
  const temporary = `${paths.artifact}.${process.pid}.${randomUUID()}.tmp`
  const env = { GIT_INDEX_FILE: temporary }
  try {
    await git(location.root, ['read-tree', commitParent], { env })
    await git(location.root, ['add', '--', ...journal.binding.selectedPaths], { env })
    const tree = gitText(await git(location.root, ['write-tree'], { env }))
    const changed = gitText(await git(location.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', commitParent, tree]))
      .split(/\r?\n/u).filter(Boolean).toSorted()
    if (!same(changed, journal.binding.selectedPaths)) fail('CHECKPOINT_FILE_SET_MISMATCH', 'tree')
    const artifactHash = await hashFile(temporary)
    if (artifactHash === undefined) fail('INDEX_PREPARATION_FAILED', 'artifact')
    const existing = await safeFile(paths.artifact, { missing: true })
    if (existing === undefined) await rename(temporary, paths.artifact)
    else if (digest(existing) !== artifactHash) fail('PERSISTED_VALUE_MISMATCH', paths.artifact)
    const identity = await resolvedIdentity(location)
    const fixedDate = `${Math.floor(Date.now() / 1000)} +0000`
    const next = {
      ...journal,
      phase: 'commit-input',
      commitInput: {
        tree,
        parent: commitParent,
        message: `planning checkpoint ${request.id}`,
        author: identity.author,
        committer: identity.committer,
        authorDate: fixedDate,
        committerDate: fixedDate,
        artifactSha256: artifactHash,
      },
    }
    await assertCommitSourceBlobs(location, journal.binding.source, next.commitInput.tree)
    return saveJournal(paths, journal, next)
  } finally { await rm(temporary, { force: true }).catch(() => undefined) }
}

async function assertCommitInput(location, paths, journal) {
  const input = journal.commitInput
  exact(input, ['tree', 'parent', 'message', 'author', 'committer', 'authorDate', 'committerDate', 'artifactSha256'], 'journal.commitInput', 'STATE_CORRUPT')
  const parentSnapshot = await assertParentSnapshot(location, paths, journal.binding.request.parentSnapshotId)
  if (!/^[a-f0-9]{40}$/u.test(input.tree)
    || input.parent !== (parentSnapshot?.codeBaseline.checkpointCommit ?? journal.binding.request.baseline.head)
    || !/^[a-f0-9]{64}$/u.test(input.artifactSha256)) {
    fail('STATE_CORRUPT', 'journal.commitInput')
  }
  if (await hashFile(paths.artifact, { missing: true, allowHardlinks: true }) !== input.artifactSha256) fail('PERSISTED_VALUE_MISMATCH', paths.artifact)
  await assertCommitSourceBlobs(location, journal.binding.source, input.tree)
}

async function assertCommitSourceBlobs(location, source, tree) {
  for (const document of documents(source)) {
    const entry = (await git(location.root, ['ls-tree', '-z', tree, '--', document.path])).stdout.toString('utf8')
    const match = /^(100644|100755) blob [a-f0-9]{40}\t([^\0]+)\0$/u.exec(entry)
    if (match === null || match[2] !== document.path) fail('CHECKPOINT_SOURCE_BLOB_MISMATCH', document.path)
    const blob = (await git(location.root, ['show', '--no-textconv', `${tree}:${document.path}`])).stdout
    if (digest(blob) !== document.sha256) fail('CHECKPOINT_SOURCE_BLOB_MISMATCH', document.path)
  }
}

async function materializeCommit(location, paths, journal, lease) {
  if (journal.phase !== 'commit-input') return journal
  await assertLease(lease)
  await assertCommitInput(location, paths, journal)
  const input = journal.commitInput
  const commit = gitText(await git(location.root, ['-c', 'commit.gpgsign=false', 'commit-tree', input.tree, '-p', input.parent, '-m', input.message], {
    env: {
      GIT_AUTHOR_NAME: input.author.name,
      GIT_AUTHOR_EMAIL: input.author.email,
      GIT_AUTHOR_DATE: input.authorDate,
      GIT_COMMITTER_NAME: input.committer.name,
      GIT_COMMITTER_EMAIL: input.committer.email,
      GIT_COMMITTER_DATE: input.committerDate,
    },
  }))
  if (!COMMIT.test(commit)) fail('GIT_FAILURE', 'commit-tree', 'invalid commit id')
  return saveJournal(paths, journal, { ...journal, phase: 'commit-proposed', checkpointCommit: commit })
}

async function assertProposedCommit(location, journal) {
  if (journal.checkpointCommit === null || journal.commitInput === null) fail('PENDING_JOURNAL', 'commit')
  const [tree, parents] = await Promise.all([
    git(location.root, ['show', '-s', '--format=%T', journal.checkpointCommit]),
    git(location.root, ['show', '-s', '--format=%P', journal.checkpointCommit]),
  ])
  if (gitText(tree) !== journal.commitInput.tree || gitText(parents) !== journal.commitInput.parent) fail('PERSISTED_VALUE_MISMATCH', 'checkpointCommit')
}

async function reconcileUnjournaledRefAdvance(location, paths, request, journal, lease, runtimeGitignore) {
  if (journal.phase !== 'commit-proposed') return journal
  const currentRef = await planningRefCommit(location, request)
  if (currentRef !== journal.checkpointCommit) return journal
  await assertLease(lease)
  await assertCommitInput(location, paths, journal)
  await assertProposedCommit(location, journal)
  await assertAfterRefBeforeIndex(location, request, journal, runtimeGitignore)
  return saveJournal(paths, journal, { ...journal, phase: 'ref-updated' })
}

async function advanceRefAndIndex(location, paths, request, journal, lease, fault, authorizeCallback, runtimeGitignore) {
  if (journal.phase === 'commit-proposed') {
    await assertLease(lease)
    await assertCommitInput(location, paths, journal)
    await assertProposedCommit(location, journal)
    await assertBeforeRef(location, paths, request, journal.binding.source, journal, runtimeGitignore)
    await authorize(authorizeCallback, location, request, journal.binding.source, journal, lease)
    try {
      await git(location.root, ['update-ref', planningRef(request), journal.checkpointCommit, '0'.repeat(journal.checkpointCommit.length)])
    } catch (error) {
      const current = await planningRefCommit(location, request)
      if (current !== journal.checkpointCommit) throw error
    }
    await invokeFault(fault, 'after-ref-update-before-journal', journal)
    journal = await saveJournal(paths, journal, { ...journal, phase: 'ref-updated' })
    await invokeFault(fault, 'after-ref-cas', journal)
    await assertLease(lease)
    await authorize(authorizeCallback, location, request, journal.binding.source, journal, lease)
    await assertAfterRefBeforeIndex(location, request, journal, runtimeGitignore)
    journal = await saveJournal(paths, journal, { ...journal, phase: 'index-synced' })
    await invokeFault(fault, 'after-index-sync', journal)
  }
  if (journal.phase === 'ref-updated') {
    await assertLease(lease)
    await assertCommitInput(location, paths, journal)
    await assertProposedCommit(location, journal)
    await authorize(authorizeCallback, location, request, journal.binding.source, journal, lease)
    await assertAfterRefBeforeIndex(location, request, journal, runtimeGitignore)
    journal = await saveJournal(paths, journal, { ...journal, phase: 'index-synced' })
    await invokeFault(fault, 'after-index-sync', journal)
  }
  if (journal.phase === 'index-synced') {
    await assertLease(lease)
    await authorize(authorizeCallback, location, request, journal.binding.source, journal, lease)
    await assertAfterIndex(location, request, journal, runtimeGitignore)
  }
  return journal
}

function snapshotFor(location, journal) {
  return {
    contract: PLANNING_CHECKPOINT_SNAPSHOT_CONTRACT,
    id: `snapshot-${journal.id}`,
    checkpointId: journal.id,
    projectRoot: location.root,
    source: clone(journal.binding.source),
    sourceDigest: journal.binding.sourceDigest,
    codeBaseline: {
      branch: journal.binding.request.baseline.branch,
      sourceHead: journal.binding.request.baseline.head,
      checkpointCommit: journal.checkpointCommit,
      checkpointTree: journal.commitInput.tree,
      sourcePaths: documents(journal.binding.source).map(document => document.path).toSorted(),
    },
    authorization: clone(journal.grant.value),
    reason: journal.binding.request.reason,
    parentSnapshotId: journal.binding.request.parentSnapshotId,
    ...(journal.binding.request.executionParent === undefined
      ? {}
      : { executionParent: clone(journal.binding.request.executionParent) }),
  }
}

async function persistSnapshot(location, paths, request, journal, lease, fault, authorizeCallback, runtimeGitignore) {
  if (journal.phase === 'snapshot-persisted') return journal
  if (journal.phase !== 'index-synced') fail('PENDING_JOURNAL', 'snapshot')
  await assertLease(lease)
  await authorize(authorizeCallback, location, request, journal.binding.source, journal, lease)
  await assertAfterIndex(location, request, journal, runtimeGitignore)
  await assertParentSnapshot(location, paths, request.parentSnapshotId)
  const snapshot = snapshotFor(location, journal)
  await writeOnce(paths.snapshot, snapshot)
  await invokeFault(fault, 'after-snapshot-write-before-journal', journal)
  const next = await saveJournal(paths, journal, {
    ...journal,
    phase: 'snapshot-persisted',
    snapshotId: snapshot.id,
    snapshotSha256: digest(canonical(snapshot)),
  })
  await invokeFault(fault, 'after-snapshot', next)
  return next
}

async function resultFor(location, paths, journal) {
  if (journal.phase !== 'snapshot-persisted' || journal.snapshotId === null || journal.snapshotSha256 === null) fail('PENDING_JOURNAL', 'result')
  const snapshot = await readJson(paths.snapshot)
  if (snapshot?.id !== journal.snapshotId || digest(canonical(snapshot)) !== journal.snapshotSha256 || !same(snapshot, snapshotFor(location, journal))) {
    fail('SNAPSHOT_MISMATCH', paths.snapshot)
  }
  return deepFreeze({
    contract: PLANNING_CHECKPOINT_RESULT_CONTRACT,
    phase: 'checkpointed',
    checkpointId: journal.id,
    checkpointCommit: journal.checkpointCommit,
    checkpointTree: journal.commitInput.tree,
    sourceDigest: journal.binding.sourceDigest,
    authorization: { id: journal.grant.id, digest: journal.grant.digest },
    snapshot: clone(snapshot),
  })
}

async function runUnderLease(location, paths, request, authorizer, lease, fault, runtimeGitignore) {
  await assertLease(lease)
  let journal = await loadJournal(paths, request.id)
  if (journal === undefined) {
    await assertNoOtherPendingCheckpoint(paths, request.id)
    const parent = await assertParentSnapshot(location, paths, request.parentSnapshotId)
    assertParentContinuation(request, parent)
    const source = await validatePlanningSourceChain({
      root: location.root,
      cwd: location.cwd,
      manifest: request.manifest,
      baseline: request.baseline,
      sourceBaselineCommit: parent?.codeBaseline.checkpointCommit,
      source: request.source,
      supporting: request.supporting,
      parentSource: parent?.source,
    })
    await assertLease(lease)
    await assertInitialState(location, request, source, undefined, runtimeGitignore)
    const grant = await authorize(authorizer, location, request, source, undefined, lease)
    const binding = bindingFor(location, request, source)
    const indexSha256 = await hashFile(join(location.gitDirectory, 'index'), { allowHardlinks: true })
    if (indexSha256 === undefined) fail('INDEX_MISSING', 'index')
    journal = {
      contract: PLANNING_CHECKPOINT_JOURNAL_CONTRACT,
      id: request.id,
      binding,
      grant,
      phase: 'source-validated',
      initialIndexSha256: indexSha256,
      commitInput: null,
      checkpointCommit: null,
      snapshotId: null,
      snapshotSha256: null,
    }
    await writeOnce(paths.journal, journal)
    journal = journalShape(await readJson(paths.journal))
    await invokeFault(fault, 'after-journal-prepared', journal)
  } else {
    if (!same(journal.binding.request, request)) fail('JOURNAL_BINDING_MISMATCH', 'request')
    await authorize(authorizer, location, request, journal.binding.source, journal, lease)
    journal = await reconcileUnjournaledRefAdvance(location, paths, request, journal, lease, runtimeGitignore)
    if (['source-validated', 'commit-input', 'commit-proposed'].includes(journal.phase)) {
      await assertBeforeRef(location, paths, request, journal.binding.source, journal, runtimeGitignore)
    }
  }
  await authorize(authorizer, location, request, journal.binding.source, journal, lease)
  journal = await prepareCommit(location, paths, request, journal, lease, runtimeGitignore)
  await authorize(authorizer, location, request, journal.binding.source, journal, lease)
  journal = await materializeCommit(location, paths, journal, lease)
  await invokeFault(fault, 'after-commit-object', journal)
  await authorize(authorizer, location, request, journal.binding.source, journal, lease)
  journal = await advanceRefAndIndex(location, paths, request, journal, lease, fault, authorizer, runtimeGitignore)
  journal = await persistSnapshot(location, paths, request, journal, lease, fault, authorizer, runtimeGitignore)
  await assertLease(lease)
  return resultFor(location, paths, journal)
}

/**
 * Create or resume a source-bound Git checkpoint. Authorization and outer
 * concurrency are supplied by production callbacks; this kernel creates no
 * authority grant and never activates a Workflow or Runner.
 */
export async function runPlanningCheckpoint({ root, cwd = root, request, authorize, withLease, fault, runtimeDirectory = '.dsh-workflow' } = {}) {
  const normalized = requestShape(request)
  if (typeof authorize !== 'function') fail('AUTHORIZATION_REQUIRED', 'authorize')
  if (typeof withLease !== 'function') fail('LEASE_REQUIRED', 'withLease')
  if (runtimeDirectory !== '.dsh-workflow') fail('UNSUPPORTED_RUNTIME_DIRECTORY', 'runtimeDirectory')
  const location = await rootLocation(root, cwd)
  const runtimeGitignore = runtimeGitignorePath(location.root)
  const paths = pathsFor(location.gitDirectory, normalized.id)
  await ensureState(paths, location.gitDirectory)
  return withLease(lease => runUnderLease(location, paths, normalized, authorize, lease, fault, runtimeGitignore))
}

/** Read one persisted checkpoint without advancing recovery or granting authority. */
export async function readPlanningCheckpoint({ root, id } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT', 'root')
  const checkpointId = text(id, 'id', { id: true })
  const location = await rootLocation(root, root)
  const paths = pathsFor(location.gitDirectory, checkpointId)
  if (!await stateExists(paths, location.gitDirectory)) return deepFreeze({ journal: null, snapshot: null })
  const journal = await loadJournal(paths, checkpointId)
  const snapshot = await readJson(paths.snapshot, { missing: true })
  return deepFreeze({ journal: journal === undefined ? null : clone(journal), snapshot: snapshot === undefined ? null : clone(snapshot) })
}

/**
 * Load the immutable snapshot of one completed checkpoint. This performs no
 * worktree, index, or HEAD validation and never resumes a pending checkpoint.
 */
export async function loadPlanningCheckpointSnapshot({ root, id } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT', 'root')
  const checkpointId = text(id, 'id', { id: true })
  const location = await rootLocation(root, root)
  const paths = pathsFor(location.gitDirectory, checkpointId)
  if (!await stateExists(paths, location.gitDirectory)) fail('CHECKPOINT_SNAPSHOT_MISSING', 'id')
  const journal = await loadJournal(paths, checkpointId)
  if (journal === undefined || journal.phase !== 'snapshot-persisted') fail('CHECKPOINT_SNAPSHOT_INCOMPLETE', 'id')
  const result = await resultFor(location, paths, journal)
  return deepFreeze(clone(result.snapshot))
}

/**
 * Read every durably completed checkpoint snapshot for a repository. This is
 * deliberately read-only: callers must choose and bind a unique snapshot
 * themselves instead of inferring requirements from mutable Markdown.
 */
export async function listCompletedPlanningCheckpointSnapshots({ root } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT', 'root')
  const location = await rootLocation(root, root)
  const placeholder = pathsFor(location.gitDirectory, 'placeholder')
  if (!await stateExists(placeholder, location.gitDirectory)) return deepFreeze([])
  const names = await readdir(placeholder.journals)
  const snapshots = []
  for (const name of names.toSorted()) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._:-]*)\.json$/u.exec(name)
    if (match === null) fail('STATE_AMBIGUOUS', join(placeholder.journals, name))
    const paths = pathsFor(location.gitDirectory, match[1])
    const journal = await loadJournal(paths, match[1])
    if (journal === undefined || journal.phase !== 'snapshot-persisted') continue
    snapshots.push(clone((await resultFor(location, paths, journal)).snapshot))
  }
  return deepFreeze(snapshots)
}

/**
 * Read-only gate for callers that must not dispatch while a checkpoint has
 * advanced Git but has not durably published its immutable snapshot.
 */
export async function planningCheckpointPending({ root } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT', 'root')
  const location = await rootLocation(root, root)
  const paths = pathsFor(location.gitDirectory, 'placeholder')
  if (!await stateExists(paths, location.gitDirectory)) return deepFreeze([])
  return deepFreeze(await pendingJournalIds(paths))
}
