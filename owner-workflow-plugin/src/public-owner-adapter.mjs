import { kernelDigest, ownerFeedbackEvidence, ownerFeedbackReportSummary } from './workflow-engine.mjs'
import {
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
  publicOwnerContextDigest,
} from './public-owner-change.mjs'
import { ownerPublicContractGap } from './owner-feedback.mjs'

const stableId = description => ({
  type: 'string',
  minLength: 1,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$',
  description,
})
const prose = description => ({ type: 'string', minLength: 1, maxLength: 8_192, description })

/** Model-facing request facts. Runtime-owned plan versions and digests are intentionally absent. */
export const PUBLIC_OWNER_REQUEST_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    workflow_id: stableId('Existing workflow id returned by workflow_status.'),
    source_issue_id: stableId('Open owner-feedback issue id shown by workflow_status.publicOwnerRequests.'),
    target_owner_id: stableId('Current upstream producer Owner selected from the issue seed. Runtime verifies this binding.'),
    contract_id: stableId('Contract already declared by the current frozen Spec and source Ticket.'),
    expected_behavior: prose('Behavior the requesting task needs while preserving the frozen acceptance criteria.'),
    actual_gap: prose('Observed gap reported by the source Owner.'),
    suggestion: prose('A non-binding technical suggestion for independent public Owner review.'),
    consumer_task_ids: {
      type: 'array',
      uniqueItems: true,
      items: stableId('Current plan task consuming the public contract.'),
      description: 'Complete known consumer task inventory. Runtime derives each consumer Owner and contract binding.',
    },
    consumer_inventory_complete: {
      type: 'boolean',
      description: 'True only when consumer_task_ids is complete. False restricts the Owner to a facts_missing decision.',
    },
  },
  required: [
    'workflow_id', 'source_issue_id', 'target_owner_id', 'contract_id',
    'expected_behavior', 'actual_gap', 'suggestion', 'consumer_task_ids',
    'consumer_inventory_complete',
  ],
}

/** Locate an owner-feedback issue entirely from existing persisted issue/action facts. */
export function publicOwnerFeedbackSource(state, workflow, issueId) {
  const issue = workflow.issues?.[issueId]
  if (!issue || issue.status !== 'open') return { status: 'feedback_source_mismatch', reason: 'issue_not_open', issueId }
  const evidence = ownerFeedbackEvidence(state, workflow, issue)
  if (!evidence) {
    const notice = Object.values(state.actions).find(action => action.workflowId === workflow.id && action.kind === 'notify_main'
      && action.input?.reason === 'owner_feedback' && action.input?.detail?.issueId === issueId)
    return { status: 'feedback_source_mismatch', reason: notice ? 'source_action_missing' : 'feedback_notice_missing', issueId }
  }
  const { notice, source } = evidence
  const taskId = source.input?.task?.id
  const ownerId = source.input?.owner?.id
  const task = workflow.plan?.tasks.find(item => item.id === taskId)
  if (!task) return { status: 'feedback_source_mismatch', reason: 'task_missing', issueId, taskId, ownerId }
  if (task.ownerId !== ownerId) return { status: 'feedback_source_mismatch', reason: 'owner_changed', issueId, taskId, ownerId, currentOwnerId: task.ownerId }
  const owner = workflow.plan?.owners.find(item => item.id === ownerId)
  if (!owner) return { status: 'feedback_source_mismatch', reason: 'owner_missing', issueId, taskId, ownerId }
  return { status: 'matched', issue, notice, source, task, owner, report: evidence.report }
}

