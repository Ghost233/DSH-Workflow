import { createHash } from 'node:crypto'

export const PUBLIC_OWNER_CHANGE_LOG_CONTRACT = 'DSH_PUBLIC_OWNER_CHANGE_LOG_V1'
export const PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT = 'DSH_PUBLIC_OWNER_CHANGE_REQUEST_V1'
export const PUBLIC_OWNER_CHANGE_DECISION_CONTRACT = 'DSH_PUBLIC_OWNER_CHANGE_DECISION_V1'

const SHA256 = /^[a-f0-9]{64}$/u
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const OUTCOMES = new Set([
  'capability_sufficient', 'compatible_extension', 'migration_required',
  'rejected', 'facts_missing', 'business_decision_required',
])
const IMPACTS = new Set(['no_change', 'compatible', 'update_required'])

export class PublicOwnerChangeError extends Error {
  constructor(code, field, detail) {
    super(`${code}: ${field}${detail === undefined ? '' : ` (${detail})`}`)
    this.name = 'PublicOwnerChangeError'
    this.code = code
    this.field = field
  }
}

function fail(code, field, detail) { throw new PublicOwnerChangeError(code, field, detail) }

function plain(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Object.getOwnPropertySymbols(value).length !== 0) fail('INVALID_INPUT', field)
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(value))
  if (descriptors.some(item => !item.enumerable || !Object.hasOwn(item, 'value'))) fail('INVALID_INPUT', field)
  return value
}

function exact(value, keys, field) {
  const object = plain(value, field)
  const actual = Object.getOwnPropertyNames(object)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))
    || keys.some(key => !Object.hasOwn(object, key))) fail('INVALID_INPUT', field, 'unexpected fields')
  return object
}

