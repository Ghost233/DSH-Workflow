import { PLAN_REVIEW_SUBMISSION_SCHEMA, PLAN_V2_SUBMISSION_SCHEMA } from './model.mjs'

const text = { type: 'string', minLength: 1 }
const texts = { type: 'array', items: text }
const object = (properties, required = Object.keys(properties), extra = {}) => ({ type: 'object', properties, required, additionalProperties: false, ...extra })
const describedText = description => ({ ...text, description })
const consumer = object({
  consumerId: describedText('Copy one consumerId from the supplied context.'),
  ownerId: describedText('Copy that consumer’s ownerId from the supplied context.'),
  impact: { enum: ['no_change', 'compatible', 'update_required'], description: 'Impact of this decision on the consumer.' },
  evidenceRefs: { ...texts, minItems: 1, description: 'Evidence ids from the supplied context supporting this impact.' },
})
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] })

// The native action owns Registry identity; the stored DAG keeps the full domain contract.
const plannerSubmission = {
  ...PLAN_V2_SUBMISSION_SCHEMA,
  required: PLAN_V2_SUBMISSION_SCHEMA.required.filter(field => field !== 'registryDigest'),
  properties: {
    ...PLAN_V2_SUBMISSION_SCHEMA.properties,
    registryDigest: { ...PLAN_V2_SUBMISSION_SCHEMA.properties.registryDigest,
      description: 'Omit this field. Runtime binds it from the admitted action. A supplied value must match exactly.' },
  },
}
const plannerPatch = object({
  tasks: { ...PLAN_V2_SUBMISSION_SCHEMA.properties.tasks, description: 'Only complete changed or new task definitions inside revisionBoundary.taskIds. Omitted tasks are preserved by Runtime.' },
  verifications: { ...PLAN_V2_SUBMISSION_SCHEMA.properties.verifications, description: 'Changed existing verifications must be inside revisionBoundary.verificationIds. A new id may be introduced when every real tasks[].verify consumer is a changed or new task inside revisionBoundary.taskIds.' },
  removeTaskIds: texts,
  removeVerificationIds: texts,
  planningBindings: { ...PLAN_V2_SUBMISSION_SCHEMA.properties.planningBindings,
    description: 'Complete source bindings for the final merged plan: exactly one entry for every retained and added task, excluding removed tasks. This replaces the full mapping; it is not a delta. Use the current snapshot, Ticket revisions and selected fragments for all entries.' },
  publicOwnerChanges: PLAN_V2_SUBMISSION_SCHEMA.properties.publicOwnerChanges,
}, ['tasks', 'verifications', 'planningBindings'])

