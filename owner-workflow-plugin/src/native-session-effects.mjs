import { isManagedRangeStopped } from './execution-evidence.mjs'
import { mkdir, realpath, lstat, readdir } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, sep, basename, dirname } from 'node:path'
import { OwnerTeamSessions } from './owner-team.mjs'
import { readSessionEvents, terminalForPrompt } from './dsh-execution.mjs'
import { withControlLock } from './workflow-store.mjs'
import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'
import { kernelDigest, planningPackageSourceBinding, attemptDispatchContract, taskDirectConsumers } from './workflow-engine.mjs'
import { assertOwnerWrite, assertOwnerPath } from './owner-access.mjs'
import { git, currentBranch, statusRecords } from './git.mjs'
import { roleReportParameters } from './kernel-role-contracts.mjs'
import { loadPlanningCheckpointSnapshot } from './planning-checkpoint.mjs'
import { planningPackageForTask, dispatchedPlanningPackage } from './planning-packages.mjs'
import { diagnosticText } from './workflow-diagnostics.mjs'
import { OWNER_EXECUTION_FEEDBACK_SCHEMA, bindOwnerExecutionFeedback } from './owner-feedback.mjs'
import { repairPromptFields } from './repair-prompt-context.mjs'
import { candidateSubmissionPromptFields } from './candidate-submission-context.mjs'

const READ_TOOLS = new Set(['read', 'grep', 'glob', 'ls', 'web_search', 'web_fetch', 'skill', 'list_skills', 'read_skill'])
const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
const tool = (name, description, parameters, execute) => ({ name, description, parameters, execute, output: { schema: {}, render } })
const reportSchema = { type: 'object', properties: { report: { type: 'object' } }, required: ['report'], additionalProperties: false }
const feedbackSchema = { type: 'object', properties: { report: OWNER_EXECUTION_FEEDBACK_SCHEMA }, required: ['report'], additionalProperties: false }
const commandSchema = { type: 'object', properties: { command: { type: 'string' }, workdir: { type: 'string' } }, required: ['command'], additionalProperties: false }

function ownerBranchFor(workflowId, ownerId, attemptId) {
  const safe = value => String(value).replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return `dsh/owner/${safe(workflowId)}/${safe(ownerId)}/${safe(attemptId)}`
}

export async function assertRetryDraft(action, workflow, worktree, ownerBranch, owner, records, branch, head) {
  if (!records.length) return
  const prior = workflow.attempts[action.input.repair?.fromAttemptId]
  if (!prior || prior.phase !== 'failed' || prior.quarantined || prior.submission || prior.candidate
    || prior.termination?.executionSettled !== true || prior.termination?.sourceWritesClosed !== true
    || !isManagedRangeStopped(prior.termination)
    || prior.taskId !== action.input.task?.id || prior.ownerId !== owner.id
    || prior.definitionDigest !== action.input.definitionDigest) {
    throw new Error('Prepared Owner worktree has uncommitted changes without a settled same-task retry')
  }
  const priorBranch = ownerBranchFor(workflow.id, owner.id, prior.id)
  if (branch !== priorBranch && branch !== ownerBranch) throw new Error('Retry draft is on an unexpected Owner branch')
  if (branch === priorBranch && head !== prior.baseCommit) throw new Error('Retry draft baseline changed')
  if (branch === ownerBranch && head !== action.input.baseCommit) throw new Error('Prepared retry branch baseline changed')
  for (const record of records) {
    if (!['??', ' M'].includes(record.code) || record.originalPath) throw new Error(`Retry draft has unsupported Git change: ${record.path}`)
    await assertOwnerPath({ worktree, owner, task: action.input.task }, record.path)
  }
}

function turnFailure(reason, fallback) {
  if (reason?.kind === 'max-tokens') return 'role_turn_max_tokens: model output exhausted before the required report'
  if (reason?.kind !== 'error') return fallback
  const code = typeof reason.error?.code === 'string' ? reason.error.code : 'MODEL_ERROR'
  const message = diagnosticText(reason.error?.message, { maximum: 2_000, paths: true })
  return `role_turn_failed: ${code}${message ? `: ${message}` : ''}`
}

function ownerTurnFailure(events, reason) {
  if (reason?.kind === 'max-tokens') return 'owner_turn_max_tokens_without_submission: model output exhausted before owner_submit'
  const turnError = turnFailure(reason, null)
  if (turnError) return turnError
  const calls = new Map(events.filter(event => event.type === 'tool/call')
    .map(event => [event.data.callId, event.data.name]))
  for (const event of events.toReversed()) {
    if (event.type !== 'tool/result') continue
    const result = event.data.message?.content?.find(block => block.type === 'tool-result')
    if (result?.isError !== true) continue
    const callId = event.data.message.source?.callId ?? result.toolCallId
    const name = calls.get(callId) ?? 'owner_tool'
    const detail = result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const summary = diagnosticText(detail, { maximum: 2_000, paths: true })
    return `owner_tool_failed: ${name}${summary ? `: ${summary}` : ''}`
  }
  return 'owner_ended_without_submission'
}

