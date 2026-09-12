import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { TextDecoder } from 'node:util'
import { orchestratorDocumentPath } from './orchestrator-documents.mjs'

export const PLANNING_REFERENCE_MANIFEST_CONTRACT = 'DSH_PLANNING_REFERENCE_MANIFEST_V1'
export const PLANNING_REFERENCE_SET_CONTRACT = 'DSH_PLANNING_REFERENCE_SET_V1'
export const PLANNING_DOCUMENT_CONTRACT = 'DSH_PLANNING_DOCUMENT_V1'

const SHA256 = /^[a-f0-9]{64}$/u
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

export class PlanningReferenceError extends Error {
  constructor(code, field, detail = '') {
    super(`Planning references: ${code} at ${field}${detail === '' ? '' : ` (${detail})`}`)
    this.name = 'PlanningReferenceError'
    this.code = `PLANNING_REFERENCES_${code}`
    this.field = field
  }
}

function fail(code, field, detail) { throw new PlanningReferenceError(code, field, detail) }

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredObject(value, field) {
  if (!isObject(value)) fail('INVALID_MANIFEST', field, 'expected object')
  return value
}

function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key) }

function exactKeys(value, keys, field, { source = false } = {}) {
  const object = source
    ? (isObject(value) ? value : fail('INVALID_SOURCE', field, 'expected object'))
    : requiredObject(value, field)
  const actual = Object.keys(object)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
    fail(source ? 'INVALID_SOURCE' : 'INVALID_MANIFEST', field, 'unexpected fields')
  }
  for (const key of keys) if (!hasOwn(object, key)) fail(source ? 'INVALID_SOURCE' : 'INVALID_MANIFEST', `${field}.${key}`, 'missing field')
  return object
}

function text(value, field, { source = false, identifier = false } = {}) {
  const code = source ? 'INVALID_SOURCE' : 'INVALID_MANIFEST'
  if (typeof value !== 'string' || value.trim() === '') {
    if (field.endsWith('revision')) fail('MISSING_REVISION', field)
    fail(code, field, 'expected non-empty string')
  }
  const result = value.trim()
  if (identifier && !IDENTIFIER.test(result)) fail(code, field, 'expected stable identifier')
  return result
}

function digest(value, field) {
  const result = text(value, field)
  if (!SHA256.test(result)) fail('INVALID_MANIFEST', field, 'expected lowercase sha256')
  return result
}

function stable(value, field = 'value') {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_MANIFEST', field, 'expected JSON value')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item, index) => stable(item, `${field}[${index}]`)).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key], `${field}.${key}`)}`).join(',')}}`
  fail('INVALID_MANIFEST', field, 'expected JSON value')
}

function same(left, right, field) { return stable(left, field) === stable(right, field) }

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function array(value, field, { source = false } = {}) {
  if (!Array.isArray(value)) fail(source ? 'INVALID_SOURCE' : 'INVALID_MANIFEST', field, 'expected array')
  return value
}

function unique(values, field, selector = value => value) {
  const seen = new Set()
  for (const value of values) {
    const key = selector(value)
    if (seen.has(key)) fail('DUPLICATE_ID', field, String(key))
    seen.add(key)
  }
}

function normalizeAcceptanceCriteria(value, field) {
  const items = array(value, field)
  if (items.length === 0) fail('EMPTY_REFERENCE', field, 'acceptance criteria required')
  const result = items.map((item, index) => text(item, `${field}[${index}]`, { identifier: true }))
  unique(result, field)
  return result
}

function normalizeSpecContracts(value, field) {
  const items = array(value, field)
  const result = items.map((item, index) => {
    exactKeys(item, ['id', 'revision', ...(hasOwn(item ?? {}, 'status') ? ['status'] : [])], `${field}[${index}]`)
    const contract = {
      id: text(item.id, `${field}[${index}].id`, { identifier: true }),
      revision: text(item.revision, `${field}[${index}].revision`, { identifier: true }),
      ...(item.status === undefined ? {} : { status: text(item.status, `${field}[${index}].status`, { identifier: true }) }),
    }
    if (contract.status !== undefined && !['ready', 'blocked'].includes(contract.status)) {
      fail('INVALID_MANIFEST', `${field}[${index}].status`, 'expected ready or blocked')
    }
    return contract
  })
  unique(result, field, item => item.id)
  return result
}

