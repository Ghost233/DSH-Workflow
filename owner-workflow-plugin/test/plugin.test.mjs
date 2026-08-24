import test from 'node:test'
import assert from 'node:assert/strict'
import plugin, {
  askWorkflowDecision,
  confirmOwnerChangeApproval,
  confirmPlanApproval,
  confirmPlanRevisionExtension,
  confirmWorkflowCancellation,
} from '../index.js'
import { OWNER_WORKFLOW_SKILLS } from '../src/skills.mjs'
import { ownerRolePrompt, ownerTaskPrompt } from '../src/owner-agent.mjs'

test('插件注册主编排工具、全局守卫和九个中文 Skill', () => {
  const skills = []
  const tools = []
  const guards = []
  const sections = []
  const providers = []
  const ctx = {
    skills: { register: skill => { skills.push(skill); return () => {} } },
    tools: {
      register: definition => { tools.push(definition); return () => {} },
      guard: guard => { guards.push(guard); return () => {} },
    },
    systemPrompt: { section: section => { sections.push(section); return () => {} } },
    subagents: {
      registerProvider(provider) { providers.push(provider); return () => {} },
      registerContinuableSetup() { return () => {} },
    },
    on: () => () => {},
    effect: () => () => {},
  }

  plugin.apply(ctx, {})
  assert.deepEqual(skills.map(skill => skill.name), [
    'owner-workflow',
    'owner-operator',
    'owner-planner',
    'owner-worker',
    'owner-memory-workflow',
    'owner-reviewer',
    'owner-supervisor',
    'owner-memory-curator',
    'owner-memory-reviewer',
  ])
  assert.ok(skills.every(skill => skill.source === 'runtime'))
  assert.equal(tools[0].name, 'owner_workflow')
  assert.equal(tools[1].name, 'owner_submit')
  assert.equal(tools[2].name, 'owner_memory_note')
  assert.equal(tools[3].name, 'owner_host_exec')
  const ownerMemoryNote = tools.find(tool => tool.name === 'owner_memory_note')
  assert.deepEqual(ownerMemoryNote.parameters.properties.note.properties.type.enum, ['完成', '结论', '下一步', '阻塞'])
  for (const removed of ['owner_bash', 'owner_write', 'owner_edit', 'owner_verify', 'owner_repair']) {
    assert.equal(tools.some(tool => tool.name === removed), false, removed)
  }
  assert.ok(tools.some(tool => tool.name === 'workflow_preflight'))
  assert.ok(tools.some(tool => tool.name === 'workflow_start'))
  assert.ok(tools.some(tool => tool.name === 'workflow_plan_submit'))
  assert.ok(tools.some(tool => tool.name === 'workflow_plan_review_submit'))
  assert.ok(tools.some(tool => tool.name === 'workflow_plan_revision_extend'))
  assert.ok(tools.some(tool => tool.name === 'workflow_status'))
  assert.ok(tools.some(tool => tool.name === 'workflow_git_inspect'))
  const ownerHostExec = tools.find(tool => tool.name === 'owner_host_exec')
  assert.deepEqual(ownerHostExec.parameters.required, ['command', 'description', 'justification'])
  assert.equal(ownerHostExec.parameters.properties.sandbox_permissions, undefined)
  for (const name of ['operation_start', 'operation_status', 'operation_continue', 'operation_approve', 'operation_cancel', 'operation_report', 'operation_exec']) {
    assert.ok(tools.some(tool => tool.name === name), name)
  }
  const approve = tools.find(tool => tool.name === 'operation_approve')
  assert.deepEqual(approve.parameters.required, ['operation_id', 'approval_id', 'command'])
  const continuation = tools.find(tool => tool.name === 'operation_continue')
  assert.equal(Object.hasOwn(continuation.parameters.properties, 'approved'), false)
  assert.equal(guards.length, 1)
  assert.equal(providers.length, 1)
  assert.match(providers[0].name, /^owner-workflow-one-shot-/u)
  assert.equal(providers[0].capabilities.depthLimit, true)
  assert.ok(sections.some(section => section.name === 'owner-workflow:orchestrator'))
  assert.ok(plugin.inject.includes('subagents'))
  assert.ok(plugin.inject.includes('sandbox'))
  assert.ok(plugin.inject.includes('approval'))
  assert.ok(plugin.inject.includes('userQuestions'))
  const reviewSubmit = tools.find(tool => tool.name === 'workflow_plan_review_submit')
  assert.deepEqual(reviewSubmit.parameters.properties.review.properties.status.enum, ['passed', 'needs_revision'])
  assert.match(tools.find(tool => tool.name === 'workflow_plan_approve').description, /原生.*同意\/不同意/u)
  assert.match(tools.find(tool => tool.name === 'workflow_plan_revision_extend').description, /原生.*同意\/不同意/u)
  assert.match(tools.find(tool => tool.name === 'workflow_owner_change_approve').description, /原生.*同意\/不同意/u)
  assert.match(tools.find(tool => tool.name === 'workflow_cancel').description, /原生.*同意\/不同意/u)
})