function assertSessionSettlement(receipt, owner, promptId) {
  if (receipt.executionSettled !== true || !isManagedRangeStopped(receipt)
    || owner && receipt.sourceWritesClosed !== true
    || promptId !== undefined && (receipt.sessionId !== promptId || receipt.promptId !== promptId)) {
    throw Object.assign(new Error('Stored session receipt lacks scoped settlement evidence'), { code: 'EXECUTION_UNCONFIRMED' })
  }
  return receipt
}

function missingPersistedSession(error) {
  return error?.name === 'SessionPersistenceNotFoundError'
}

async function readPersistedSessionIfPresent(persistence, sessionId, options) {
  try { return await readSessionEvents(persistence, sessionId, options) }
  catch (error) { if (missingPersistedSession(error)) return null; throw error }
}

function acceptedDispatch(receipt) {
  return receipt?.contract === 'DSH_NATIVE_SESSION_DISPATCH_V1' && receipt.accepted === true
}

async function awaitDispatchReceipt(binding, signal) {
  signal?.throwIfAborted()
  let abort
  try {
    await Promise.race([binding.dispatchReady, ...(signal ? [new Promise((_, reject) => {
      abort = () => reject(signal.reason ?? new Error('Native tool cancelled before dispatch receipt'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })] : [])])
  } finally { if (abort) signal.removeEventListener('abort', abort) }
}

function verificationProjection(plan, task) {
  return task.verify.map(id => {
    const verification = plan.verifications.find(item => item.id === id)
    if (!verification) throw new Error(`Owner task references missing verification: ${id}`)
    return verification
  })
}

function exactTaskIds(tasks) { return tasks.map(task => task.id) }
function scopedVerifications(plan, tasks) {
  const ids = new Set(tasks.flatMap(task => task.verify))
  return plan.verifications.filter(item => ids.has(item.id))
}
function groupedPackagesProjection(packages) {
  if (packages.length === 1) return { planningPackage: packages[0] }
  const tickets = new Map(), contracts = new Map()
  const task = item => ({ taskId: item.taskId, task: item.task, owner: item.owner,
    tickets: item.tickets.map(ticket => {
      const key = `${ticket.id}\u0000${ticket.revision}`
      const current = tickets.get(key) ?? { ...ticket, selectedFragments: [] }
      current.selectedFragments = [...new Set([...current.selectedFragments, ...ticket.selectedFragments])]
      tickets.set(key, current)
      return { id: ticket.id, revision: ticket.revision, selectedFragments: ticket.selectedFragments }
    }), contracts: item.contracts.map(contract => {
      const key = `${contract.id}\u0000${contract.revision}`
      contracts.set(key, contract)
      return { id: contract.id, revision: contract.revision }
    }), verification: item.verification, inputs: item.inputs })
  const tasks = packages.map(task)
  return { planningPackages: { spec: packages[0].spec, tickets: [...tickets.values()], contracts: [...contracts.values()], tasks } }
}

/** Native sessions and tool authority for one persisted Action; no scheduling choices. */
export class NativeSessionEffects {
  constructor(ctx, store, commands, { root, pipeline, validateReport = async (_action, report) => report }) {
    this.ctx = ctx; this.store = store; this.commands = commands; this.root = root
    this.pipeline = pipeline; this.validateReport = validateReport; this.team = new OwnerTeamSessions(ctx)
    this.live = new Map(); this.bindings = new Map()
    // FS intent events are host-wide, unlike scoped tool registrations. Route
    // once by the actual native actor; sibling Owner guards must not reject
    // each other's writes or interpret paths using another worktree's context.
    this.fsGuards = ['fs/write-intent', 'fs/edit-intent'].map(event => ctx.on(event, async (target, actor, next) => {
      const entry = this.bindings.get(actor?.agent?.id)
      if (!entry) return next()
      const { agent, binding, childCtx } = entry
      if (actor.agent !== agent || binding.role !== 'owner') throw new Error('Read-only or stale session cannot write')
      const fs = childCtx.get('fs')
      if (!fs) throw new Error('Native filesystem capability is unavailable')
      await assertOwnerWrite(binding, fs.processPath(target), (authority, options) => this.assertAuthority(authority, options))
      return next()
    }, { prepend: true }))
  }
  async assertAuthority(authority, { writes = false } = {}) {
    const state = await this.store.read()
    for (const workflow of Object.values(state.workflows)) {
      const attempt = Object.values(workflow.attempts).find(item => item.authority === authority)
      if (!attempt) continue
      if (workflow.cancelRequested || workflow.tasks[attempt.taskId]?.attemptId !== attempt.id
        || ['failed', 'succeeded', 'cancelled', 'stopping'].includes(attempt.phase) || attempt.quarantined
        || writes && (attempt.writeFrozen || attempt.phase !== 'executing')) throw new Error('Owner authority has expired or is frozen')
      return { workflow, attempt }
    }
    throw new Error('Unknown Owner authority')
  }
  async assertAction(action) {
    const current = (await this.store.read()).actions[action.controlActionId ?? action.id]
    if (!current || current.inputDigest !== action.inputDigest || !['running', 'waiting'].includes(current.status) || current.stopRequested) throw new Error('Session Action authority expired')
  }
  async writePermit(binding, callback, signal) {
    await mkdir(join(this.root, binding.action.id), { recursive: true, mode: 0o700 })
    return withControlLock(artifactPath(this.root, binding.action.id, 'write.lock'), callback, { signal })
  }
  async confirmSourceWritesClosed(binding) {
    // Freeze is durable and checked inside every source tool's write permit.
    // Acquiring it after freeze drains all previously admitted native writes.
    return this.writePermit(binding, async () => {
      const state = await this.store.read()
      const attempt = state.workflows[binding.action.workflowId]?.attempts[binding.action.attemptId]
      if (!attempt || !(attempt.writeFrozen || ['stopping', 'failed', 'cancelled', 'succeeded'].includes(attempt.phase))) {
        throw new Error('Owner source write authority has not closed')
      }
    })
  }
  async taskAcceptanceContext(action, workflow, role, controlState = null) {
    const state = controlState ?? await this.store.read()
    const attempt = workflow.attempts[action.attemptId]
    const record = workflow.tasks[attempt?.taskId]
    if (!attempt || record?.attemptId !== attempt.id || record.definitionDigest !== attempt.definitionDigest) {
      throw new Error('Task acceptance attempt is no longer current')
    }
    const dispatch = attemptDispatchContract(state, workflow, attempt)
    const { task, owner, verifications: verification } = dispatch
    const currentTask = workflow.plan?.tasks.find(item => item.id === task.id)
    if (!currentTask || kernelDigest(task) !== kernelDigest(action.input.task)
      || kernelDigest(task) !== kernelDigest(currentTask)) throw new Error('Task acceptance task changed')
    if (action.input.owner && kernelDigest(owner) !== kernelDigest(action.input.owner)) throw new Error('Task acceptance Owner changed')
    const expected = dispatch.taskPackage
    const legacyCandidate = role === 'reviewer' && action.kind === 'verify_candidate' && action.input.taskPackage === undefined
    const binding = legacyCandidate ? expected : action.input.taskPackage
    if (action.kind === 'verify_candidate') {
      if (action.input.planVersion !== dispatch.planVersion || kernelDigest(action.input.verifications) !== kernelDigest(verification)
        || kernelDigest(action.input.candidate) !== kernelDigest(attempt.candidate) || action.input.candidate?.authority !== attempt.authority) {
        throw new Error('Candidate review acceptance context changed')
      }
    }
    if (binding === null || binding === undefined) {
      if (binding === null && expected !== null) throw new Error('Task acceptance package binding changed')
      if (binding === undefined && expected !== null) throw new Error('Task acceptance package binding is missing')
      return null
    }
    if (!expected || kernelDigest(binding) !== kernelDigest(expected) || binding.taskId !== task.id
      || binding.ownerId !== task.ownerId) throw new Error('Task acceptance package binding changed')
    const root = await realpath(workflow.root)
    const snapshot = await loadPlanningCheckpointSnapshot({ root, id: binding.checkpointId })
    if (kernelDigest(snapshot) !== binding.snapshotDigest) throw new Error('Owner task package snapshot changed')
    const packages = await readArtifact(binding.packagesRef)
    if (!packages) throw new Error('Task acceptance package artifact is missing')
    const address = /^packages-([a-f0-9]{64})$/.exec(basename(dirname(binding.packagesRef)))
    if (!address || basename(binding.packagesRef) !== 'result.json') throw new Error('Task acceptance package is not content addressed')
    const planningPackage = dispatchedPlanningPackage({ snapshot, packages, packageDigest: address[1], dispatch })
    return { planningPackage, directConsumers: dispatch.directConsumers }
  }
  async reviewScopeContext(action, workflow, state) {
    const scope = action.input.reviewScope
    if (scope === undefined) return { ...(await this.taskAcceptanceContext(action, workflow, 'reviewer', state) ?? {}),
      ...await candidateSubmissionPromptFields({ state, action }) }
    if (scope === null) return null
    if (!scope || !['combined', 'final'].includes(scope.kind)) throw new Error('Reviewer acceptance scope is invalid')
    const source = planningPackageSourceBinding(workflow)
    if (!source || scope.packagesRef !== source.packagesRef || scope.checkpointId !== source.checkpointId
      || scope.snapshotDigest !== source.snapshotDigest || scope.planVersion !== source.planVersion || scope.planDigest !== source.planDigest) {
      throw new Error('Reviewer acceptance source binding changed')
    }
    let tasks, expectedTask
    if (scope.kind === 'combined') {
      const control = state.actions[action.controlActionId ?? action.id]
      const attempt = workflow.attempts[control?.attemptId]
      if (!control || control.kind !== 'integrate_candidate' || !attempt || scope.integrationHead !== workflow.integrationHead
        || scope.candidateCommit !== action.input.candidate?.baseCommit) throw new Error('Combined review binding changed')
      tasks = workflow.plan.tasks.filter(task => task.id === attempt.taskId
        || workflow.attempts[workflow.tasks[task.id]?.attemptId]?.phase === 'succeeded')
      expectedTask = { id: 'combined', title: 'Combined integration acceptance', verify: [...new Set(tasks.flatMap(task => task.verify))],
        done: tasks.flatMap(task => task.done ?? []) }
    } else {
      if (action.kind !== 'verify_workflow' || scope.integrationHead !== workflow.integrationHead
        || scope.integrationHead !== action.input.commitSha || scope.integrationHead !== action.input.candidate?.baseCommit
        || action.input.planVersion !== workflow.planVersion || kernelDigest(action.input.plan) !== kernelDigest(workflow.plan)
        || workflow.plan.tasks.filter(task => !task.children)
          .some(task => workflow.attempts[workflow.tasks[task.id]?.attemptId]?.phase !== 'succeeded')) {
        throw new Error('Final review binding changed')
      }
      tasks = workflow.plan.tasks
      expectedTask = { id: 'final', title: 'Complete workflow acceptance', verify: workflow.plan.verifications.map(item => item.id),
        done: workflow.plan.tasks.flatMap(task => task.done ?? []) }
    }
    const verifications = scope.kind === 'final' ? workflow.plan.verifications : scopedVerifications(workflow.plan, tasks)
    if (!Array.isArray(scope.taskIds) || kernelDigest(scope.taskIds) !== kernelDigest(exactTaskIds(tasks))
      || kernelDigest(action.input.task) !== kernelDigest(expectedTask)
      || kernelDigest(action.input.verifications) !== kernelDigest(verifications)) {
      throw new Error('Reviewer acceptance scope changed')
    }
    const root = await realpath(workflow.root)
    const snapshot = await loadPlanningCheckpointSnapshot({ root, id: source.checkpointId })
    if (kernelDigest(snapshot) !== source.snapshotDigest) throw new Error('Reviewer acceptance snapshot changed')
    const packages = await readArtifact(source.packagesRef)
    if (!packages) throw new Error('Reviewer acceptance package artifact is missing')
    const selected = tasks.map(task => {
      const owner = workflow.plan.owners.find(item => item.id === task.ownerId)
      if (!owner) throw new Error('Reviewer acceptance task Owner changed')
      const item = planningPackageForTask({ snapshot, plan: workflow.plan, packages, taskId: task.id, ownerId: task.ownerId })
      if (kernelDigest(item.task) !== kernelDigest(task) || kernelDigest(item.owner) !== kernelDigest(owner)
        || kernelDigest(item.verification) !== kernelDigest(verificationProjection(workflow.plan, task))) {
        throw new Error('Reviewer acceptance package content changed')
      }
      return item
    })
    return { ...groupedPackagesProjection(selected), verifications, directConsumers: taskDirectConsumers(workflow.plan, exactTaskIds(tasks)) }
  }
  async ownerDispatchContext(action, workflow) { return this.taskAcceptanceContext(action, workflow, 'owner') }
  async setup(childCtx, agent, binding) {
    this.bindings.set(agent.id, { agent, binding, childCtx })
    const readOnly = binding.role !== 'owner'
    const submitName = readOnly ? 'workflow_action_submit' : 'owner_submit'
    const approvalReview = binding.role === 'approval-reviewer'
    const allowed = new Set([...(approvalReview ? [] : READ_TOOLS), submitName, ...(approvalReview ? [] : ['bash']), 'run_code',
      ...(readOnly ? [] : ['write', 'edit', 'owner_execution_feedback'])])
    childCtx.tools.restrict({ allow: [...allowed].filter(name => name !== 'run_code' && childCtx.tools.get(name, agent) !== undefined) })
    const denied = new Map()
    childCtx.tools.guard(exec => {
      if (allowed.has(exec.name)) return undefined
      const count = (denied.get(exec.name) ?? 0) + 1
      denied.set(exec.name, count)
      if (count >= 3) binding.abortRepeatedDenial?.(exec.name)
      return 'This Owner Workflow role has no authority for this capability'
    })
    childCtx.on('tools/execute', async (exec, next) => {
      if (exec.agent !== agent) throw new Error('Native tool caller binding changed')
      await awaitDispatchReceipt(binding, exec.signal)
      const write = ['write', 'edit'].includes(exec.name)
      const command = exec.name === 'bash'
      const run = async () => {
        await this.assertAction(binding.action)
        if (binding.authority) {
          const current = await this.assertAuthority(binding.authority, { writes: write })
          if (binding.role === 'owner' && current.attempt.writeFrozen && exec.name !== 'owner_submit') throw new Error('Submitted Owner execution is frozen')
        }
        if (write && readOnly) throw new Error('Read-only role cannot write')
        return next()
      }
      return write || command ? this.writePermit(binding, run, exec.signal) : run()
    }, { prepend: true })
    if (!approvalReview) childCtx.tools.register(tool('bash', 'Run a read-only diagnostic command in this task directory. Modify code using write/edit. The runner executes the project-defined fixed verification after submission without installing or managing project dependencies.', commandSchema,
      async (args, exec) => {
        const root = await realpath(binding.worktree)
        const cwd = await realpath(resolve(root, args.workdir ?? '.'))
        const rel = relative(root, cwd)
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Command directory escapes task workspace')
        return this.commands.execute({ action: binding.action, argv: ['bash', '-c', args.command], cwd, mode: 'read-only',
          authority: binding.authority, verificationId: `read-${exec.callId}`, sessionId: agent.id, signal: exec.signal })
      }))
    childCtx.tools.register(tool(submitName, readOnly ? 'Submit this action’s structured result and finish the current turn.'
      : 'Accept this candidate and finish the current turn. Acceptance does not mean tests, review or integration have passed.', roleReportParameters(binding.role, {
        commitSha: binding.role === 'reviewer' ? binding.action.input.candidate?.commitSha : undefined,
      }),
      async ({ report }, exec) => {
        const result = await this.writePermit(binding, async () => {
          await this.assertAction(binding.action)
          if (readOnly) {
            const validated = await this.validateReport(binding.action, report, binding.role, { evidenceRef: binding.receiptPath })
            await publishArtifact(artifactPath(this.root, binding.record.sessionId, 'report.json'), validated)
            return { status: 'accepted', actionId: binding.action.id }
          }
          const { attempt } = await this.assertAuthority(binding.authority)
          if (attempt.submission) {
            if (kernelDigest(attempt.submission.report) !== kernelDigest(report)) throw new Error('Conflicting duplicate Owner report')
            return { contract: 'DSH_OWNER_SUBMISSION_V2', status: 'accepted', accepted: true, submissionId: attempt.submission.id, attemptId: attempt.id }
          }
          if (report.status !== 'completed') {
            await this.store.transact({ type: 'attempt.stop', workflowId: binding.action.workflowId, attemptId: attempt.id, reason: `owner_${report.status ?? 'failed'}: ${report.summary ?? ''}` })
            return { status: 'reported', completed: false }
          }
          const submission = await this.pipeline.captureSubmission({ attempt, task: binding.task, owner: binding.owner,
            worktree: binding.worktree, ownerBranch: binding.ownerBranch, report }, exec.signal)
          return (await this.store.transact({ type: 'owner.submit', workflowId: binding.action.workflowId, attemptId: attempt.id,
            authority: binding.authority, report, ...submission }, { signal: exec.signal })).result
        }, exec.signal)
        exec.concludeTurn()
        return result
      }))
    if (!readOnly) childCtx.tools.register(tool('owner_execution_feedback', 'Record either an explicit public contract gap or a runner resource observation. Missing Owner-local dependencies are observations bound to a frozen verification; the runner decides availability from its own execution evidence.', feedbackSchema,
      async ({ report }, exec) => {
        const normalized = bindOwnerExecutionFeedback(report, binding.task)
        const id = `issue-${kernelDigest([binding.action.attemptId, normalized.sourceId ?? exec.callId]).slice(0, 40)}`
        await this.store.transact({ type: 'issue.register', workflowId: binding.action.workflowId,
          issue: { id, sourceId: normalized.sourceId ?? exec.callId,
            closeWhen: normalized.kind === 'runner_resource_observation'
              ? { kind: 'runner_resource_available', verificationId: normalized.verificationId,
                observedExitCode: normalized.observedExitCode }
              : { kind: 'public_contract_decision', contractId: normalized.contractId },
            blocksActivation: false } })
        await this.store.transact({ type: 'action.enqueue', workflowId: binding.action.workflowId, kind: 'notify_main', key: id,
          input: { rootSessionId: binding.record.parentSessionId, reason: 'owner_feedback', detail: { issueId: id, report: normalized } } })
        return { status: 'recorded', issueId: id }
      }))
    childCtx.systemPrompt.section({ name: 'owner-workflow:kernel', order: -10, text: [
      `Role: ${binding.role}. You are responsible only for this action.`,
      approvalReview ? 'Assess only the supplied transcript and exact request; the structured report is your only tool.' : readOnly
        ? 'Inspect only the supplied candidate, fixed verification evidence, and directly relevant contract. Submit the structured review promptly. Arbitrary bash is enforced read-only.'
        : 'The frozen task package and fixed verification are your starting point. Inspect only the files needed for the first in-scope edit, then write a small working change promptly; do not keep reading to design the whole solution. If a concrete contract gap prevents a safe edit, report that gap with owner_submit instead of continuing broad exploration. Arbitrary bash is enforced read-only. Do not inspect or initialize dependency/toolchain state unless a fixed verification has failed on that state. Do not weaken the sandbox or request extra agents.',
      readOnly ? 'Do not modify project files. Finish by calling workflow_action_submit with the requested structured report.'
        : 'Every write/edit must be inside both task.write and Owner scope. After implementing, call owner_submit({report:{status:"completed",summary:"..."}}). This returns acceptance only; the runner then executes the project-defined verification and integration. A missing engineering environment is a project initialization condition, not an Owner repair task.',
      'If business scope is ambiguous report the exact missing decision. Technical failures do not grant broader scope.',
    ].join('\n') })
  }
  async execute(action, { signal, started }, options = {}) {
    const role = options.role ?? 'owner'
    const suffix = options.key ?? role
    const sessionId = `owner-${kernelDigest([action.id, suffix]).slice(0, 40)}`
    const receiptPath = artifactPath(this.root, sessionId)
    const prior = await readArtifact(receiptPath)
    if (prior) return assertSessionSettlement(prior, role === 'owner', sessionId)
    const state = await this.store.read(); const workflow = state.workflows[action.workflowId]
    const parent = this.ctx.agents.get(workflow.rootSessionId)
    if (!parent) return { deferred: true, reason: 'root_session_offline' }
    await this.assertAction(action)
    const owner = action.input.owner
    const taskPackage = role === 'owner' ? await this.taskAcceptanceContext(action, workflow, role, state)
      : role === 'reviewer' ? await this.reviewScopeContext(action, workflow, state) : null
    const repairFields = repairPromptFields({ state, action, role })
    const ownerBranch = role === 'owner' ? ownerBranchFor(workflow.id, owner.id, action.attemptId) : null
    const worktree = options.worktree ?? join(this.root, 'worktrees', kernelDigest([workflow.id, owner.id]).slice(0, 40))
    const record = { workflowRoot: workflow.root, workflowId: workflow.id, ownerId: owner?.id ?? `${role}-${sessionId}`,
      worktree, sessionId, parentSessionId: workflow.rootSessionId }
    const intentPath = artifactPath(this.root, sessionId, 'intent.json')
    const intent = { record, actionId: action.id, controlActionId: action.controlActionId ?? action.id, inputDigest: action.inputDigest, role }
    const previousIntent = await readArtifact(intentPath)
    if (previousIntent && kernelDigest(previousIntent) !== kernelDigest(intent)) throw new Error('Native session preparation binding changed')
    const legacyDispatchPath = artifactPath(this.root, sessionId, 'dispatch.json')
    const dispatchPath = artifactPath(this.root, sessionId, 'accepted.json')
    if (await readArtifact(dispatchPath)) return this.observeSession(action, sessionId)
    // A pre-V1 dispatch.json may describe either an accepted prompt or only
    // preparation. Durable Session existence distinguishes them: accepted
    // prompts are persisted before the Host acknowledges them.
    if (await readArtifact(legacyDispatchPath)
      && await readPersistedSessionIfPresent(this.ctx.sessionPersistence, sessionId)) {
      return this.observeSession(action, sessionId)
    }
    await mkdir(join(this.root, sessionId), { recursive: true, mode: 0o700 })
    await publishArtifact(intentPath, intent)
    if (!options.worktree) {
      await mkdir(join(this.root, 'worktrees'), { recursive: true, mode: 0o700 })
      try {
        const info = await lstat(worktree)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unowned Owner worktree already exists')
        if (await git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'], signal)
            !== await git(workflow.root, ['rev-parse', '--path-format=absolute', '--git-common-dir'], signal)) throw new Error('Prepared Owner worktree repository or baseline changed')
        const records = await statusRecords(worktree, signal)
        const branch = await currentBranch(worktree, signal)
        const head = await git(worktree, ['rev-parse', 'HEAD'], signal)
        await assertRetryDraft(action, workflow, worktree, ownerBranch, owner, records, branch, head)
        if (branch !== ownerBranch) {
          const exists = await git(workflow.root, ['show-ref', '--verify', '--quiet', `refs/heads/${ownerBranch}`], signal).then(() => true, () => false)
          if (records.length && exists) throw new Error('Retry draft target branch already exists')
          await git(worktree, ['switch', ...(exists ? [] : ['-c']), ownerBranch, ...(exists ? [] : [action.input.baseCommit])], signal)
        }
        if (await git(worktree, ['rev-parse', 'HEAD'], signal) !== action.input.baseCommit) throw new Error('Owner branch did not synchronize to the task baseline')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        const exists = await git(workflow.root, ['show-ref', '--verify', '--quiet', `refs/heads/${ownerBranch}`], signal).then(() => true, () => false)
        await git(workflow.root, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', ...(exists ? [] : ['-b', ownerBranch]), worktree,
          ...(exists ? [ownerBranch] : [action.input.baseCommit])], signal)
        if (exists) {
          if (await git(worktree, ['rev-parse', 'HEAD'], signal) !== action.input.baseCommit) throw new Error('Owner branch did not synchronize to the task baseline')
        }
      }
      await this.pipeline.restoreCandidate?.(action, worktree, signal)
    }
    const dispatchReady = Promise.withResolvers()
    const binding = { action, record, worktree, ownerBranch, role, task: action.input.task, owner, receiptPath,
      dispatchReady: dispatchReady.promise,
      authority: action.input.authority ?? action.input.candidate?.authority ?? null }
    const controller = new AbortController(); const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    binding.abortRepeatedDenial = name => controller.abort(new Error(`Repeated unauthorized ${role} tool: ${name}`))
    const entry = { binding, controller }; this.live.set(sessionId, entry)
    try {
      await this.team.activate(record, parent, { signal: combined, agentOptions: options.agentOptions, setup: (ctx, agent) => this.setup(ctx, agent, binding) })
      const defaultPrompt = JSON.stringify({ task: action.input.task, owner, inputs: action.input.inputs,
        ...repairFields, history: owner && this.ownerHistory ? await this.ownerHistory(workflow.root, owner.id) : undefined,
        ...(taskPackage ?? {}) })
      const promptContext = { ...(taskPackage ?? {}), ...repairFields }
      const prompt = options.prompt && Object.keys(promptContext).length
        ? `${options.prompt}\n\n${JSON.stringify(promptContext)}` : options.prompt ?? defaultPrompt
      const result = await this.team.dispatch(record, parent, { taskId: action.input.task?.id ?? action.id, attemptId: action.attemptId ?? action.id,
        planDigest: action.inputDigest, promptId: sessionId, prompt, signal: combined,
        onAccepted: async evidence => {
          // A durable dispatch fact means the Host accepted the prompt and its
          // user message is in Session persistence. Preparation/activation is
          // not dispatch: recording it earlier strands a never-started Owner as
          // an unknown old-host writer after restart.
          await publishArtifact(dispatchPath, { contract: 'DSH_NATIVE_SESSION_DISPATCH_V1', accepted: true,
            actionId: action.id, inputDigest: action.inputDigest, sessionId, evidence })
          await started?.({ handleId: sessionId, ...evidence })
          dispatchReady.resolve()
        } })
      if (role === 'owner') {
        const current = await this.store.read()
        const attempt = current.workflows[action.workflowId]?.attempts[action.attemptId]
        const control = current.actions[action.controlActionId ?? action.id]
        if (!attempt?.submission) {
          if (attempt && attempt.phase !== 'stopping' && !['failed', 'cancelled', 'succeeded'].includes(attempt.phase)
            && !control?.stopRequested) {
            await this.store.transact({ type: 'attempt.stop', workflowId: action.workflowId,
              attemptId: action.attemptId, reason: ownerTurnFailure(result.events, result.reason) }, { signal: combined })
          }
          return { pending: true, fact: 'running' }
        }
      }
      const stopped = await this.commands.stop([action.controlActionId ?? action.id], { signal: combined })
      if (!isManagedRangeStopped(stopped)) throw new Error('Session commands have not terminated')
      if (role === 'owner') await this.confirmSourceWritesClosed(binding)
      else await this.writePermit(binding, async () => {})
      let value
      if (role === 'owner') value = { ...stopped, authority: binding.authority, executionSettled: true, sourceWritesClosed: true, terminationId: stopped.terminationId, sessionId, promptId: sessionId }
      else {
        const report = await readArtifact(artifactPath(this.root, sessionId, 'report.json'))
        value = report
          ? { ...report, ...stopped, sessionId, promptId: sessionId, executionSettled: true, evidenceRef: receiptPath }
          : { ...stopped, failed: true, reason: turnFailure(result.reason, 'Role finished without a structured report'), sessionId, promptId: sessionId,
              executionSettled: true, evidenceRef: receiptPath }
      }
      await this.team.suspend(record)
      await publishArtifact(receiptPath, value)
      this.bindings.delete(sessionId)
      return value
    } catch (error) { controller.abort(error); throw error }
    finally {
      // This map describes in-flight local execute promises, not unresolved
      // external execution. Keep the tool/FS binding until formal suspension;
      // the observer and stop lane must reconcile missing-report failures.
      this.live.delete(sessionId)
    }
  }
  async observeSession(action, sessionId, context = {}) {
    const prior = await readArtifact(artifactPath(this.root, sessionId))
    if (prior) return assertSessionSettlement(prior, action.kind === 'execute_owner', sessionId)
    const intent = await readArtifact(artifactPath(this.root, sessionId, 'intent.json'))
    const dispatch = await readArtifact(artifactPath(this.root, sessionId, 'accepted.json'))
      ?? await readArtifact(artifactPath(this.root, sessionId, 'dispatch.json'))
    if (!intent || !dispatch) {
      if (intent && intent.inputDigest !== action.inputDigest) throw new Error('Native session preparation identity mismatch')
      return context.executionQuiescent ? { pending: true, fact: 'not_started', proof: { notDispatched: true, executionQuiescent: true } }
        : { pending: true, fact: 'unknown' }
    }
    if (intent.actionId !== action.id || intent.controlActionId !== (action.controlActionId ?? action.id)
      || intent.inputDigest !== action.inputDigest) throw new Error('Native session input changed')
    if (dispatch.actionId !== action.id || dispatch.inputDigest !== action.inputDigest || dispatch.sessionId !== sessionId) {
      throw new Error('Native session dispatch identity mismatch')
    }
    if (this.live.has(sessionId)) return { pending: true, fact: 'running' }
    const stored = await readPersistedSessionIfPresent(this.ctx.sessionPersistence, sessionId)
    // Legacy builds wrote dispatch.json before Host prompt acceptance. A
    // missing durable Session proves that receipt described preparation only.
    // Accepted V1 receipts remain uncertain if their promised Session is gone.
    if (!stored) return !acceptedDispatch(dispatch) && context.executionQuiescent
      ? { pending: true, fact: 'not_started', proof: { notDispatched: true, executionQuiescent: true } }
      : { pending: true, fact: 'unknown' }
    if (stored.header.id !== sessionId || stored.header.parentSession !== intent.record.parentSessionId
      || stored.header.cwd !== intent.record.worktree) throw new Error('Recovered native session identity mismatch')
    const termination = await this.commands.stop([action.controlActionId ?? action.id])
    if (!isManagedRangeStopped(termination)) return { pending: true, fact: 'unknown' }
    if (intent.role === 'owner') {
      const workflow = (await this.store.read()).workflows[action.workflowId]
      const attempt = workflow.attempts[action.attemptId]
      if (!attempt?.submission || !attempt.writeFrozen) return { pending: true, fact: 'unknown' }
      // Every source mutation and shell call holds this permit. Its post-freeze
      // acquisition proves all pre-submit source tools have returned; persistent
      // authority checks veto late tools even in another still-live host.
      return this.writePermit({ action }, async () => {
        await this.assertAuthority(attempt.authority)
        return publishArtifact(artifactPath(this.root, sessionId), { ...termination, authority: attempt.authority, executionSettled: true, sourceWritesClosed: true,
          terminationId: termination.terminationId, sessionId, promptId: sessionId })
      })
    }
    const terminal = terminalForPrompt(stored.events, sessionId)
    if (!terminal) return { pending: true, fact: 'unknown' }
    const receiptPath = artifactPath(this.root, sessionId)
    return this.writePermit({ action: { id: intent.actionId } }, async () => {
      const report = await readArtifact(artifactPath(this.root, sessionId, 'report.json'))
      return publishArtifact(receiptPath, report
        ? { ...report, ...termination, sessionId, promptId: sessionId, executionSettled: true, evidenceRef: receiptPath }
        : { ...termination, failed: true, reason: turnFailure(terminal.data.reason, 'Role finished without a structured report'), sessionId, promptId: sessionId,
            executionSettled: true, evidenceRef: receiptPath })
    })
  }
  async stop(action, { signal } = {}) {
    const previous = await readArtifact(artifactPath(this.root, action.id))
    if (previous) return assertSessionSettlement(previous, Boolean(action.attemptId))
    const state = await this.store.read()
    const targets = action.input.targetActionId ? [action.input.targetActionId]
      : Object.values(state.actions).filter(item => item.attemptId === action.attemptId && item.id !== action.id).map(item => item.id)
    const entries = [...this.live.entries()].filter(([, entry]) => targets.includes(entry.binding.action.controlActionId ?? entry.binding.action.id))
    for (const [id, entry] of entries) { entry.controller.abort(new Error('Action stopped')); this.ctx.agents.get(id)?.cancel({ kind: 'parent' }) }
    for (const [id, entry] of entries) {
      const agent = this.ctx.agents.get(id)
      if (agent) await agent.whenIdle()
      await this.writePermit(entry.binding, async () => {})
      await this.team.suspend(entry.binding.record)
      this.live.delete(id); this.bindings.delete(id)
    }
    const termination = await this.commands.stop(targets, { signal })
    if (!isManagedRangeStopped(termination)) return { pending: true, fact: 'unknown' }
    for (const id of targets) {
      const lockDirectory = join(this.store.directory, 'action-locks')
      await mkdir(lockDirectory, { recursive: true, mode: 0o700 })
      try { await withControlLock(join(lockDirectory, `${id}.lock`), async () => {}, { signal, timeoutMs: 0 }) }
      catch (error) { if (error.code !== 'CONTROL_LOCK_BUSY') throw error; return { pending: true, fact: 'running' } }
    }
    // Any old-host unresolved native session requires explicit recovery evidence.
    const nativeIds = await readdir(this.root).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    for (const sessionId of nativeIds.filter(id => id.startsWith('owner-'))) {
      const intent = await readArtifact(artifactPath(this.root, sessionId, 'intent.json'))
      if (!intent || !targets.includes(intent.controlActionId ?? intent.actionId)) continue
      const dispatch = await readArtifact(artifactPath(this.root, sessionId, 'accepted.json'))
        ?? await readArtifact(artifactPath(this.root, sessionId, 'dispatch.json'))
      if (!dispatch) continue
      if (dispatch.actionId !== intent.actionId || dispatch.inputDigest !== intent.inputDigest || dispatch.sessionId !== sessionId) {
        throw new Error('Native session dispatch identity mismatch')
      }
      const receipt = await readArtifact(artifactPath(this.root, sessionId))
      if (receipt) { assertSessionSettlement(receipt, intent.role === 'owner', sessionId); continue }
      if (entries.some(([liveId]) => liveId === sessionId)) continue
      // A read-only model still occupies a native session and may have managed
      // commands. Its absence from this host is not proof it has terminated.
      const stored = await readPersistedSessionIfPresent(this.ctx.sessionPersistence, sessionId)
      if (!stored) {
        if (!acceptedDispatch(dispatch)) continue
        return { pending: true, fact: 'unknown' }
      }
      if (stored.header.id !== sessionId || stored.header.cwd !== intent.record.worktree
        || stored.header.parentSession !== intent.record.parentSessionId || !terminalForPrompt(stored.events, sessionId)) return { pending: true, fact: 'unknown' }
      // Termination needs all three facts: bound native terminal, managed
      // command ranges stopped, and the final native-write permit barrier.
      await this.writePermit({ action: { id: intent.actionId } }, async () => {}, signal)
      const active = this.bindings.get(sessionId)
      if (active) {
        await this.team.suspend(active.binding.record)
        this.bindings.delete(sessionId)
      }
    }
    if (action.attemptId) {
      for (const sourceAction of Object.values(state.actions).filter(item => item.attemptId === action.attemptId && item.kind === 'execute_owner')) {
        await this.confirmSourceWritesClosed({ action: sourceAction })
      }
    }
    return publishArtifact(artifactPath(this.root, action.id), { ...termination, executionSettled: true, ...(action.attemptId ? { sourceWritesClosed: true } : {}), authority: action.input.authority, ...(action.input.targetActionId ? { targetActionId: action.input.targetActionId } : {}) })
  }
  adapters() { return { execute_owner: { execute: (action, context) => this.execute(action, context), observe: (action, context) => this.observeSession(action, `owner-${kernelDigest([action.id, 'owner']).slice(0, 40)}`, context) },
    stop_execution: { execute: (action, context) => this.stop(action, context), observe: (action, context) => this.stop(action, context) } } }
  async close() {
    await this.team.dispose()
    for (const dispose of this.fsGuards) dispose()
    this.bindings.clear()
  }
}
