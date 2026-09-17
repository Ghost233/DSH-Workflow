import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { kernelNativeHost } from './kernel-native-host.mjs'
import { KernelRuntime } from '../../src/kernel-runtime.mjs'
import { git } from '../../src/git.mjs'
import { ensureRegistry, proposeRegistryChange, applyApprovedRegistryChange, loadRegistry } from '../../src/registry.mjs'
import { registerKernelRoot } from '../../src/kernel-plugin.mjs'
import { listCompletedPlanningCheckpointSnapshots } from '../../src/planning-checkpoint.mjs'
import { kernelToolDefinitions } from '../../src/kernel-tools.mjs'
import { kernelDigest } from '../../src/workflow-engine.mjs'
import { readSessionEvents } from '../../src/dsh-execution.mjs'
import { WorkflowStore } from '../../src/workflow-store.mjs'
import { waitForWorkflowProgress } from './workflow-progress-wait.mjs'

function *call(id, name, args) {
  const value = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: value }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: value } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
function boundedOwnerToolEvents(events) {
  const calls = new Map(events.filter(event => event.type === 'tool/call')
    .map(event => [event.data.callId, event.data.name]))
  return events.flatMap(event => {
    if (event.type === 'tool/call') {
      return event.data.name === 'owner_submit'
        ? [{ type: event.type, seq: event.seq, callId: event.data.callId, name: event.data.name }]
        : []
    }
    if (event.type !== 'tool/result') return []
    const result = event.data.message.content.find(block => block.type === 'tool-result')
    const callId = event.data.message.source?.callId ?? result?.toolCallId
    const name = calls.get(callId)
    if (name !== 'owner_submit' && (!['write', 'edit'].includes(name) || result?.isError !== true)) return []
    const summary = result?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n').slice(0, 800)
    return [{ type: event.type, seq: event.seq, callId, name, isError: result?.isError === true,
      ...(summary ? { summary } : {}) }]
  })
}
function document(kind, value, body) {
  const { path, ...declaration } = value
  return `---\nplanning_document: DSH_PLANNING_DOCUMENT_V1\ndocument_kind: ${kind}\ndocument_id: ${value.id}\ndocument_revision: ${value.revision}\n`
    + (kind === 'ticket' ? `spec_id: ${value.spec.id}\nspec_revision: ${value.spec.revision}\n` : '')
    + `planning_declaration: ${JSON.stringify(declaration)}\n---\n\n# ${value.id}\n\n${body}\n`
}
const reviewScopeScenario = process.env.UKR_NATIVE_REVIEW_SCOPE_FIXTURE === '1'
const spec = { id: 'SPEC-NATIVE', revision: 'R1', path: 'docs/specs/native/spec.md', acceptanceCriteria: ['AC-NATIVE'], contracts: [{ id: 'source', revision: 'v1' }] }
const ticket = { id: 'TICKET-NATIVE', revision: 'R1', path: 'docs/specs/native/tickets/T1.md', spec: { id: spec.id, revision: spec.revision },
  acceptanceCriteria: [{ id: 'AC-NATIVE', specId: spec.id, specRevision: spec.revision }], contracts: spec.contracts,
  dependsOn: [], work: { ready: reviewScopeScenario ? [{ id: 'source-value' }, { id: 'source-secondary' }] : [{ id: 'source-value' }], blocked: [] } }
