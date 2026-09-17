import { readdir, realpath, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path'
import { git, statusRecords } from './git.mjs'
import { normalizePlanV2, planReviewResult, PLAN_V2_SUBMISSION_EXAMPLES } from './model.mjs'
import { loadPlanningCheckpointSnapshot } from './planning-checkpoint.mjs'
import { authorizePlanningCheckpoint } from './planning-authority.mjs'
import { compilePlanningPackages } from './planning-packages.mjs'
import { loadRegistry } from './registry.mjs'
import { kernelDigest, planningSources, preflightPlanningResult } from './workflow-engine.mjs'
import { artifactPath, publishArtifact, readArtifact } from './effect-artifacts.mjs'

const PLANNING_ADMISSION_CONTRACT = 'DSH_PLANNING_ADMISSION_V1'

function assertPlannerObstructionSources(snapshot, action, review) {
  const sources = new Set()
  const add = value => {
    const id = value?.id ?? value?.sourceId
    const version = value?.version ?? value?.revision ?? value?.sourceVersion
    if (typeof id === 'string' && typeof version === 'string') sources.add(`${id}\u0000${version}`)
  }
  const references = snapshot?.source?.references
  add(references?.spec)
  for (const ticket of references?.tickets ?? []) {
    add(ticket)
    for (const contract of ticket.contracts ?? []) add(contract)
  }
  for (const contract of references?.spec?.contracts ?? []) add(contract)
  for (const obligation of action.input.openObligations ?? []) add(obligation.source ?? obligation)
  for (const issue of review.issues) {
    if (!sources.has(`${issue.sourceId}\u0000${issue.sourceVersion}`)) {
      throw new Error(`Planner obstruction source is not bound to the frozen planning input: ${issue.sourceId}@${issue.sourceVersion}`)
    }
  }
}

/** A local revision carries changed definitions; Runtime preserves everything omitted. */
export function plannerSubmission(report, action, registry) {
  if (!Object.hasOwn(report, 'planPatch')) return report.plan ?? report
  if (Object.hasOwn(report, 'plan')) throw new Error('Submit either plan or planPatch')
  const { previousPlan, revisionBoundary } = action.input
  if (!previousPlan || !revisionBoundary) throw new Error('planPatch requires an admitted previous plan and revision boundary')
  const patch = report.planPatch
  if (!patch || !patch.planningBindings) throw new Error('planPatch requires current planningBindings')
  const merge = (previous, changed, removed, allowed, label, { allowNew } = {}) => {
    if (!Array.isArray(changed) || !Array.isArray(removed)) throw new Error(`Invalid ${label} patch`)
    const ids = [...changed.map(item => item.id), ...removed]
    const permitted = changed.every(item => allowed.includes(item.id)
      || !previous.some(existing => existing.id === item.id) && allowNew?.(item) === true)
      && removed.every(id => allowed.includes(id))
    if (new Set(ids).size !== ids.length || !permitted) throw new Error(`${label} patch exceeds revision boundary or repeats an id`)
    if (removed.some(id => !previous.some(item => item.id === id))) throw new Error(`${label} patch removes an unknown id`)
    const replacements = new Map(changed.map(item => [item.id, item]))
    return [...previous.filter(item => !removed.includes(item.id)).map(item => {
      const replacement = replacements.get(item.id); replacements.delete(item.id); return replacement ?? item
    }), ...replacements.values()]
  }
  const tasks = merge(previousPlan.tasks, patch.tasks, patch.removeTaskIds ?? [], revisionBoundary.taskIds, 'Task')
  const ownerIds = [...new Set([...previousPlan.owners.map(owner => owner.id), ...tasks.map(task => task.ownerId).filter(Boolean)])]
  return structuredClone({ ...previousPlan,
    registryDigest: action.input.registryDigest,
    owners: ownerIds.map(id => registry.owners.find(item => item.id === id) ?? previousPlan.owners.find(item => item.id === id)),
    tasks,
    verifications: merge(previousPlan.verifications, patch.verifications, patch.removeVerificationIds ?? [], revisionBoundary.verificationIds, 'Verification', {
      allowNew: verification => {
        const consumers = tasks.filter(task => task.verify?.includes(verification.id))
        return consumers.length > 0 && consumers.every(task => {
          const before = previousPlan.tasks.find(item => item.id === task.id)
          return revisionBoundary.taskIds.includes(task.id) && (!before || kernelDigest(before) !== kernelDigest(task))
        })
      },
    }),
    planningBindings: patch.planningBindings,
    ...(patch.publicOwnerChanges === undefined ? {} : { publicOwnerChanges: patch.publicOwnerChanges }),
  })
}

export async function assertPlanningCheckout(root, snapshot, { head = snapshot.codeBaseline.sourceHead,
  allowSupportingDrift = false } = {}) {
  const expectedHead = head
  if (await git(root, ['rev-parse', 'HEAD']) !== expectedHead
    || await git(root, ['symbolic-ref', '--short', 'HEAD']) !== snapshot.codeBaseline.branch) throw new Error('Planning code baseline changed')
  const normative = [snapshot.source.references.spec,
    ...snapshot.source.references.tickets.map(ticket => ticket.document)]
  const supporting = snapshot.source.references.supporting ?? []
  const documents = [...normative, ...supporting]
  const permitted = new Set(documents.map(document => document.path))
  const changes = await statusRecords(root, undefined, { readOnly: true })
  if (changes.some(change => !change.path.startsWith('.dsh-workflow/')
    && (!permitted.has(change.path) || change.code[0] !== ' ' || change.originalPath))) {
    throw new Error('Planning baseline contains uncheckpointed user changes')
  }
  for (const document of allowSupportingDrift ? normative : documents) {
    const path = resolve(root, document.path)
    const part = relative(root, path)
    if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) throw new Error('Planning source path escapes the project')
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== document.sha256) throw new Error(`Planning source changed: ${document.path}`)
  }
}

