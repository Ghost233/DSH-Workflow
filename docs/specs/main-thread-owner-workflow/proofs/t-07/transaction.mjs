import { createHash, randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { copyFile, link, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { orchestratorDocumentPath } from '../../../../../owner-workflow-plugin/src/orchestrator-documents.mjs'
import { isGeneratedRuntimeGitignore } from '../../../../../owner-workflow-plugin/src/project-layout.mjs'
import { validatePlanningReferences } from '../../../../../owner-workflow-plugin/src/planning-references.mjs'

const execFile = promisify(execFileCallback)

export const PLANNING_WRITE_RECEIPT_CONTRACT = 'DSH_PLANNING_WRITE_RECEIPT_V1'
export const PLANNING_TRANSACTION_REQUEST_CONTRACT = 'DSH_PLANNING_TRANSACTION_REQUEST_V1'
export const PLANNING_TRANSACTION_RESULT_CONTRACT = 'DSH_PLANNING_TRANSACTION_RESULT_V1'
export const PLANNING_SNAPSHOT_PROOF_CONTRACT = 'DSH_PLANNING_SNAPSHOT_PROOF_V1'
export const PLANNING_ACTIVATION_STATE_CONTRACT = 'DSH_PLANNING_ACTIVATION_STATE_V1'

const SHA256 = /^[a-f0-9]{40,64}$/u
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

export class PlanningTransactionError extends Error {
  constructor(code, field, detail = '') {
    super(`Planning transaction: ${code} at ${field}${detail === '' ? '' : ` (${detail})`}`)
    this.name = 'PlanningTransactionError'
    this.code = `PLANNING_TRANSACTION_${code}`
    this.field = field
  }
}

function fail(code, field, detail) { throw new PlanningTransactionError(code, field, detail) }
function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
function object(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST', field, 'expected object')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail('INVALID_REQUEST', field, 'expected plain object')
  return value
}
function exact(value, keys, field) {
  object(value, field)
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) {
    fail('INVALID_REQUEST', field, 'unexpected fields')
  }
  for (const key of keys) if (!hasOwn(value, key)) fail('INVALID_REQUEST', `${field}.${key}`, 'missing field')
  return value
}
function text(value, field, { id = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') fail('INVALID_REQUEST', field, 'expected non-empty string')
  const result = value.trim()
  if (id && !IDENTIFIER.test(result)) fail('INVALID_REQUEST', field, 'expected stable identifier')
  return result
}
function digest(value, field) {
  const result = text(value, field)
  if (!SHA256.test(result)) fail('INVALID_REQUEST', field, 'expected object id')
  return result
}
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_REQUEST', 'value', 'expected JSON')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  fail('INVALID_REQUEST', 'value', 'expected JSON')
}
function same(left, right) { return canonical(left) === canonical(right) }
function sha(value) { return createHash('sha256').update(value).digest('hex') }
function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
function posixRelative(root, path) { return relative(root, path).split(sep).join('/') }
function pathsEqual(left, right) { return [...left].sort().join('\0') === [...right].sort().join('\0') }

async function git(root, args, { env = {} } = {}) {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env },
      maxBuffer: 4 * 1024 * 1024,
    })
    return String(stdout ?? '').trim()
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim()
    fail('GIT_FAILURE', `git ${args[0] ?? ''}`, detail)
  }
}

async function gitNulPaths(root, args) {
  const output = await git(root, args)
  return output === '' ? [] : output.split('\0').filter(Boolean)
}

async function gitBlobHash(root, revision, path) {
  try {
    const { stdout } = await execFile('git', ['show', `${revision}:${path}`], {
      cwd: root,
      encoding: 'buffer',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      maxBuffer: 4 * 1024 * 1024,
    })
    return sha(stdout)
  } catch (error) {
    // `show <tree>:<missing-path>` is the one expected absence: a newly
    // recorded planning document has no pre-write blob at the fixed baseline.
    if (Number(error?.code) === 128) return null
    fail('GIT_FAILURE', `git show ${path}`, String(error?.stderr ?? error?.message ?? error).trim())
  }
}

async function proofRoot({ root, tempRoot }) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof tempRoot !== 'string' || !isAbsolute(tempRoot)) {
    fail('UNSAFE_ROOT', 'root', 'absolute root and tempRoot required')
  }
  let canonicalRoot, canonicalTemp
  try {
    canonicalRoot = realpathSync(root)
    canonicalTemp = realpathSync(tempRoot)
  } catch { fail('UNSAFE_ROOT', 'root', 'root or tempRoot missing') }
  if (!within(canonicalTemp, canonicalRoot)) fail('UNSAFE_ROOT', 'root', 'root is outside passed tempRoot')
  const reportedRoot = resolve(await git(canonicalRoot, ['rev-parse', '--show-toplevel']))
  let canonicalReported
  try { canonicalReported = realpathSync(reportedRoot) } catch { fail('UNSAFE_ROOT', 'root', 'Git root missing') }
  if (canonicalReported !== canonicalRoot) fail('UNSAFE_ROOT', 'root', 'must be the actual temporary Git root')
  const gitDirectory = realpathSync(await git(canonicalRoot, ['rev-parse', '--absolute-git-dir']))
  return { root: canonicalRoot, tempRoot: canonicalTemp, gitDirectory }
}