test('取消 Workflow 只有原生问询明确同意后才丢弃临时现场', async () => {
  const agent = { id: 'main-agent' }
  const exec = { signal: new AbortController().signal }
  const answers = ['不同意', '同意']
  const questions = []
  const ctx = {
    userQuestions: {
      async ask(request) {
        questions.push(request.questions[0])
        return { answers: [{ id: request.questions[0].id, selected: [answers.shift()] }] }
      },
    },
  }
  const workflow = {
    workflowId: 'wf-cancel-confirmation',
    status: 'failed',
    orchestratorSessionId: agent.id,
    temporaryArtifactsCleaned: false,
    plan: { summary: '测试取消确认' },
  }
  let cancellations = 0
  const runtime = {
    async status() { return { workflow } },
    async cancelWorkflow(_agent, workflowId) {
      cancellations += 1
      assert.equal(workflowId, workflow.workflowId)
      return { workflowId, status: 'cancelled', temporaryArtifactsCleaned: true }
    },
  }

  const rejected = await confirmWorkflowCancellation(ctx, runtime, agent, exec, workflow.workflowId)
  assert.equal(rejected.applied, false)
  assert.equal(cancellations, 0)

  const approved = await confirmWorkflowCancellation(ctx, runtime, agent, exec, workflow.workflowId)
  assert.equal(approved.applied, true)
  assert.equal(approved.temporaryArtifactsCleaned, true)
  assert.equal(cancellations, 1)
  assert.match(questions[0].detail, /删除.*临时分支.*worktree.*未提交修改/us)
})

test('计划修订额度只有原生问询明确同意后才扩展当前 Workflow', async () => {
  const agent = { id: 'main-agent' }
  const exec = { signal: new AbortController().signal }
  const answers = ['不同意', '同意']
  const ctx = {
    userQuestions: {
      async ask(request) {
        return { answers: [{ id: request.questions[0].id, selected: [answers.shift()] }] }
      },
    },
  }
  let extensions = 0
  const workflow = {
    workflowId: 'wf-limit',
    status: 'planned',
    planDigest: 'plan-digest',
    planReview: {
      status: 'needs_revision',
      summary: '还需要补充验证',
      issues: [{ title: '验证不完整', detail: '缺少失败路径。' }],
    },
    planReviewDigest: 'plan-digest',
    planReviewRevisionCount: 3,
    configuredMaxPlanRevisionTurns: 3,
    maxPlanRevisionTurns: 3,
    planRevisionRemaining: 0,
  }
  const runtime = {
    async status() { return { workflow } },
    async extendPlanRevisionLimit(_agent, workflowId, planDigest) {
      extensions += 1
      assert.equal(workflowId, workflow.workflowId)
      assert.equal(planDigest, workflow.planDigest)
      return {
        contract: 'DSH_WORKFLOW_PLAN_REVISION_LIMIT_EXTENDED_V1',
        workflowId,
        revisionBudget: { used: 3, limit: 6, remaining: 3, exhausted: false },
      }
    },
  }

  const rejected = await confirmPlanRevisionExtension(
    ctx, runtime, agent, exec, workflow.workflowId, workflow.planDigest,
  )
  assert.equal(rejected.applied, false)
  assert.equal(extensions, 0)

  const approved = await confirmPlanRevisionExtension(
    ctx, runtime, agent, exec, workflow.workflowId, workflow.planDigest,
  )
  assert.equal(approved.applied, true)
  assert.equal(extensions, 1)
})