/**
 * Project a persisted checkpoint into the immutable facts a planning role needs.
 * Authorization receipts and native write journals stay in the trusted runtime,
 * where inputs() verifies them before any role is dispatched.
 */
export function planningRoleInput(snapshot) {
  const references = snapshot?.source?.references
  if (references === null || typeof references !== 'object' || Array.isArray(references)) {
    throw new Error('Planning role input requires frozen Spec/Ticket references')
  }
  return structuredClone({
    contract: 'DSH_PLANNING_ROLE_INPUT_V1',
    snapshot: {
      id: snapshot.id,
      checkpointId: snapshot.checkpointId,
      projectRoot: snapshot.projectRoot,
      sourceDigest: snapshot.sourceDigest,
      codeBaseline: snapshot.codeBaseline,
      reason: snapshot.reason,
      parentSnapshotId: snapshot.parentSnapshotId,
      ...(snapshot.executionParent === undefined ? {} : { executionParent: snapshot.executionParent }),
    },
    references,
  })
}

/** Source/package validation for the engine's ordinary planning Actions. No private recovery loop. */
export class NativePlanningEffects {
  constructor(ctx, store, sessions, root, { prepareSource } = {}) {
    this.ctx = ctx; this.store = store; this.sessions = sessions; this.root = root; this.prepareSource = prepareSource
  }
  admissionPath(action) {
    if (typeof action.id !== 'string' || typeof action.inputDigest !== 'string') return null
    return artifactPath(this.root, `planning-admission-${kernelDigest([action.id, action.inputDigest]).slice(0, 40)}`)
  }
  assertBoundAction(action, bound) {
    if (bound?.contract !== PLANNING_ADMISSION_CONTRACT || bound.actionId !== action.id
      || bound.workflowId !== action.workflowId || bound.kind !== action.kind || bound.inputDigest !== action.inputDigest
      || bound.checkpointId !== action.input.checkpointId || bound.snapshotDigest !== action.input.snapshotDigest
      || bound.registryDigest !== action.input.registryDigest || typeof bound.root !== 'string' || !isAbsolute(bound.root)
      || !/^[a-f0-9]{40}$/u.test(bound.exactCommit ?? '') || kernelDigest(bound.snapshot) !== bound.snapshotDigest
      || bound.snapshot?.checkpointId !== bound.checkpointId || bound.snapshot?.projectRoot !== bound.root
      || kernelDigest(bound.registry) !== bound.registryDigest || bound.source?.baseCommit !== bound.exactCommit
      || typeof bound.source?.artifact !== 'string' || !isAbsolute(bound.source.artifact)) throw new Error('Planning admission receipt does not bind this Action')
    return bound
  }
  sessionIdentity(action) {
    const role = action.kind === 'plan' ? 'planner' : 'plan-reviewer'
    return { role, sessionId: `owner-${kernelDigest([action.id, role]).slice(0, 40)}` }
  }
  async dispatchedIntent(action) {
    if (typeof this.sessions.root !== 'string') return null
    const { sessionId } = this.sessionIdentity(action)
    const intent = await readArtifact(artifactPath(this.sessions.root, sessionId, 'intent.json'))
    if (!intent || !await readArtifact(artifactPath(this.sessions.root, sessionId, 'dispatch.json'))) return null
    if (intent.actionId !== action.id || intent.inputDigest !== action.inputDigest) throw new Error('Planning native dispatch identity changed')
    return { sessionId, intent }
  }
  exactCommit(action, workflow, snapshot) {
    const governance = workflow.registryBaseline
    return action.input.sources?.executionBaseline?.commitSha
      ?? (this.admissionPath(action) === null && governance?.snapshotDigest === action.input.snapshotDigest
        ? governance.commitSha : snapshot.codeBaseline.checkpointCommit)
  }
  async immutableSource(action, exactCommit, signal) {
    if (typeof this.prepareSource !== 'function') throw new Error('Planning immutable source preparation is unavailable')
    const prepared = await this.prepareSource(action, exactCommit, signal)
    if (!prepared || typeof prepared.artifact !== 'string' || !isAbsolute(prepared.artifact)
      || prepared.baseCommit !== exactCommit) throw new Error('Planning immutable source receipt does not bind the admitted commit')
    return { artifact: prepared.artifact, baseCommit: prepared.baseCommit,
      ...(prepared.commitSha === undefined ? {} : { commitSha: prepared.commitSha }) }
  }
  async freezeActionInputs(action, workflow, root, { signal, authorize = true, dispatch } = {}) {
    const snapshot = await loadPlanningCheckpointSnapshot({ root, id: action.input.checkpointId })
    if (kernelDigest(snapshot) !== action.input.snapshotDigest || snapshot.source?.source?.sessionId !== workflow.rootSessionId
      || snapshot.projectRoot !== root) throw new Error('Planning snapshot identity or root source changed')
    if (authorize) {
      const parent = this.ctx.agents.get(workflow.rootSessionId)
      if (!parent || !this.ctx.agents.roots().includes(parent)) throw new Error('Planning requires its live root session')
      const grant = await authorizePlanningCheckpoint({ ctx: this.ctx, agent: parent,
        binding: { root, source: snapshot.source, authorizationId: snapshot.authorization.id } })
      if (kernelDigest(grant) !== kernelDigest(snapshot.authorization)) throw new Error('Planning authority changed')
    }
    const exactCommit = this.exactCommit(action, workflow, snapshot)
    const source = await this.immutableSource(action, exactCommit, signal)
    const registry = await loadRegistry(source.artifact)
    if (kernelDigest(registry) !== action.input.registryDigest) throw new Error('Planning immutable source Registry changed')
    const bound = {
      contract: PLANNING_ADMISSION_CONTRACT,
      actionId: action.id,
      workflowId: action.workflowId,
      kind: action.kind,
      inputDigest: action.inputDigest,
      checkpointId: action.input.checkpointId,
      snapshotDigest: action.input.snapshotDigest,
      registryDigest: action.input.registryDigest,
      exactCommit,
      root,
      snapshot,
      registry,
      source,
      ...(dispatch ? { dispatchedSession: { sessionId: dispatch.sessionId, worktree: dispatch.intent.record.worktree } } : {}),
    }
    const path = this.admissionPath(action)
    if (!path) throw new Error('Planning admission requires a persisted Action identity')
    await publishArtifact(path, bound)
    return { workflow, ...bound, snapshot: structuredClone(snapshot), registry: structuredClone(registry), source: structuredClone(source) }
  }
  async boundInputs(action) {
    const path = this.admissionPath(action)
    if (!path) throw new Error('Planning report requires an admitted Action identity')
    let bound = await readArtifact(path)
    if (!bound) {
      const state = await this.store.read()
      const current = state.actions?.[action.id]
      if (!current || current.workflowId !== action.workflowId || current.kind !== action.kind
        || current.inputDigest !== action.inputDigest) throw new Error('Planning report requires its persisted Action identity')
      const dispatch = await this.dispatchedIntent(action)
      if (!dispatch) throw new Error('Planning report requires its persisted admission receipt')
      const workflow = state.workflows[action.workflowId]
      const root = await realpath(workflow.root)
      await this.freezeActionInputs(action, workflow, root, { authorize: false, dispatch })
      bound = await readArtifact(path)
    }
    this.assertBoundAction(action, bound)
    return { ...bound, snapshot: structuredClone(bound.snapshot), registry: structuredClone(bound.registry), source: structuredClone(bound.source) }
  }
  async inputs(action, { signal, allowSupportingDrift = false } = {}) {
    const state = await this.store.read()
    const workflow = state.workflows[action.workflowId]
    const root = await realpath(workflow.root)
    const admissionPath = this.admissionPath(action)
    if (admissionPath) {
      const prior = await readArtifact(admissionPath)
      if (prior) {
        this.assertBoundAction(action, prior)
        const source = await this.immutableSource(action, prior.exactCommit, signal)
        if (kernelDigest(source) !== kernelDigest(prior.source)) throw new Error('Planning immutable source receipt changed')
        return { workflow, ...prior, snapshot: structuredClone(prior.snapshot), registry: structuredClone(prior.registry), source }
      }
      const current = state.actions?.[action.id]
      if (!current || current.workflowId !== action.workflowId || current.kind !== action.kind
        || current.inputDigest !== action.inputDigest) throw new Error('Planning admission requires the persisted Action')
      return this.freezeActionInputs(action, workflow, root, { signal })
    }
    const snapshot = await loadPlanningCheckpointSnapshot({ root, id: action.input.checkpointId })
    if (kernelDigest(snapshot) !== action.input.snapshotDigest || snapshot.source?.source?.sessionId !== workflow.rootSessionId
      || snapshot.projectRoot !== root) throw new Error('Planning snapshot identity or root source changed')
    const parent = this.ctx.agents.get(workflow.rootSessionId)
    if (!parent || !this.ctx.agents.roots().includes(parent)) throw new Error('Planning requires its live root session')
    const grant = await authorizePlanningCheckpoint({ ctx: this.ctx, agent: parent,
      binding: { root, source: snapshot.source, authorizationId: snapshot.authorization.id } })
    if (kernelDigest(grant) !== kernelDigest(snapshot.authorization)) throw new Error('Planning authority changed')
    const registry = await loadRegistry(root)
    if (kernelDigest(registry) !== action.input.registryDigest) throw new Error('Planning Owner registry changed')
    const sources = planningSources(workflow)
    const governance = workflow.registryBaseline
    if (sources && snapshot.id !== `snapshot-${sources.checkpointId}`) {
      const previous = await loadPlanningCheckpointSnapshot({ root, id: sources.checkpointId })
      if (snapshot.parentSnapshotId !== previous.id || snapshot.codeBaseline.sourceHead !== previous.codeBaseline.sourceHead
        || snapshot.codeBaseline.branch !== workflow.baseBranch) throw new Error('Revised sources must extend the exact active checkpoint and user branch')
    }
    const expectedHead = this.exactCommit(action, workflow, snapshot)
    if (governance?.snapshotDigest === action.input.snapshotDigest && governance.registryDigest !== action.input.registryDigest) throw new Error('Registry governance baseline changed')
    await assertPlanningCheckout(root, snapshot, { head: workflow.registryBaseline?.commitSha ?? snapshot.codeBaseline.sourceHead,
      allowSupportingDrift })
    return { workflow, root, snapshot, registry, exactCommit: expectedHead }
  }
  async validationFailures(action) {
    const directory = dirname(artifactPath(this.root, action.id))
    let names
    try { names = await readdir(directory) } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const failures = []
    for (const name of names.filter(name => /^planning-validation-[a-f0-9]{64}\.json$/u.test(name)).sort()) {
      const evidenceRef = join(directory, name)
      const failure = await readArtifact(evidenceRef)
      if (failure?.contract !== 'DSH_PLANNING_VALIDATION_FAILURE_V1' || failure.actionId !== action.id
        || failure.workflowId !== action.workflowId || failure.inputDigest !== action.inputDigest
        || failure.snapshotDigest !== action.input.snapshotDigest || failure.evidenceRef !== evidenceRef) {
        throw new Error('Stored Planner validation failure does not bind this Action')
      }
      failures.push(failure)
    }
    return failures
  }
  async validate(action, report, role, { evidenceRef } = {}) {
    if (!['planner', 'plan-reviewer'].includes(role)) return report
    const { snapshot, registry } = await this.boundInputs(action)
    if (typeof evidenceRef !== 'string' || evidenceRef.length === 0) throw new Error('Planning validation requires its native receipt path')
    if (role === 'planner') {
      if (Object.hasOwn(report, 'review')) {
        const review = planReviewResult(report.review)
        if (review.status === 'passed' || review.issues.length === 0 || review.obligationClosures?.length) {
          throw new Error('Planner obstruction must be negative, contain concrete issues, and cannot claim review closures')
        }
        assertPlannerObstructionSources(snapshot, action, review)
        let planDigest = null
        if (action.input.previousPlan !== undefined) {
          const plan = normalizePlanV2(action.input.previousPlan)
          planDigest = kernelDigest(plan)
          if (!action.input.revisionBoundary || action.input.previousPlanDigest !== planDigest
            || plan.registryDigest !== action.input.registryDigest) throw new Error('Planner obstruction does not bind the admitted previous plan and revision boundary')
        } else if (action.input.previousPlanDigest !== undefined && action.input.previousPlanDigest !== null) {
          throw new Error('Initial Planner obstruction cannot claim a previous plan digest')
        }
        const validationFailures = await this.validationFailures(action)
        const result = { blocked: true, review, planDigest, snapshotDigest: action.input.snapshotDigest,
          ...(validationFailures.length ? { validationFailures } : {}) }
        preflightPlanningResult(await this.store.read(), { actionId: action.id, workflowId: action.workflowId,
          kind: action.kind, inputDigest: action.inputDigest }, { ...result, evidenceRef })
        return result
      }
      try {
        const submitted = plannerSubmission(report, action, registry)
        // boundInputs already verified the immutable admission receipt and Registry.
        // An omitted identity belongs to that action, never to the model or previous plan.
        const plan = normalizePlanV2(submitted && typeof submitted === 'object' && !Array.isArray(submitted)
          && !Object.hasOwn(submitted, 'registryDigest') ? { ...submitted, registryDigest: action.input.registryDigest } : submitted)
        if (plan.registryDigest !== action.input.registryDigest) throw new Error('Planner must use the bound Registry digest; omit registryDigest and Runtime will bind the admitted identity')
        for (const owner of plan.owners) {
          const stored = registry.owners.find(item => item.id === owner.id)
          if (!stored || kernelDigest(stored.scope) !== kernelDigest(owner.scope) || kernelDigest(stored.exclude ?? []) !== kernelDigest(owner.exclude ?? [])) throw new Error('Planner cannot redefine Owner scope')
        }
        const packages = compilePlanningPackages({ snapshot, plan })
        if (packages.packages.some(item => item.status !== 'planned')) throw new Error('Planner assigned a blocked execution package')
        const packagesRef = artifactPath(this.root, `packages-${kernelDigest(packages)}`)
        preflightPlanningResult(await this.store.read(), { actionId: action.id, workflowId: action.workflowId,
          kind: action.kind, inputDigest: action.inputDigest },
        { plan, snapshotDigest: action.input.snapshotDigest, packagesRef, evidenceRef })
        await publishArtifact(packagesRef, packages)
        return { plan, snapshotDigest: action.input.snapshotDigest, packagesRef }
      } catch (error) {
        const failure = {
          contract: 'DSH_PLANNING_VALIDATION_FAILURE_V1', actionId: action.id, workflowId: action.workflowId,
          inputDigest: action.inputDigest, snapshotDigest: action.input.snapshotDigest,
          code: typeof error?.code === 'string' && error.code ? error.code : 'PLANNING_SUBMISSION_REJECTED',
          field: typeof error?.field === 'string' && error.field ? error.field : null,
          detail: error?.detail === undefined ? String(error?.message ?? error).slice(0, 4096) : structuredClone(error.detail),
        }
        const failureRef = artifactPath(this.root, action.id, `planning-validation-${kernelDigest(failure)}.json`)
        const recorded = { ...failure, evidenceRef: failureRef }
        await publishArtifact(failureRef, recorded)
        throw error
      }
    }
    const review = planReviewResult(report.review ?? report)
    preflightPlanningResult(await this.store.read(), { actionId: action.id, workflowId: action.workflowId,
      kind: action.kind, inputDigest: action.inputDigest },
    { review, planDigest: action.input.planDigest, snapshotDigest: action.input.snapshotDigest, evidenceRef })
    return { review, planDigest: action.input.planDigest, snapshotDigest: action.input.snapshotDigest }
  }
  async execute(action, context) {
    const current = (await this.store.read()).workflows[action.workflowId]
    const { role, sessionId } = this.sessionIdentity(action)
    if (await this.dispatchedIntent(action)) return this.sessions.observeSession(action, sessionId, context)
    if (!this.ctx.agents.get(current.rootSessionId)) return { deferred: true, reason: 'root_session_offline' }
    const { snapshot, registry, source } = await this.inputs(action, { signal: context?.signal })
    const planningInput = planningRoleInput(snapshot)
    const openPlanObligations = action.input.openObligations ?? Object.values(current.issues)
      .filter(issue => issue.status === 'open' && issue.origin === 'plan_review')
    const openObligationIds = new Set(openPlanObligations.map(issue => issue.obligationId ?? issue.id))
    const decisionEvidence = Object.values(current.decisions).filter(decision => decision.status === 'answered'
      && openObligationIds.has(decision.binding?.obligationId)
      && [action.input.planDigest, action.input.previousPlanDigest].includes(decision.binding?.planDigest))
      .map(decision => ({ obligationId: decision.binding.obligationId, decisionId: decision.id,
        taskId: decision.binding.taskId, source: decision.binding.source,
        boundPlanDigest: decision.binding.planDigest,
        selected: decision.answer?.answers?.find(item => item.id === decision.id)?.selected ?? [] }))
    const prompt = role === 'planner' ? [
      'Compile this frozen Spec/Ticket snapshot into a DSH_PLAN_V2 executable DAG. Requirements are already discussed in the main thread.',
      'Use existing long-lived Owners, exactly one Owner per leaf. Tasks may share a Ticket; all ready fragments and common AC must remain covered.',
      'Preserve contract dependencies and blocked fragments. A test infrastructure producer must not run a future downstream scenario prematurely. Every fixed verification needs an actual command and cwd.',
      'For each verification naming a concrete test file, check that the file already exists in the frozen baseline or that a preceding task explicitly creates it within its Owner write scope. A fixtures task must not silently author tests for production modules delivered later. If a feature Owner cannot write the test path, add a dependent quality task to create and run that behavioral test; bind the feature to only executable checks available at its own freeze point.',
      'A build or typecheck alone does not prove behavioral acceptance or cross-host parity. When the frozen Spec requires behavior or parity, assign a producer and an executable behavior check after the required implementations, including both host paths.',
      'Field contract: verifications[].run is argv and optional cwd is repository-relative; tasks[].verify contains verification ids; tasks[].resources contains lock identities; expanded Composite entry/exit contain child task ids. Never place commands or prose in these id arrays.',
      `Minimal field examples: ${JSON.stringify(PLAN_V2_SUBMISSION_EXAMPLES)}`,
      'planningBindings={contract:"DSH_PLANNING_BINDINGS_V1",snapshotId,sourceDigest,tasks:[{taskId,tickets:[{id,revision,fragments:[]}],contracts:[{id,revision}]}]}.',
      'ownerFeedbackFacts are persisted, non-blocking execution evidence. Use their report as context, but do not redefine them as plan_review obligations.',
      'Report {plan: ...} through workflow_action_submit. Do not write documents, change Registry, or create new requirements.',
      'For a local revision with previousPlan and revisionBoundary, prefer {planPatch:{tasks:[only complete changed task definitions],verifications:[only changed definitions],planningBindings:current complete bindings}}. Runtime preserves omitted tasks, verifications and plan fields. Optional removeTaskIds/removeVerificationIds must be explicitly inside the boundary. Do not submit plan and planPatch together. A partial patch undergoes the same package, dependency, scope and review checks as a full plan.',
      'Omit plan.registryDigest from the submitted report. Runtime binds the admitted Registry identity; do not copy or reconstruct a digest from previousPlan.',
      'When revisionBoundary is present, preserve all execution contracts outside its explicit taskIds/verificationIds. task.write, ownerId, selected source fragments, contract revisions, actual verification definitions, and recursive dependency changes count as task changes. A Ticket document revision, unrelated Owner description edit, or scope expansion alone does not change a task execution contract; the full current snapshot bindings must still be compiled accurately. You may create a new verification id without predeclaring its name only when it has a real tasks[].verify binding and every consumer is a changed or new task inside revisionBoundary.taskIds; existing verification definitions still require revisionBoundary.verificationIds. Any other out-of-bound execution change is rejected before publication.',
      'If no valid plan can be formed from the frozen sources, including an initial plan with no previousPlan or a revision constrained by revisionBoundary, use the same workflow_action_submit once more with {report:{review:DSH_PLAN_REVIEW_V1}}. It must be a negative status with concrete structured issues naming every affected task/verification and the exact frozen source id/version. Use needs_revision for a wider execution boundary and needs_split when the frozen Ticket decomposition itself must be revised. This report never approves or activates a plan. Runtime preserves any earlier rejected submission error as its own evidence when one exists; do not copy or invent that error.',
      'For a negative Planner obstruction, sourceId/sourceVersion must match an exact Spec, Ticket or contract pair in the frozen references. Assign each new issue a fresh obligationId. Do not reuse an id from openObligations for a different contract, and never reuse a legacy planning or execution issue id as a review obligation id. Submit the negative report promptly rather than repeatedly revising a rejected report with invented source identities.',
      JSON.stringify({ planningInput, registry, registryDigest: action.input.registryDigest, previousPlan: action.input.previousPlan, review: action.input.review,
        revisionBoundary: action.input.revisionBoundary,
        revisionReason: action.input.revisionReason, repairReason: action.input.repairReason, publicOwnerChangeLog: action.input.publicOwnerChangeLog,
        openObligations: action.input.openObligations ?? [], ownerFeedbackFacts: action.input.ownerFeedbackFacts ?? [] }),
    ].join('\n\n') : [
      'Independently review the frozen Spec/Tickets and executable DAG. Check all shared acceptance criteria, readiness, dependencies, scopes and actual verification producers.',
      'For each concrete validator file, verify it exists at the frozen baseline or has an explicit earlier producer with a matching Owner write scope; a generic fixtures task does not implicitly produce downstream feature tests. Reject a task that binds a not-yet-created validator, and reject build/typecheck-only evidence for required behavior or host parity.',
      'Do not demand a future implementation test pass before its producing task can run. Plan-time obligations concern executable contracts and dependency structure; actual code verification belongs to its execution task and final acceptance.',
      'ownerFeedbackFacts are persisted, non-blocking execution evidence. Review the revised plan against them, but do not redefine them as plan_review obligations.',
      'For each issue about a verification command or binding, include every affected existing verification id in targetVerificationIds. These ids declare review attention and revision scope; they do not assert that every listed command or binding must change. Use [] if none; do not hide verification changes only in prose. The runtime returns review failures to the main thread and never auto-replans.',
      'A leaf Owner may be a read-only review with write:[] and verify:[] because its durable Owner report is the output. Use plan_verification_binding only when an actual task-to-verification binding is missing.',
      'Check each new requirement is concretely carried by task.done and its actual verification obligations. Removing or changing a revision label is not proof that the document text stayed semantically equivalent.',
      'Submit {review: DSH_PLAN_REVIEW_V1}. passed requires no unresolved planning obligations; execution verification obligations may remain open until their actual task results exist. Use needs_revision, needs_split, needs_discovery or needs_decision precisely; each issue requires source and closure evidence.',
      'A positive summary or empty issues array never closes an existing obligation. For every resolved blocking plan_review obligation in openObligations, submit obligationClosures with its exact obligationId, closeWhen.kind, taskId, applicable verificationId/decisionId, and current planDigest. Runtime verifies the evidence. If you omit or mismatch a claim, correct your submission in this same session; do not end the action without a successfully accepted report.',
      'The bounded decisionEvidence below is the native Runtime record for open obligations. A decision_record closure has exactly {obligationId,kind:"decision_record",taskId,planDigest,decisionId}; use the CURRENT planDigest in the claim and the recorded decisionId. Do not add source, authority, selected or historical digest fields to the claim. A prior-plan decision may carry to this direct revision only when the selected answer accepts the suggested change; Runtime verifies that lineage. Do not search the control catalog or plugin source to reconstruct this already supplied closure schema.',
      'Finish the independent plan checks against the frozen snapshot and DAG, then submit a structured review promptly. Keep inspection focused on changed task definitions, their recursive consumers, and affected verification producers; avoid repeated repository-wide searches.',
      'Evaluate the CURRENT plan, not copied findings from an older revision. For a still-open obligation, keep its original obligationId, sourceId/sourceVersion, targetTaskIds and closeWhen unchanged, but update detail, suggestion and technicalFacts to describe what remains wrong now. classificationBasis.source must use that same original source even if the current Spec has a newer revision. Changing immutable identity requires a new obligationId; it never silently replaces or closes the old obligation.',
      'When all requirements of an existing obligation are satisfied, omit it from issues and explicitly claim its closure. For plan_verification_binding the claim shape is {obligationId,kind:"plan_verification_binding",taskId,verificationId,planDigest}; copy the exact identities from openObligations and use the current planDigest. New independently remaining defects get new issues and ids in the same report. A partially fixed compound obligation remains open until EVERY stated requirement is satisfied; one matching closeWhen binding alone is not proof of the entire compound requirement.',
      'Write new findings as independently closable obligations: one concrete missing producer, command or binding per issue with an appropriate closeWhen. Keep correct existing commands when only their task binding needs repair. Check that every referenced validator script has a producing task and dependency, and every final acceptance command has an actual binding; do not accept done prose as a substitute.',
      JSON.stringify({ planningInput, plan: action.input.plan, registry, planDigest: action.input.planDigest,
        previousPlanDigest: action.input.previousPlanDigest, repairReason: action.input.repairReason,
        openObligations: openPlanObligations, decisionEvidence,
        ownerFeedbackFacts: action.input.ownerFeedbackFacts ?? [] }),
    ].join('\n\n')
    return this.sessions.execute(action, context, { role, worktree: source.artifact, prompt })
  }
  adapters() {
    return Object.fromEntries(['plan', 'review_plan'].map(kind => [kind, {
      execute: (action, context) => this.execute(action, context),
      observe: (action, context) => this.sessions.observeSession(action, `owner-${kernelDigest([action.id, action.kind === 'plan' ? 'planner' : 'plan-reviewer']).slice(0, 40)}`, context),
    }]))
  }
}