const presetScenario = process.env.UKR_NATIVE_PRESET_FIXTURE === '1'
const fullPresetScenario = process.env.UKR_NATIVE_FULL_PRESET_FIXTURE === '1'
const registryScenario = process.env.UKR_NATIVE_REGISTRY_REVISION_FIXTURE === '1'
let registryStep = 0
const initialRevisionScenario = process.env.UKR_NATIVE_INITIAL_REVISION_FIXTURE === '1'
const revisionScenario = process.env.UKR_NATIVE_REVISION_FIXTURE === '1'
const planningFeedbackScenario = process.env.UKR_NATIVE_PLANNING_FEEDBACK_FIXTURE === '1'
const planningPreflightScenario = process.env.UKR_NATIVE_PLANNING_PREFLIGHT_FIXTURE === '1'
const closurePreflightScenario = process.env.UKR_NATIVE_CLOSURE_PREFLIGHT_FIXTURE === '1'
const repairScenario = process.env.UKR_NATIVE_REPAIR_FIXTURE === '1' || revisionScenario || registryScenario
const freshAttempt = revisionScenario || registryScenario
const clarifiedCompletion = 'Source equals exactly "changed"; partial values such as "almost" are rejected by the Node test'
let revisionStep = 0, revisedSnapshot, planningFeedbackQuestions = 0
let mainStep = 0, ownerStep = 0, planReviewSubmitStep = 0, planValue, runtime, host, workflowId, checkpoint, registry, retryIssued = false, restoredCandidate = false
const reviewOwnerSteps = new Map(), reviewOwnersEntered = new Set(), reviewOwnersReady = Promise.withResolvers()
const reviewOwnersSubmitted = new Set(), reviewOwnersSubmittedTogether = Promise.withResolvers(), reviewerScopes = new Set()
async function *model(options) {
  const serialized = JSON.stringify(options)
  if (serialized.includes('Compile this frozen Spec/Ticket snapshot')) {
    const submitted = structuredClone(planValue)
    delete submitted.registryDigest
    const report = revisionScenario && retryIssued ? { planPatch: {
      tasks: submitted.tasks, verifications: [], planningBindings: submitted.planningBindings,
    } } : { plan: submitted }
    yield* call('planner-result', 'workflow_action_submit', { report }); return
  }
  if (serialized.includes('Independently review the frozen Spec/Tickets')) {
    planReviewSubmitStep++
    const closureIssue = { obligationId: 'plan-contract-closure', sourceId: 'SPEC-NATIVE', sourceVersion: 'R1',
      targetTaskIds: ['T1'], severity: 'medium', title: 'The revised task must be executable',
      detail: 'Bind the revised source to its executable task.', suggestion: 'Review the revised task and explicitly close this obligation.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'T1' } }
    const closureAction = closurePreflightScenario && planReviewSubmitStep >= 3
      ? Object.values((await runtime.store.read()).actions).filter(action => action.kind === 'review_plan').at(-1) : null
    const executionIssue = { obligationId: planningPreflightScenario && planReviewSubmitStep === 1 ? 'invalid/obligation' : 'verified-source',
      sourceId: ticket.id, sourceVersion: ticket.revision, targetTaskIds: ['T1'], severity: 'medium',
      title: 'The fixed source verification must pass.', detail: 'The task result must carry the fixed unit verification.',
      suggestion: 'Keep the current task verification binding.',
      closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' } }
    yield* call(`plan-review-result-${planReviewSubmitStep}`, 'workflow_action_submit', { report: { review: {
      contract: 'DSH_PLAN_REVIEW_V1', status: initialRevisionScenario && !retryIssued ? 'needs_revision' : 'passed',
      summary: 'Bound source contract has an executable module task and fixed acceptance.',
      issues: planningPreflightScenario ? [executionIssue] : closurePreflightScenario && planReviewSubmitStep === 1 ? [closureIssue] : [],
      ...(closureAction ? { obligationClosures: [{ obligationId: closureIssue.obligationId,
        ...closureIssue.closeWhen, planDigest: closureAction.input.planDigest }] } : {}),
    } } }); return
  }
  if (serialized.includes('Summarize only this sealed Owner history')) {
    const sourceDigest = /sourceDigest\\?"\s*:\s*\\?"([a-f0-9]{64})/.exec(serialized)?.[1]
    const worklogRef = /worklogRef\\?"\s*:\s*\\?"([^"\\]+)\\?"/.exec(serialized)?.[1]
    yield* call('summary', 'workflow_action_submit', { report: { sourceDigest, worklogRef, summary: 'Source now meets the frozen Spec and fixed verification.' } }); return
  }
  const candidateCommit = /commitSha\\?"\s*:\s*\\?"([a-f0-9]{40,64})/.exec(serialized)?.[1]
  if (candidateCommit && options.tools?.some(tool => tool.name === 'workflow_action_submit')) {
    const scope = /"task\\?"\s*:\s*\{[^{}]*"id\\?"\s*:\s*\\?"(combined|final)\\?"/.exec(serialized)?.[1]
    if (scope) {
      assert.match(serialized, /planningPackages|planningPackage/, `${scope} Reviewer receives its frozen task package projection`)
      assert.match(serialized, /test\/(?:value|secondary)\.test\.mjs/, `${scope} Reviewer receives fixed verification argv and cwd`)
      assert.doesNotMatch(serialized, /test-grant-1/, `${scope} Reviewer does not receive planning authorization receipts`)
      reviewerScopes.add(scope)
    }
    yield* call('candidate-review', 'workflow_action_submit', { report: { passed: true, commitSha: candidateCommit, reasons: ['Fixture checks native source binding; the actual fixed test checks behavior.'] } }); return
  }
  if (options.tools?.some(tool => tool.name === 'owner_submit')) {
    if (presetScenario || fullPresetScenario) {
      assert.ok(options.tools.some(tool => tool.name === 'read'))
      assert.ok(options.tools.some(tool => tool.name === 'edit'))
      assert.equal(serialized.includes('MAIN_THREAD_ONLY_PRESET_GUIDANCE'), false)
    }
    if (reviewScopeScenario) {
      const taskId = /"taskId\\?"\s*:\s*\\?"(T1|T2)\\?"/.exec(serialized)?.[1]
      assert.ok(taskId, 'Owner receives its exact frozen task package')
      const module = taskId === 'T1' ? 'value' : 'secondary'
      const step = (reviewOwnerSteps.get(taskId) ?? 0) + 1
      reviewOwnerSteps.set(taskId, step); ownerStep++
      if (step === 1) {
        reviewOwnersEntered.add(taskId)
        if (reviewOwnersEntered.size === 2) reviewOwnersReady.resolve()
        let timer
        try { await Promise.race([reviewOwnersReady.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Independent planned Owners did not overlap')), 5_000) })]) }
        finally { clearTimeout(timer) }
        yield* call(`review-scope-read-${taskId}`, 'read', { file_path: `src/${module}` })
      } else if (step === 2) {
        yield* call(`review-scope-edit-${taskId}`, 'edit', { file_path: `src/${module}`, old_string: 'base', new_string: 'changed' })
      } else if (step === 3) {
        reviewOwnersSubmitted.add(taskId)
        if (reviewOwnersSubmitted.size === 2) reviewOwnersSubmittedTogether.resolve()
        let timer
        try { await Promise.race([reviewOwnersSubmittedTogether.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Independent planned Owners did not submit together')), 5_000) })]) }
        finally { clearTimeout(timer) }
        yield* call(`review-scope-submit-${taskId}`, 'owner_submit', { report: { status: 'completed', summary: `Implement the frozen ${module} source Ticket.` } })
      } else throw new Error('Review-scope Owner must conclude after submission')
      return
    }
    ownerStep++
    if (ownerStep === 1) yield* call('owner-read', 'read', { file_path: 'src/value' })
    else if (ownerStep === 2) yield* call('owner-edit', 'edit', { file_path: 'src/value', old_string: 'base', new_string: repairScenario ? 'almost' : 'changed' })
    else if (ownerStep === 3) yield* call('owner-submit', 'owner_submit', { report: { status: 'completed', summary: 'Implement the frozen source-value Ticket.' } })
    else if (repairScenario && ownerStep === 4) {
      const active = [...runtime.sessions.live.values()].find(entry => entry.binding.role === 'owner')
      assert.equal(await readFile(join(active.binding.worktree, 'src/value'), 'utf8'), freshAttempt ? 'base' : 'almost')
      restoredCandidate = !freshAttempt
      yield* call('repair-read', 'read', { file_path: 'src/value' })
    }
    else if (repairScenario && ownerStep === 5) yield* call('repair-edit', 'edit', { file_path: 'src/value', old_string: freshAttempt ? 'base' : 'almost', new_string: 'changed' })
    else if (repairScenario && ownerStep === 6) yield* call('repair-submit', 'owner_submit', { report: { status: 'completed', summary: 'Repair the actual failed verification using the retained candidate.' } })
    else throw new Error('Owner must conclude after submission')
    return
  }
  mainStep++
  if (mainStep === 1) yield* call('main-read-spec', 'read', { file_path: spec.path })
  else if (mainStep === 2) yield* call('main-edit-spec', 'edit', { file_path: spec.path, old_string: 'Draft requirement.', new_string: 'Source value must become changed; the actual Node test must pass.' })
  else if (mainStep === 3) yield* call('main-read-ticket', 'read', { file_path: ticket.path })
  else if (mainStep === 4) yield* call('main-edit-ticket', 'edit', { file_path: ticket.path, old_string: 'Draft implementation.', new_string: 'Update src/value within the API Owner boundary, then verify the source value.' })
  else if (mainStep === 5) yield* call('main-finalize', 'workflow_planning_finalize', planningFeedbackScenario ? {}
    : { implementation_request: { quote: '再完成开发及验收', rationale: 'The Spec and Ticket implement the user-requested source value and its local verification.' } })
  else if (mainStep === 6) {
    if (planningFeedbackScenario) {
      assert.match(serialized, /revision_requested/)
      assert.match(serialized, /请先修正验证命令和任务依赖/)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '已收到规划修订意见，未启动实施。' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const [snapshot] = await listCompletedPlanningCheckpointSnapshots({ root: project })
    if (!snapshot) throw new Error('No completed native source checkpoint')
    checkpoint = { snapshot, checkpointId: snapshot.checkpointId }
    const tasks = reviewScopeScenario
      ? [{ id: 'T1', title: 'Implement source value', role: 'work', ownerId: 'api', dependsOn: [], resources: [], write: ['src/value'], verify: ['unit-value'], done: ['Source value is changed and its Node test passes'] },
        { id: 'T2', title: 'Implement secondary source', role: 'work', ownerId: 'secondary', dependsOn: [], resources: [], write: ['src/secondary'], verify: ['unit-secondary'], done: ['Secondary source is changed and its Node test passes'] }]
      : [{ id: 'T1', title: 'Implement source value', role: 'work', ownerId: 'api', dependsOn: [], resources: [], write: ['src/**'], verify: ['unit'], done: ['Source is changed and the Node test passes'] }]
    const verifications = reviewScopeScenario
      ? [{ id: 'unit-value', run: [process.execPath, '--test', 'test/value.test.mjs'] }, { id: 'unit-secondary', run: [process.execPath, '--test', 'test/secondary.test.mjs'] }]
      : [{ id: 'unit', run: [process.execPath, '--test', 'test/value.test.mjs'] }]
    planValue = { contract: 'DSH_PLAN_V2', summary: 'Native source-to-delivery fixture', registryDigest: kernelDigest(registry), owners: registry.owners,
      tasks, verifications, planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: snapshot.id, sourceDigest: snapshot.sourceDigest,
        tasks: reviewScopeScenario
          ? [{ taskId: 'T1', tickets: [{ id: ticket.id, revision: ticket.revision, fragments: ['source-value'] }], contracts: spec.contracts },
            { taskId: 'T2', tickets: [{ id: ticket.id, revision: ticket.revision, fragments: ['source-secondary'] }], contracts: spec.contracts }]
          : [{ taskId: 'T1', tickets: [{ id: ticket.id, revision: ticket.revision, fragments: ['source-value'] }], contracts: spec.contracts }] } }
    yield* call('main-start', 'workflow_start', { checkpoint_id: snapshot.checkpointId, request: 'Implement the source value from the native main-thread Spec and Ticket' })
  }
  else {
    if (initialRevisionScenario && !retryIssued) {
      const workflow = Object.values((await runtime.store.read()).workflows)[0]
      if (workflow?.planningFailure === 'revision_required') { retryIssued = true; revisionStep = 1 }
    }
    if (repairScenario && !retryIssued) {
      const workflow = Object.values((await runtime.store.read()).workflows)[0]
      const attempt = workflow?.attempts[workflow.tasks.T1?.attemptId]
      if (attempt?.phase === 'failed' && attempt.issueId) {
        retryIssued = true
        if (registryScenario) {
          registryStep = 1
          yield* call('active-registry-change', 'workflow_registry_change', { workflow_id: workflow.id, reason: 'Narrow the API Owner to its exact module file', operations: [
            { type: 'remove', ownerId: 'api', reason: 'Replace broad module responsibility' },
            { type: 'add', owner: { ...registry.owners[0], scope: ['src/value'] }, reason: 'Exact source file responsibility' } ] })
          return
        }
        if (revisionScenario) { revisionStep = 1 }
        else { yield* call('main-repair', 'workflow_retry_task', { workflow_id: workflow.id, task_id: 'T1', instructions: 'The fixed test requires changed, but the submitted candidate says almost. Repair that exact value and reuse the current Ticket.' })
        return }
      }
    }
    if (registryStep === 1) {
      const workflow = Object.values((await runtime.store.read()).workflows)[0]
      if (workflow.pendingRegistry?.phase === 'replan_required') {
        registryStep = 2; registry = await loadRegistry(project)
        planValue = { ...planValue, registryDigest: kernelDigest(registry), owners: registry.owners, tasks: planValue.tasks.map(task => ({ ...task, write: ['src/value'] })) }
        yield* call('registry-replan', 'workflow_replan', { workflow_id: workflow.id, affected_task_ids: ['T1'], affected_verification_ids: [], reason: 'Use the approved narrower Owner scope while preserving the same Spec, Ticket, fixed test and failure budget' })
        return
      }
    }
    if (revisionStep) {
      const step = revisionStep++
      const nextSpec = { ...spec, revision: 'R2' }
      const nextTicket = { ...ticket, revision: 'R2', spec: { ...ticket.spec, revision: 'R2' }, acceptanceCriteria: ticket.acceptanceCriteria.map(item => ({ ...item, specRevision: 'R2' })) }
      if (step === 1) yield* call('revision-read-spec', 'read', { file_path: spec.path })
      else if (step === 2) yield* call('revision-edit-spec', 'edit', { file_path: spec.path, old_string: document('spec', spec, 'Source value must become changed; the actual Node test must pass.'), new_string: document('spec', nextSpec, 'Clarified requirement: the complete value is changed, without a partial value.') })
      else if (step === 3) yield* call('revision-read-ticket', 'read', { file_path: ticket.path })
      else if (step === 4) yield* call('revision-edit-ticket', 'edit', { file_path: ticket.path, old_string: document('ticket', ticket, 'Update src/value within the API Owner boundary, then verify the source value.'), new_string: document('ticket', nextTicket, 'Implement the clarified source value and retain the full existing fixed test.') })
      else if (step === 5) yield* call('revision-finalize', 'workflow_planning_finalize', { implementation_request: { quote: '再完成开发及验收', rationale: 'This technical revision preserves the same requested source value and acceptance test.' } })
      else if (step === 6) {
        const snapshots = await listCompletedPlanningCheckpointSnapshots({ root: project })
        revisedSnapshot = snapshots.find(item => item.parentSnapshotId === checkpoint.snapshot.id)
        assert.ok(revisedSnapshot, 'revised source checkpoint must retain its parent')
        planValue = { ...planValue,
          tasks: planValue.tasks.map(task => task.id === 'T1' ? { ...task, done: [clarifiedCompletion] } : task),
          planningBindings: { ...planValue.planningBindings, snapshotId: revisedSnapshot.id, sourceDigest: revisedSnapshot.sourceDigest,
            tasks: [{ taskId: 'T1', tickets: [{ id: ticket.id, revision: 'R2', fragments: ['source-value'] }], contracts: spec.contracts }] } }
        const workflow = Object.values((await runtime.store.read()).workflows)[0]
        yield* call('revision-replan', 'workflow_replan', { workflow_id: workflow.id, affected_task_ids: ['T1'], affected_verification_ids: [], checkpoint_id: revisedSnapshot.checkpointId, reason: 'Bind the clarified R2 Spec/Ticket to the same task and fixed acceptance; keep the existing failure and budget.' })
      } else revisionStep = 0
      if (step <= 6) return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Waiting for the runner or receiving its result.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-planning-')))
const project = join(root, 'project'); await mkdir(project)
const errors = [], disposers = []
try {
  await git(project, ['init', '-q'])
  await mkdir(join(project, 'src')); await mkdir(join(project, 'test')); await mkdir(join(project, 'docs/specs/native/tickets'), { recursive: true })
  await writeFile(join(project, 'src/value'), 'base')
  if (reviewScopeScenario) await writeFile(join(project, 'src/secondary'), 'base')
  await writeFile(join(project, spec.path), document('spec', spec, 'Draft requirement.'))
  await writeFile(join(project, ticket.path), document('ticket', ticket, 'Draft implementation.'))
  await writeFile(join(project, 'test/value.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test('frozen source-value AC',()=>assert.equal(readFileSync('src/value','utf8'),'changed'))")
  if (reviewScopeScenario) await writeFile(join(project, 'test/secondary.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test('frozen source-secondary AC',()=>assert.equal(readFileSync('src/secondary','utf8'),'changed'))")
  registry = await ensureRegistry(project)
  const proposal = proposeRegistryChange(registry, { type: 'add', owner: { id: 'api', name: 'API', description: 'Source module', scope: reviewScopeScenario ? ['src/value'] : ['src/**'], exclude: [] }, reason: 'Fixed test module boundary' })
  registry = await applyApprovedRegistryChange(project, { ...proposal, approvedDigest: proposal.digest })
  if (reviewScopeScenario) {
    const secondaryProposal = proposeRegistryChange(registry, { type: 'add', owner: { id: 'secondary', name: 'Secondary', description: 'Secondary source module', scope: ['src/secondary'], exclude: [] }, reason: 'Independent fixed test module boundary' })
    registry = await applyApprovedRegistryChange(project, { ...secondaryProposal, approvedDigest: secondaryProposal.digest })
  }
  await git(project, ['add', '.']); await git(project, ['commit', '-qm', 'fixture baseline'])
  const gitConfiguration = await readFile(join(project, '.git/config'), 'utf8')
  let presetDirectory
  if (presetScenario) {
    presetDirectory = join(root, 'presets')
    const preset = join(presetDirectory, 'owner-fixture'); await mkdir(preset, { recursive: true })
    await writeFile(join(preset, 'prompt.mjs'), `export const inject=['systemPrompt']; export function apply(ctx){ctx.systemPrompt.section({name:'owner-workflow:kernel',order:-20,text:'MAIN_THREAD_ONLY_PRESET_GUIDANCE'})}`)
    await writeFile(join(preset, 'agent.cordis.yml'), JSON.stringify([
      { id: 'fs-tools', name: fileURLToPath(new URL('../../../deepseek-harness/packages/fs/tool-fs/lib/index.js', import.meta.url)) },
      { id: 'root-guidance', name: './prompt.mjs' }
    ]))
  }
  if (fullPresetScenario) {
    presetDirectory = fileURLToPath(new URL('../../kernel-presets', import.meta.url))
    // This process is a disposable fixture child; never mount a runtime in the real catalog.
    process.env.DSH_OWNER_WORKFLOW_CATALOG_ROOT = root
    process.chdir(project)
  }
  host = await kernelNativeHost(project, { executable: true, filesystem: true, model, persistenceRoot: join(root, 'sessions'), presetDirectory,
    ...(fullPresetScenario ? { fullPreset: true, presetId: 'owner-workflow' } : {}) })
  if (registryScenario || planningFeedbackScenario) {
    const { default: UserQuestions } = await import('../../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
    await host.ctx.plugin(UserQuestions)
    host.ctx.on('user-questions/request', async request => {
      if (planningFeedbackScenario) {
        planningFeedbackQuestions++
        return { answers: [{ id: request.questions[0].id, selected: [], custom: '请先修正验证命令和任务依赖，再提交规划。' }] }
      }
      return { answers: [{ id: request.questions[0].id, selected: ['应用这批职责'] }] }
    })
  }
  if (fullPresetScenario) {
    runtime = { store: new WorkflowStore(root), dispose: async () => {} }
    assert.ok(host.parent.agent.ctx.tools.get('workflow_start', host.parent.agent), 'actual preset must register the kernel')
    assert.equal(host.ctx.tools.get('read'), undefined)
  } else {
    runtime = new KernelRuntime(host.ctx, { catalogRoot: root, onError: error => errors.push(String(error.stack ?? error)) })
    await runtime.ready
    disposers.push(registerKernelRoot(host.parent.agent.ctx, runtime))
  }
  host.parent.agent.followup({ id: 'actual-user-request', role: 'user', content: [{ type: 'text', text: '把 source value 修改为 changed。先在主线程完善 Spec 和 Ticket，再完成开发及验收。' }], source: { kind: 'user' } })
  await host.parent.agent.whenIdle()
  await host.ctx.sessions.flush(host.parent.agent.session)
  workflowId = Object.keys((await runtime.store.read()).workflows)[0]
  if (planningFeedbackScenario) {
    const events = (await readSessionEvents(host.ctx.sessionPersistence, host.parent.agent.id)).events
    const persisted = JSON.stringify(events)
    assert.match(persisted, /DSH_PLANNING_AUTHORIZATION_DECISION_V1/)
    assert.match(persisted, /revision_requested/)
    assert.match(persisted, /请先修正验证命令和任务依赖/)
    assert.equal(planningFeedbackQuestions, 1)
    assert.equal(workflowId, undefined)
    assert.deepEqual(await listCompletedPlanningCheckpointSnapshots({ root: project }), [])
    assert.equal(await git(project, ['rev-list', '--count', 'HEAD']), '1')
    console.log(JSON.stringify({ status: 'passed', actualPersistedPlanningFeedback: true, planningFeedbackQuestions }))
  } else {
  const wait = workflowId ? await waitForWorkflowProgress({
    readView: () => runtime.store.readView(workflowId),
    shouldStop: view => (view.terminal && (!(repairScenario || initialRevisionScenario) || view.status === 'completed')) || errors.length > 0,
    idleMs: 10_000,
    absoluteMs: 40_000,
  }) : { view: undefined, reason: 'workflow_missing', elapsedMs: 0 }
  const { view } = wait
  if (view?.status !== 'completed') {
    const events = (await readSessionEvents(host.ctx.sessionPersistence, host.parent.agent.id)).events
    const control = await runtime.store.read()
    const failedWorkflow = control.workflows[workflowId]
    const verification = Object.values(failedWorkflow?.attempts ?? {}).map(attempt => attempt.verification).filter(Boolean)
    const ownerDiagnostics = await Promise.all(Object.values(failedWorkflow?.attempts ?? {}).map(async attempt => {
      const action = Object.values(control.actions).find(item => item.kind === 'execute_owner' && item.attemptId === attempt.id)
      const sessionEvents = attempt.sessionId
        ? (await readSessionEvents(host.ctx.sessionPersistence, attempt.sessionId)).events
        : []
      return { actionId: action?.id, attemptId: attempt.id, sessionId: attempt.sessionId,
        submissionId: attempt.submission?.id, writeFrozen: attempt.writeFrozen === true, phase: attempt.phase,
        toolEvents: boundedOwnerToolEvents(sessionEvents) }
    }))
    const planningDiagnostics = await Promise.all(Object.values(control.actions).filter(action => ['plan', 'review_plan'].includes(action.kind))
      .map(async action => ({ actionId: action.id, kind: action.kind, status: action.status, result: action.result,
        events: action.evidence?.sessionId ? (await readSessionEvents(host.ctx.sessionPersistence, action.evidence.sessionId)).events.slice(-12) : [] })))
    console.error(JSON.stringify({ errors, wait: { reason: wait.reason, elapsedMs: wait.elapsedMs }, view, verification,
      ownerDiagnostics, planningDiagnostics, mainStep, mainEvents: events.slice(-10) }))
  }
  assert.equal(view?.status, 'completed')
  assert.equal(await readFile(join(project, 'src/value'), 'utf8'), 'changed')
  if (reviewScopeScenario) assert.equal(await readFile(join(project, 'src/secondary'), 'utf8'), 'changed')
  assert.equal(view.delivery.commitSha, await git(project, ['rev-parse', 'HEAD']))
  assert.ok(checkpoint.snapshot.id)
  assert.equal(await readFile(join(project, '.git/config'), 'utf8'), gitConfiguration)
  if (reviewScopeScenario) assert.deepEqual([...reviewerScopes].sort(), ['combined', 'final'], 'the real KernelRuntime dispatches bound planning packages to combined and final reviewers')
  if (repairScenario) {
    const current = (await runtime.store.read()).workflows[workflowId]
    assert.equal(Object.keys(current.attempts).length, 2)
    assert.equal(current.recoveryUsed, 1)
    assert.equal(Object.values(current.issues).filter(issue => issue.status === 'open').length, 0)
    assert.equal(restoredCandidate, !freshAttempt)
    if (registryScenario) {
      assert.equal(current.planVersion, 2)
      assert.equal(current.registryHistory.length, 1)
      assert.equal(current.baseCommit, current.registryBaseline.commitSha)
      assert.equal(current.activation.sources.snapshotDigest, checkpoint.snapshot && kernelDigest(checkpoint.snapshot))
      assert.equal(current.pendingRegistry, null)
    }
    if (revisionScenario) {
      assert.equal(current.planVersion, 2)
      assert.equal(current.activation.sources.checkpointId, revisedSnapshot.checkpointId)
      assert.equal(current.baseCommit, revisedSnapshot.codeBaseline.checkpointCommit)
      assert.equal(current.retiredTasks.length, 1)
      assert.deepEqual(current.plan.tasks.find(task => task.id === 'T1').done, [clarifiedCompletion])
    }
  }
  if (initialRevisionScenario) {
    const current = (await runtime.store.read()).workflows[workflowId]
    assert.equal(Object.keys(current.attempts).length, 1)
    assert.equal(current.planVersion, 1)
    assert.equal(current.recoveryUsed, 1, 'only the explicit root revision is charged; review never dispatches an automatic retry')
    assert.equal(current.activation.sources.checkpointId, revisedSnapshot.checkpointId)
    assert.equal(current.baseCommit, revisedSnapshot.codeBaseline.checkpointCommit)
    assert.equal(Object.values(current.issues).filter(issue => issue.status === 'open').length, 0)
  }
  if (closurePreflightScenario) {
    const control = await runtime.store.read()
    const reviews = Object.values(control.actions).filter(action => action.kind === 'review_plan')
    assert.equal(reviews.length, 2, 'missing closure is corrected inside the second Reviewer action')
    assert.equal(planReviewSubmitStep, 3, 'one rejected and one corrected report share the revised review session')
    const events = (await readSessionEvents(host.ctx.sessionPersistence, reviews[1].result.sessionId)).events
    assert.match(JSON.stringify(events.filter(event => event.type === 'tool/result')), /passed review lacks verified obligationClosures/)
    assert.equal(control.workflows[workflowId].recoveryUsed, 1)
  }
  if (planningPreflightScenario) {
    const control = await runtime.store.read()
    const review = Object.values(control.actions).find(action => action.kind === 'review_plan')
    const reviewEvents = (await readSessionEvents(host.ctx.sessionPersistence, review.result.sessionId)).events
    const submitResults = reviewEvents.filter(event => event.type === 'tool/result').map(event => event.data.message.content
      .find(block => block.type === 'tool-result')).filter(Boolean)
    assert.equal(submitResults.length, 2)
    assert.equal(submitResults[0].isError, true)
    assert.match(JSON.stringify(submitResults[0]), /review\.issues\[\]\.obligationId.*letters.*digits/u)
    assert.equal(submitResults[1].isError, false)
    assert.equal(control.workflows[workflowId].issues['invalid/obligation'], undefined)
    assert.equal(control.workflows[workflowId].issues['verified-source'].status, 'closed')
  }
  console.log(JSON.stringify({ status: 'passed', actualFullPreset: fullPresetScenario, actualInitialSourceRevision: initialRevisionScenario, actualActiveRegistryRevision: registryScenario, actualPlanningPreflight: planningPreflightScenario, actualScopedPresetTools: presetScenario, counts: view.counts, actualNativeSourceWrites: true, actualRegistryValidation: true, actualCandidateRepair: restoredCandidate, actualSourceRevision: Boolean(revisedSnapshot),
    actualExecutionContractRevision: Boolean(revisedSnapshot) && planValue.tasks.find(task => task.id === 'T1')?.done.includes(clarifiedCompletion),
    reviewerScopes: [...reviewerScopes].sort(), model: 'deterministic' }))
  }
} finally {
  for (const dispose of disposers.reverse()) dispose?.()
  await runtime?.dispose(); await host?.close(); await rm(root, { recursive: true, force: true })
}
