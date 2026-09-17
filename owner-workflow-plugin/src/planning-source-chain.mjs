import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { validatePlanningReferences } from './planning-references.mjs'
import { orchestratorDocumentPath } from './orchestrator-documents.mjs'
import {
  PLANNING_WRITE_JOURNAL_CONTRACT,
  PLANNING_WRITE_PREPARED_CONTRACT,
  PLANNING_WRITE_TERMINAL_CONTRACT,
  readPlanningWriteJournal,
} from './planning-write-journal.mjs'

export const PLANNING_SOURCE_CHAIN_CONTRACT = 'DSH_PLANNING_SOURCE_CHAIN_V1'

const execFile = promisify(execFileCallback)
const SHA256 = /^[a-f0-9]{64}$/u
const COMMIT = /^[a-f0-9]{40}$/u

export class PlanningSourceChainError extends Error {
  constructor(code, field, detail) {
    super(`Planning source chain: ${code}${field === undefined ? '' : ` (${field}${detail === undefined ? '' : `: ${detail}`})`}`)
    this.name = 'PlanningSourceChainError'
    this.code = code
    this.field = field
  }
}

function fail(code, field, detail) { throw new PlanningSourceChainError(code, field, detail) }

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function object(value, field) {
  if (!isObject(value)) fail('INVALID_INPUT', field, 'expected object')
  return value
}

function exactKeys(value, keys, field, code = 'INVALID_INPUT') {
  const actual = Object.keys(object(value, field))
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    fail(code, field, 'unexpected fields')
  }
  return value
}

function nonempty(value, field, code = 'INVALID_INPUT') {
  if (typeof value !== 'string' || value.trim() === '') fail(code, field, 'expected non-empty string')
  return value
}

function digest(value, field, { nullable = false, code = 'INVALID_RECORD' } = {}) {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code, field, 'expected sha256')
  return value
}

function version(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null
  return nonempty(value, field, 'INVALID_RECORD')
}

function bytes(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_RECORD', field, 'expected non-negative safe integer')
  return value
}

function boolean(value, field) {
  if (typeof value !== 'boolean') fail('INVALID_RECORD', field, 'expected boolean')
  return value
}

