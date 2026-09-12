import { createHash } from 'node:crypto'

import {
  createPublicOwnerChangeLog,
  normalizePublicOwnerChangeDecision,
  normalizePublicOwnerContext,
  publicOwnerContextDigest,
  registerPublicOwnerChangeRequest,
} from './public-owner-change.mjs'
import { readRecoverySessionArtifact } from './recovery-session.mjs'
import { normalizeReplanContexts } from './replan-session.mjs'

export const PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT = 'DSH_PUBLIC_OWNER_DECISION_SESSION_REQUEST_V1'
export const PUBLIC_OWNER_DECISION_SESSION_STATE_CONTRACT = 'DSH_PUBLIC_OWNER_DECISION_SESSION_V1'
export const PUBLIC_OWNER_DECISION_SESSION_RESULT_CONTRACT = 'DSH_PUBLIC_OWNER_DECISION_SESSION_RESULT_V1'
export const PUBLIC_OWNER_DECISION_SUBMIT_RESULT_CONTRACT = 'DSH_WORKFLOW_PUBLIC_OWNER_DECISION_SUBMIT_RESULT_V1'

const TERMINAL_PHASES = new Set([
  'submission_observed', 'settled_failed', 'settled_cancelled', 'settled_timeout', 'stale', 'technical_pause',
])
const ACTIVE_PHASES = new Set(['creating', 'created', 'submitted'])

const decisionFields = [
  'contract', 'decisionId', 'requestId', 'requestVersion', 'requestDigest', 'targetOwnerId',
  'baseline', 'outcome', 'summary', 'basisRefs', 'affectedConsumers', 'contractChange',
  'migrationOrder', 'alternative', 'unknowns', 'businessChange',
]

export const PUBLIC_OWNER_DECISION_SUBMISSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(decisionFields.map(field => [field, field === 'requestVersion'
    ? { type: 'integer', minimum: 1 }
    : ['basisRefs', 'affectedConsumers', 'migrationOrder', 'unknowns'].includes(field)
      ? { type: 'array' }
      : ['baseline', 'contractChange', 'alternative', 'businessChange'].includes(field)
        ? {}
        : { type: 'string', minLength: 1 }])),
  required: decisionFields,
}

function fail(reason) {
  throw new Error(`PublicOwnerSession ${reason}`)
}

function plain(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length !== 0
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => (
      !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
    ))) fail(`${name}_invalid`)
  return value
}

function exact(value, keys, name) {
  plain(value, name)
  const actual = Object.getOwnPropertyNames(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${name}_invalid`)
  }
  return value
}

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name}_invalid`)
  return value
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function publicOwnerSessionDigest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function normalizePublicOwnerDecisionSessionRequest(raw) {
  exact(raw, ['contract', 'request', 'context', 'prompt'], 'request')
  if (raw.contract !== PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT) fail('request_contract_invalid')
  exact(raw.prompt, ['id', 'content'], 'prompt')
  const context = normalizePublicOwnerContext(raw.context)
  const registered = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), raw.request, context)
  return {
    contract: PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT,
    request: registered.request,
    requestDigest: registered.requestDigest,
    context,
    contextDigest: publicOwnerContextDigest(context),
    prompt: { id: text(raw.prompt.id, 'prompt_id'), content: text(raw.prompt.content, 'prompt_content') },
  }
}

export function publicOwnerDecisionSessionId(workflowId, request) {
  text(workflowId, 'workflow_id')
  return `public-owner-${publicOwnerSessionDigest({
    workflowId, requestId: request.requestId, requestVersion: request.requestVersion,
    requestDigest: request.requestDigest,
  }).slice(0, 32)}`
}

export function createPublicOwnerDecisionSessionState(workflowId, normalized, now) {
  return {
    contract: PUBLIC_OWNER_DECISION_SESSION_STATE_CONTRACT,
    workflowId,
    requestId: normalized.request.requestId,
    requestVersion: normalized.request.requestVersion,
    requestDigest: normalized.requestDigest,
    ownerId: normalized.request.targetOwnerId,
    planRevision: normalized.context.planRevision,
    planDigest: normalized.context.planDigest,
    contextDigest: normalized.contextDigest,
    executionIdentity: {
      sessionId: publicOwnerDecisionSessionId(workflowId, {
        requestId: normalized.request.requestId,
        requestVersion: normalized.request.requestVersion,
        requestDigest: normalized.requestDigest,
      }),
      promptId: normalized.prompt.id,
    },
    prompt: structuredClone(normalized.prompt),
    request: structuredClone(normalized.request),
    context: structuredClone(normalized.context),
    contextMessages: [],
    phase: 'creating',
    createdAt: now,
    updatedAt: now,
  }
}

export function assertPublicOwnerDecisionSessionState(record, workflowId, normalized) {
  plain(record, 'state')
  if (record.contract !== PUBLIC_OWNER_DECISION_SESSION_STATE_CONTRACT
    || record.workflowId !== workflowId
    || record.requestId !== normalized.request.requestId
    || record.requestVersion !== normalized.request.requestVersion
    || record.requestDigest !== normalized.requestDigest
    || record.ownerId !== normalized.request.targetOwnerId
    || record.planRevision !== normalized.context.planRevision
    || record.planDigest !== normalized.context.planDigest
    || record.contextDigest !== normalized.contextDigest
    || canonical(record.prompt) !== canonical(normalized.prompt)
    || canonical(record.request) !== canonical(normalized.request)
    || canonical(record.context) !== canonical(normalized.context)
    || !Array.isArray(record.contextMessages)
    || record.executionIdentity?.sessionId !== publicOwnerDecisionSessionId(workflowId, {
      requestId: normalized.request.requestId,
      requestVersion: normalized.request.requestVersion,
      requestDigest: normalized.requestDigest,
    })
    || record.executionIdentity?.promptId !== normalized.prompt.id
    || (!ACTIVE_PHASES.has(record.phase) && !TERMINAL_PHASES.has(record.phase))) {
    fail('state_binding_mismatch')
  }
  normalizeReplanContexts(record.contextMessages)
  return record
}