test('工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见', async () => {
  const requests = []
  const agent = { id: 'main-agent' }
  const signal = new AbortController().signal
  const answers = [
    { answers: [{ id: 'decision', selected: ['同意'] }] },
    { answers: [{ id: 'decision', selected: ['不同意'] }] },
    { answers: [{ id: 'decision', selected: [], custom: '请缩小文件范围' }] },
  ]
  const ctx = {
    userQuestions: {
      async ask(request) {
        requests.push(request)
        return answers.shift()
      },
    },
  }
  const request = {
    agent,
    signal,
    id: 'decision',
    header: 'Owner Registry',
    question: '是否批准？',
    detail: '精确提案内容',
  }
  assert.deepEqual(await askWorkflowDecision(ctx, request), {
    contract: 'DSH_WORKFLOW_USER_DECISION_V1',
    decision: 'approved',
  })
  assert.deepEqual(await askWorkflowDecision(ctx, request), {
    contract: 'DSH_WORKFLOW_USER_DECISION_V1',
    decision: 'rejected',
  })
  assert.deepEqual(await askWorkflowDecision(ctx, request), {
    contract: 'DSH_WORKFLOW_USER_DECISION_V1',
    decision: 'custom',
    feedback: '请缩小文件范围',
  })
  assert.deepEqual(requests[0].questions[0].options.map(option => option.label), ['同意', '不同意'])
  assert.equal(requests[0].questions[0].multiSelect, false)
  assert.equal(requests[0].agent, agent)
  assert.equal(requests[0].signal, signal)
})

test('Registry 与计划批准在原生问询同意前绝不修改 Runtime', async () => {
  const owner = {
    id: 'android-vpn',
    name: 'Android VPN',
    description: 'Android VPN 可靠性',
    scope: ['flutter_app/android/**'],
    exclude: [],
  }
  const proposal = {
    digest: 'proposal-digest',
    operation: 'add',
    reason: '新增 Android VPN Owner',
    affectedOwnerIds: [owner.id],
    before: { owners: [] },
    after: { owners: [owner] },
  }
  const agent = { id: 'main-agent' }
  const exec = { signal: new AbortController().signal }
  const answers = ['不同意', '同意', '不同意', '同意']
  const decisionRequests = []
  const ctx = {
    userQuestions: {
      async ask(request) {
        decisionRequests.push(request)
        return { answers: [{ id: request.questions[0].id, selected: [answers.shift()] }] }
      },
    },
  }
  let registryApplies = 0
  let planApplies = 0
  const runtime = {
    async registryStatus() {
      return { registryDigest: 'registry-digest', pendingProposal: proposal }
    },
    async status() {
      return {
        workflow: {
          status: 'planned',
          planDigest: 'plan-digest',
          registryDigest: 'registry-digest',
          planReview: { status: 'passed' },
          planReviewDigest: 'plan-digest',
          plan: {
            summary: '修复 Android VPN',
            tasks: [{
              id: 'TASK-1', role: 'work', ownerId: owner.id, title: '修复连接',
              dependsOn: [], write: owner.scope, verify: ['android-test'], done: '测试通过',
            }],
          },
        },
      }
    },
    async approveOwnerChange() {
      registryApplies += 1
      return { approvedProposalDigest: proposal.digest }
    },
    async approvePlan() {
      planApplies += 1
      return { approved: true }
    },
  }

  const rejectedRegistry = await confirmOwnerChangeApproval(
    ctx, runtime, agent, exec, 'wf-1', proposal.digest,
  )
  assert.equal(rejectedRegistry.applied, false)
  assert.equal(registryApplies, 0)
  assert.match(decisionRequests[0].questions[0].detail, /Owner 应表示由代码目录、模块、接口和长期职责形成的稳定责任域/u)
  assert.match(decisionRequests[0].questions[0].detail, /不能只是当前 Workflow 的阶段、任务/u)
  assert.match(decisionRequests[0].questions[0].detail, /设置位置：创建该 Workflow 的主线程/u)
  const approvedRegistry = await confirmOwnerChangeApproval(
    ctx, runtime, agent, exec, 'wf-1', proposal.digest,
  )
  assert.equal(approvedRegistry.applied, true)
  assert.equal(registryApplies, 1)

  const rejectedPlan = await confirmPlanApproval(
    ctx, runtime, agent, exec, 'wf-1', 'plan-digest', 'registry-digest',
  )
  assert.equal(rejectedPlan.applied, false)
  assert.equal(planApplies, 0)
  const approvedPlan = await confirmPlanApproval(
    ctx, runtime, agent, exec, 'wf-1', 'plan-digest', 'registry-digest',
  )
  assert.equal(approvedPlan.applied, true)
  assert.equal(planApplies, 1)
})

