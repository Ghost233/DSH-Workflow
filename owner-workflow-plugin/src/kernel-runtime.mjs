import { mkdir, realpath, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WorkflowStore, withControlLock } from './workflow-store.mjs'
import { WorkflowEffects } from './workflow-effects.mjs'
import { WorkflowRunner } from './workflow-runner.mjs'
import { acquireWorkflowHost } from './workflow-host.mjs'
import { NativeCommandEffects } from './native-command-effects.mjs'
import { NativeSessionEffects } from './native-session-effects.mjs'
import { NativeDecisionEffects } from './native-decision-effects.mjs'
import { NativeNotificationEffects } from './native-notification-effects.mjs'
import { NativePlanningEffects, assertPlanningCheckout } from './native-planning-effects.mjs'
import { NativeRegistryEffects } from './native-registry-effects.mjs'
import { SubmissionPipeline } from './submission-pipeline.mjs'
import { WorkflowDelivery } from './workflow-delivery.mjs'
import { WorkflowGitEffects } from './workflow-git-effects.mjs'
import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'
import { kernelDigest, view, reservesProject, planningSources, planningPackageSourceBinding, planningIssueContext, ownerFeedbackEvidence,
  planningRevisionBoundary, planningAuthoringCandidate } from './workflow-engine.mjs'
import { askNativeQuestion } from './dsh-execution.mjs'
import { crossThreadCancellationDetail } from './approval-markdown.mjs'
import { git, repositoryRoot, statusRecords } from './git.mjs'
import { loadRegistry, readRegistryForProposal, proposeRegistryChange } from './registry.mjs'
import { derivePlanningBundle } from './planning-bundle.mjs'
import { PlanningCheckpointError, runPlanningCheckpoint, loadPlanningCheckpointSnapshot } from './planning-checkpoint.mjs'
import { authorizePlanningCheckpoint } from './planning-authority.mjs'
import { validatePlanningSourceChain } from './planning-source-chain.mjs'
import { orchestratorDocumentPath } from './orchestrator-documents.mjs'
import { bindPublicOwnerChangeDecision, normalizePublicOwnerChangeRequest, normalizePublicOwnerContext } from './public-owner-change.mjs'
import { materializePublicOwnerRequest, publicOwnerFeedbackSource, publicOwnerRequestSeed } from './public-owner-adapter.mjs'
import { planningPackageForTask } from './planning-packages.mjs'
import { OwnerMemoryEffects } from './owner-memory-effects.mjs'
import { assertRetainedPathAvailable } from './isolated-attempt-retirement.mjs'
import { ownerResourceObservation } from './owner-feedback.mjs'

export function candidateReviewPrompt({ candidate, task, results }) {
  return ['Independently review this exact candidate against its fixed task and acceptance criteria. Read the candidate files and consider the verification results.',
    'The bound ownerSubmission.report is durable candidate evidence. For a task with write:[], that report is the task output and does not need to be duplicated in candidate files. Only the supplied results are fixed verification evidence; do not invent a missing verification requirement or treat an ad hoc diagnostic command as an acceptance gate.',
    'Keep the review bounded: inspect the changed files and directly relevant contracts, then submit the structured decision. Do not repeat repository-wide searches, create temporary test files, or build a second test harness. If the fixed results pass but a concrete defect remains, cite the exact defect in reasons and submit passed:false. Submit passed:true with concise reasons when the evidence is sufficient; do not spend the action deadline exploring unrelated callers.',
    'Use workflow_action_submit({report:{passed:boolean,commitSha,reasons:[...]}}). You have read-only capabilities.',
    JSON.stringify({ commitSha: candidate.commitSha, task, results })].join('\n\n')
}

function projectBlockers(state, root, now) {
  return Object.values(state.workflows).filter(workflow => workflow.root === root && reservesProject(state, workflow))
    .map(workflow => {
      const current = view(state, workflow.id, now)
      return { workflowId: workflow.id, rootSessionId: workflow.rootSessionId, status: current.status,
        cancelRequested: workflow.cancelRequested, counts: current.counts,
        reasons: current.attention.map(item => item.reason) }
    })
}

export function reviewScopeBinding(workflow, kind, tasks, { integrationHead, candidateCommit } = {}) {
  const source = planningPackageSourceBinding(workflow)
  if (source === null) return null
  return { kind, taskIds: tasks.map(task => task.id), ...source, integrationHead,
    ...(candidateCommit ? { candidateCommit } : {}) }
}

const EXEC_TASK_TOOLS = ['read', 'grep', 'glob', 'ls', 'write', 'edit', 'bash', 'run_code',
  'web_search', 'web_fetch', 'skill', 'list_skills', 'read_skill']