function immutable(value) {
  if (Array.isArray(value)) {
    for (const item of value) immutable(item)
  } else if (isObject(value)) {
    for (const item of Object.values(value)) immutable(item)
  }
  return Object.freeze(value)
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function inside(root, path) {
  const part = relative(root, path)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

function canonicalRelative(root, path, field) {
  const raw = nonempty(path, field)
  if (isAbsolute(raw)) fail('UNSUPPORTED_PATH', field, 'source paths must be root-relative')
  const absolute = resolve(root, raw)
  if (!inside(root, absolute)) fail('UNSUPPORTED_PATH', field)
  return relative(root, absolute).split(sep).join('/')
}

function call(value, field, { name = false } = {}) {
  exactKeys(value, name ? ['callId', 'rootCallId', 'agentId', 'sessionId', 'name'] : ['callId', 'rootCallId', 'agentId', 'sessionId'], field, 'INVALID_RECORD')
  const result = {
    callId: nonempty(value.callId, `${field}.callId`, 'INVALID_RECORD'),
    rootCallId: nonempty(value.rootCallId, `${field}.rootCallId`, 'INVALID_RECORD'),
    agentId: nonempty(value.agentId, `${field}.agentId`, 'INVALID_RECORD'),
    sessionId: nonempty(value.sessionId, `${field}.sessionId`, 'INVALID_RECORD'),
  }
  if (name) {
    result.name = nonempty(value.name, `${field}.name`, 'INVALID_RECORD')
    if (!['write', 'edit'].includes(result.name)) fail('INVALID_RECORD', `${field}.name`, 'expected write or edit')
  }
  return result
}

function sameCall(left, right, field) {
  for (const key of ['callId', 'rootCallId', 'agentId', 'sessionId']) {
    if (left[key] !== right[key]) fail('IDENTITY_MISMATCH', `${field}.${key}`)
  }
}

function before(value, field) {
  exactKeys(value, ['version', 'sha256', 'normalizedSha256', 'bytes', 'rawRoundTrip'], field, 'INVALID_RECORD')
  const result = {
    version: version(value.version, `${field}.version`, { nullable: true }),
    sha256: digest(value.sha256, `${field}.sha256`, { nullable: true }),
    normalizedSha256: digest(value.normalizedSha256, `${field}.normalizedSha256`, { nullable: true }),
    bytes: bytes(value.bytes, `${field}.bytes`, { nullable: true }),
    rawRoundTrip: boolean(value.rawRoundTrip, `${field}.rawRoundTrip`),
  }
  const absent = result.version === null || result.sha256 === null || result.normalizedSha256 === null || result.bytes === null
  if (absent && !(result.version === null && result.sha256 === null && result.normalizedSha256 === null
    && result.bytes === 0 && result.rawRoundTrip === true)) {
    fail('INVALID_RECORD', field, 'missing source must use the exact create baseline')
  }
  if (!absent && !result.rawRoundTrip) fail('INCOMPLETE_RECORD', field, 'raw bytes are not reconstructable')
  return result
}

function after(value, field) {
  exactKeys(value, ['sha256', 'normalizedSha256', 'bytes', 'rawRoundTrip'], field, 'INVALID_RECORD')
  const result = {
    sha256: digest(value.sha256, `${field}.sha256`),
    normalizedSha256: digest(value.normalizedSha256, `${field}.normalizedSha256`),
    bytes: bytes(value.bytes, `${field}.bytes`),
    rawRoundTrip: boolean(value.rawRoundTrip, `${field}.rawRoundTrip`),
  }
  if (!result.rawRoundTrip) fail('INCOMPLETE_RECORD', field, 'raw bytes are not reconstructable')
  return result
}

function prepared(value, field, { root, path, agentId, sessionId, callId }) {
  exactKeys(value, ['contract', 'phase', 'checkpointEligible', 'journalId', 'call', 'root', 'target', 'finalIntent', 'before', 'expectedAfter'], field, 'INVALID_RECORD')
  if (value.contract !== PLANNING_WRITE_PREPARED_CONTRACT || value.phase !== 'prepared' || value.checkpointEligible !== false) {
    fail('INVALID_RECORD', field, 'invalid prepared contract')
  }
  const actualCall = call(value.call, `${field}.call`, { name: true })
  if (actualCall.callId !== callId || actualCall.agentId !== agentId || actualCall.sessionId !== sessionId) {
    fail('IDENTITY_MISMATCH', `${field}.call`)
  }
  const id = digest(value.journalId, `${field}.journalId`)
  if (id !== sha256(actualCall.callId)) fail('IDENTITY_MISMATCH', `${field}.journalId`)
  if (value.root !== root) fail('IDENTITY_MISMATCH', `${field}.root`)
  exactKeys(value.target, ['path', 'targetKey', 'displayPath'], `${field}.target`, 'INVALID_RECORD')
  if (value.target.path !== path) fail('IDENTITY_MISMATCH', `${field}.target.path`)
  // targetKey/displayPath are opaque provider fields. The recorder binds the
  // native path separately through `target.path`; retain both fields without
  // guessing a provider-specific representation here.
  nonempty(value.target.targetKey, `${field}.target.targetKey`, 'INVALID_RECORD')
  nonempty(value.target.displayPath, `${field}.target.displayPath`, 'INVALID_RECORD')
  exactKeys(value.finalIntent, value.finalIntent?.kind === 'createIfAbsent' ? ['kind'] : ['kind', 'version'], `${field}.finalIntent`, 'INVALID_RECORD')
  if (value.finalIntent.kind !== 'createIfAbsent' && value.finalIntent.kind !== 'replaceIfVersion') {
    fail('INVALID_RECORD', `${field}.finalIntent.kind`)
  }
  if (value.finalIntent.kind === 'replaceIfVersion') version(value.finalIntent.version, `${field}.finalIntent.version`)
  const initial = before(value.before, `${field}.before`)
  if (value.finalIntent.kind === 'createIfAbsent' && initial.version !== null) fail('INTENT_MISMATCH', `${field}.finalIntent`)
  if (value.finalIntent.kind === 'replaceIfVersion' && initial.version !== value.finalIntent.version) fail('INTENT_MISMATCH', `${field}.finalIntent`)
  exactKeys(value.expectedAfter, ['sha256', 'bytes'], `${field}.expectedAfter`, 'INVALID_RECORD')
  const expectedAfter = {
    sha256: digest(value.expectedAfter.sha256, `${field}.expectedAfter.sha256`, { nullable: true }),
    bytes: bytes(value.expectedAfter.bytes, `${field}.expectedAfter.bytes`, { nullable: true }),
  }
  if ((expectedAfter.sha256 === null) !== (expectedAfter.bytes === null)) fail('INVALID_RECORD', `${field}.expectedAfter`)
  if (actualCall.name === 'write' && expectedAfter.sha256 === null) fail('INCOMPLETE_RECORD', `${field}.expectedAfter`)
  return { call: actualCall, journalId: id, before: initial, expectedAfter }
}

function terminal(value, field, source) {
  exactKeys(value, ['contract', 'phase', 'status', 'journalId', 'call', 'preparedContract', 'postVersion', 'observedAt', 'completeness', 'checkpointEligible', 'before', 'after', 'resultBeforeNormalizedSha256', 'resultAfterNormalizedSha256'], field, 'INVALID_RECORD')
  if (value.contract !== PLANNING_WRITE_TERMINAL_CONTRACT || value.phase !== 'terminal'
    || value.status !== 'native-observed' || value.completeness !== 'complete' || value.checkpointEligible !== false) {
    fail('INCOMPLETE_RECORD', field, 'terminal is not a complete native observation')
  }
  if (value.journalId !== source.journalId || value.preparedContract !== PLANNING_WRITE_PREPARED_CONTRACT) {
    fail('IDENTITY_MISMATCH', field)
  }
  const actualCall = call(value.call, `${field}.call`, { name: true })
  sameCall(source.call, actualCall, `${field}.call`)
  if (actualCall.name !== source.call.name) fail('IDENTITY_MISMATCH', `${field}.call.name`)
  const postVersion = version(value.postVersion, `${field}.postVersion`)
  nonempty(value.observedAt, `${field}.observedAt`, 'INVALID_RECORD')
  const previous = before(value.before, `${field}.before`)
  if (JSON.stringify(previous) !== JSON.stringify(source.before)) fail('IDENTITY_MISMATCH', `${field}.before`)
  const next = after(value.after, `${field}.after`)
  const resultBefore = digest(value.resultBeforeNormalizedSha256, `${field}.resultBeforeNormalizedSha256`, { nullable: true })
  const resultAfter = digest(value.resultAfterNormalizedSha256, `${field}.resultAfterNormalizedSha256`)
  if (resultBefore !== source.before.normalizedSha256 || resultAfter !== next.normalizedSha256) {
    fail('IDENTITY_MISMATCH', `${field}.result`)
  }
  if (source.expectedAfter.sha256 !== null && (source.expectedAfter.sha256 !== next.sha256 || source.expectedAfter.bytes !== next.bytes)) {
    fail('DIGEST_MISMATCH', `${field}.after`)
  }
  return { postVersion, after: next }
}

function validateRecord(record, field, expected) {
  exactKeys(record, ['journalId', 'prepared', 'terminal', 'checkpointEligible'], field, 'INVALID_RECORD')
  if (record.checkpointEligible !== false || record.prepared === null || record.terminal === null) {
    fail('INCOMPLETE_RECORD', field)
  }
  const source = prepared(record.prepared, `${field}.prepared`, expected)
  if (record.journalId !== source.journalId) fail('IDENTITY_MISMATCH', `${field}.journalId`)
  const observed = terminal(record.terminal, `${field}.terminal`, source)
  return { source, observed }
}

function baseline(value) {
  exactKeys(value, ['branch', 'head'], 'baseline')
  const branch = nonempty(value.branch, 'baseline.branch')
  const head = nonempty(value.head, 'baseline.head')
  if (!COMMIT.test(head)) fail('INVALID_INPUT', 'baseline.head', 'expected full lowercase commit')
  return { branch, head }
}

function source(value) {
  exactKeys(value, ['agentId', 'sessionId', 'chains'], 'source')
  const agentId = nonempty(value.agentId, 'source.agentId')
  const sessionId = nonempty(value.sessionId, 'source.sessionId')
  if (!Array.isArray(value.chains) || value.chains.length === 0) fail('INVALID_INPUT', 'source.chains', 'expected chains')
  const chains = value.chains.map((item, index) => {
    exactKeys(item, ['path', 'callIds'], `source.chains[${index}]`)
    if (!Array.isArray(item.callIds) || item.callIds.length === 0) fail('INVALID_INPUT', `source.chains[${index}].callIds`, 'expected ordered calls')
    const callIds = item.callIds.map((callId, callIndex) => nonempty(callId, `source.chains[${index}].callIds[${callIndex}]`))
    const seen = new Set()
    for (const callId of callIds) {
      if (seen.has(callId)) fail('DUPLICATE_CALL_ID', `source.chains[${index}].callIds`, callId)
      seen.add(callId)
    }
    return { path: nonempty(item.path, `source.chains[${index}].path`), callIds }
  })
  return { agentId, sessionId, chains }
}

async function git(root, args, { allowExitOne = false } = {}) {
  try {
    const result = await execFile('git', args, {
      cwd: root,
      encoding: 'buffer',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
      maxBuffer: 4 * 1024 * 1024,
    })
    return { code: 0, stdout: Buffer.from(result.stdout), stderr: Buffer.from(result.stderr) }
  } catch (error) {
    if (allowExitOne && error?.code === 1) return { code: 1, stdout: Buffer.from(error.stdout ?? ''), stderr: Buffer.from(error.stderr ?? '') }
    fail('GIT_READ_FAILED', args.join(' '), error instanceof Error ? error.message : String(error))
  }
}

async function currentRepository(root, expected) {
  const [top, head, branch, staged] = await Promise.all([
    git(root, ['rev-parse', '--show-toplevel']),
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['symbolic-ref', '--short', 'HEAD']),
    git(root, ['diff', '--cached', '--quiet'], { allowExitOne: true }),
  ])
  const actualTop = (top.stdout.toString('utf8').trim())
  let canonicalTop
  try { canonicalTop = await realpath(actualTop) } catch { fail('GIT_READ_FAILED', 'repository root') }
  if (canonicalTop !== root) fail('ROOT_MISMATCH', 'root')
  const actualHead = head.stdout.toString('utf8').trim()
  const actualBranch = branch.stdout.toString('utf8').trim()
  if (actualHead !== expected.head) fail('BASELINE_HEAD_MISMATCH', 'baseline.head')
  if (actualBranch !== expected.branch) fail('BASELINE_BRANCH_MISMATCH', 'baseline.branch')
  if (staged.code !== 0) fail('STAGED_CHANGES', 'index')
}

async function baselineBlob(root, head, path) {
  // A missing HEAD:path makes cat-file -e exit 128, also used for real Git
  // errors. Enumerate the exact tree path instead of swallowing that exit code.
  const tree = await git(root, ['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', head, '--', path])
  const entries = tree.stdout.toString('utf8').split('\0').filter(Boolean)
  if (entries.length === 0) return null
  if (entries.length !== 1 || !/^100(?:644|755) blob [a-f0-9]+\t/u.test(entries[0])
    || entries[0].slice(entries[0].indexOf('\t') + 1) !== path) {
    fail('BASELINE_BLOB_MISMATCH', path, 'expected one regular file in the baseline tree')
  }
  const value = await git(root, ['show', '--no-textconv', `${head}:${path}`])
  return value.stdout
}

async function supportingDocuments(root, cwd, value, formal) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail('INVALID_INPUT', 'supporting', 'expected array')
  const result = []
  const paths = new Set(formal.keys())
  for (const [index, descriptor] of value.entries()) {
    exactKeys(descriptor, ['path', 'sha256'], `supporting[${index}]`)
    const path = canonicalRelative(root, descriptor.path, `supporting[${index}].path`)
    if (paths.has(path)) fail('DUPLICATE_PATH', `supporting[${index}].path`, path)
    const expected = digest(descriptor.sha256, `supporting[${index}].sha256`, { code: 'INVALID_INPUT' })
    const absolute = orchestratorDocumentPath({ root, cwd, filePath: path })
    if (absolute === undefined) fail('UNSUPPORTED_PATH', `supporting[${index}].path`, path)
    let bytes
    try { bytes = await readFile(absolute) } catch { fail('MISSING_SOURCE', `supporting[${index}].path`, path) }
    if (sha256(bytes) !== expected) fail('HASH_MISMATCH', `supporting[${index}].sha256`)
    paths.add(path)
    result.push({ path, sha256: expected })
  }
  return result.toSorted((left, right) => left.path.localeCompare(right.path))
}