function normalizeTicketContracts(value, field) {
  const items = array(value, field)
  const result = items.map((item, index) => {
    exactKeys(item, ['id', 'revision'], `${field}[${index}]`)
    return {
      id: text(item.id, `${field}[${index}].id`, { identifier: true }),
      revision: text(item.revision, `${field}[${index}].revision`, { identifier: true }),
    }
  })
  unique(result, field, item => item.id)
  return result
}

function normalizeTicketAcceptanceCriteria(value, field) {
  const items = array(value, field)
  if (items.length === 0) fail('EMPTY_REFERENCE', field, 'acceptance criteria required')
  const result = items.map((item, index) => {
    exactKeys(item, ['id', 'specId', 'specRevision'], `${field}[${index}]`)
    return {
      id: text(item.id, `${field}[${index}].id`, { identifier: true }),
      specId: text(item.specId, `${field}[${index}].specId`, { identifier: true }),
      specRevision: text(item.specRevision, `${field}[${index}].specRevision`, { identifier: true }),
    }
  })
  unique(result, field, item => item.id)
  return result
}

function normalizeSpecReference(value, field) {
  exactKeys(value, ['id', 'revision'], field)
  return {
    id: text(value.id, `${field}.id`, { identifier: true }),
    revision: text(value.revision, `${field}.revision`, { identifier: true }),
  }
}

function normalizeWork(value, field) {
  exactKeys(value, ['ready', 'blocked'], field)
  const ready = array(value.ready, `${field}.ready`).map((item, index) => {
    exactKeys(item, ['id'], `${field}.ready[${index}]`)
    return { id: text(item.id, `${field}.ready[${index}].id`, { identifier: true }) }
  })
  const blocked = array(value.blocked, `${field}.blocked`).map((item, index) => {
    exactKeys(item, ['id', 'reason'], `${field}.blocked[${index}]`)
    return {
      id: text(item.id, `${field}.blocked[${index}].id`, { identifier: true }),
      reason: text(item.reason, `${field}.blocked[${index}].reason`),
    }
  })
  if (ready.length + blocked.length === 0) fail('EMPTY_WORK', field)
  unique([...ready, ...blocked], field, item => item.id)
  return { ready, blocked }
}

function normalizeDependsOn(value, field) {
  const items = array(value, field)
  const result = items.map((item, index) => text(item, `${field}[${index}]`, { identifier: true }))
  unique(result, field)
  return result
}

function specDeclaration(value, field) {
  exactKeys(value, ['id', 'revision', 'acceptanceCriteria', 'contracts'], field)
  return {
    id: text(value.id, `${field}.id`, { identifier: true }),
    revision: text(value.revision, `${field}.revision`, { identifier: true }),
    acceptanceCriteria: normalizeAcceptanceCriteria(value.acceptanceCriteria, `${field}.acceptanceCriteria`),
    contracts: normalizeSpecContracts(value.contracts, `${field}.contracts`),
  }
}

function ticketDeclaration(value, field) {
  exactKeys(value, ['id', 'revision', 'spec', 'acceptanceCriteria', 'contracts', 'dependsOn', 'work'], field)
  return {
    id: text(value.id, `${field}.id`, { identifier: true }),
    revision: text(value.revision, `${field}.revision`, { identifier: true }),
    spec: normalizeSpecReference(value.spec, `${field}.spec`),
    acceptanceCriteria: normalizeTicketAcceptanceCriteria(value.acceptanceCriteria, `${field}.acceptanceCriteria`),
    contracts: normalizeTicketContracts(value.contracts, `${field}.contracts`),
    dependsOn: normalizeDependsOn(value.dependsOn, `${field}.dependsOn`),
    work: normalizeWork(value.work, `${field}.work`),
  }
}

function manifestSpec(value, field) {
  exactKeys(value, ['path', 'id', 'revision', 'sha256', 'acceptanceCriteria', 'contracts'], field)
  const declaration = specDeclaration({
    id: value.id,
    revision: value.revision,
    acceptanceCriteria: value.acceptanceCriteria,
    contracts: value.contracts,
  }, field)
  return { path: text(value.path, `${field}.path`), sha256: digest(value.sha256, `${field}.sha256`), ...declaration }
}