function statePaths(gitDirectory) {
  const root = join(gitDirectory, 'planning-transaction-proof')
  return {
    root,
    receipts: join(root, 'write-receipts'),
    journals: join(root, 'journals'),
    snapshots: join(root, 'snapshots'),
    artifacts: join(root, 'artifacts'),
    activation: join(root, 'activation.json'),
    activationLock: join(root, 'activation.lock'),
    transactionLock: join(root, 'transaction.lock'),
  }
}

async function ensureProofDirectories(paths) {
  await Promise.all([paths.root, paths.receipts, paths.journals, paths.snapshots, paths.artifacts].map(path => mkdir(path, { recursive: true, mode: 0o700 })))
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    fail('INVALID_JOURNAL', path, String(error?.message ?? error))
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${canonical(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}

async function writeJsonOnce(path, value) {
  const existing = await readJson(path)
  if (existing !== undefined) {
    if (!same(existing, value)) fail('PERSISTED_VALUE_MISMATCH', path)
    return existing
  }
  await writeJsonAtomic(path, value)
  return value
}

async function hashFile(path) {
  try { return sha(await readFile(path)) } catch (error) {
    if (error?.code === 'ENOENT') return null
    fail('IO_FAILURE', path, String(error?.message ?? error))
  }
}

async function initialActivation(paths) {
  let value = await readJson(paths.activation)
  if (value === undefined) {
    // Publish a complete initial record without replacing a concurrently
    // initialized or already activated record.
    const temporary = `${paths.activation}.${process.pid}.${randomUUID()}.initial`
    await writeJsonAtomic(temporary, { contract: PLANNING_ACTIVATION_STATE_CONTRACT, current: null, history: [] })
    try { await link(temporary, paths.activation) } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    } finally { await rm(temporary, { force: true }) }
    value = await readJson(paths.activation)
  }
  if (value?.contract !== PLANNING_ACTIVATION_STATE_CONTRACT || !Array.isArray(value.history)
    || !Object.prototype.hasOwnProperty.call(value, 'current')) fail('PERSISTED_VALUE_MISMATCH', paths.activation)
  exact(value, ['contract', 'current', 'history'], 'activation')
  if (value.current !== null) {
    exact(value.current, ['executionVersionId', 'parentExecutionVersionId', 'snapshotId', 'checkpointCommit', 'authorizationId'], 'activation.current')
    for (const key of ['executionVersionId', 'snapshotId', 'authorizationId']) text(value.current[key], `activation.current.${key}`, { id: true })
    if (value.current.parentExecutionVersionId !== null) text(value.current.parentExecutionVersionId, 'activation.current.parentExecutionVersionId', { id: true })
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.current.checkpointCommit)) fail('PERSISTED_VALUE_MISMATCH', paths.activation)
  }
  return value
}

export async function initializeProofState(input = {}) {
  const location = await proofRoot(input)
  const paths = statePaths(location.gitDirectory)
  await ensureProofDirectories(paths)
  return clone(await initialActivation(paths))
}

function receiptPath(paths, id) {
  if (!IDENTIFIER.test(id)) fail('INVALID_REQUEST', 'writeReceiptId', 'expected stable identifier')
  return join(paths.receipts, `${id}.json`)
}

function documentPath(location, cwd, path, field) {
  const actualCwd = cwd ?? location.root
  const document = orchestratorDocumentPath({ root: location.root, cwd: actualCwd, filePath: path })
  if (document === undefined) fail('UNSUPPORTED_DOCUMENT_PATH', field)
  return document
}

/** Records an explicit, authorized document write in Git metadata before a transaction may consume it. */
export async function recordPlanningWrite({ root, tempRoot, cwd = root, path, content, source } = {}) {
  const location = await proofRoot({ root, tempRoot })
  const paths = statePaths(location.gitDirectory)
  await ensureProofDirectories(paths)
  await initialActivation(paths)
  exact(source, ['authorizationId', 'sourceId'], 'source')
  const authorizationId = text(source.authorizationId, 'source.authorizationId', { id: true })
  const sourceId = text(source.sourceId, 'source.sourceId', { id: true })
  if (typeof content !== 'string') fail('INVALID_REQUEST', 'content', 'expected UTF-8 text')
  const document = documentPath(location, cwd, path, 'path')
  const beforeSha256 = await hashFile(document)
  await mkdir(dirname(document), { recursive: true, mode: 0o700 })
  await writeFile(document, content, { encoding: 'utf8', mode: 0o600 })
  const guarded = documentPath(location, cwd, path, 'path')
  if (guarded !== document) fail('UNSUPPORTED_DOCUMENT_PATH', 'path', 'path changed while writing')
  const afterSha256 = await hashFile(document)
  if (afterSha256 === null) fail('IO_FAILURE', 'path', 'document disappeared after write')
  const receipt = {
    contract: PLANNING_WRITE_RECEIPT_CONTRACT,
    id: `write-${randomUUID()}`,
    path: posixRelative(location.root, document),
    beforeSha256,
    afterSha256,
    authorizationId,
    sourceId,
  }
  await writeJsonOnce(receiptPath(paths, receipt.id), receipt)
  return deepFreeze(clone(receipt))
}