function text(value, field, { id = false, digest = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') fail('INVALID_INPUT', field)
  const result = value.trim()
  if (id && !STABLE_ID.test(result)) fail('INVALID_INPUT', field, 'invalid stable identifier')
  if (digest && !SHA256.test(result)) fail('INVALID_INPUT', field, 'invalid digest')
  return digest ? result.toLowerCase() : result
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_INPUT', field)
  return value
}

function list(value, field, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail('INVALID_INPUT', field)
  return value
}

function unique(items, field, key = item => item) {
  const seen = new Set()
  for (const item of items) {
    const identity = key(item)
    if (seen.has(identity)) fail('DUPLICATE_REFERENCE', field, identity)
    seen.add(identity)
  }
  return items
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex') }
function clone(value) { return structuredClone(value) }

function reference(value, field) {
  exact(value, ['id', 'revision'], field)
  return { id: text(value.id, `${field}.id`, { id: true }), revision: text(value.revision, `${field}.revision`, { id: true }) }
}

function contextConsumer(value, field, evidenceSet) {
  exact(value, ['consumerId', 'ownerId', 'contract', 'evidenceRefs'], field)
  const evidenceRefs = unique(list(value.evidenceRefs, `${field}.evidenceRefs`, { nonempty: true })
    .map((item, index) => text(item, `${field}.evidenceRefs[${index}]`, { id: true })), `${field}.evidenceRefs`)
  if (evidenceRefs.some(item => !evidenceSet.has(item))) fail('UNKNOWN_EVIDENCE', `${field}.evidenceRefs`)
  return {
    consumerId: text(value.consumerId, `${field}.consumerId`, { id: true }),
    ownerId: text(value.ownerId, `${field}.ownerId`, { id: true }),
    contract: reference(value.contract, `${field}.contract`),
    evidenceRefs,
  }
}

export function normalizePublicOwnerContext(raw) {
  exact(raw, [
    'workflowId', 'planRevision', 'planDigest', 'owners', 'tickets',
    'acceptanceCriteria', 'contracts', 'evidenceRefs', 'consumerInventoryComplete', 'consumers',
  ], 'context')
  const owners = unique(list(raw.owners, 'context.owners', { nonempty: true })
    .map((item, index) => text(item, `context.owners[${index}]`, { id: true })), 'context.owners')
  const ownerSet = new Set(owners)
  const tickets = unique(list(raw.tickets, 'context.tickets', { nonempty: true })
    .map((item, index) => reference(item, `context.tickets[${index}]`)), 'context.tickets', item => item.id)
  const acceptanceCriteria = unique(list(raw.acceptanceCriteria, 'context.acceptanceCriteria', { nonempty: true })
    .map((item, index) => text(item, `context.acceptanceCriteria[${index}]`, { id: true })), 'context.acceptanceCriteria')
  const contracts = unique(list(raw.contracts, 'context.contracts', { nonempty: true }).map((item, index) => {
    const field = `context.contracts[${index}]`
    exact(item, ['id', 'revision', 'ownerId'], field)
    const ownerId = text(item.ownerId, `${field}.ownerId`, { id: true })
    if (!ownerSet.has(ownerId)) fail('UNKNOWN_OWNER', `${field}.ownerId`, ownerId)
    return { ...reference({ id: item.id, revision: item.revision }, field), ownerId }
  }), 'context.contracts', item => item.id)
  const evidenceRefs = unique(list(raw.evidenceRefs, 'context.evidenceRefs', { nonempty: true })
    .map((item, index) => text(item, `context.evidenceRefs[${index}]`, { id: true })), 'context.evidenceRefs')
  const evidenceSet = new Set(evidenceRefs)
  if (typeof raw.consumerInventoryComplete !== 'boolean') fail('INVALID_INPUT', 'context.consumerInventoryComplete')
  const consumers = unique(list(raw.consumers, 'context.consumers')
    .map((item, index) => contextConsumer(item, `context.consumers[${index}]`, evidenceSet)),
  'context.consumers', item => item.consumerId)
  for (const [index, consumer] of consumers.entries()) {
    if (!ownerSet.has(consumer.ownerId)) fail('UNKNOWN_OWNER', `context.consumers[${index}].ownerId`, consumer.ownerId)
    const known = contracts.find(item => item.id === consumer.contract.id)
    if (known === undefined || known.revision !== consumer.contract.revision) {
      fail('UNKNOWN_REFERENCE', `context.consumers[${index}].contract`, consumer.contract.id)
    }
  }
  return {
    workflowId: text(raw.workflowId, 'context.workflowId', { id: true }),
    planRevision: integer(raw.planRevision, 'context.planRevision'),
    planDigest: text(raw.planDigest, 'context.planDigest', { digest: true }),
    owners,
    tickets,
    acceptanceCriteria,
    contracts,
    evidenceRefs,
    consumerInventoryComplete: raw.consumerInventoryComplete,
    consumers,
  }
}

export function publicOwnerContextDigest(raw) {
  const context = normalizePublicOwnerContext(raw)
  return digest({
    workflowId: context.workflowId,
    planRevision: context.planRevision,
    planDigest: context.planDigest,
    owners: context.owners,
    tickets: context.tickets,
    acceptanceCriteria: context.acceptanceCriteria,
    contracts: context.contracts,
    consumerInventoryComplete: context.consumerInventoryComplete,
    consumers: context.consumers,
  })
}

function baseline(raw, field) {
  exact(raw, ['workflowId', 'planRevision', 'planDigest', 'contract', 'contextDigest'], field)
  return {
    workflowId: text(raw.workflowId, `${field}.workflowId`, { id: true }),
    planRevision: integer(raw.planRevision, `${field}.planRevision`),
    planDigest: text(raw.planDigest, `${field}.planDigest`, { digest: true }),
    contract: reference(raw.contract, `${field}.contract`),
    contextDigest: text(raw.contextDigest, `${field}.contextDigest`, { digest: true }),
  }
}

function assertBaseline(value, context, targetOwnerId, field) {
  if (value.workflowId !== context.workflowId || value.planRevision !== context.planRevision
    || value.planDigest !== context.planDigest || value.contextDigest !== publicOwnerContextDigest(context)) {
    fail('STALE_BASELINE', field)
  }
  const contract = context.contracts.find(item => item.id === value.contract.id)
  if (contract === undefined || contract.revision !== value.contract.revision) {
    fail('STALE_CONTRACT', `${field}.contract`, value.contract.id)
  }
  if (contract.ownerId !== targetOwnerId) fail('OWNER_CONTRACT_MISMATCH', `${field}.contract`, targetOwnerId)
}

function source(raw, field, context) {
  exact(raw, ['tickets', 'acceptanceCriteria'], field)
  const tickets = unique(list(raw.tickets, `${field}.tickets`, { nonempty: true })
    .map((item, index) => reference(item, `${field}.tickets[${index}]`)), `${field}.tickets`, item => item.id)
  const criteria = unique(list(raw.acceptanceCriteria, `${field}.acceptanceCriteria`, { nonempty: true })
    .map((item, index) => text(item, `${field}.acceptanceCriteria[${index}]`, { id: true })), `${field}.acceptanceCriteria`)
  for (const ticket of tickets) {
    const current = context.tickets.find(item => item.id === ticket.id)
    if (current === undefined || current.revision !== ticket.revision) fail('UNKNOWN_REFERENCE', `${field}.tickets`, ticket.id)
  }
  for (const criterion of criteria) {
    if (!context.acceptanceCriteria.includes(criterion)) fail('UNKNOWN_REFERENCE', `${field}.acceptanceCriteria`, criterion)
  }
  return { tickets, acceptanceCriteria: criteria }
}

function evidenceRefs(raw, field, context, { nonempty = true } = {}) {
  const refs = unique(list(raw, field, { nonempty })
    .map((item, index) => text(item, `${field}[${index}]`, { id: true })), field)
  for (const ref of refs) if (!context.evidenceRefs.includes(ref)) fail('UNKNOWN_EVIDENCE', field, ref)
  return refs
}

export function normalizePublicOwnerChangeRequest(raw, rawContext) {
  const context = normalizePublicOwnerContext(rawContext)
  exact(raw, [
    'contract', 'requestId', 'requestVersion', 'requesterOwnerId', 'targetOwnerId',
    'source', 'baseline', 'expectedBehavior', 'actualGap', 'evidenceRefs',
    'suggestion', 'supersedesRequestDigest',
  ], 'request')
  if (raw.contract !== PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT) fail('UNKNOWN_CONTRACT', 'request.contract')
  const requesterOwnerId = text(raw.requesterOwnerId, 'request.requesterOwnerId', { id: true })
  const targetOwnerId = text(raw.targetOwnerId, 'request.targetOwnerId', { id: true })
  if (!context.owners.includes(requesterOwnerId)) fail('UNKNOWN_OWNER', 'request.requesterOwnerId', requesterOwnerId)
  if (!context.owners.includes(targetOwnerId)) fail('UNKNOWN_OWNER', 'request.targetOwnerId', targetOwnerId)
  if (requesterOwnerId === targetOwnerId) fail('INVALID_INPUT', 'request.targetOwnerId', 'must be a public Owner')
  const requestBaseline = baseline(raw.baseline, 'request.baseline')
  assertBaseline(requestBaseline, context, targetOwnerId, 'request.baseline')
  const requestVersion = integer(raw.requestVersion, 'request.requestVersion')
  const supersedesRequestDigest = raw.supersedesRequestDigest === null
    ? null : text(raw.supersedesRequestDigest, 'request.supersedesRequestDigest', { digest: true })
  if ((requestVersion === 1) !== (supersedesRequestDigest === null)) {
    fail('INVALID_SUPERSESSION', 'request.supersedesRequestDigest')
  }
  return {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId: text(raw.requestId, 'request.requestId', { id: true }),
    requestVersion,
    requesterOwnerId,
    targetOwnerId,
    source: source(raw.source, 'request.source', context),
    baseline: requestBaseline,
    expectedBehavior: text(raw.expectedBehavior, 'request.expectedBehavior'),
    actualGap: text(raw.actualGap, 'request.actualGap'),
    evidenceRefs: evidenceRefs(raw.evidenceRefs, 'request.evidenceRefs', context),
    suggestion: text(raw.suggestion, 'request.suggestion'),
    supersedesRequestDigest,
  }
}

function affectedConsumer(raw, field, context) {
  exact(raw, ['consumerId', 'ownerId', 'impact', 'evidenceRefs'], field)
  const consumerId = text(raw.consumerId, `${field}.consumerId`, { id: true })
  const current = context.consumers.find(item => item.consumerId === consumerId)
  const ownerId = text(raw.ownerId, `${field}.ownerId`, { id: true })
  if (current === undefined || current.ownerId !== ownerId) fail('UNKNOWN_CONSUMER', field, consumerId)
  const impact = text(raw.impact, `${field}.impact`, { id: true })
  if (!IMPACTS.has(impact)) fail('INVALID_OUTCOME', `${field}.impact`, impact)
  return { consumerId, ownerId, impact, evidenceRefs: evidenceRefs(raw.evidenceRefs, `${field}.evidenceRefs`, context) }
}

function contractChange(raw, field) {
  if (raw === null) return null
  exact(raw, ['nextRevision', 'behavior', 'compatibility'], field)
  return {
    nextRevision: text(raw.nextRevision, `${field}.nextRevision`, { id: true }),
    behavior: text(raw.behavior, `${field}.behavior`),
    compatibility: text(raw.compatibility, `${field}.compatibility`),
  }
}

function alternative(raw, field) {
  if (raw === null) return null
  exact(raw, ['kind', 'detail'], field)
  const kind = text(raw.kind, `${field}.kind`, { id: true })
  if (!['alternative', 'infeasible'].includes(kind)) fail('INVALID_OUTCOME', `${field}.kind`, kind)
  return { kind, detail: text(raw.detail, `${field}.detail`) }
}

function unknown(raw, field, context) {
  exact(raw, ['fact', 'ownerId', 'closeWhen'], field)
  const ownerId = text(raw.ownerId, `${field}.ownerId`, { id: true })
  if (!context.owners.includes(ownerId)) fail('UNKNOWN_OWNER', `${field}.ownerId`, ownerId)
  return { fact: text(raw.fact, `${field}.fact`), ownerId, closeWhen: text(raw.closeWhen, `${field}.closeWhen`) }
}

function businessChange(raw, field, request) {
  if (raw === null) return null
  exact(raw, ['acceptanceCriterion', 'currentCommitment', 'proposedCommitment', 'consequence'], field)
  const acceptanceCriterion = text(raw.acceptanceCriterion, `${field}.acceptanceCriterion`, { id: true })
  if (!request.source.acceptanceCriteria.includes(acceptanceCriterion)) {
    fail('UNKNOWN_REFERENCE', `${field}.acceptanceCriterion`, acceptanceCriterion)
  }
  const currentCommitment = text(raw.currentCommitment, `${field}.currentCommitment`)
  const proposedCommitment = text(raw.proposedCommitment, `${field}.proposedCommitment`)
  if (currentCommitment === proposedCommitment) fail('INVALID_OUTCOME', field, 'commitment did not change')
  return { acceptanceCriterion, currentCommitment, proposedCommitment, consequence: text(raw.consequence, `${field}.consequence`) }
}

function assertConsumerCoverage(consumers, context, field) {
  if (context.consumerInventoryComplete !== true) fail('CONSUMER_FACTS_INCOMPLETE', field)
  const actual = [...consumers.map(item => item.consumerId)].sort()
  const expected = [...context.consumers.map(item => item.consumerId)].sort()
  if (canonical(actual) !== canonical(expected)) fail('CONSUMER_FACTS_INCOMPLETE', field)
}

export function normalizePublicOwnerChangeDecision(raw, request, rawContext) {
  const context = normalizePublicOwnerContext(rawContext)
  exact(raw, [
    'contract', 'decisionId', 'requestId', 'requestVersion', 'requestDigest',
    'targetOwnerId', 'baseline', 'outcome', 'summary', 'basisRefs',
    'affectedConsumers', 'contractChange', 'migrationOrder', 'alternative',
    'unknowns', 'businessChange',
  ], 'decision')
  if (raw.contract !== PUBLIC_OWNER_CHANGE_DECISION_CONTRACT) fail('UNKNOWN_CONTRACT', 'decision.contract')
  const boundDigest = digest(request)
  if (raw.requestId !== request.requestId || raw.requestVersion !== request.requestVersion
    || raw.requestDigest !== boundDigest || raw.targetOwnerId !== request.targetOwnerId) {
    fail('DECISION_REQUEST_MISMATCH', 'decision.requestDigest')
  }
  const decisionBaseline = baseline(raw.baseline, 'decision.baseline')
  if (canonical(decisionBaseline) !== canonical(request.baseline)) fail('DECISION_REQUEST_MISMATCH', 'decision.baseline')
  assertBaseline(decisionBaseline, context, request.targetOwnerId, 'decision.baseline')
  const outcome = text(raw.outcome, 'decision.outcome', { id: true })
  if (!OUTCOMES.has(outcome)) fail('INVALID_OUTCOME', 'decision.outcome', outcome)
  const affectedConsumers = unique(list(raw.affectedConsumers, 'decision.affectedConsumers')
    .map((item, index) => affectedConsumer(item, `decision.affectedConsumers[${index}]`, context)),
  'decision.affectedConsumers', item => item.consumerId)
  const normalizedContractChange = contractChange(raw.contractChange, 'decision.contractChange')
  const migrationOrder = unique(list(raw.migrationOrder, 'decision.migrationOrder')
    .map((item, index) => text(item, `decision.migrationOrder[${index}]`, { id: true })), 'decision.migrationOrder')
  const normalizedAlternative = alternative(raw.alternative, 'decision.alternative')
  const unknowns = list(raw.unknowns, 'decision.unknowns')
    .map((item, index) => unknown(item, `decision.unknowns[${index}]`, context))
  const normalizedBusinessChange = businessChange(raw.businessChange, 'decision.businessChange', request)

  if (['capability_sufficient', 'compatible_extension', 'migration_required'].includes(outcome)) {
    assertConsumerCoverage(affectedConsumers, context, 'decision.affectedConsumers')
  }
  if (outcome === 'capability_sufficient') {
    if (normalizedContractChange !== null || migrationOrder.length !== 0 || normalizedAlternative !== null
      || unknowns.length !== 0 || normalizedBusinessChange !== null
      || affectedConsumers.some(item => item.impact === 'update_required')) fail('INVALID_OUTCOME', 'decision')
  } else if (outcome === 'compatible_extension') {
    if (normalizedContractChange === null || normalizedContractChange.nextRevision === request.baseline.contract.revision
      || migrationOrder.length !== 0 || normalizedAlternative !== null || unknowns.length !== 0
      || normalizedBusinessChange !== null) fail('INVALID_OUTCOME', 'decision')
  } else if (outcome === 'migration_required') {
    const required = affectedConsumers.filter(item => item.impact === 'update_required').map(item => item.consumerId).sort()
    if (normalizedContractChange === null || normalizedContractChange.nextRevision === request.baseline.contract.revision
      || canonical([...migrationOrder].sort()) !== canonical(required) || required.length === 0
      || normalizedAlternative !== null || unknowns.length !== 0 || normalizedBusinessChange !== null) {
      fail('INVALID_OUTCOME', 'decision')
    }
  } else if (outcome === 'rejected') {
    if (normalizedAlternative === null || normalizedContractChange !== null || migrationOrder.length !== 0
      || unknowns.length !== 0 || normalizedBusinessChange !== null) fail('INVALID_OUTCOME', 'decision')
  } else if (outcome === 'facts_missing') {
    if (unknowns.length === 0 || normalizedContractChange !== null || migrationOrder.length !== 0
      || normalizedAlternative !== null || normalizedBusinessChange !== null) fail('INVALID_OUTCOME', 'decision')
  } else if (normalizedBusinessChange === null || normalizedContractChange !== null || migrationOrder.length !== 0
    || normalizedAlternative !== null || unknowns.length !== 0) fail('INVALID_OUTCOME', 'decision')

  return {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: text(raw.decisionId, 'decision.decisionId', { id: true }),
    requestId: request.requestId,
    requestVersion: request.requestVersion,
    requestDigest: boundDigest,
    targetOwnerId: request.targetOwnerId,
    baseline: decisionBaseline,
    outcome,
    summary: text(raw.summary, 'decision.summary'),
    basisRefs: evidenceRefs(raw.basisRefs, 'decision.basisRefs', context),
    affectedConsumers,
    contractChange: normalizedContractChange,
    migrationOrder,
    alternative: normalizedAlternative,
    unknowns,
    businessChange: normalizedBusinessChange,
  }
}

/** Bind a model-supplied judgment to the immutable request fields owned by Runtime. */
export function bindPublicOwnerChangeDecision(rawJudgment, request, rawContext) {
  exact(rawJudgment, [
    'decisionId', 'outcome', 'summary', 'basisRefs', 'affectedConsumers',
    'contractChange', 'migrationOrder', 'alternative', 'unknowns', 'businessChange',
  ], 'decision')
  return normalizePublicOwnerChangeDecision({
    ...rawJudgment,
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    requestId: request.requestId,
    requestVersion: request.requestVersion,
    requestDigest: digest(request),
    targetOwnerId: request.targetOwnerId,
    baseline: clone(request.baseline),
  }, request, rawContext)
}

export function createPublicOwnerChangeLog() {
  return { contract: PUBLIC_OWNER_CHANGE_LOG_CONTRACT, requests: [], decisions: [] }
}

export function normalizePublicOwnerChangeLog(raw) {
  exact(raw, ['contract', 'requests', 'decisions'], 'log')
  if (raw.contract !== PUBLIC_OWNER_CHANGE_LOG_CONTRACT) fail('UNKNOWN_CONTRACT', 'log.contract')
  const requests = list(raw.requests, 'log.requests').map((item, index) => {
    exact(item, ['requestDigest', 'context', 'request'], `log.requests[${index}]`)
    const context = normalizePublicOwnerContext(item.context)
    const request = normalizePublicOwnerChangeRequest(item.request, context)
    const requestDigest = text(item.requestDigest, `log.requests[${index}].requestDigest`, { digest: true })
    if (requestDigest !== digest(request)) fail('DIGEST_MISMATCH', `log.requests[${index}].requestDigest`)
    return { requestDigest, context, request }
  })
  unique(requests, 'log.requests', item => `${item.request.requestId}:${item.request.requestVersion}`)
  const decisions = list(raw.decisions, 'log.decisions').map((item, index) => {
    exact(item, ['decisionDigest', 'decision'], `log.decisions[${index}]`)
    const decisionDigest = text(item.decisionDigest, `log.decisions[${index}].decisionDigest`, { digest: true })
    const requestDigest = text(item.decision?.requestDigest, `log.decisions[${index}].decision.requestDigest`, { digest: true })
    const request = requests.find(entry => entry.requestDigest === requestDigest)
    if (request === undefined) fail('DECISION_REQUEST_MISMATCH', `log.decisions[${index}]`)
    const decision = normalizePublicOwnerChangeDecision(item.decision, request.request, request.context)
    if (decisionDigest !== digest(decision)) fail('DIGEST_MISMATCH', `log.decisions[${index}].decisionDigest`)
    return { decisionDigest, decision }
  })
  unique(decisions, 'log.decisions', item => item.decision.requestDigest)
  unique(decisions, 'log.decisions.decisionId', item => item.decision.decisionId)
  return { contract: PUBLIC_OWNER_CHANGE_LOG_CONTRACT, requests, decisions }
}

export function registerPublicOwnerChangeRequest(rawLog, rawRequest, rawContext) {
  const log = normalizePublicOwnerChangeLog(rawLog)
  const request = normalizePublicOwnerChangeRequest(rawRequest, rawContext)
  const requestDigest = digest(request)
  const versions = log.requests.filter(item => item.request.requestId === request.requestId)
    .sort((left, right) => left.request.requestVersion - right.request.requestVersion)
  const same = versions.find(item => item.request.requestVersion === request.requestVersion)
  if (same !== undefined) {
    if (same.requestDigest !== requestDigest) fail('REQUEST_VERSION_CONFLICT', 'request.requestVersion')
    return { log, outcome: 'replayed', request: clone(same.request), requestDigest }
  }
  const latest = versions.at(-1)
  if (latest === undefined) {
    if (request.requestVersion !== 1 || request.supersedesRequestDigest !== null) fail('INVALID_SUPERSESSION', 'request')
  } else if (request.requestVersion !== latest.request.requestVersion + 1
    || request.supersedesRequestDigest !== latest.requestDigest) fail('INVALID_SUPERSESSION', 'request')
  log.requests.push({ requestDigest, context: normalizePublicOwnerContext(rawContext), request: clone(request) })
  return { log, outcome: 'accepted', request: clone(request), requestDigest }
}

export function registerPublicOwnerChangeDecision(rawLog, rawDecision, rawContext) {
  const log = normalizePublicOwnerChangeLog(rawLog)
  const requestDigest = text(rawDecision?.requestDigest, 'decision.requestDigest', { digest: true })
  const entry = log.requests.find(item => item.requestDigest === requestDigest)
  if (entry === undefined) fail('UNKNOWN_REQUEST', 'decision.requestDigest')
  const decision = normalizePublicOwnerChangeDecision(rawDecision, entry.request, rawContext)
  const decisionDigest = digest(decision)
  const existing = log.decisions.find(item => item.decision.requestDigest === requestDigest)
  if (existing !== undefined) {
    if (existing.decisionDigest !== decisionDigest) fail('DECISION_CONFLICT', 'decision.requestDigest')
    return { log, outcome: 'replayed', decision: clone(existing.decision), decisionDigest }
  }
  const identityConflict = log.decisions.find(item => item.decision.decisionId === decision.decisionId)
  if (identityConflict !== undefined) fail('DECISION_ID_CONFLICT', 'decision.decisionId')
  log.decisions.push({ decisionDigest, decision: clone(decision) })
  return { log, outcome: 'accepted', decision: clone(decision), decisionDigest }
}

export function projectPublicOwnerChange(rawLog, requestId, rawContext) {
  const log = normalizePublicOwnerChangeLog(rawLog)
  const context = normalizePublicOwnerContext(rawContext)
  const versions = log.requests.filter(item => item.request.requestId === requestId)
    .sort((left, right) => left.request.requestVersion - right.request.requestVersion)
  const entry = versions.at(-1)
  if (entry === undefined) fail('UNKNOWN_REQUEST', 'requestId', requestId)
  if (entry.request.baseline.contextDigest !== publicOwnerContextDigest(context)
    || entry.request.baseline.planDigest !== context.planDigest
    || entry.request.baseline.planRevision !== context.planRevision) {
    return { status: 'stale', ready: false, action: 'request_new_version', requestDigest: entry.requestDigest }
  }
  const currentContract = context.contracts.find(item => item.id === entry.request.baseline.contract.id)
  if (currentContract?.revision !== entry.request.baseline.contract.revision
    || currentContract?.ownerId !== entry.request.targetOwnerId) {
    return { status: 'stale', ready: false, action: 'request_new_version', requestDigest: entry.requestDigest }
  }
  const decisionEntry = log.decisions.find(item => item.decision.requestDigest === entry.requestDigest)
  if (decisionEntry === undefined) {
    return { status: 'pending', ready: false, action: 'owner_decision', requestDigest: entry.requestDigest }
  }
  const mapping = {
    capability_sufficient: ['ready', true, 'rebind_consumers'],
    compatible_extension: ['decided', false, 'implement_public_extension'],
    migration_required: ['decided', false, 'execute_migration_order'],
    rejected: ['decided', false, 'main_coordination'],
    facts_missing: ['decided', false, 'bounded_investigation'],
    business_decision_required: ['decided', false, 'user_decision'],
  }
  const [status, ready, action] = mapping[decisionEntry.decision.outcome]
  return {
    status,
    ready,
    action,
    requestDigest: entry.requestDigest,
    decisionDigest: decisionEntry.decisionDigest,
    outcome: decisionEntry.decision.outcome,
  }
}