export function publicOwnerSessionActive(record) {
  return record?.contract === PUBLIC_OWNER_DECISION_SESSION_STATE_CONTRACT && ACTIVE_PHASES.has(record.phase)
}

const paused = reason => ({ outcome: 'paused', phase: 'technical_pause', reason })

function turnFacts(events, prompt, contextMessages) {
  const matchesPrompt = value => value?.id === prompt.id && value?.role === 'user'
    && canonical(value.content) === canonical([{ type: 'text', text: prompt.content }])
    && canonical(value.source) === canonical({ kind: 'user' })
  const inputs = events.filter(event => event.type === 'user/message').map(event => event.data)
  const queued = events.filter(event => event.type === 'agent/inbox/spliced')
    .flatMap(event => (event.data?.inserted ?? []).filter(item => item?.role === 'user'))
  const contexts = normalizeReplanContexts(contextMessages ?? [])
  const extras = inputs.filter(item => !matchesPrompt(item))
  if (inputs.filter(matchesPrompt).length !== 1 || queued.length > 1
    || extras.some(item => !contexts.some(saved => canonical(saved) === canonical(item)))
    || queued.some(item => !matchesPrompt(item))) {
    return paused('prompt_not_unique')
  }
  const starts = events.filter(event => event.type === 'turn/start')
  const ends = events.filter(event => event.type === 'turn/end')
  if (starts.length !== 1 || ends.length !== 1 || starts[0].data?.turn !== ends[0].data?.turn) {
    return paused(ends.length === 0 ? 'session_not_terminal' : 'terminal_shape_ambiguous')
  }
  const turn = starts[0].data.turn
  const steps = events.filter(event => event.type === 'step/start' && event.data?.turn === turn)
    .map(event => event.data.step)
  if (steps.length === 0 || new Set(steps).size !== steps.length) return paused('terminal_step_ambiguous')
  return { outcome: 'observed_terminal', turn, steps, terminalSeq: ends[0].seq, terminal: ends[0] }
}

export async function inspectPublicOwnerDecisionSession({ persistence, record, signal }) {
  const observation = await readRecoverySessionArtifact({
    persistence,
    executionIdentity: record.executionIdentity,
    prompt: record.prompt,
    signal,
  })
  if (observation.outcome !== 'artifact') return paused(observation.reason ?? 'artifact_unavailable')
  const facts = turnFacts(observation.events, record.prompt, record.contextMessages)
  if (facts.outcome !== 'observed_terminal') return facts
  const terminalKind = facts.terminal?.data?.reason?.kind ?? facts.terminal?.data?.kind
  if (!['completed', 'aborted'].includes(terminalKind)) return paused('terminal_reason_unknown')
  const calls = observation.events.filter(event => (
    event.type === 'tool/call' && event.data?.name === 'workflow_public_owner_decision_submit'
  ))
  const accepted = []
  for (const call of calls) {
    if (call.data.turn !== facts.turn || !facts.steps.includes(call.data.step)) return paused('tool_turn_mismatch')
    const results = observation.events.filter(event => event.type === 'tool/result'
      && event.data?.message?.source?.callId === call.data.callId)
    if (results.length !== 1) return paused('tool_result_unknown')
    const result = results[0]
    const block = result.data?.message?.content?.[0]
    if (result.seq <= call.seq || result.seq >= facts.terminalSeq
      || block?.type !== 'tool-result' || block.toolCallId !== call.data.callId
      || block.isError === true || result.data?.error !== undefined) continue
    let receipt, args
    try {
      receipt = JSON.parse(block.content.map(item => item.text).join(''))
      args = JSON.parse(call.data.arguments)
    } catch { return paused('tool_payload_invalid') }
    if (receipt?.contract !== PUBLIC_OWNER_DECISION_SUBMIT_RESULT_CONTRACT || receipt.accepted !== true
      || receipt.ownerId !== record.ownerId || receipt.requestId !== record.requestId
      || receipt.requestVersion !== record.requestVersion || receipt.requestDigest !== record.requestDigest) {
      return paused('tool_receipt_binding_mismatch')
    }
    let decision
    try {
      decision = normalizePublicOwnerChangeDecision(args?.decision, record.request, record.context)
    } catch { return paused('tool_decision_invalid') }
    accepted.push({
      decision,
      receipt: {
        toolName: 'workflow_public_owner_decision_submit', callId: call.data.callId,
        callSeq: call.seq, resultSeq: result.seq, terminalSeq: facts.terminalSeq,
        terminalKind, revision: observation.revision, decisionDigest: publicOwnerSessionDigest(decision),
      },
    })
  }
  if (accepted.length > 1) return paused('submission_not_unique')
  if (accepted.length === 1) return { outcome: 'submission_observed', phase: 'submission_observed', ...accepted[0] }
  return {
    outcome: terminalKind === 'aborted' ? 'cancelled' : 'failed',
    phase: terminalKind === 'aborted' ? 'settled_cancelled' : 'settled_failed',
    reason: 'submission_missing',
  }
}