function normalizedAuthorization(value, field) {
  exact(value, ['contract', 'id', 'sourceId', 'allowedPaths', 'status'], field)
  if (value.contract !== 'DSH_PLANNING_AUTHORIZATION_V1' || value.status !== 'approved') {
    fail('AUTHORIZATION_REFUSED', field, 'requires explicit approved planning authorization')
  }
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.length === 0) fail('INVALID_REQUEST', `${field}.allowedPaths`)
  const allowedPaths = value.allowedPaths.map((item, index) => text(item, `${field}.allowedPaths[${index}]`))
  if (new Set(allowedPaths).size !== allowedPaths.length) fail('DUPLICATE_RECEIPT', `${field}.allowedPaths`)
  return {
    contract: value.contract,
    id: text(value.id, `${field}.id`, { id: true }),
    sourceId: text(value.sourceId, `${field}.sourceId`, { id: true }),
    allowedPaths,
    status: value.status,
  }
}

function normalizedParent(value, field) {
  exact(value, ['executionVersionId', 'registryDigest', 'dagDigest', 'review'], field)
  if (value.executionVersionId !== null) text(value.executionVersionId, `${field}.executionVersionId`, { id: true })
  exact(value.review, ['id', 'digest', 'status'], `${field}.review`)
  if (value.review.status !== 'passed') fail('REVIEW_REFUSED', `${field}.review.status`)
  return {
    executionVersionId: value.executionVersionId,
    registryDigest: digest(value.registryDigest, `${field}.registryDigest`),
    dagDigest: digest(value.dagDigest, `${field}.dagDigest`),
    review: { id: text(value.review.id, `${field}.review.id`, { id: true }), digest: digest(value.review.digest, `${field}.review.digest`), status: 'passed' },
  }
}

function normalizedRequest(value) {
  exact(value, ['contract', 'id', 'expected', 'manifest', 'writeReceiptIds', 'authorization', 'parent', 'activation', 'reason'], 'request')
  if (value.contract !== PLANNING_TRANSACTION_REQUEST_CONTRACT) fail('INVALID_REQUEST', 'request.contract')
  exact(value.expected, ['branch', 'head'], 'request.expected')
  exact(value.activation, ['id', 'expectedParentExecutionVersionId', 'authorizationId'], 'request.activation')
  if (!Array.isArray(value.writeReceiptIds) || value.writeReceiptIds.length === 0) fail('INVALID_REQUEST', 'request.writeReceiptIds')
  const writeReceiptIds = value.writeReceiptIds.map((item, index) => text(item, `request.writeReceiptIds[${index}]`, { id: true }))
  if (new Set(writeReceiptIds).size !== writeReceiptIds.length) fail('DUPLICATE_RECEIPT', 'request.writeReceiptIds')
  const parent = normalizedParent(value.parent, 'request.parent')
  if (value.activation.expectedParentExecutionVersionId !== parent.executionVersionId) {
    fail('PARENT_MISMATCH', 'request.activation.expectedParentExecutionVersionId')
  }
  const authorization = normalizedAuthorization(value.authorization, 'request.authorization')
  if (value.activation.authorizationId !== authorization.id) fail('AUTHORIZATION_REFUSED', 'request.activation.authorizationId')
  return {
    contract: value.contract,
    id: text(value.id, 'request.id', { id: true }),
    expected: { branch: text(value.expected.branch, 'request.expected.branch'), head: digest(value.expected.head, 'request.expected.head') },
    manifest: clone(value.manifest),
    writeReceiptIds,
    authorization,
    parent,
    activation: {
      id: text(value.activation.id, 'request.activation.id', { id: true }),
      expectedParentExecutionVersionId: parent.executionVersionId,
      authorizationId: authorization.id,
    },
    reason: text(value.reason, 'request.reason'),
  }
}