/** Public Owner supplies judgment only. Runtime binds request identity, digests, target and baseline. */
export const PUBLIC_DECISION_SCHEMA = object({
  decisionId: describedText('Stable identity for this independent judgment.'),
  outcome: {
    enum: ['capability_sufficient', 'compatible_extension', 'migration_required', 'rejected', 'facts_missing', 'business_decision_required'],
    description: 'Choose exactly one outcome and follow its null/empty-field rules described on the dependent fields.',
  },
  summary: describedText('Concise conclusion supported by basisRefs.'),
  basisRefs: { ...texts, minItems: 1, description: 'One or more evidence ids copied from the supplied context.' },
  affectedConsumers: {
    type: 'array', items: consumer,
    description: 'For capability_sufficient, compatible_extension, or migration_required, cover every supplied consumer exactly once. Otherwise include only assessed consumers or [].',
  },
  contractChange: nullable(object({
    nextRevision: describedText('New contract revision, different from the baseline revision.'),
    behavior: describedText('Behavior added or changed by the new revision.'),
    compatibility: describedText('Compatibility effect on existing consumers.'),
  })),
  migrationOrder: {
    ...texts,
    description: 'For migration_required, list exactly every affected consumer with impact update_required; otherwise use [].',
  },
  alternative: nullable(object({
    kind: { enum: ['alternative', 'infeasible'] },
    detail: describedText('Concrete alternative or reason the request is infeasible.'),
  })),
  unknowns: {
    type: 'array',
    items: object({ fact: describedText('Specific missing fact.'), ownerId: describedText('Current Owner responsible for investigating.'),
      closeWhen: describedText('Observable condition that resolves this unknown.') }),
    description: 'facts_missing requires at least one unknown; every other outcome uses [].',
  },
  businessChange: nullable(object({
    acceptanceCriterion: describedText('Acceptance criterion from the supplied request.'),
    currentCommitment: describedText('Current frozen product commitment.'),
    proposedCommitment: describedText('Proposed different product commitment.'),
    consequence: describedText('User-visible consequence of changing the commitment.'),
  })),
}, undefined, {
  description: 'Independent public Owner judgment. Runtime adds all authoritative request and baseline binding fields before persistence.',
  allOf: [
    { if: { properties: { outcome: { const: 'capability_sufficient' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'null' }, migrationOrder: { maxItems: 0 }, alternative: { type: 'null' }, unknowns: { maxItems: 0 }, businessChange: { type: 'null' },
    } } },
    { if: { properties: { outcome: { const: 'compatible_extension' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'object' }, migrationOrder: { maxItems: 0 }, alternative: { type: 'null' }, unknowns: { maxItems: 0 }, businessChange: { type: 'null' },
    } } },
    { if: { properties: { outcome: { const: 'migration_required' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'object' }, migrationOrder: { minItems: 1 }, alternative: { type: 'null' }, unknowns: { maxItems: 0 }, businessChange: { type: 'null' },
    } } },
    { if: { properties: { outcome: { const: 'rejected' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'null' }, migrationOrder: { maxItems: 0 }, alternative: { type: 'object' }, unknowns: { maxItems: 0 }, businessChange: { type: 'null' },
    } } },
    { if: { properties: { outcome: { const: 'facts_missing' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'null' }, migrationOrder: { maxItems: 0 }, alternative: { type: 'null' }, unknowns: { minItems: 1 }, businessChange: { type: 'null' },
    } } },
    { if: { properties: { outcome: { const: 'business_decision_required' } }, required: ['outcome'] }, then: { properties: {
      contractChange: { type: 'null' }, migrationOrder: { maxItems: 0 }, alternative: { type: 'null' }, unknowns: { maxItems: 0 }, businessChange: { type: 'object' },
    } } },
  ],
})

export function roleReportParameters(role, { commitSha } = {}) {
  const schema = role === 'plan-reviewer' ? object({ review: PLAN_REVIEW_SUBMISSION_SCHEMA })
    : role === 'approval-reviewer' ? object({ decision: { enum: ['allow', 'deny', 'escalate'] }, exactDigest: text, rationale: text })
    : role === 'planner' ? object({ plan: plannerSubmission, planPatch: plannerPatch,
      review: { ...PLAN_REVIEW_SUBMISSION_SCHEMA,
        description: 'A negative, source-bound planning obstruction when no valid plan can be formed inside the admitted revision boundary. This never counts as independent plan approval.' } }, [], {
      oneOf: [{ required: ['plan'] }, { required: ['planPatch'] }, { required: ['review'] }],
    })
      : role === 'public-owner' ? object({ decision: PUBLIC_DECISION_SCHEMA })
        : role === 'operator' ? object({ passed: { type: 'boolean' }, summary: text, findings: texts, evidence: texts, nextActions: texts })
        : role === 'memory-curator' ? object({ summary: text, sourceDigest: text, worklogRef: text })
          : role === 'reviewer' ? object({
            passed: { type: 'boolean', description: 'Whether this exact candidate satisfies the supplied task and acceptance evidence.' },
            commitSha: typeof commitSha === 'string'
              ? { type: 'string', const: commitSha, description: 'Copy this exact bound task commit SHA.' }
              : describedText('Exact task commit SHA supplied in the review context.'),
            reasons: { ...texts, minItems: 1, description: 'Concrete findings for this exact candidate and task.' },
          })
            : role === 'owner' ? { type: 'object', required: ['status', 'summary'], properties: { status: { enum: ['completed', 'blocked', 'failed'] }, summary: text } }
              : { type: 'object' }
  return object({ report: schema })
}