function documentMap(references, supporting = []) {
  const entries = [
    { path: references.spec.path, sha256: references.spec.sha256, kind: 'spec', id: references.spec.id },
    ...references.tickets.map(ticket => ({ path: ticket.document.path, sha256: ticket.document.sha256, kind: 'ticket', id: ticket.id })),
    ...supporting.map(document => ({ ...document, kind: 'supporting', id: document.path })),
  ]
  const result = new Map()
  for (const item of entries) {
    if (result.has(item.path)) fail('DUPLICATE_PATH', 'references', item.path)
    result.set(item.path, item)
  }
  return result
}

function parentDocumentMap(value, root, identity) {
  if (value === undefined || value === null) return new Map()
  if (!isObject(value) || value.contract !== PLANNING_SOURCE_CHAIN_CONTRACT
    || !isObject(value.references) || !isObject(value.references.spec)
    || !Array.isArray(value.references.tickets)
    || (value.references.supporting !== undefined && !Array.isArray(value.references.supporting))
    || !isObject(value.source)
    || value.source.agentId !== identity.agentId || value.source.sessionId !== identity.sessionId) {
    fail('PARENT_SOURCE_MISMATCH', 'parentSource')
  }
  const entries = [
    { path: value.references.spec.path, sha256: value.references.spec.sha256, kind: 'spec', id: value.references.spec.id },
    ...value.references.tickets.map(ticket => ({ path: ticket?.document?.path, sha256: ticket?.document?.sha256,
      kind: 'ticket', id: ticket?.id })),
    ...(value.references.supporting ?? []).map(document => ({ path: document?.path, sha256: document?.sha256,
      kind: 'supporting', id: document?.path })),
  ]
  const result = new Map()
  for (const [index, item] of entries.entries()) {
    const path = canonicalRelative(root, item.path, `parentSource.documents[${index}].path`)
    const sha = digest(item.sha256, `parentSource.documents[${index}].sha256`, { code: 'PARENT_SOURCE_MISMATCH' })
    if (typeof item.id !== 'string' || item.id === '' || result.has(path)) fail('PARENT_SOURCE_MISMATCH', `parentSource.documents[${index}]`)
    result.set(path, { path, sha256: sha, kind: item.kind, id: item.id })
  }
  return result
}