async function repositoryState(location) {
  const branch = await git(location.root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (branch === '') fail('EXPECTED_BRANCH_MISMATCH', 'HEAD', 'detached head')
  const head = await git(location.root, ['rev-parse', 'HEAD'])
  const staged = await gitNulPaths(location.root, ['diff', '--cached', '--name-only', '-z'])
  const unstaged = await gitNulPaths(location.root, ['diff', '--name-only', '-z'])
  const untracked = (await gitNulPaths(location.root, ['ls-files', '--others', '--exclude-standard', '-z'])).filter(path => !isGeneratedRuntimeGitignore(path))
  const indexSha256 = await hashFile(join(location.gitDirectory, 'index'))
  return { branch, head, staged, unstaged, untracked, indexSha256 }
}

function assertExpectedRepository(state, expected) {
  if (state.branch !== expected.branch) fail('EXPECTED_BRANCH_MISMATCH', 'request.expected.branch')
  if (state.head !== expected.head) fail('EXPECTED_HEAD_MISMATCH', 'request.expected.head')
}

function assertWorkspaceBoundary(state, allowedPaths) {
  if (state.staged.length > 0) fail('STAGED_CHANGES_REFUSED', 'index', state.staged.join(','))
  const allowed = new Set(allowedPaths)
  const extra = [...new Set([...state.unstaged, ...state.untracked])].filter(path => !allowed.has(path))
  if (extra.length > 0) fail('UNRELATED_WORKTREE_REFUSED', 'worktree', extra.join(','))
}

async function loadReceipt(paths, id) {
  const value = await readJson(receiptPath(paths, id))
  if (value === undefined) fail('MISSING_WRITE_RECEIPT', 'request.writeReceiptIds', id)
  exact(value, ['contract', 'id', 'path', 'beforeSha256', 'afterSha256', 'authorizationId', 'sourceId'], `write-receipt:${id}`)
  if (value.contract !== PLANNING_WRITE_RECEIPT_CONTRACT || value.id !== id) fail('INVALID_WRITE_RECEIPT', `write-receipt:${id}`)
  if (value.beforeSha256 !== null && (typeof value.beforeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.beforeSha256))) {
    fail('INVALID_WRITE_RECEIPT', `write-receipt:${id}.beforeSha256`)
  }
  if (typeof value.afterSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.afterSha256)) {
    fail('INVALID_WRITE_RECEIPT', `write-receipt:${id}.afterSha256`)
  }
  return value
}