/** Composition of the replacement kernel. The legacy runtime is never imported. */
export class KernelRuntime {
  constructor(ctx, { catalogRoot, parallel = 3, onError = () => {}, registryVerifier } = {}) {
    this.ctx = ctx; this.onError = onError
    this.store = new WorkflowStore(catalogRoot ?? process.env.DSH_OWNER_WORKFLOW_CATALOG_ROOT ?? process.cwd(), { parallel })
    this.activeOwners = new Map(); this.agentRoles = new Map()
    this.verifyRegistry = registryVerifier ?? (async workflow => {
      if (kernelDigest(await loadRegistry(workflow.root)) !== workflow.plan.registryDigest) throw new Error('Owner Registry changed; existing execution authority is no longer valid')
    })
    this.ready = this.initialize().catch(async error => { await this.host?.close(); throw error })
  }
  async initialize() {
    await this.store.initialize()
    this.host = await acquireWorkflowHost(this.store)
    const root = this.store.directory
    const artifacts = join(root, 'artifacts')
    await mkdir(artifacts, { recursive: true, mode: 0o700 })
    this.commands = new NativeCommandEffects(this.ctx, { root: join(root, 'commands'), hostId: this.host.hostId,
      assertReusablePath: async path => assertRetainedPathAvailable(await this.store.read(), path),
      assertAuthority: (authority, options) => authority ? this.assertAuthority(authority, options) : undefined })
    this.sessions = new NativeSessionEffects(this.ctx, this.store, this.commands, { root: join(root, 'native-sessions') })
    this.planning = new NativePlanningEffects(this.ctx, this.store, this.sessions, artifacts, {
      prepareSource: (action, commit, signal) => this.candidateFromCommit(action, commit, null, 'planning', signal),
    })
    this.registry = new NativeRegistryEffects(this.store)
    this.memory = new OwnerMemoryEffects(this.store, this.sessions, join(root, 'memory'))
    this.sessions.ownerHistory = (root, ownerId) => this.memory.history(root, ownerId)
    this.sessions.validateReport = async (action, report, role, receipt = {}) => {
      if (role === 'public-owner') {
        await this.verifyRegistry((await this.store.read()).workflows[action.workflowId])
        return { decision: bindPublicOwnerChangeDecision(report.decision, action.input.request, action.input.context) }
      }
      if (role === 'memory-curator') return this.memory.validate(action, report)
      if (['planner', 'plan-reviewer'].includes(role)) return this.planning.validate(action, report, role, receipt)
      if (role === 'reviewer') {
        if (typeof report.passed !== 'boolean' || report.commitSha !== action.input.candidate.commitSha
          || !Array.isArray(report.reasons) || report.reasons.length === 0) throw new Error('Review must bind the exact candidate and provide findings')
      }
      return report
    }
    this.nativeOwnerAuthority = this.sessions.assertAuthority.bind(this.sessions)
    this.sessions.assertAuthority = (authority, options) => this.assertAuthority(authority, options)
    this.pipeline = new SubmissionPipeline({ artifactsRoot: artifacts,
      stopCommands: action => this.commands.stop([action.controlActionId ?? action.id]),
      assertAuthority: (authority, options) => this.assertAuthority(authority, options),
      executeCommand: request => this.commands.execute({ ...request, action: { ...request.action, id: request.action.controlActionId ?? request.action.id }, verificationId: `${request.action.id}:${request.verificationId}` }),
      reviewCandidate: ({ action, candidate, task, results, signal }) => this.sessions.execute(action, { signal }, {
        role: 'reviewer', worktree: candidate.artifact,
        prompt: candidateReviewPrompt({ candidate, task, results }),
      }),
      integrateCandidate: (action, context) => this.integration(action).then(effect => effect.integrate(action, context)),
    })
    this.sessions.pipeline = this.pipeline
    this.notifications = new NativeNotificationEffects(this.ctx, this.store, join(root, 'notices'))
    this.decisions = new NativeDecisionEffects(this.ctx, this.store, join(root, 'decisions'))
    this.delivery = new WorkflowDelivery(this.store, join(root, 'deliveries'))
    const adapters = { ...this.sessions.adapters(), ...this.pipeline.adapters(), ...this.planning.adapters(),
      prepare_workflow: { execute: (action, context) => this.prepareWorkflow(action, context), observe: (action, context) => this.prepareWorkflow(action, context) },
      prepare_revision: { execute: (action, context) => this.prepareRevision(action, context), observe: (action, context) => this.prepareRevision(action, context) },
      deliver_workflow: this.delivery.adapter(), notify_main: this.notifications.adapter(), request_decision: this.decisions.adapter(),
      summarize_memory: this.memory.adapter(),
      change_registry: this.registry.adapter(),
      consult_owner: {
        execute: async (action, context) => {
          const state = await this.store.read()
          const workflow = state.workflows[action.workflowId]
          const feedback = await this.publicOwnerSeed(state, workflow, action.input.request.requestId)
          const candidate = await this.candidateFromCommit(action, workflow.integrationHead, null, 'consultation', context.signal)
          return this.sessions.execute(action, context, { role: 'public-owner', worktree: candidate.artifact,
            prompt: ['You are the independent public module Owner. Evaluate the requesting module’s need and all downstream consumers before deciding.',
              'Preserve the request baseline, evidence, consumer inventory, compatibility and migration obligations. Do not change code.',
              'Submit only judgment fields. Runtime binds the immutable request id, version, digest, target Owner and baseline.',
              'capability_sufficient: cover every consumer; use contractChange/alternative/businessChange=null and migrationOrder/unknowns=[].',
              'compatible_extension: cover every consumer and provide a new contractChange; use migrationOrder/unknowns=[] and alternative/businessChange=null.',
              'migration_required: cover every consumer, provide a new contractChange, and list exactly every update_required consumer in migrationOrder.',
              'rejected: provide alternative; facts_missing: provide one or more bounded unknowns; business_decision_required: provide businessChange tied to a request acceptance criterion. All unused objects are null and unused arrays are [].',
              'Every basisRefs and affected-consumer evidenceRefs value must come from input.context.evidenceRefs. Do not invent evidence ids.',
              'Call workflow_action_submit({report:{decision:{decisionId,outcome,summary,basisRefs,affectedConsumers,contractChange,migrationOrder,alternative,unknowns,businessChange}}}).',
              JSON.stringify({ ...action.input, sourceFeedback: feedback.seed?.feedbackOrigin?.report ?? null })].join('\n\n') })
        },
        observe: (action, context) => this.sessions.observeSession(action, `owner-${kernelDigest([action.id, 'public-owner']).slice(0, 40)}`, context),
      },
      integrate_candidate: {
        execute: (action, context) => this.pipeline.integrate(action, context),
        observe: (action, context) => this.integration(action).then(effect => effect.observe(action, context)),
      },
      verify_workflow: {
        execute: (action, context) => this.verifyWorkflow(action, context),
        observe: async (action, context) => await readArtifact(artifactPath(artifacts, `${action.id}-delivery`))
          ?? (context?.executionQuiescent ? this.verifyWorkflow(action, context) : { pending: true, fact: 'unknown' }),
      },
    }
    this.effects = new WorkflowEffects(this.store, adapters, { onError: this.onError, hostId: this.host.hostId })
    this.runner = new WorkflowRunner(this.store, this.effects, { onError: this.onError })
    return this
  }
  async prepareWorkflow(action, { signal } = {}) {
    const workflow = (await this.store.read()).workflows[action.workflowId]
    const receipt = artifactPath(this.store.directory, `${action.id}-prepared`)
    const prior = await readArtifact(receipt)
    if (prior) return prior
    if (workflow.cancelRequested) return { integrationRef: workflow.integrationRef, baseCommit: workflow.baseCommit, evidenceRef: receipt, cancelledBeforePreparation: true }
    if (!/^refs\/heads\/dsh\/workflow\/ukr-[a-f0-9]{40}$/.test(workflow.integrationRef)) throw new Error('Workflow preparation requires its allocated ref')
    const existing = await git(workflow.root, ['for-each-ref', '--format=%(objectname)', workflow.integrationRef], signal)
    if (existing && existing !== workflow.baseCommit) throw new Error('Allocated workflow ref has unexpected content')
    if (!existing) await git(workflow.root, ['update-ref', workflow.integrationRef, workflow.baseCommit, '0'.repeat(workflow.baseCommit.length)], signal)
    return publishArtifact(receipt, { integrationRef: workflow.integrationRef, baseCommit: workflow.baseCommit, evidenceRef: receipt })
  }
  async assertAuthority(authority, options = {}) {
    if (typeof authority === 'string' && authority.startsWith('final-')) {
      if (options.writes) throw new Error('Final verification has no source write authority')
      const state = await this.store.read()
      const workflow = Object.values(state.workflows).find(workflow => !workflow.cancelRequested && workflow.plan
        && authority === `final-${kernelDigest([workflow.id, workflow.planVersion, workflow.integrationHead])}`)
      if (!workflow) throw new Error('Final verification authority expired')
      await this.verifyRegistry(workflow)
      return { workflow, attempt: null }
    }
    const current = await this.nativeOwnerAuthority(authority, options)
    await this.verifyRegistry(current.workflow)
    return current
  }
  async integration(action) {
    const workflow = (await this.store.read()).workflows[action.workflowId]
    return new WorkflowGitEffects({ root: workflow.root, artifactsRoot: join(this.store.directory, 'integrations'),
      integrationRef: workflow.integrationRef, assertAuthority: (authority, options) => this.assertAuthority(authority, options),
      verifyIntegration: async ({ commitSha, signal }) => {
        const candidate = await this.candidateFromCommit(action, commitSha, action.input.authority, 'combined', signal)
        const covered = workflow.plan.tasks.filter(task => task.id === workflow.attempts[action.attemptId]?.taskId
          || workflow.attempts[workflow.tasks[task.id]?.attemptId]?.phase === 'succeeded')
        const task = { id: 'combined', title: 'Combined integration acceptance', verify: [...new Set(covered.flatMap(item => item.verify))], done: covered.flatMap(item => item.done ?? []) }
        const result = await this.pipeline.verify({ ...action, controlActionId: action.id, id: `${action.id}-combined`,
          input: { candidate, task, verifications: workflow.plan.verifications.filter(item => task.verify.includes(item.id)),
            reviewScope: reviewScopeBinding(workflow, 'combined', covered, { integrationHead: workflow.integrationHead, candidateCommit: commitSha }) } }, { signal })
        return { ...result, commitSha }
      },
    })
  }
  async prepareRevision(action, context) {
    const assertCurrent = async () => {
      const state = await this.store.read(), current = state.actions[action.id]
      if (!current || !['running', 'waiting', 'uncertain'].includes(current.status) || current.stopRequested
        || current.inputDigest !== action.inputDigest || state.workflows[action.workflowId].cancelRequested) throw new Error('Source revision action authority expired')
      const { proposal } = action.input
      await this.planning.inputs({ workflowId: action.workflowId, input: { checkpointId: proposal.sources.checkpointId,
        snapshotDigest: proposal.sources.snapshotDigest, registryDigest: proposal.plan.registryDigest } },
      // The independent review already bound this revision to an immutable
      // checkpoint. Supporting progress notes may advance while Owners run;
      // normative Spec/Tickets and the code baseline must still match.
      { allowSupportingDrift: true })
      const workflow = (await this.store.read()).workflows[action.workflowId]
      if (kernelDigest(workflow.pendingActivation) !== kernelDigest(proposal)) throw new Error('Source revision proposal changed')
    }
    return (await this.integration(action)).prepareRevision(action, { ...context, assertCurrent })
  }
  async candidateFromCommit(action, commitSha, authority, key, signal) {
    const id = `${action.id}-${key}`
    const sourceRoot = join(this.pipeline.root, 'sources')
    const saved = await readArtifact(artifactPath(sourceRoot, id))
    if (saved) {
      if (saved.baseCommit !== commitSha || saved.authority !== authority) throw new Error('Source snapshot identity was reused for a different commit or authority')
      if (await git(saved.repositoryRoot, ['show', '-s', '--format=%T', saved.commitSha], signal) !== saved.treeSha) throw new Error('Source commit identity changed')
      try {
        if (await git(saved.artifact, ['rev-parse', 'HEAD'], signal) === saved.commitSha) return saved
      } catch {}
      await git(saved.repositoryRoot, ['worktree', 'remove', '--force', saved.artifact], signal).catch(() => undefined)
      await rm(saved.artifact, { recursive: true, force: true })
      await git(saved.repositoryRoot, ['worktree', 'prune'], signal).catch(() => undefined)
      await git(saved.repositoryRoot, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', saved.artifact, saved.commitSha], signal)
      return saved
    }
    const workflow = (await this.store.read()).workflows[action.workflowId]
    const directory = join(sourceRoot, id); const tree = join(directory, 'tree')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const treeSha = await git(workflow.root, ['show', '-s', '--format=%T', commitSha], signal)
    const candidate = { repositoryRoot: workflow.root, artifact: tree, baseCommit: commitSha,
      commitSha, treeSha, paths: [], authority, sourceOnly: true }
    await git(workflow.root, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', tree, commitSha], signal)
    return publishArtifact(artifactPath(sourceRoot, id), candidate)
  }
  async verifyWorkflow(action, { signal } = {}) {
    const workflow = (await this.store.read()).workflows[action.workflowId]
    const authority = `final-${kernelDigest([workflow.id, workflow.planVersion, workflow.integrationHead])}`
    const candidate = await this.candidateFromCommit(action, action.input.commitSha, authority, 'final', signal)
    const task = { id: 'final', title: 'Complete workflow acceptance', verify: action.input.plan.verifications.map(item => item.id),
      done: action.input.plan.tasks.flatMap(item => item.done ?? []) }
    const result = await this.pipeline.verify({ ...action, input: { candidate, task, verifications: action.input.plan.verifications,
      plan: action.input.plan, planVersion: action.input.planVersion, commitSha: action.input.commitSha,
      reviewScope: reviewScopeBinding(workflow, 'final', workflow.plan.tasks, { integrationHead: action.input.commitSha }) } }, { signal })
    if (result?.pending || result?.deferred) return result
    const receipt = { ...result, commitSha: action.input.commitSha, planVersion: action.input.planVersion }
    return publishArtifact(artifactPath(this.pipeline.root, `${action.id}-delivery`), receipt)
  }
  rootAgent(agent) {
    if (!this.modeEnabledForActor({ agent })) throw new Error('Workflow control requires the actual live root Agent in this Owner preset')
    return agent
  }
  async rootFor(agent) { this.rootAgent(agent); return realpath(await repositoryRoot(agent.session.header.cwd)) }
  modeEnabledForActor(actor) {
    const agent = actor?.agent
    if (!agent || !this.ctx.agents.roots().includes(agent) || this.ctx.agents.get(agent.id) !== agent) return false
    // ToolRegistry resolves the actual agent scope. A global filesystem guard
    // must not turn every unrelated root in the Web host into an orchestrator.
    const definition = this.rootTools?.find(tool => tool.name === 'workflow_start')
    return Boolean(definition && this.ctx.tools.get(definition.name, agent)?.execute === definition.execute)
  }
  actorRoot(actor) { try { return realpathSync(actor.agent.session.header.cwd) } catch { return undefined } }
  orchestratorDocumentPath(actor, filePath) {
    return orchestratorDocumentPath({ root: this.actorRoot(actor), cwd: actor.agent.session.header.cwd, filePath })
  }
  checkToolExecution(exec) {
    if (!this.modeEnabledForActor(exec)) return undefined
    if (['write', 'edit'].includes(exec.name)) return this.orchestratorDocumentPath(exec, exec.arguments?.file_path) ? undefined : 'The orchestrator may write only approved planning documents; delegate source changes to their Owner'
    const allowed = new Set(['read', 'grep', 'glob', 'ls', 'web_search', 'web_fetch', 'skill', 'list_skills', 'read_skill',
      'ask_user_question', 'run_code', ...(this.rootTools ?? []).map(tool => tool.name)])
    return allowed.has(exec.name) ? undefined : 'Use an Owner task in the controlled Workflow for this capability'
  }
  async execTask(agent, args, exec) {
    await this.ready
    const root = await this.rootFor(agent)
    if (typeof args?.task !== 'string' || !args.task.trim() || typeof args.reason !== 'string' || !args.reason.trim()
      || !Array.isArray(args.steps) || args.steps.length < 1 || args.steps.length > 20
      || args.steps.some(step => typeof step !== 'string' || !step.trim())) throw new Error('Exec task requires a concrete task, 1–20 steps and a reason')
    if (typeof exec.callId !== 'string' || !exec.callId || !exec.signal) throw new Error('A live DSH tool execution is required')
    const subagents = this.ctx.get('subagents')
    if (typeof subagents?.start !== 'function' || !subagents.getProvider?.('spawn')) throw new Error('Native one-shot Exec sessions are unavailable')
    const approval = this.ctx.get('approval')
    if (typeof approval?.request !== 'function') throw new Error('Native user approval is unavailable')
    const allowed = EXEC_TASK_TOOLS.filter(name => this.ctx.tools.get(name, agent) !== undefined)
    if (!allowed.includes('bash') || !allowed.includes('read')) throw new Error('Exec session requires the native bash and read tools')
    const id = kernelDigest({ agentId: agent.id, callId: exec.callId })
    const binding = kernelDigest({ agentId: agent.id, callId: exec.callId, root, args, allowed })
    const dir = join(this.store.directory, 'exec-tasks', id)
    const claimPath = artifactPath(join(this.store.directory, 'exec-tasks'), id, 'claim.json')
    const resultPath = artifactPath(join(this.store.directory, 'exec-tasks'), id, 'result.json')
    const lockPath = artifactPath(join(this.store.directory, 'exec-tasks'), id, 'lock')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    return withControlLock(lockPath, async () => {
      const claim = await readArtifact(claimPath)
      if (claim && claim.binding !== binding) throw new Error('Exec task call identity was reused with different scope')
      if (claim) return await readArtifact(resultPath) ?? { status: 'outcome_unknown', callId: exec.callId,
        reason: 'This approved Exec task was already claimed and cannot be started again automatically.' }
      const outcome = await approval.request({ agent, toolName: 'workflow_exec_task', callId: exec.callId,
        reason: `一次非 Owner Exec 任务\n任务：${args.task}\n理由：${args.reason}\n项目根目录：${root}\n会话工作目录：${agent.session.header.cwd}\n预计步骤：\n${args.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n工具：${allowed.join(', ')}\n仍受 DSH 沙箱限制；本次授权结束后失效。`,
        signal: exec.signal })
      if (outcome !== 'allowed-once') {
        await publishArtifact(claimPath, { binding, decision: outcome })
        return publishArtifact(resultPath, { status: outcome, executed: false })
      }
      exec.signal.throwIfAborted()
      await publishArtifact(claimPath, { binding, decision: outcome, task: args.task, steps: args.steps, reason: args.reason, root, allowed })
      const prompt = [
        'You are a single-use Exec session for one user-approved non-Owner task. Complete only the task and steps below in the project workspace.',
        'You may use the provided tools repeatedly as needed. Do not run an Owner Workflow, delegate, expand the task, change permission settings, or seek another approval.',
        'If a requirement or product decision is missing, stop and report the precise question to the main thread. Report what changed, what was verified and any unfinished work. Do not claim success without evidence.',
        JSON.stringify({ task: args.task, steps: args.steps, reason: args.reason, root }),
      ].join('\n\n')
      const run = await subagents.start('spawn', { parent: agent, label: `Exec: ${args.task.slice(0, 80)}`,
        prompt: [{ type: 'text', text: prompt }], signal: exec.signal, maxDepth: 1,
        toolFilter: { allow: allowed }, persona: 'You are the one-time Exec task agent. Stay within the approved task; report decisions to the main thread.' })
      try {
        const result = await run.result
        if (!run.localAgent || await this.ctx.sessions.flush(run.localAgent.session) !== true) {
          throw new Error('Exec session result was not durably recorded')
        }
        const receipt = { status: 'settled', callId: exec.callId, sessionId: run.id,
          stopReason: result.stopReason, output: result.output,
          ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}) }
        return publishArtifact(resultPath, receipt)
      } finally { await run.dispose() }
    }, { signal: exec.signal })
  }
  checkFilesystemWrite(target, actor, ctx) {
    if (!this.modeEnabledForActor(actor)) return
    const path = (actor.agent.ctx?.get('fs') ?? ctx.get('fs')).processPath(target)
    if (this.modeEnabledForActor(actor) && !this.orchestratorDocumentPath(actor, path)) return { kind: 'deny', reason: 'Orchestrator document boundary rejected this write' }
  }
  assertPlanningSourceWritable(state, root) {
    const workflowIds = new Set(Object.values(state.workflows).filter(workflow => workflow.root === root).map(workflow => workflow.id))
    const busy = Object.values(state.actions).filter(action => workflowIds.has(action.workflowId)
      && ['prepare_workflow', 'prepare_revision', 'change_registry', 'deliver_workflow'].includes(action.kind)
      && (!['succeeded', 'failed', 'cancelled'].includes(action.status) || action.quarantined))
    if (busy.length) throw new Error(`Project checkout is being changed by unsettled actions: ${busy.map(action => `${action.kind}:${action.id}`).join(', ')}. Wait for checkout mutation to settle before writing or finalizing documents.`)
  }
  async withPlanningSourceWrite(agent, callback, signal, root = this.actorRoot({ agent })) {
    await this.ready
    this.rootAgent(agent)
    if (!root) throw new Error('Planning source root is unavailable')
    return this.store.withLockedState(state => this.assertPlanningSourceWritable(state, root), callback, { signal })
  }
  async preparePlanningCheckpoint(agent, input, signal) {
    const root = await this.rootFor(agent)
    const source = await validatePlanningSourceChain({ root, cwd: agent.session.header.cwd, manifest: input.manifest, baseline: input.baseline,
      source: { agentId: agent.id, sessionId: agent.id, chains: input.chains }, supporting: input.supporting })
    return { source, sourceDigest: kernelDigest(source), checkpointCreated: false }
  }
  async checkpointPlanningDocuments(agent, input, exec, { directProceed, implementationRequest } = {}) {
    await this.ready; const root = await this.rootFor(agent)
    const source = { agentId: agent.id, sessionId: agent.id, chains: input.chains }
    const request = { ...input, source, parentSnapshotId: input.parentSnapshotId ?? null }; delete request.chains
    await this.store.bindProject(root)
    return runPlanningCheckpoint({ root, cwd: agent.session.header.cwd, request,
      authorize: binding => authorizePlanningCheckpoint({ ctx: this.ctx, agent, exec, binding, signal: exec.signal, directProceed, implementationRequest }),
      withLease: callback => this.withPlanningSourceWrite(agent, () => withControlLock(join(root, '.dsh-workflow', 'planning.lock'), lease => callback({ signal: exec.signal,
        assertLease: () => { lease.assertHeld(); exec.signal?.throwIfAborted() } }), { signal: exec.signal }), exec.signal, root),
    })
  }
  async finalizePlanningDocuments(agent, exec, implementationRequest) {
    await this.ready
    const root = await this.rootFor(agent)
    const active = Object.values((await this.store.read()).workflows).filter(workflow => workflow.root === root && workflow.rootSessionId === agent.id
      && planningSources(workflow)?.checkpointId && !workflow.cancelRequested && !workflow.delivery)
    if (active.length > 1) throw new Error('Multiple active source parents require reconciliation')
    const parent = active[0] ? await loadPlanningCheckpointSnapshot({ root, id: planningSources(active[0]).checkpointId }) : null
    const bundle = await derivePlanningBundle({ root, cwd: agent.session.header.cwd, agentId: agent.id, sessionId: agent.id,
      parentSnapshot: parent })
    try {
      return await this.checkpointPlanningDocuments(agent, { ...bundle, parentSnapshotId: parent?.id ?? null }, exec, { implementationRequest })
    } catch (error) {
      if (error instanceof PlanningCheckpointError && error.decision !== undefined) return structuredClone(error.decision)
      throw error
    }
  }
  async startWorkflow(agent, { checkpoint_id, request }, exec) {
    await this.ready; const root = await this.rootFor(agent)
    const snapshot = await loadPlanningCheckpointSnapshot({ root, id: checkpoint_id })
    if (snapshot.source.source.sessionId !== agent.id) throw new Error('Checkpoint is from a different root thread')
    const grant = await authorizePlanningCheckpoint({ ctx: this.ctx, agent, exec,
      binding: { root, source: snapshot.source, authorizationId: snapshot.authorization.id } })
    if (kernelDigest(grant) !== kernelDigest(snapshot.authorization)) throw new Error('Checkpoint authorization changed')
    const registry = await loadRegistry(root)
    if (!registry.owners.length) throw new Error('An Owner Registry must be established before compiling this snapshot')
    const identity = kernelDigest([root, agent.id, snapshot.id]).slice(0, 40)
    const id = `wf-${identity}`
    const current = await this.store.read()
    if (current.workflows[id]) return this.status(agent, id)
    const blockers = projectBlockers(current, root, this.store.clock())
    if (blockers.length) throw new Error(`Project already has an active or unresolved workflow: ${blockers.map(item => item.workflowId).join(', ')}. Read workflow_status.projectBlockers. Continue in its original root thread; only an explicitly requested new run may cancel the old workflow through workflow_cancel. Cancellation preserves history and unresolved occupancy.`)
    const ref = `refs/heads/dsh/workflow/ukr-${identity}`
    const baseCommit = snapshot.codeBaseline.checkpointCommit
    const snapshotDigest = kernelDigest(snapshot)
    const sources = { snapshotDigest, sourceDigest: snapshot.sourceDigest, checkpointId: checkpoint_id, codeBaseline: snapshot.codeBaseline }
    const planning = { checkpointId: checkpoint_id, snapshotDigest, registryDigest: kernelDigest(registry), parentVersion: 0,
      sources, authorization: { scope: 'implementation', sourceId: grant.id } }
    // Persist the identity before Git effects. A restarted host reconciles the
    // same allocated ref and cannot create an orphan by repeating workflow_start.
    await this.store.transact({ type: 'workflow.create', id, root, exclusiveRoot: true, rootSessionId: agent.id, request: request ?? snapshot.source.references.spec.id,
      baseCommit, baseBranch: snapshot.codeBaseline.branch, integrationRef: ref, planning, policy: { parallel: registry.config.parallel } }, {
      signal: exec.signal, validate: async () => {
        await assertPlanningCheckout(root, snapshot)
        if (kernelDigest(await loadRegistry(root)) !== planning.registryDigest) throw new Error('Planning Owner registry changed')
      },
    })
    this.runner.start()
    return this.store.readView(id)
  }
  async publicOwnerSeed(state, workflow, issueId) {
    const source = publicOwnerFeedbackSource(state, workflow, issueId)
    if (source.status !== 'matched') return source
    // A pending replan may already have a replacement planningSources value.
    // Public requests remain bound to the currently active plan until activation.
    const active = workflow.activation?.sources
    if (!active?.packagesRef || !active.checkpointId || !active.snapshotDigest) {
      return { status: 'feedback_source_mismatch', reason: 'current_package_missing', issueId }
    }
    let snapshot
    try { snapshot = await loadPlanningCheckpointSnapshot({ root: workflow.root, id: active.checkpointId }) }
    catch { return { status: 'feedback_source_mismatch', reason: 'current_snapshot_unavailable', issueId } }
    if (kernelDigest(snapshot) !== active.snapshotDigest) {
      return { status: 'feedback_source_mismatch', reason: 'current_snapshot_digest_changed', issueId }
    }
    const packages = await readArtifact(active.packagesRef)
    if (!packages) return { status: 'feedback_source_mismatch', reason: 'current_package_artifact_missing', issueId }
    try {
      const planningPackage = planningPackageForTask({ snapshot, plan: workflow.plan, packages,
        taskId: source.task.id, ownerId: source.owner.id })
      return { source, planningPackage, seed: publicOwnerRequestSeed(source, planningPackage, workflow) }
    } catch {
      return { status: 'feedback_source_mismatch', reason: 'current_package_invalid', issueId,
        taskId: source.task.id, ownerId: source.owner.id }
    }
  }
  async publicOwnerSeeds(state, workflow) {
    const issueIds = Object.values(workflow.issues ?? {}).filter(issue => issue.status === 'open').map(issue => issue.id)
    const seeds = []
    for (const issueId of issueIds) {
      const source = publicOwnerFeedbackSource(state, workflow, issueId)
      if (source.status !== 'matched') continue
      const resolved = await this.publicOwnerSeed(state, workflow, issueId)
      if ((resolved.seed ?? resolved).status === 'feedback_not_public_contract') continue
      seeds.push(resolved.seed ?? resolved)
    }
    return seeds
  }
  ownerFeedbackObservations(state, workflow, publicOwnerRequests) {
    const publicIssues = new Set(publicOwnerRequests.map(item => item.issueId))
    const observations = []
    for (const issue of Object.values(workflow.issues ?? {}).filter(item => item.status === 'open' && !publicIssues.has(item.id))) {
      const evidence = ownerFeedbackEvidence(state, workflow, issue)
      if (!evidence) continue
      const attempt = workflow.attempts[evidence.attemptId]
      const task = evidence.source.input?.task
      const verifications = attempt?.dispatchContract?.verifications ?? workflow.plan?.verifications ?? []
      const resource = ownerResourceObservation(evidence.report, task, verifications)
      observations.push(resource ? {
        issueId: issue.id, status: 'runner_verification_pending', taskId: evidence.taskId,
        attemptId: evidence.attemptId, verificationId: resource.verificationId,
        resumeCondition: 'await_bound_candidate_verification',
        ...(resource.migration ? { migration: resource.migration } : {}),
      } : {
        issueId: issue.id, status: 'unclassified_feedback', taskId: evidence.taskId,
        attemptId: evidence.attemptId, resumeCondition: 'requires_explicit_feedback_classification',
      })
    }
    return observations
  }
  async status(agent, workflowId) {
    await this.ready; this.rootAgent(agent)
    const state = await this.store.read()
    const now = this.store.clock()
    if (!workflowId) {
      // Canonicalize the actual caller's project, not a caller-supplied path.
      const cwd = agent.session.header.cwd
      const root = await realpath(await repositoryRoot(cwd).catch(() => cwd))
      const currentRegistry = await readRegistryForProposal(root)
      return {
        workflows: Object.values(state.workflows).filter(workflow => workflow.rootSessionId === agent.id)
          .map(workflow => view(state, workflow.id, now)),
        projectBlockers: projectBlockers(state, root, now),
        registry: { exists: currentRegistry.exists, ...currentRegistry.registry },
        runner: this.runner.health,
      }
    }
    if (!Object.hasOwn(state.workflows, workflowId)) {
      throw new Error(`Unknown workflow: ${workflowId}. workflow_id must be an existing Workflow ID; to view the Registry, call workflow_status({}).`)
    }
    const result = view(state, workflowId, now)
    if (result.rootSessionId !== agent.id) throw new Error('Workflow belongs to a different root thread')
    const publicOwnerRequests = await this.publicOwnerSeeds(state, state.workflows[workflowId])
    return { ...result, publicOwnerRequests,
      ownerFeedbackObservations: this.ownerFeedbackObservations(state, state.workflows[workflowId], publicOwnerRequests),
      runner: this.runner.health }
  }
  async changeRegistry(agent, { operations, reason, workflow_id, checkpoint_id }, exec) {
    await this.ready; const root = await this.rootFor(agent)
    if ((await statusRecords(root, exec.signal, { readOnly: true })).some(item => item.path === '.owner-workflow' || item.path.startsWith('.owner-workflow/'))) throw new Error('Preserve and reconcile existing uncommitted Registry changes before proposing ownership')
    const baseline = { head: await git(root, ['rev-parse', 'HEAD'], exec.signal), ref: await git(root, ['symbolic-ref', 'HEAD'], exec.signal) }
    const target = workflow_id ? await this.workflowFor(agent, workflow_id) : null
    if (target && target.root !== root) throw new Error('Registry target belongs to a different project')
    const before = await readRegistryForProposal(root)
    const proposal = proposeRegistryChange(before.registry, { type: 'batch', operations, reason })
    let pendingSources, sourceInput
    if (checkpoint_id) {
      if (!target) throw new Error('A pending Registry source requires its existing workflow')
      const snapshot = await loadPlanningCheckpointSnapshot({ root, id: checkpoint_id })
      pendingSources = { checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot), sourceDigest: snapshot.sourceDigest, codeBaseline: snapshot.codeBaseline }
      sourceInput = { checkpointId: snapshot.checkpointId, snapshotDigest: pendingSources.snapshotDigest, registryDigest: kernelDigest(before.registry) }
      await this.planning.inputs({ workflowId: target.id, input: sourceInput })
    }
    const id = `registry-${kernelDigest([root, agent.id, exec.callId, proposal.digest]).slice(0, 40)}`
    await this.store.transact({ type: 'registry.request', id, workflowId: target?.id, root, rootSessionId: agent.id, proposal, beforeExists: before.exists, baseline,
      ...(pendingSources ? { planningSources: pendingSources } : {}) }, { signal: exec.signal,
      validate: pendingSources ? () => this.planning.inputs({ workflowId: target.id, input: sourceInput }) : undefined })
    this.runner.start()
    return this.status(agent, target?.id ?? id)
  }
  async workflowFor(agent, workflowId) {
    await this.status(agent, workflowId)
    const workflow = (await this.store.read()).workflows[workflowId]
    if (workflow.cancelRequested) throw new Error('Workflow is cancelled')
    return workflow
  }
  async authorizeRecovery(agent, input, exec) {
    const workflow = await this.workflowFor(agent, input.workflow_id)
    const id = `recovery-${kernelDigest([workflow.id, workflow.recoveryUsed, input.attempts, input.reason]).slice(0, 40)}`
    await this.store.transact({ type: 'recovery.request', workflowId: workflow.id, id,
      attempts: input.attempts, reason: input.reason }, { signal: exec.signal })
    this.runner.start()
    return this.status(agent, workflow.id)
  }
  async retryTask(agent, input, exec) {
    const workflow = await this.workflowFor(agent, input.workflow_id)
    await this.verifyRegistry(workflow)
    const attempt = workflow.attempts[workflow.tasks[input.task_id]?.attemptId]
    if (!attempt?.issueId) throw new Error('Task has no bound recoverable issue')
    await this.store.transact({ type: 'task.retry', workflowId: workflow.id, taskId: input.task_id,
      issueId: attempt.issueId, instructions: input.instructions,
      decisionRef: `root-call:${agent.id}:${exec.callId}` }, { signal: exec.signal })
    this.runner.start()
    return this.status(agent, workflow.id)
  }
  async retryAction(agent, input, exec) {
    const workflow = await this.workflowFor(agent, input.workflow_id)
    const action = (await this.store.read()).actions[input.action_id]
    if (workflow.plan && !['change_registry', 'plan', 'review_plan'].includes(action?.kind)) await this.verifyRegistry(workflow)
    if (['plan', 'review_plan'].includes(action?.kind)) await this.planning.boundInputs(action)
    await this.store.transact({ type: 'action.retry', workflowId: workflow.id, actionId: input.action_id, reason: input.reason,
      decisionRef: `root-call:${agent.id}:${exec.callId}` }, { signal: exec.signal })
    this.runner.start()
    return this.status(agent, workflow.id)
  }
  async replan(agent, input, exec) {
    const workflow = await this.workflowFor(agent, input.workflow_id)
    const state = await this.store.read()
    const currentWorkflow = state.workflows[workflow.id]
    const authoringCandidate = planningAuthoringCandidate(state, currentWorkflow)
    const revisionBoundary = planningRevisionBoundary(input.affected_task_ids, input.affected_verification_ids)
    const sources = planningSources(currentWorkflow)
    if (!sources?.checkpointId) throw new Error('Replanning requires the original native source checkpoint')
    const snapshot = await loadPlanningCheckpointSnapshot({ root: currentWorkflow.root, id: input.checkpoint_id ?? sources.checkpointId })
    const registry = await loadRegistry(currentWorkflow.root)
    const sourceChanged = kernelDigest(snapshot) !== sources.snapshotDigest
    const request = { checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot), registryDigest: kernelDigest(registry),
      parentVersion: currentWorkflow.planVersion, revisionBoundary,
      ...(sourceChanged ? { previousSnapshotDigest: sources.snapshotDigest } : {}),
      sources: sourceChanged ? { checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot), sourceDigest: snapshot.sourceDigest, codeBaseline: snapshot.codeBaseline } : { ...sources, ...(currentWorkflow.registryBaseline?.snapshotDigest === sources.snapshotDigest ? { executionBaseline: currentWorkflow.registryBaseline } : {}) },
      authorization: { scope: 'implementation', sourceId: snapshot.authorization.id },
      previousPlan: authoringCandidate?.plan ?? currentWorkflow.plan,
      previousPlanDigest: authoringCandidate?.planDigest ?? currentWorkflow.activation?.planDigest,
      ...(authoringCandidate ? { previousPlanActionId: authoringCandidate.actionId } : {}),
      revisionReason: input.reason, publicOwnerChangeLog: currentWorkflow.publicOwnerChangeLog ?? null,
      ...planningIssueContext(state, currentWorkflow) }
    if (currentWorkflow.registryBaseline) request.sources = { ...request.sources, registryBaseline: currentWorkflow.registryBaseline }
    await this.planning.inputs({ workflowId: currentWorkflow.id, input: request })
    const integrationHead = currentWorkflow.pendingActivation
      ? await git(currentWorkflow.root, ['rev-parse', currentWorkflow.integrationRef], exec.signal) : undefined
    await this.store.transact({ type: 'planning.request', workflowId: currentWorkflow.id, input: request, integrationHead }, {
      signal: exec.signal, validate: () => this.planning.inputs({ workflowId: currentWorkflow.id, input: request }),
    })
    this.runner.start()
    return this.status(agent, currentWorkflow.id)
  }
  async requestPublicOwner(agent, input, exec) {
    const workflow = await this.workflowFor(agent, input.workflow_id)
    await this.verifyRegistry(workflow)
    const state = await this.store.read()
    const resolved = await this.publicOwnerSeed(state, workflow, input.source_issue_id)
    if (!resolved.source || !resolved.planningPackage) return resolved.seed ?? resolved
    const materialized = materializePublicOwnerRequest({ workflow, source: resolved.source,
      planningPackage: resolved.planningPackage, input })
    if (materialized.accepted !== true) return materialized
    const context = normalizePublicOwnerContext(materialized.context)
    const request = normalizePublicOwnerChangeRequest(materialized.request, context)
    await this.store.transact({ type: 'public_owner.request', workflowId: workflow.id, request, context }, { signal: exec.signal })
    this.runner.start()
    return this.status(agent, workflow.id)
  }
  async cancelWorkflow(agent, workflowId, exec) {
    await this.ready; this.rootAgent(agent)
    const workflow = (await this.store.read()).workflows[workflowId]
    if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`)
    let evidenceRef
    if (workflow.rootSessionId !== agent.id) {
      const cwd = agent.session.header.cwd
      const root = await realpath(await repositoryRoot(cwd).catch(() => cwd))
      if (workflow.root !== root) throw new Error('Workflow belongs to a different project')
      if (!exec?.callId || exec.agent !== agent) throw new Error('Cross-thread cancellation requires a native root call')
      const id = `cancel-${kernelDigest([workflow.id, workflow.rootSessionId, agent.id, exec.callId]).slice(0, 40)}`
      const question = { id, header: '旧工作流处理', question: '是否取消同项目旧工作流，以便开始用户要求的新一轮验收？',
        detail: crossThreadCancellationDetail({ root, workflowId: workflow.id,
          originalSessionId: workflow.rootSessionId, requestingSessionId: agent.id }),
        options: [{ label: '取消该旧工作流', description: '通过正常生命周期停止旧流程，保留历史与隔离资源。' },
          { label: '保留旧工作流', description: '不改变旧流程，本轮启动继续等待。' }], multiSelect: false }
      const answer = await askNativeQuestion(this.ctx.userQuestions, { agent, questions: [question], signal: exec.signal })
      evidenceRef = artifactPath(join(this.store.directory, 'decisions'), id)
      await publishArtifact(evidenceRef, { question, answer, workflowId, root, rootSessionId: workflow.rootSessionId,
        requestingRootSessionId: agent.id, callId: exec.callId })
      const choice = answer?.answers?.length === 1 ? answer.answers[0] : null
      if (answer?.cancelled || choice?.id !== id || choice?.selected?.length !== 1
        || choice.selected[0] !== '取消该旧工作流' || choice.custom?.trim()) throw new Error('Cross-thread cancellation not approved')
    }
    await this.store.transact({ type: 'workflow.cancel', workflowId,
      ...(evidenceRef ? { requestedByRootSessionId: agent.id, evidenceRef } : {}) }, { signal: exec?.signal,
      validate: state => {
        this.rootAgent(agent)
        const current = state.workflows[workflowId]
        if (current?.root !== workflow.root || current?.rootSessionId !== workflow.rootSessionId) throw new Error('Cancellation target changed')
      } })
    this.runner.start()
    return this.store.readView(workflowId)
  }
  async dispose() {
    try { await this.ready } catch { return }
    // Keep executor fencing until every owned writer has actually unwound.
    // A failed close retains the lock rather than granting a second host access.
    await this.runner.close(); await this.commands.close(); await this.sessions.close()
    for (const dispose of this.documentGuards ?? []) dispose()
    await this.host.close()
  }
}