/**
 * Validates an already-authorized, native-observed planning document edit chain.
 * It provides evidence only: callers retain responsibility for authorization,
 * checkpoint locking, snapshot creation, and activation.
 */
export async function validatePlanningSourceChain({ root, cwd = root, manifest, baseline: expectedBaseline, sourceBaselineCommit,
  source: requestedSource, supporting, parentSource } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT', 'root')
  let canonicalRoot
  try { canonicalRoot = await realpath(root) } catch { fail('INVALID_ROOT', 'root') }
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) fail('INVALID_ROOT', 'cwd')
  let canonicalCwd
  try { canonicalCwd = await realpath(cwd) } catch { fail('INVALID_ROOT', 'cwd') }
  if (!inside(canonicalRoot, canonicalCwd) && canonicalCwd !== canonicalRoot) fail('ROOT_MISMATCH', 'cwd')
  const baselineValue = baseline(expectedBaseline)
  const sourceValue = source(requestedSource)
  await currentRepository(canonicalRoot, baselineValue)
  const references = await validatePlanningReferences({ root: canonicalRoot, cwd: canonicalCwd, manifest })
  const formal = documentMap(references)
  const supplemental = await supportingDocuments(canonicalRoot, canonicalCwd, supporting, formal)
  const documents = documentMap(references, supplemental)
  const inheritedDocuments = parentDocumentMap(parentSource, canonicalRoot, sourceValue)

  const chainsByPath = new Map()
  const allCallIds = new Set()
  for (const [index, chain] of sourceValue.chains.entries()) {
    const path = canonicalRelative(canonicalRoot, chain.path, `source.chains[${index}].path`)
    if (!documents.has(path)) fail('UNSELECTED_PATH', `source.chains[${index}].path`, path)
    if (chainsByPath.has(path)) fail('DUPLICATE_PATH', `source.chains[${index}].path`, path)
    for (const callId of chain.callIds) {
      if (allCallIds.has(callId)) fail('DUPLICATE_CALL_ID', `source.chains[${index}].callIds`, callId)
      allCallIds.add(callId)
    }
    chainsByPath.set(path, { path, callIds: [...chain.callIds] })
  }
  for (const [path, parent] of inheritedDocuments.entries()) {
    if (!documents.has(path)) fail('PARENT_SOURCE_MISSING', 'manifest', path)
    const current = documents.get(path)
    if (!chainsByPath.has(path)
      && (current.sha256 !== parent.sha256 || current.kind !== parent.kind || current.id !== parent.id)) {
      fail('PARENT_SOURCE_MISMATCH', 'manifest', path)
    }
  }
  for (const [path, current] of documents.entries()) {
    if (chainsByPath.has(path)) continue
    const parent = inheritedDocuments.get(path)
    if (parent === undefined) fail('MISSING_CHAIN', 'source.chains', path)
    if (current.sha256 !== parent.sha256 || current.kind !== parent.kind || current.id !== parent.id) {
      fail('PARENT_SOURCE_MISMATCH', 'manifest', path)
    }
  }

  const journal = await readPlanningWriteJournal({ root: canonicalRoot })
  exactKeys(journal, ['contract', 'records'], 'journal', 'INVALID_RECORD')
  if (journal.contract !== PLANNING_WRITE_JOURNAL_CONTRACT || !Array.isArray(journal.records)) fail('INVALID_RECORD', 'journal')
  const recordByCallId = new Map()
  for (const [index, record] of journal.records.entries()) {
    exactKeys(record, ['journalId', 'prepared', 'terminal', 'checkpointEligible'], `journal.records[${index}]`, 'INVALID_RECORD')
    const callId = record.prepared?.call?.callId
    if (typeof callId === 'string') {
      if (recordByCallId.has(callId)) fail('DUPLICATE_CALL_ID', `journal.records[${index}]`, callId)
      recordByCallId.set(callId, record)
    }
  }

  const selectedChains = []
  for (const [path, chain] of chainsByPath.entries()) {
    const absolute = resolve(canonicalRoot, path)
    const document = documents.get(path)
    const baselineBytes = await baselineBlob(canonicalRoot, sourceBaselineCommit ?? baselineValue.head, path)
    const selected = []
    let previous
    for (const [index, callId] of chain.callIds.entries()) {
      const record = recordByCallId.get(callId)
      if (record === undefined) fail('MISSING_RECORD', `source.${path}.callIds[${index}]`, callId)
      const checked = validateRecord(record, `journal.${callId}`, {
        root: canonicalRoot,
        path: absolute,
        agentId: sourceValue.agentId,
        sessionId: sourceValue.sessionId,
        callId,
      })
      if (previous === undefined) {
        const expectedDigest = baselineBytes === null ? null : sha256(baselineBytes)
        if (checked.source.before.sha256 !== expectedDigest) fail('BASELINE_BLOB_MISMATCH', `journal.${callId}.prepared.before.sha256`)
        if (baselineBytes === null && checked.source.before.version !== null) fail('BASELINE_BLOB_MISMATCH', `journal.${callId}.prepared.before.version`)
        if (baselineBytes !== null && checked.source.before.version === null) fail('BASELINE_BLOB_MISMATCH', `journal.${callId}.prepared.before.version`)
      } else if (previous.after.sha256 !== checked.source.before.sha256 || previous.postVersion !== checked.source.before.version) {
        fail('CHAIN_DISCONTINUITY', `journal.${callId}.prepared.before`)
      }
      previous = checked.observed
      selected.push(clone(record))
    }
    if (previous?.after.sha256 !== document.sha256) fail('FINAL_DOCUMENT_MISMATCH', `source.${path}`)
    selectedChains.push({ path, callIds: [...chain.callIds], records: selected })
  }

  // References are already byte-bound by T05. Re-checking Git/index after the
  // journal read closes the read-side observation window; no lock is claimed.
  await currentRepository(canonicalRoot, baselineValue)
  return immutable({
    contract: PLANNING_SOURCE_CHAIN_CONTRACT,
    references: clone({ ...references, supporting: supplemental }),
    baseline: clone(baselineValue),
    source: {
      agentId: sourceValue.agentId,
      sessionId: sourceValue.sessionId,
      chains: selectedChains,
    },
  })
}