async function validateRecordedSources(location, paths, request, references) {
  const selected = [references.spec, ...references.tickets.map(ticket => ticket.document)]
  const selectedPaths = selected.map(item => item.path)
  if (!pathsEqual(request.authorization.allowedPaths, selectedPaths)) {
    fail('AUTHORIZATION_SCOPE_MISMATCH', 'request.authorization.allowedPaths')
  }
  if (request.writeReceiptIds.length !== selected.length) fail('RECEIPT_SET_MISMATCH', 'request.writeReceiptIds')
  const byPath = new Map()
  for (const id of request.writeReceiptIds) {
    const receipt = await loadReceipt(paths, id)
    if (receipt.authorizationId !== request.authorization.id || receipt.sourceId !== request.authorization.sourceId) {
      fail('SOURCE_AUTHORITY_MISMATCH', `write-receipt:${id}`)
    }
    if (byPath.has(receipt.path)) fail('DUPLICATE_RECEIPT', `write-receipt:${id}.path`)
    byPath.set(receipt.path, receipt)
  }
  for (const document of selected) {
    const receipt = byPath.get(document.path)
    if (receipt === undefined || receipt.afterSha256 !== document.sha256) {
      fail('SOURCE_CONTENT_MISMATCH', document.path)
    }
    if (receipt.beforeSha256 !== await gitBlobHash(location.root, request.expected.head, document.path)) {
      fail('SOURCE_BASELINE_MISMATCH', document.path)
    }
    const actual = await hashFile(join(location.root, document.path))
    if (actual !== receipt.afterSha256) fail('SOURCE_CONTENT_MISMATCH', document.path)
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function bindingFor(request, references, receipts) {
  return {
    requestId: request.id,
    expected: request.expected,
    authorization: request.authorization,
    parent: request.parent,
    activation: request.activation,
    reason: request.reason,
    references: clone(references),
    receipts: clone(receipts),
  }
}

async function assertBoundSources(location, paths, request, journal) {
  const references = await validatePlanningReferences({ root: location.root, cwd: location.root, manifest: request.manifest })
  if (!same(references, journal.binding.references)) fail('FROZEN_SOURCE_CHANGED', 'planning references')
  const receipts = await validateRecordedSources(location, paths, request, references)
  if (!same(receipts, journal.binding.receipts)) fail('FROZEN_SOURCE_CHANGED', 'write receipts')
  return references
}

async function assertBeforeRefCas(location, paths, request, journal) {
  const references = await assertBoundSources(location, paths, request, journal)
  const state = await repositoryState(location)
  assertExpectedRepository(state, request.expected)
  assertWorkspaceBoundary(state, [references.spec.path, ...references.tickets.map(ticket => ticket.document.path)])
  if (state.indexSha256 !== journal.initialIndexSha256) fail('INDEX_CHANGED', 'index')
}

async function assertCheckpointDocumentBlobs(location, journal) {
  const documents = [journal.binding.references.spec, ...journal.binding.references.tickets.map(ticket => ticket.document)]
  for (const document of documents) {
    if (await gitBlobHash(location.root, journal.checkpointCommit, document.path) !== document.sha256) {
      fail('CHECKPOINT_DOCUMENT_MISMATCH', document.path)
    }
  }
}

async function assertCheckpointWorktree(location, paths, request, journal, { awaitingIndexReconcile = false, snapshotRequired = false } = {}) {
  await assertBoundSources(location, paths, request, journal)
  await assertCheckpointDocumentBlobs(location, journal)
  const state = await repositoryState(location)
  if (state.branch !== request.expected.branch || state.head !== journal.checkpointCommit) {
    fail('CHECKPOINT_REF_CONFLICT', `journal:${journal.id}`)
  }
  if (awaitingIndexReconcile) {
    if (state.indexSha256 !== journal.initialIndexSha256) fail('INDEX_CHANGED', 'index')
  } else if (await git(location.root, ['write-tree']) !== journal.commitInput.tree) {
    // A completed checkpoint may have a harmless stat/cache refresh in the
    // native index. Compare its tree, rather than forcing the old byte hash
    // back over a user's real index.
    fail('INDEX_CHANGED', 'index')
  }
  const modified = await gitNulPaths(location.root, ['diff', '--no-ext-diff', '--name-only', '-z', journal.checkpointCommit, '--'])
  const selected = new Set([journal.binding.references.spec.path, ...journal.binding.references.tickets.map(ticket => ticket.document.path)])
  const untracked = (await gitNulPaths(location.root, ['ls-files', '--others', '--exclude-standard', '-z']))
    .filter(path => !isGeneratedRuntimeGitignore(path) && (!awaitingIndexReconcile || !selected.has(path)))
  const relevantModified = modified.filter(path => !awaitingIndexReconcile || !selected.has(path))
  if (relevantModified.length > 0 || untracked.length > 0) {
    fail('POST_COMMIT_WORKTREE_CHANGED', 'worktree', [...relevantModified, ...untracked].join(','))
  }
  if (snapshotRequired) {
    const expected = snapshotFor(location, request, journal)
    const stored = await readJson(snapshotPath(paths, expected.id))
    if (stored === undefined || !same(stored, expected) || journal.snapshotSha256 !== sha(canonical(expected))) {
      fail('SNAPSHOT_MISMATCH', `snapshot:${expected.id}`)
    }
  }
}

function journalPath(paths, id) { return join(paths.journals, `${id}.json`) }
function artifactPath(paths, id) { return join(paths.artifacts, `${id}.prepared.index`) }
function snapshotPath(paths, id) { return join(paths.snapshots, `${id}.json`) }

async function ensureJournal(paths, id, binding, state) {
  const path = journalPath(paths, id)
  const existing = await readJson(path)
  if (existing !== undefined) {
    if (existing.contract !== 'DSH_PLANNING_TRANSACTION_JOURNAL_V1' || !same(existing.binding, binding)) {
      fail('JOURNAL_BINDING_MISMATCH', `journal:${id}`)
    }
    return existing
  }
  const journal = {
    contract: 'DSH_PLANNING_TRANSACTION_JOURNAL_V1', id, binding,
    phase: 'started', initialIndexSha256: state.indexSha256,
  }
  await writeJsonAtomic(path, journal)
  return journal
}

async function saveJournal(paths, journal) {
  await writeJsonAtomic(journalPath(paths, journal.id), journal)
  return journal
}

function commitEnvironment(input) {
  return {
    GIT_AUTHOR_NAME: input.author.name,
    GIT_AUTHOR_EMAIL: input.author.email,
    GIT_AUTHOR_DATE: input.author.date,
    GIT_COMMITTER_NAME: input.committer.name,
    GIT_COMMITTER_EMAIL: input.committer.email,
    GIT_COMMITTER_DATE: input.committer.date,
  }
}

async function localIdentity(location) {
  const author = {
    name: await git(location.root, ['config', '--local', '--get', 'user.name']),
    email: await git(location.root, ['config', '--local', '--get', 'user.email']),
  }
  if (author.name === '' || author.email === '') fail('GIT_IDENTITY_REQUIRED', 'local git config')
  return author
}

async function prepareCommit(location, paths, request, journal) {
  if (journal.phase !== 'started') return journal
  const artifact = artifactPath(paths, request.id)
  const temporary = `${artifact}.${process.pid}.${randomUUID()}.tmp`
  const alternateIndex = { GIT_INDEX_FILE: temporary }
  await git(location.root, ['read-tree', request.expected.head], { env: alternateIndex })
  const selectedPaths = [journal.binding.references.spec.path, ...journal.binding.references.tickets.map(ticket => ticket.document.path)]
  await git(location.root, ['add', '--', ...selectedPaths], { env: alternateIndex })
  const tree = await git(location.root, ['write-tree'], { env: alternateIndex })
  const preparedIndexSha256 = await hashFile(temporary)
  if (preparedIndexSha256 === null) fail('INDEX_PREPARATION_FAILED', 'temporary index')
  if (existsSync(artifact)) {
    if (await hashFile(artifact) !== preparedIndexSha256) fail('PERSISTED_VALUE_MISMATCH', artifact)
    await rm(temporary, { force: true })
  } else {
    await rename(temporary, artifact)
  }
  const identity = await localIdentity(location)
  const fixedDate = `${Math.floor(Date.now() / 1000)} +0000`
  return saveJournal(paths, {
    ...journal,
    phase: 'commit-input',
    commitInput: {
      tree, parent: request.expected.head, message: `planning checkpoint ${request.id}`,
      author: identity, committer: identity, authorDate: fixedDate, committerDate: fixedDate,
      indexArtifact: artifact, preparedIndexSha256,
    },
  })
}

async function materializeCommit(location, paths, journal) {
  if (journal.phase === 'started') fail('PENDING_JOURNAL', `journal:${journal.id}`)
  if (journal.phase !== 'commit-input') return journal
  const input = journal.commitInput
  if (await hashFile(input.indexArtifact) !== input.preparedIndexSha256) fail('PERSISTED_VALUE_MISMATCH', input.indexArtifact)
  const commit = await git(location.root, ['-c', 'commit.gpgsign=false', 'commit-tree', input.tree, '-p', input.parent, '-m', input.message], {
    env: commitEnvironment({
      author: { ...input.author, date: input.authorDate },
      committer: { ...input.committer, date: input.committerDate },
    }),
  })
  return saveJournal(paths, { ...journal, phase: 'commit-proposed', checkpointCommit: commit })
}

async function matchingIndexLock(location, journal) {
  const lock = join(location.gitDirectory, 'index.lock')
  try {
    const [left, right] = await Promise.all([lstat(lock), lstat(journal.commitInput.indexArtifact)])
    return left.isFile() && left.dev === right.dev && left.ino === right.ino
      && await hashFile(lock) === journal.commitInput.preparedIndexSha256
  } catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}

async function releaseOwnIndexLock(location, journal) {
  if (journal?.lockOwnerPid === process.pid && journal.commitInput && await matchingIndexLock(location, journal)) {
    await rm(join(location.gitDirectory, 'index.lock'))
  }
}

async function releaseKnownIndexLock(location, journal) {
  const lock = join(location.gitDirectory, 'index.lock')
  if (!existsSync(lock)) return
  const expected = journal.commitInput?.preparedIndexSha256
  if (expected === undefined || !Number.isInteger(journal.lockOwnerPid) || journal.lockOwnerPid <= 0
    || !await matchingIndexLock(location, journal)) fail('FOREIGN_INDEX_LOCK', lock)
  if (journal.lockOwnerPid !== undefined) {
    try {
      process.kill(journal.lockOwnerPid, 0)
      fail('INDEX_LOCK_ACTIVE', lock)
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }
  await rm(lock, { force: false })
}

async function reconcileCommit(location, paths, request, journal, fault) {
  if (!['commit-proposed', 'index-locked', 'ref-updated', 'committed'].includes(journal.phase)) return journal
  const current = await repositoryState(location)
  const artifact = journal.commitInput.indexArtifact
  const artifactHash = journal.commitInput.preparedIndexSha256
  if (await hashFile(artifact) !== artifactHash) fail('PERSISTED_VALUE_MISMATCH', artifact)
  const lock = join(location.gitDirectory, 'index.lock')
  if (current.head === journal.checkpointCommit) {
    if (journal.phase === 'committed') {
      if (await git(location.root, ['write-tree']) !== journal.commitInput.tree) fail('INDEX_CHANGED', 'index')
      return journal
    }
    if (current.indexSha256 === artifactHash) {
      if (existsSync(lock)) await releaseKnownIndexLock(location, journal)
      return journal.phase === 'committed' ? journal : saveJournal(paths, { ...journal, phase: 'committed' })
    }
    if (current.indexSha256 === journal.initialIndexSha256) {
      if (existsSync(lock)) {
        if (!await matchingIndexLock(location, journal)) fail('FOREIGN_INDEX_LOCK', lock)
        if (journal.lockOwnerPid !== process.pid) {
          try { process.kill(journal.lockOwnerPid, 0); fail('INDEX_LOCK_ACTIVE', lock) }
          catch (error) { if (error?.code !== 'ESRCH') throw error }
        }
      } else await link(artifact, lock)
      journal = await saveJournal(paths, { ...journal, phase: 'ref-updated', lockOwnerPid: process.pid })
      await assertCheckpointWorktree(location, paths, request, journal, { awaitingIndexReconcile: true })
      await rename(lock, join(location.gitDirectory, 'index'))
      const committed = await saveJournal(paths, { ...journal, phase: 'committed' })
      await assertCheckpointWorktree(location, paths, request, committed)
      return committed
    }
    fail('INDEX_RECONCILIATION_REQUIRED', `journal:${journal.id}`)
  }
  if (current.head !== request.expected.head || current.branch !== request.expected.branch) {
    fail('CHECKPOINT_REF_CONFLICT', `journal:${journal.id}`)
  }
  if (current.indexSha256 !== journal.initialIndexSha256) fail('INDEX_CHANGED', 'index')
  if (existsSync(lock)) await releaseKnownIndexLock(location, journal)
  await assertCheckpointDocumentBlobs(location, journal)
  await invokeFault(fault, 'before-commit', journal)
  await assertBeforeRefCas(location, paths, request, journal)
  await assertCheckpointDocumentBlobs(location, journal)
  await link(artifact, lock)
  journal = await saveJournal(paths, { ...journal, phase: 'index-locked', lockOwnerPid: process.pid })
  try {
    await git(location.root, ['update-ref', `refs/heads/${request.expected.branch}`, journal.checkpointCommit, request.expected.head])
  } catch (error) {
    if (existsSync(lock) && await hashFile(lock) === artifactHash) await rm(lock, { force: true })
    throw error
  }
  journal = await saveJournal(paths, { ...journal, phase: 'ref-updated' })
  // The ref CAS is durable while the real index still remains untouched under
  // its Git lock. A killed worker leaves a byte-identifiable proof lock that a
  // restart may reconcile, but no snapshot or execution version yet exists.
  await invokeFault(fault, 'after-commit', journal)
  await assertCheckpointWorktree(location, paths, request, journal, { awaitingIndexReconcile: true })
  await rename(lock, join(location.gitDirectory, 'index'))
  journal = await saveJournal(paths, { ...journal, phase: 'committed' })
  await assertCheckpointWorktree(location, paths, request, journal)
  return journal
}

function snapshotFor(location, request, journal) {
  return {
    contract: PLANNING_SNAPSHOT_PROOF_CONTRACT,
    id: `snapshot-${request.id}`,
    projectRoot: location.root,
    planningReferences: clone(journal.binding.references),
    writeReceipts: clone(journal.binding.receipts),
    codeBaseline: {
      expectedBranch: request.expected.branch,
      sourceHead: request.expected.head,
      checkpointCommit: journal.checkpointCommit,
      checkpointTree: journal.commitInput.tree,
    },
    parent: clone(request.parent),
    authorization: clone(request.authorization),
    reason: request.reason,
  }
}

async function persistSnapshot(location, paths, request, journal) {
  if (['snapshot-persisted', 'activated'].includes(journal.phase)) return journal
  if (journal.phase !== 'committed') fail('PENDING_JOURNAL', `journal:${journal.id}`)
  const snapshot = snapshotFor(location, request, journal)
  const path = snapshotPath(paths, snapshot.id)
  await writeJsonOnce(path, snapshot)
  return saveJournal(paths, { ...journal, phase: 'snapshot-persisted', snapshotId: snapshot.id, snapshotSha256: sha(canonical(snapshot)) })
}

async function acquireActivationLock(paths) {
  try {
    await mkdir(paths.activationLock, { mode: 0o700 })
  } catch (error) {
    if (error?.code === 'EEXIST') fail('ACTIVATION_LOCKED', paths.activationLock)
    throw error
  }
}

async function acquireTransactionLock(paths, requestId) {
  try {
    await mkdir(paths.transactionLock, { mode: 0o700 })
    await writeJsonAtomic(join(paths.transactionLock, 'owner.json'), { requestId, pid: process.pid })
    return
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  const owner = await readJson(join(paths.transactionLock, 'owner.json'))
  if (owner?.requestId !== requestId || !Number.isInteger(owner?.pid)) fail('TRANSACTION_LOCKED', paths.transactionLock)
  try {
    process.kill(owner.pid, 0)
    fail('TRANSACTION_LOCKED', paths.transactionLock)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  // A known worker for this exact durable request died. Reclaim its proof-only
  // lock once; unknown locks remain an explicit refusal.
  await rm(paths.transactionLock, { recursive: true, force: false })
  try {
    await mkdir(paths.transactionLock, { mode: 0o700 })
    await writeJsonAtomic(join(paths.transactionLock, 'owner.json'), { requestId, pid: process.pid })
  } catch (error) {
    if (error?.code === 'EEXIST') fail('TRANSACTION_LOCKED', paths.transactionLock)
    throw error
  }
}

function expectedActivation(request, journal) {
  return { executionVersionId: request.activation.id, parentExecutionVersionId: request.parent.executionVersionId,
    snapshotId: journal.snapshotId, checkpointCommit: journal.checkpointCommit, authorizationId: request.authorization.id }
}

function assertActivationMatches(current, request, journal) {
  if (!same(current, expectedActivation(request, journal))) fail('ACTIVATION_CONFLICT', 'activation.current')
}

async function activate(paths, request, journal) {
  if (journal.phase === 'activated') return journal
  if (journal.phase !== 'snapshot-persisted') fail('PENDING_JOURNAL', `journal:${journal.id}`)
  await acquireActivationLock(paths)
  try {
    const activation = await initialActivation(paths)
    if (activation.current?.executionVersionId === request.activation.id) {
      assertActivationMatches(activation.current, request, journal)
    } else {
      if ((activation.current?.executionVersionId ?? null) !== request.parent.executionVersionId) {
        fail('PARENT_ACTIVATION_CONFLICT', 'request.parent.executionVersionId')
      }
      const current = {
        executionVersionId: request.activation.id,
        parentExecutionVersionId: request.parent.executionVersionId,
        snapshotId: journal.snapshotId,
        checkpointCommit: journal.checkpointCommit,
        authorizationId: request.authorization.id,
      }
      await writeJsonAtomic(paths.activation, { ...activation, current })
    }
    return saveJournal(paths, { ...journal, phase: 'activated', executionVersionId: request.activation.id })
  } finally {
    await rm(paths.activationLock, { recursive: true, force: true })
  }
}

async function invokeFault(fault, stage, journal) {
  if (typeof fault === 'function') await fault(stage, clone(journal))
}

/**
 * Actual temporary-Git proof transaction. It deliberately refuses a pending
 * journal, foreign index lock, stale parent, unapproved authority, or any
 * workspace/index change outside recorded planning writes instead of trying to
 * repair user state.
 */
export async function runPlanningTransaction({ root, tempRoot, cwd = root, request, fault } = {}) {
  const location = await proofRoot({ root, tempRoot })
  const paths = statePaths(location.gitDirectory)
  await ensureProofDirectories(paths)
  await initialActivation(paths)
  const normalized = normalizedRequest(request)
  await acquireTransactionLock(paths, normalized.id)
  try {
    const references = await validatePlanningReferences({ root: location.root, cwd, manifest: normalized.manifest })
    const receipts = await validateRecordedSources(location, paths, normalized, references)
    const binding = bindingFor(normalized, references, receipts)
    const existing = await readJson(journalPath(paths, normalized.id))
    if (existing !== undefined && (existing.contract !== 'DSH_PLANNING_TRANSACTION_JOURNAL_V1' || !same(existing.binding, binding))) {
      fail('JOURNAL_BINDING_MISMATCH', `journal:${normalized.id}`)
    }
    const state = await repositoryState(location)
    if (existing === undefined) {
      assertExpectedRepository(state, normalized.expected)
      assertWorkspaceBoundary(state, [references.spec.path, ...references.tickets.map(ticket => ticket.document.path)])
    } else if (state.head === normalized.expected.head) {
      assertExpectedRepository(state, normalized.expected)
      assertWorkspaceBoundary(state, [references.spec.path, ...references.tickets.map(ticket => ticket.document.path)])
    } else if (state.head !== existing.checkpointCommit || state.branch !== normalized.expected.branch) {
      fail('CHECKPOINT_REF_CONFLICT', `journal:${normalized.id}`)
    }
    let journal = await ensureJournal(paths, normalized.id, binding, state)
    if (journal.phase === 'activated') {
      await assertCheckpointWorktree(location, paths, normalized, journal, { snapshotRequired: true })
      const activation = await initialActivation(paths)
      assertActivationMatches(activation.current, normalized, journal)
      return deepFreeze({ contract: PLANNING_TRANSACTION_RESULT_CONTRACT, id: normalized.id,
        checkpointCommit: journal.checkpointCommit, snapshotId: journal.snapshotId,
        executionVersionId: journal.executionVersionId, replayed: true })
    }
    journal = await prepareCommit(location, paths, normalized, journal)
    journal = await materializeCommit(location, paths, journal)
    journal = await reconcileCommit(location, paths, normalized, journal, fault)
    if (journal.phase === 'committed') {
      await assertCheckpointWorktree(location, paths, normalized, journal)
      await invokeFault(fault, 'before-snapshot', journal)
      await assertCheckpointWorktree(location, paths, normalized, journal)
      journal = await persistSnapshot(location, paths, normalized, journal)
      await invokeFault(fault, 'after-snapshot', journal)
    }
    if (journal.phase === 'snapshot-persisted') {
      await assertCheckpointWorktree(location, paths, normalized, journal, { snapshotRequired: true })
      await invokeFault(fault, 'before-activation', journal)
      await assertCheckpointWorktree(location, paths, normalized, journal, { snapshotRequired: true })
      journal = await activate(paths, normalized, journal)
      await invokeFault(fault, 'after-activation', journal)
    }
    return deepFreeze({ contract: PLANNING_TRANSACTION_RESULT_CONTRACT, id: normalized.id,
      checkpointCommit: journal.checkpointCommit, snapshotId: journal.snapshotId,
      executionVersionId: journal.executionVersionId })
  } catch (error) {
    // Retain ref, index and user files; only release this process's known lock.
    const journal = await readJson(journalPath(paths, normalized.id))
    await releaseOwnIndexLock(location, journal)
    throw error
  } finally {
    await rm(paths.transactionLock, { recursive: true, force: true })
  }
}

export async function readProofState({ root, tempRoot } = {}) {
  const location = await proofRoot({ root, tempRoot })
  const paths = statePaths(location.gitDirectory)
  await ensureProofDirectories(paths)
  const readDirectory = async directory => {
    const names = await readdir(directory).catch(error => error?.code === 'ENOENT' ? [] : Promise.reject(error))
    const values = await Promise.all(names.filter(name => name.endsWith('.json')).sort().map(name => readJson(join(directory, name))))
    return values.filter(Boolean)
  }
  return deepFreeze({
    journals: await readDirectory(paths.journals),
    snapshots: await readDirectory(paths.snapshots),
    activation: await initialActivation(paths),
  })
}

/** A receipt for any non-active execution version is retained only as history. */
export async function classifyReceipt({ root, tempRoot, receipt } = {}) {
  const location = await proofRoot({ root, tempRoot })
  const paths = statePaths(location.gitDirectory)
  await ensureProofDirectories(paths)
  exact(receipt, ['executionVersionId', 'id'], 'receipt')
  const executionVersionId = text(receipt.executionVersionId, 'receipt.executionVersionId', { id: true })
  await acquireActivationLock(paths)
  try {
    const activation = await initialActivation(paths)
    if (activation.current?.executionVersionId === executionVersionId) {
      return deepFreeze({ outcome: 'accepted', executionVersionId })
    }
    const history = [...activation.history, { receipt: clone(receipt), reason: 'execution-version-mismatch' }]
    await writeJsonAtomic(paths.activation, { ...activation, history })
    return deepFreeze({ outcome: 'history-only', reason: 'execution-version-mismatch' })
  } finally {
    await rm(paths.activationLock, { recursive: true, force: true })
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}