function producerBindings(planningPackage) {
  const result = []
  for (const input of planningPackage.inputs ?? []) {
    if (input.kind === 'task_dependency') result.push({ taskId: input.taskId, ownerId: input.ownerId, contracts: input.contracts ?? [] })
    if (input.kind === 'ticket_dependency') for (const producer of input.producers ?? []) {
      result.push({ taskId: producer.taskId, ownerId: producer.ownerId, contracts: producer.contracts ?? [] })
    }
  }
  const seen = new Set()
  return result.filter(item => {
    const key = `${item.taskId}\u0000${item.ownerId}\u0000${JSON.stringify(item.contracts)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sourceReferences(planningPackage) {
  const tickets = (planningPackage.tickets ?? []).map(ticket => ({ id: ticket.id, revision: ticket.revision }))
  const acceptanceCriteria = [...new Set((planningPackage.tickets ?? [])
    .flatMap(ticket => (ticket.acceptanceCriteria ?? []).map(item => item.id)))]
  return { tickets, acceptanceCriteria }
}

function dependsOn(tasks, taskId, producerId, seen = new Set()) {
  if (seen.has(taskId)) return false
  seen.add(taskId)
  const task = tasks.get(taskId)
  return (task?.dependsOn ?? []).some(dependency => dependency === producerId || dependsOn(tasks, dependency, producerId, seen))
}

function knownConsumers(workflow, producerTaskIds, contract) {
  const tasks = new Map((workflow.plan?.tasks ?? []).map(task => [task.id, task]))
  const bound = new Set((workflow.plan?.planningBindings?.tasks ?? []).filter(binding =>
    binding.contracts?.some(item => item.id === contract.id && item.revision === contract.revision)).map(binding => binding.taskId))
  return (workflow.plan?.tasks ?? []).filter(task => !task.children && !producerTaskIds.includes(task.id)
    && (bound.has(task.id) || producerTaskIds.some(producerId => dependsOn(tasks, task.id, producerId))))
    .map(task => task.id).sort()
}

/** Read-only status projection; planningPackage must be freshly validated against the active plan. */
export function publicOwnerRequestSeed(source, planningPackage, workflow) {
  if (source.status !== 'matched') return source
  if (planningPackage.taskId !== source.task.id || planningPackage.owner?.id !== source.owner.id) {
    return { status: 'feedback_source_mismatch', reason: 'current_package_binding_changed', issueId: source.issue.id,
      taskId: source.task.id, ownerId: source.owner.id }
  }
  const producers = producerBindings(planningPackage)
  const specContracts = planningPackage.spec?.contracts ?? []
  const producerContracts = producers.flatMap(producer => producer.contracts.map(contract => ({
    ...contract, producerTaskId: producer.taskId, ownerId: producer.ownerId,
    knownConsumerTaskIds: knownConsumers(workflow, [producer.taskId], contract),
  }))).filter(contract => specContracts.some(item => item.id === contract.id && item.revision === contract.revision))
  const references = sourceReferences(planningPackage)
  const gap = ownerPublicContractGap(source.report, { taskId: source.task.id, producerContracts })
  if (!gap) return { issueId: source.issue.id, status: 'feedback_not_public_contract',
    reason: 'explicit_public_contract_gap_required' }
  const matchingContracts = gap.contractId === null ? producerContracts
    : producerContracts.filter(contract => contract.id === gap.contractId)
  return {
    issueId: source.issue.id,
    status: matchingContracts.length ? 'ready_for_public_owner_request' : 'source_revision_required',
    resumeCondition: matchingContracts.length
      ? 'submit_workflow_public_owner_request'
      : 'declare_contract_in_public_producer_ticket_and_plan_binding_then_finalize_and_replan_same_workflow',
    feedbackOrigin: { planVersion: source.source.input?.taskPackage?.planVersion ?? null,
      taskId: source.task.id, ownerId: source.owner.id, report: ownerFeedbackReportSummary(source.report) },
    currentSource: { planVersion: workflow.planVersion, taskId: source.task.id, ownerId: source.owner.id,
      tickets: references.tickets, acceptanceCriteria: references.acceptanceCriteria,
      contracts: matchingContracts, producers: producers.map(item => ({ taskId: item.taskId, ownerId: item.ownerId,
        contracts: item.contracts })) },
    consumerCandidates: (workflow.plan?.tasks ?? []).filter(task => !task.children)
      .map(task => ({ taskId: task.id, ownerId: task.ownerId })),
  }
}

function evidenceId(kind, value) { return `ev-${kind}-${kernelDigest(value).slice(0, 40)}` }
/** Convert model-observed facts into the strict internal public-Owner V1 request. */
export function materializePublicOwnerRequest({ workflow, source, planningPackage, input }) {
  const seed = publicOwnerRequestSeed(source, planningPackage, workflow)
  if (seed.status === 'feedback_source_mismatch' || seed.status === 'feedback_not_public_contract') return seed
  if (seed.status === 'source_revision_required') return {
    ...seed,
    accepted: false,
    missing: { contractId: source.report?.contractId ?? input.contract_id, spec: true,
      sourceTickets: seed.currentSource.tickets.map(item => item.id),
      ownerBinding: 'current_public_producer_ticket_and_plan_binding' },
    nextTool: 'workflow_planning_finalize',
  }
  if (source.report?.kind === 'public_contract_gap' && input.contract_id !== source.report.contractId) {
    throw new Error(`Public Owner request must use the reported contract: ${source.report.contractId}`)
  }
  const declared = (planningPackage.spec?.contracts ?? []).find(item => item.id === input.contract_id)
  if (!declared) return {
    ...seed,
    status: 'source_revision_required',
    accepted: false,
    missing: { contractId: input.contract_id, spec: true, sourceTickets: seed.currentSource.tickets.map(item => item.id),
      ownerBinding: 'current_public_producer_ticket_and_plan_binding' },
    nextTool: 'workflow_planning_finalize',
  }
  const producers = producerBindings(planningPackage)
  const bound = producers.filter(item => item.contracts.some(contract => contract.id === declared.id && contract.revision === declared.revision))
  const owners = [...new Set(bound.map(item => item.ownerId))]
  if (owners.length !== 1) return {
    ...seed,
    status: 'source_revision_required',
    accepted: false,
    missing: { contractId: input.contract_id, spec: false, sourceTickets: seed.currentSource.tickets.map(item => item.id),
      ownerBinding: owners.length ? 'unambiguous_public_producer' : 'declare_contract_in_public_producer_ticket_and_plan_binding' },
    nextTool: 'workflow_planning_finalize',
  }
  if (input.target_owner_id !== owners[0]) throw new Error(`Public contract Owner must be the current upstream producer: ${owners[0]}`)
  const taskById = new Map((workflow.plan?.tasks ?? []).filter(task => !task.children).map(task => [task.id, task]))
  const consumerIds = [...new Set(input.consumer_task_ids)]
  if (consumerIds.length !== input.consumer_task_ids.length) throw new Error('Public Owner consumer task ids must be unique')
  const knownConsumerIds = knownConsumers(workflow, bound.map(item => item.taskId), declared)
  const unexpected = consumerIds.filter(id => !knownConsumerIds.includes(id))
  if (unexpected.length) throw new Error(`Public Owner consumer is not bound to the current public producer: ${unexpected.join(', ')}`)
  if (input.consumer_inventory_complete && kernelDigest([...consumerIds].sort()) !== kernelDigest(knownConsumerIds)) {
    throw new Error(`Complete public Owner consumer inventory must cover: ${knownConsumerIds.join(', ')}`)
  }
  const consumers = consumerIds.map(id => {
    const task = taskById.get(id)
    if (!task) throw new Error(`Unknown current public contract consumer task: ${id}`)
    return { consumerId: task.id, ownerId: task.ownerId, contract: { id: declared.id, revision: declared.revision },
      evidenceRefs: [evidenceId('consumer', [workflow.id, workflow.planVersion, task.id, task.ownerId])] }
  })
  const references = sourceReferences(planningPackage)
  if (!references.tickets.length || !references.acceptanceCriteria.length) throw new Error('Current feedback source package has no frozen Ticket/acceptance source')
  const feedbackEvidence = evidenceId('feedback', [workflow.id, source.issue.id, source.issue.sourceId])
  const ticketEvidence = references.tickets.map(ticket => evidenceId('ticket', [workflow.id, workflow.planVersion, ticket]))
  const context = {
    workflowId: workflow.id,
    planRevision: workflow.planVersion,
    planDigest: workflow.activation.planDigest,
    owners: workflow.plan.owners.map(owner => owner.id),
    tickets: references.tickets,
    acceptanceCriteria: references.acceptanceCriteria,
    contracts: [{ id: declared.id, revision: declared.revision, ownerId: owners[0] }],
    evidenceRefs: [...new Set([feedbackEvidence, ...ticketEvidence, ...consumers.flatMap(item => item.evidenceRefs)])],
    consumerInventoryComplete: input.consumer_inventory_complete,
    consumers,
  }
  const contextDigest = publicOwnerContextDigest(context)
  const requestId = source.issue.id
  const core = {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId,
    requesterOwnerId: source.owner.id,
    targetOwnerId: owners[0],
    source: references,
    baseline: { workflowId: workflow.id, planRevision: workflow.planVersion, planDigest: workflow.activation.planDigest,
      contract: { id: declared.id, revision: declared.revision }, contextDigest },
    expectedBehavior: input.expected_behavior,
    actualGap: input.actual_gap,
    evidenceRefs: [feedbackEvidence, ...ticketEvidence],
    suggestion: input.suggestion,
  }
  const versions = (workflow.publicOwnerChangeLog?.requests ?? []).filter(entry => entry.request.requestId === requestId)
    .sort((left, right) => left.request.requestVersion - right.request.requestVersion)
  const latest = versions.at(-1)
  const latestCore = latest && Object.fromEntries(Object.entries(latest.request)
    .filter(([key]) => !['requestVersion', 'supersedesRequestDigest'].includes(key)))
  const replay = latest && kernelDigest(core) === kernelDigest(latestCore)
  const request = { ...core,
    requestVersion: replay ? latest.request.requestVersion : latest ? latest.request.requestVersion + 1 : 1,
    supersedesRequestDigest: replay ? latest.request.supersedesRequestDigest : latest?.requestDigest ?? null }
  return { status: 'ready', accepted: true, context, request, seed }
}