function manifestTicket(value, field) {
  exactKeys(value, ['path', 'id', 'revision', 'sha256', 'spec', 'acceptanceCriteria', 'contracts', 'dependsOn', 'work'], field)
  const declaration = ticketDeclaration({
    id: value.id,
    revision: value.revision,
    spec: value.spec,
    acceptanceCriteria: value.acceptanceCriteria,
    contracts: value.contracts,
    dependsOn: value.dependsOn,
    work: value.work,
  }, field)
  return { path: text(value.path, `${field}.path`), sha256: digest(value.sha256, `${field}.sha256`), ...declaration }
}

function parseScalar(raw, field) {
  const value = raw.trim()
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      return text(parsed, field, { source: true, identifier: true })
    } catch {
      fail('INVALID_SOURCE', field, 'invalid JSON string')
    }
  }
  return text(value, field, { source: true, identifier: true })
}

function parseDocumentHeader(content, field) {
  const lines = content.split(/\r?\n/u)
  if (lines[0] !== '---') fail('INVALID_SOURCE', field, 'missing frontmatter')
  const values = {}
  let index = 1
  for (; index < lines.length && lines[index] !== '---'; index += 1) {
    const line = lines[index]
    const match = /^([a-z_]+): (.+)$/u.exec(line)
    if (match === null || hasOwn(values, match[1])) fail('INVALID_SOURCE', `${field}.frontmatter[${index}]`, 'invalid field line')
    values[match[1]] = match[2]
  }
  if (index === lines.length) fail('INVALID_SOURCE', field, 'unterminated frontmatter')
  const required = ['planning_document', 'document_kind', 'document_id', 'document_revision', 'planning_declaration']
  for (const key of required) {
    if (!hasOwn(values, key)) {
      if (key === 'document_revision') fail('MISSING_REVISION', `${field}.document_revision`)
      fail('INVALID_SOURCE', `${field}.${key}`, 'missing frontmatter field')
    }
  }
  if (values.planning_document !== PLANNING_DOCUMENT_CONTRACT) {
    fail('INVALID_SOURCE', `${field}.planning_document`, 'unsupported contract')
  }
  const kind = parseScalar(values.document_kind, `${field}.document_kind`)
  if (!['spec', 'ticket'].includes(kind)) fail('INVALID_SOURCE', `${field}.document_kind`, 'expected spec or ticket')
  const allowed = kind === 'ticket' ? [...required, 'spec_id', 'spec_revision'] : required
  if (Object.keys(values).length !== allowed.length || Object.keys(values).some(key => !allowed.includes(key))) {
    fail('INVALID_SOURCE', field, 'unsupported frontmatter fields')
  }
  if (kind === 'ticket' && (!hasOwn(values, 'spec_id') || !hasOwn(values, 'spec_revision'))) {
    fail('INVALID_SOURCE', `${field}.spec_id`, 'missing ticket Spec identity')
  }
  const id = parseScalar(values.document_id, `${field}.document_id`)
  const revision = parseScalar(values.document_revision, `${field}.document_revision`)
  let declaration
  try { declaration = JSON.parse(values.planning_declaration) } catch {
    fail('INVALID_SOURCE', `${field}.planning_declaration`, 'expected single-line JSON')
  }
  if (!isObject(declaration)) fail('INVALID_SOURCE', `${field}.planning_declaration`, 'expected object')
  return { kind, id, revision, declaration,
    ...(kind === 'ticket' ? {
      specId: parseScalar(values.spec_id, `${field}.spec_id`),
      specRevision: parseScalar(values.spec_revision, `${field}.spec_revision`),
    } : {}), }
}

