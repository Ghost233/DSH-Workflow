import assert from 'node:assert/strict'
import { createOwnerWorkflowRuntime } from '../../../../../../owner-workflow-plugin/src/runtime.mjs'
import { reviewIssueObligation } from '../../../../../../owner-workflow-plugin/src/convergence.mjs'
const runtime = createOwnerWorkflowRuntime({})
const state = { id: 'wf', planDigest: 'plan-v1', plan: { tasks: [{ id: 'T1', write: ['src/a'], verify: ['V1'] }] } }
const first = runtime.ownerRecoveryFingerprint(state, 'T1', 'owner', 'failed /alpha/beta')
const otherPath = runtime.ownerRecoveryFingerprint(state, 'T1', 'owner', 'failed /gamma/delta')
const nextVersion = runtime.ownerRecoveryFingerprint({ ...state, planDigest: 'plan-v2' }, 'T1', 'owner', 'failed /alpha/beta')
assert.equal(first, otherPath)
assert.notEqual(first, nextVersion)
const issue = { obligationId: 'O1', sourceId: 'source/O1', sourceVersion: '1', title: 'task executable', detail: 'T1', targetTaskIds: ['T1'], closeWhen: { kind: 'plan_task_executable', taskId: 'T1' } }
const obligation = reviewIssueObligation(issue)
assert.ok(obligation)
console.log(JSON.stringify({ case: 'root-problem-source', classification: 'negative-adapter-evidence', first, otherPath, nextVersion, obligation,
  observed: 'existing recovery fingerprint conflates paths and changes with execution version; explicit obligation source is available but requires Runtime-authoritative registration/mapping',
  boundary: 'pure actual functions, no persistence or new source registration; fingerprint designed for local retry matching, not declared faulty for that purpose' }))