test('Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词', () => {
  const calls = { tools: 0, skills: 0, prompts: 0, effects: 0 }
  const ctx = {
    tools: { register: () => { calls.tools += 1 } },
    skills: { register: () => { calls.skills += 1 } },
    systemPrompt: { section: () => { calls.prompts += 1 } },
    effect(factory) {
      calls.effects += 1
      return factory()
    },
  }
  plugin.apply(ctx, { surfaceOnly: true })
  assert.deepEqual(calls, { tools: 0, skills: 0, prompts: 0, effects: 1 })
})

test('Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick', () => {
  const skill = OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-workflow')
  const planner = OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-planner')
  const worker = OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-worker')
  const memory = OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-memory-workflow')
  assert.ok(skill)
  assert.ok(planner)
  assert.ok(worker)
  assert.ok(memory)
  assert.match(skill.content, /DSH_PLAN_V2/u)
  assert.match(skill.content, /不提供 Quick/u)
  assert.match(skill.content, /operation_approve/u)
  assert.match(skill.content, /原生.*授权卡片/u)
  assert.match(skill.content, /Owner 必须根据代码本身划分/u)
  assert.match(skill.content, /Workflow 只能把 DAG task 路由给 Owner，不能反过来塑造 Owner/u)
  assert.match(worker.content, /owner_submit/u)
  assert.match(worker.content, /owner_memory_note/u)
  assert.match(memory.content, /封存临时记忆/u)
  assert.match(worker.content, /正常编辑、Shell、Skill/u)
  assert.match(planner.content, /新的 Flutter 验证都必须显式声明其包根 cwd/u)
  assert.match(planner.content, /旧计划.*过渡分支/u)
  const owner = { id: 'api', name: 'API', description: 'API Owner', scope: ['src/**'], exclude: [] }
  const state = {
    workflowBranch: 'dsh/workflow/test',
    ownerBranch: 'dsh/owner/test/api',
    ownerWorktree: '/tmp/owner-worktree',
    plan: { contract: 'DSH_PLAN_V2', tasks: [{ id: 'T1', verify: ['flutter-test'] }] },
  }
  const task = { id: 'T1', title: '运行 Flutter 测试', write: ['flutter_app/test/core_service_test.dart'] }
  assert.match(ownerTaskPrompt(state, task, owner, [task], { digest: 'empty', documents: [] }, { notes: [] }), /固定 argv 与 cwd/u)
  assert.match(ownerRolePrompt(owner), /显式声明包根 cwd/u)
  assert.doesNotMatch(skill.content, /\bstage\b|\bstages\b|owner_add/u)
})