async function loadDocument({ root, cwd, descriptor, kind, field, usedPaths }) {
  const absolute = orchestratorDocumentPath({ root, cwd, filePath: descriptor.path })
  if (absolute === undefined) fail('UNSUPPORTED_PATH', `${field}.path`)
  if (usedPaths.has(absolute)) fail('DUPLICATE_PATH', `${field}.path`, descriptor.path)
  usedPaths.add(absolute)
  let bytes
  try { bytes = await readFile(absolute) } catch (error) {
    if (error?.code === 'ENOENT') fail('MISSING_SOURCE', `${field}.path`, descriptor.path)
    fail('INVALID_SOURCE', `${field}.path`, errorText(error))
  }
  const actualDigest = createHash('sha256').update(bytes).digest('hex')
  if (actualDigest !== descriptor.sha256) fail('HASH_MISMATCH', `${field}.sha256`)
  let content
  // Retain a UTF-8 BOM so it cannot silently disappear from the returned
  // snapshot content; the strict frontmatter parser then rejects it.
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch {
    fail('INVALID_SOURCE', `${field}.path`, 'invalid UTF-8')
  }
  const header = parseDocumentHeader(content, field)
  if (header.kind !== kind) fail('IDENTITY_MISMATCH', `${field}.document_kind`)
  if (header.id !== descriptor.id || header.revision !== descriptor.revision) fail('IDENTITY_MISMATCH', field)
  const declaration = kind === 'spec'
    ? specDeclaration(header.declaration, `${field}.planning_declaration`)
    : ticketDeclaration(header.declaration, `${field}.planning_declaration`)
  const expected = kind === 'spec'
    ? { id: descriptor.id, revision: descriptor.revision, acceptanceCriteria: descriptor.acceptanceCriteria, contracts: descriptor.contracts }
    : { id: descriptor.id, revision: descriptor.revision, spec: descriptor.spec, acceptanceCriteria: descriptor.acceptanceCriteria,
      contracts: descriptor.contracts, dependsOn: descriptor.dependsOn, work: descriptor.work }
  if (!same(declaration, expected, `${field}.planning_declaration`)) {
    fail('DECLARATION_MISMATCH', `${field}.planning_declaration`)
  }
  if (kind === 'ticket') {
    // Ticket identity carries its Spec edge independently of the JSON declaration.
    if (header.specId !== descriptor.spec.id || header.specRevision !== descriptor.spec.revision) {
      fail('IDENTITY_MISMATCH', `${field}.spec`)
    }
  }
  const canonicalRoot = realpathSync(root)
  return { path: relative(canonicalRoot, absolute).split(sep).join('/'), sha256: actualDigest, content }
}

function errorText(error) { return error instanceof Error ? error.message : String(error) }

function validateReferences(spec, tickets) {
  const contractVersions = new Map(spec.contracts.map(item => [item.id, item]))
  const acceptance = new Set(spec.acceptanceCriteria)
  const ticketIds = new Set(tickets.map(item => item.id))
  for (const ticket of tickets) {
    const field = `manifest.tickets[${ticket.index}]`
    if (!same(ticket.spec, { id: spec.id, revision: spec.revision }, `${field}.spec`)) {
      fail('REFERENCE_MISMATCH', `${field}.spec`)
    }
    for (const reference of ticket.acceptanceCriteria) {
      if (reference.specId !== spec.id || reference.specRevision !== spec.revision || !acceptance.has(reference.id)) {
        fail('REFERENCE_MISMATCH', `${field}.acceptanceCriteria`, reference.id)
      }
    }
    for (const reference of ticket.contracts) {
      const contract = contractVersions.get(reference.id)
      if (contract === undefined || contract.revision !== reference.revision) {
        fail('REFERENCE_MISMATCH', `${field}.contracts`, reference.id)
      }
    }
    for (const dependency of ticket.dependsOn) {
      if (dependency === ticket.id) fail('REFERENCE_MISMATCH', `${field}.dependsOn`, 'self dependency')
      if (!ticketIds.has(dependency)) fail('MISSING_REFERENCE', `${field}.dependsOn`, dependency)
    }
  }
}

function assertAcyclic(tickets) {
  const byId = new Map(tickets.map(item => [item.id, item]))
  const visiting = new Set()
  const done = new Set()
  const visit = id => {
    if (done.has(id)) return
    if (visiting.has(id)) fail('DEPENDENCY_CYCLE', 'manifest.tickets', id)
    visiting.add(id)
    for (const dependency of byId.get(id).dependsOn) visit(dependency)
    visiting.delete(id)
    done.add(id)
  }
  for (const ticket of tickets) visit(ticket.id)
}

function resolveScopes(spec, tickets) {
  const byId = new Map(tickets.map(ticket => [ticket.id, ticket]))
  const contractById = new Map(spec.contracts.map(contract => [contract.id, contract]))
  const memo = new Map()
  const resolveTicket = ticket => {
    if (memo.has(ticket.id)) return memo.get(ticket.id)
    const declaredBlockedBy = []
    for (const segment of ticket.work.blocked) {
      declaredBlockedBy.push({ kind: 'declared_blocked_scope', ticketId: ticket.id, segmentId: segment.id })
    }
    const readyBlockedBy = []
    for (const reference of ticket.contracts) {
      const contract = contractById.get(reference.id)
      if (contract.status === 'blocked') readyBlockedBy.push({ kind: 'blocked_contract', id: contract.id, revision: contract.revision })
    }
    for (const dependency of ticket.dependsOn) {
      if (resolveTicket(byId.get(dependency)).blocked) readyBlockedBy.push({ kind: 'blocked_dependency', ticketId: dependency })
    }
    // A Ticket can retain a ready implementation segment while separately
    // recording an unrelated blocked segment.  The partial block does,
    // however, make the Ticket incomplete for every downstream dependency.
    const result = {
      blocked: declaredBlockedBy.length > 0 || readyBlockedBy.length > 0,
      blockedBy: [...declaredBlockedBy, ...readyBlockedBy],
      readyBlockedBy,
    }
    memo.set(ticket.id, result)
    return result
  }
  const ready = []
  const blocked = []
  for (const ticket of tickets) {
    const status = resolveTicket(ticket)
    for (const segment of ticket.work.blocked) {
      blocked.push({ ticketId: ticket.id, segment: clone(segment), blockedBy: [{ kind: 'declared_blocked_scope', ticketId: ticket.id, segmentId: segment.id }] })
    }
    for (const segment of ticket.work.ready) {
      if (status.readyBlockedBy.length > 0) blocked.push({ ticketId: ticket.id, segment: clone(segment), blockedBy: clone(status.readyBlockedBy) })
      else ready.push({ ticketId: ticket.id, segment: clone(segment) })
    }
  }
  return { ready, blocked }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/**
 * Validate a main-thread supplied, byte-bound set of planning documents.
 * This protocol freezes reference identity and selected scopes only; it does
 * not assess Markdown prose, authorize implementation, activate a Workflow,
 * or create a cross-file transactional snapshot.
 */
export async function validatePlanningReferences({ root, cwd = root, manifest } = {}) {
  exactKeys(manifest, ['contract', 'spec', 'tickets'], 'manifest')
  if (manifest.contract !== PLANNING_REFERENCE_MANIFEST_CONTRACT) {
    fail('INVALID_MANIFEST', 'manifest.contract', 'unsupported contract')
  }
  const spec = manifestSpec(manifest.spec, 'manifest.spec')
  const tickets = array(manifest.tickets, 'manifest.tickets').map((item, index) => ({
    ...manifestTicket(item, `manifest.tickets[${index}]`), index,
  }))
  if (tickets.length === 0) fail('NO_EXECUTABLE_WORK', 'manifest.tickets', 'empty ticket set')
  unique(tickets, 'manifest.tickets', item => item.id)
  const allDocumentIds = [spec.id, ...tickets.map(item => item.id)]
  unique(allDocumentIds, 'manifest.documents')
  validateReferences(spec, tickets)
  assertAcyclic(tickets)

  const usedPaths = new Set()
  const specDocument = await loadDocument({ root, cwd, descriptor: spec, kind: 'spec', field: 'manifest.spec', usedPaths })
  const resolvedTickets = []
  for (const ticket of tickets) {
    const document = await loadDocument({ root, cwd, descriptor: ticket, kind: 'ticket', field: `manifest.tickets[${ticket.index}]`, usedPaths })
    resolvedTickets.push({
      id: ticket.id,
      revision: ticket.revision,
      document,
      spec: clone(ticket.spec),
      acceptanceCriteria: clone(ticket.acceptanceCriteria),
      contracts: clone(ticket.contracts),
      dependsOn: clone(ticket.dependsOn),
      work: clone(ticket.work),
    })
  }
  const scopes = resolveScopes(spec, tickets)
  if (scopes.ready.length === 0) {
    const error = new PlanningReferenceError('NO_EXECUTABLE_WORK', 'manifest.tickets')
    error.blocked = deepFreeze(clone(scopes.blocked))
    throw error
  }
  return deepFreeze({
    contract: PLANNING_REFERENCE_SET_CONTRACT,
    spec: { id: spec.id, revision: spec.revision, ...specDocument,
      acceptanceCriteria: clone(spec.acceptanceCriteria), contracts: clone(spec.contracts) },
    tickets: resolvedTickets,
    ready: scopes.ready,
    blocked: scopes.blocked,
  })
}
