import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync, watch } from 'node:fs'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { basename, join, resolve } from 'node:path'

import { projectProgress } from './supervisor.mjs'
import { OWNER_RUNTIME_DIRECTORY, ensureRuntimeGitignore } from './project-layout.mjs'
import { deriveWorkflowControl } from './workflow-state.mjs'
import {
  listOperationStates,
  operationCommandIsCompound,
  operationPublicSnapshot,
  readOperationState,
} from './operation.mjs'

const PROGRESS_FILE = 'progress.json'
const EVENTS_FILE = 'events.jsonl'
const DASHBOARD_DIRECTORY = 'dashboard'
const WORKSPACE_CATALOG_FILE = 'workspaces.json'
const RUNNER_DAEMON_CONTRACT = 'DSH_WORKFLOW_RUNNER_DAEMON_V1'
const AGENT_RUNTIME_STATUS_CONTRACT = 'DSH_AGENT_RUNTIME_STATUS_V1'
const RUNNER_HEARTBEAT_MIN_STALE_MS = 10_000
const DASHBOARD_BASELINE_POLL_MS = 5_000
const DASHBOARD_HEARTBEAT_MS = 15_000
const dashboardInstances = new Set()
const appendQueues = new Map()
const catalogQueues = new Map()

function workspacePath(workspace) {
  if (typeof workspace !== 'string' || workspace.trim() === '') {
    throw new Error('Dashboard workspace 必须是非空路径')
  }
  return resolve(workspace)
}

function projectionDirectory(workspace) {
  return join(workspacePath(workspace), OWNER_RUNTIME_DIRECTORY)
}

function workspaceCatalogPath(catalogRoot) {
  return join(projectionDirectory(catalogRoot), DASHBOARD_DIRECTORY, WORKSPACE_CATALOG_FILE)
}

function dashboardWorkspaceId(workspace) {
  return createHash('sha256').update(workspacePath(workspace)).digest('hex').slice(0, 20)
}

async function readWorkspaceCatalog(catalogRoot) {
  try {
    const raw = JSON.parse(await readFile(workspaceCatalogPath(catalogRoot), 'utf8'))
    return Array.isArray(raw?.workspaces) ? raw.workspaces.filter(item => (
      typeof item?.id === 'string'
      && typeof item?.root === 'string'
      && item.id === dashboardWorkspaceId(item.root)
      && existsSync(item.root)
    )) : []
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw new Error('Dashboard 工作区目录表不可用')
  }
}

function enqueueCatalog(path, operation) {
  const previous = catalogQueues.get(path) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  catalogQueues.set(path, current)
  return current.finally(() => {
    if (catalogQueues.get(path) === current) catalogQueues.delete(path)
  })
}

/** Runtime 用它把实际业务工作区登记到固定 Dashboard 根目录，不向浏览器暴露路径。 */
export async function registerDashboardWorkspace(catalogRoot, workspace) {
  const catalog = workspacePath(catalogRoot)
  const root = workspacePath(workspace)
  await ensureRuntimeGitignore(projectionDirectory(catalog))
  const path = workspaceCatalogPath(catalog)
  return enqueueCatalog(path, async () => {
    const workspaces = await readWorkspaceCatalog(catalog)
    const id = dashboardWorkspaceId(root)
    const now = new Date().toISOString()
    const current = workspaces.find(item => item.id === id)
    const record = {
      id,
      root,
      name: basename(root) || root,
      firstSeenAt: current?.firstSeenAt ?? now,
      lastSeenAt: now,
    }
    const next = [...workspaces.filter(item => item.id !== id), record]
    await mkdir(join(projectionDirectory(catalog), DASHBOARD_DIRECTORY), { recursive: true })
    const temporary = `${path}.tmp-${randomUUID()}`
    try {
      await writeFile(temporary, `${JSON.stringify({ contract: 'DSH_DASHBOARD_WORKSPACES_V1', workspaces: next }, null, 2)}\n`, 'utf8')
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
    return { workspaceId: id, name: record.name, lastSeenAt: record.lastSeenAt }
  })
}

/** Dashboard 页面使用的安全工作区列表；返回值不包含本地路径。 */
export async function listDashboardWorkspaces(catalogRoot) {
  return (await readWorkspaceCatalog(workspacePath(catalogRoot)))
    .map(item => ({ workspaceId: item.id, name: item.name, lastSeenAt: item.lastSeenAt }))
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
}

/** 只从 Runtime 写入的目录表解析 opaque ID，浏览器不能自行指定路径。 */
export async function resolveDashboardWorkspace(catalogRoot, workspaceId) {
  if (typeof workspaceId !== 'string' || !/^[a-f0-9]{20}$/u.test(workspaceId)) {
    throw new Error('Dashboard workspace_id 无效')
  }
  const record = (await readWorkspaceCatalog(workspacePath(catalogRoot))).find(item => item.id === workspaceId)
  if (record === undefined) throw new Error('Dashboard workspace_id 未登记')
  return workspacePath(record.root)
}

function requireWorkflowId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Dashboard workflowId 必须是非空字符串')
  }
  const workflowId = value.trim()
  if (
    workflowId === '.'
    || workflowId === '..'
    || workflowId.startsWith('-')
    || /[\\/\0]/u.test(workflowId)
    || /\s/u.test(workflowId)
  ) {
    throw new Error('Dashboard workflowId 不是安全的路径标识')
  }
  return workflowId
}

function stateWorkflowId(state) {
  const id = state.id === undefined ? undefined : requireWorkflowId(state.id)
  const workflowId = state.workflowId === undefined ? undefined : requireWorkflowId(state.workflowId)
  if (id !== undefined && workflowId !== undefined && id !== workflowId) {
    throw new Error('progress 投影中的 id 与 workflowId 不一致')
  }
  return requireWorkflowId(workflowId ?? id)
}

function dashboardDirectory(workspace, workflowId) {
  return join(projectionDirectory(workspace), DASHBOARD_DIRECTORY, requireWorkflowId(workflowId))
}

function progressPath(workspace, workflowId) {
  return join(dashboardDirectory(workspace, workflowId), PROGRESS_FILE)
}

function eventsPath(workspace, workflowId) {
  return join(dashboardDirectory(workspace, workflowId), EVENTS_FILE)
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    throw new Error(`${label} 不是可序列化的 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

function progressProjection(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('progress 投影必须是对象')
  }
  const workflowId = stateWorkflowId(state)
  if (state.plan !== undefined && Array.isArray(state.tasks)) {
    if (state.plan.contract === 'DSH_PLAN_V2') {
      const projected = projectProgress(state)
      const control = deriveWorkflowControl(state)
      const execution = control.counts
      const phase = control.phase
      const action = control.actionRequired ? workflowDashboardAction(state, phase) : undefined
      const tasks = projected.tasks.map(task => {
        const record = state.ownerRuns?.[`${task.id}:${task.ownerId}`]
        if (record === undefined) return task
        return {
          ...task,
          ownerStatus: record.status,
          phase: record.phase,
          ownerSessionId: record.sessionId ?? record.result?.sessionId,
          startedAt: record.startedAt ?? record.recoveredAt,
          lastHeartbeatAt: record.lastHeartbeatAt,
          recoveryCount: Number(record.recoveryCount ?? 0),
          pendingApprovalId: record.pendingApprovalId,
          autonomousRecovery: task.autonomousRecovery ?? record.autonomousRecovery,
        }
      })
      return {
        ...projected,
        tasks,
        workflowId,
        status: state.status ?? null,
        phase,
        execution,
        ...(typeof state.orchestratorSessionId === 'string' && state.orchestratorSessionId.trim() !== ''
          ? { mainSessionId: state.orchestratorSessionId.trim() }
          : {}),
        ...(state.planReview?.status === undefined ? {} : {
          review: {
            status: state.planReview.status,
            summary: dashboardText(state.planReview.summary, 1000),
            issueCount: Array.isArray(state.planReview.issues) ? state.planReview.issues.length : 0,
          },
        }),
        ...(state.planConvergence?.contract === 'DSH_WORKFLOW_CONVERGENCE_V1' ? {
          convergence: {
            progress: state.planConvergence.progress,
            activeStrategy: state.planConvergence.activeStrategy,
            nextStrategy: state.planConvergence.nextStrategy,
            evidenceDigest: state.planConvergence.evidenceDigest,
            openObligationCount: (state.planConvergence.obligations ?? []).filter(item => item.status === 'open').length,
            unsupportedNewObligationCount: state.planConvergence.unsupportedNewObligations?.length ?? 0,
            updatedAt: state.planConvergence.updatedAt,
          },
        } : {}),
        ...(state.pendingDecisionBundle?.contract === 'DSH_WORKFLOW_DECISION_BUNDLE_V1' ? {
          decisionBundle: {
            status: state.pendingDecisionBundle.status,
            questions: (state.pendingDecisionBundle.questions ?? []).map(question => dashboardText(question, 1000)),
          },
        } : {}),
        ...(action === undefined ? {} : { action }),
      }
    }
    return {
      contract: 'DSH_WORKFLOW_PROGRESS_V1',
      workflowId,
      status: state.status ?? null,
      summary: state.plan.summary ?? '',
      tasks: [],
    }
  }
  if (state.plan !== undefined) {
    return {
      contract: 'DSH_WORKFLOW_PROGRESS_V1',
      workflowId,
      status: state.status ?? null,
      summary: state.plan?.summary ?? '',
      tasks: [],
    }
  }
  // workflow 创建、规划和失败恢复都会先持久化尚未生成计划的状态；
  // 这不是投影错误，Dashboard 应稳定显示一个空任务列表。
  if (!Array.isArray(state.tasks)) {
    return {
      contract: 'DSH_WORKFLOW_PROGRESS_V1',
      workflowId,
      status: state.status ?? null,
      summary: '',
      tasks: [],
    }
  }
  return { ...cloneJson(state, 'progress 投影'), workflowId }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function eventType(entry) {
  const value = entry?.type ?? entry?.event
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function normalizeEvent(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
  const type = eventType(entry)
  if (type === undefined) return undefined
  let workflowId
  if (entry.workflowId !== undefined) {
    try {
      workflowId = requireWorkflowId(entry.workflowId)
    } catch {
      return undefined
    }
  }
  return {
    ...entry,
    ...(workflowId === undefined ? {} : { workflowId }),
    type,
    event: type,
  }
}

async function readEvents(workspace, workflowId) {
  const targetWorkflowId = requireWorkflowId(workflowId)
  let content
  try {
    content = await readFile(eventsPath(workspace, targetWorkflowId), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const events = []
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue
    try {
      const event = normalizeEvent(JSON.parse(line))
      if (event?.workflowId === targetWorkflowId) events.push(event)
    } catch {
      // 畸形事件只丢弃该行，绝不把原始内容或本地路径返回给浏览器。
    }
  }
  return events
}

function dashboardTask(task) {
  if (task === null || typeof task !== 'object' || Array.isArray(task)) return undefined
  const id = task.id ?? task.taskId
  if (typeof id !== 'string' || id.trim() === '') return undefined
  return {
    id: id.trim(),
    ...(typeof task.ownerId === 'string' && task.ownerId.trim() !== '' ? { ownerId: task.ownerId.trim() } : {}),
    ...(typeof task.role === 'string' && task.role.trim() !== '' ? { role: task.role.trim() } : {}),
    ...(typeof task.title === 'string' && task.title.trim() !== '' ? { title: task.title.trim() } : {}),
    dependsOn: Array.isArray(task.dependsOn)
      ? task.dependsOn.filter(item => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
      : [],
    ...(typeof task.status === 'string' && task.status.trim() !== '' ? { status: task.status.trim() } : {}),
    ...(typeof task.reason === 'string' && task.reason.trim() !== '' ? { reason: task.reason.trim() } : {}),
    ...(typeof task.action === 'string' && task.action.trim() !== '' ? { action: task.action.trim() } : {}),
    ...(typeof task.ownerStatus === 'string' && task.ownerStatus.trim() !== '' ? { ownerStatus: task.ownerStatus.trim() } : {}),
    ...(typeof task.phase === 'string' && task.phase.trim() !== '' ? { phase: task.phase.trim() } : {}),
    ...(typeof task.ownerSessionId === 'string' && task.ownerSessionId.trim() !== '' ? { ownerSessionId: task.ownerSessionId.trim() } : {}),
    ...(typeof task.startedAt === 'string' && task.startedAt.trim() !== '' ? { startedAt: task.startedAt.trim() } : {}),
    ...(typeof task.lastHeartbeatAt === 'string' && task.lastHeartbeatAt.trim() !== '' ? { lastHeartbeatAt: task.lastHeartbeatAt.trim() } : {}),
    ...(Number.isSafeInteger(task.recoveryCount) && task.recoveryCount >= 0 ? { recoveryCount: task.recoveryCount } : {}),
    ...(typeof task.pendingApprovalId === 'string' && task.pendingApprovalId.trim() !== '' ? { pendingApprovalId: task.pendingApprovalId.trim() } : {}),
    ...(task.autonomousRecovery !== null && typeof task.autonomousRecovery === 'object' && !Array.isArray(task.autonomousRecovery)
      ? {
          autonomousRecovery: {
            failureClass: dashboardText(task.autonomousRecovery.failureClass, 80),
            strategy: dashboardText(task.autonomousRecovery.strategy, 80),
            message: dashboardText(task.autonomousRecovery.message, 500),
            updatedAt: dashboardText(task.autonomousRecovery.updatedAt, 100),
          },
        }
      : {}),
    ...(typeof task.parentTaskId === 'string' && task.parentTaskId.trim() !== '' ? { parentTaskId: task.parentTaskId.trim() } : {}),
    ...(Array.isArray(task.children) ? { children: task.children.filter(item => typeof item === 'string') } : {}),
    ...(Array.isArray(task.entry) ? { entry: task.entry.filter(item => typeof item === 'string') } : {}),
    ...(Array.isArray(task.exit) ? { exit: task.exit.filter(item => typeof item === 'string') } : {}),
    ...(task.decomposition !== null && typeof task.decomposition === 'object' && !Array.isArray(task.decomposition)
      ? {
          decomposition: {
            status: dashboardText(task.decomposition.status, 40),
            kind: dashboardText(task.decomposition.kind, 40),
            outcome: dashboardText(task.decomposition.outcome, 500),
            ownerCandidates: Array.isArray(task.decomposition.ownerCandidates)
              ? task.decomposition.ownerCandidates.filter(item => typeof item === 'string').slice(0, 20)
              : [],
            unknowns: Array.isArray(task.decomposition.unknowns)
              ? task.decomposition.unknowns.filter(item => typeof item === 'string').map(item => dashboardText(item, 500)).slice(0, 20)
              : [],
          },
        }
      : {}),
  }
}

function dashboardExecution(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result = {}
  for (const key of ['totalTasks', 'pendingTasks', 'runningTasks', 'queuedTasks', 'waitingDependencyTasks', 'waitingDecisionTasks', 'completedTasks']) {
    const count = Number(value[key])
    result[key] = Number.isSafeInteger(count) && count >= 0 ? count : 0
  }
  return result
}

function dashboardWorkflowAction(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value.required !== true) return undefined
  const kind = dashboardText(value.kind, 100)
  const title = dashboardText(value.title, 200)
  const detail = dashboardText(value.detail, 1000)
  if (kind === '' || title === '' || detail === '') return undefined
  const mainSessionId = dashboardText(value.mainSessionId, 300)
  return {
    required: true,
    kind,
    title,
    detail,
    ...(mainSessionId === '' ? {} : { mainSessionId }),
  }
}

function dashboardReview(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const status = dashboardText(value.status, 100)
  if (status === '') return undefined
  const issueCount = Number(value.issueCount)
  return {
    status,
    summary: dashboardText(value.summary, 1000),
    issueCount: Number.isSafeInteger(issueCount) && issueCount >= 0 ? issueCount : 0,
  }
}

function dashboardConvergence(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const nextStrategy = dashboardText(value.nextStrategy, 100)
  if (nextStrategy === '') return undefined
  const openObligationCount = Number(value.openObligationCount)
  const unsupportedNewObligationCount = Number(value.unsupportedNewObligationCount)
  return {
    progress: dashboardText(value.progress, 100),
    activeStrategy: dashboardText(value.activeStrategy, 100),
    nextStrategy,
    evidenceDigest: dashboardText(value.evidenceDigest, 100),
    openObligationCount: Number.isSafeInteger(openObligationCount) && openObligationCount >= 0 ? openObligationCount : 0,
    unsupportedNewObligationCount: Number.isSafeInteger(unsupportedNewObligationCount) && unsupportedNewObligationCount >= 0
      ? unsupportedNewObligationCount
      : 0,
    updatedAt: dashboardText(value.updatedAt, 100),
  }
}

function dashboardDecisionBundle(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const status = dashboardText(value.status, 100)
  if (status === '') return undefined
  const questions = dashboardTextList(value.questions)
  return { status, questions, questionCount: questions.length }
}

function dashboardEvent(event) {
  const normalized = normalizeEvent(event)
  if (normalized === undefined) return undefined
  const copy = {
    ...(typeof normalized.id === 'string' && normalized.id !== '' ? { id: normalized.id } : {}),
    ...(typeof normalized.time === 'string' && normalized.time !== '' ? { time: normalized.time } : {}),
    workflowId: normalized.workflowId,
    type: normalized.type,
  }
  for (const key of ['ownerId', 'taskId', 'stageId', 'status', 'reason', 'action', 'verificationId']) {
    if (typeof normalized[key] === 'string' && normalized[key].trim() !== '') copy[key] = normalized[key].trim()
  }
  if (typeof normalized.summary === 'string' && normalized.summary.trim() !== '') {
    // Dashboard 是浏览器可读投影，只保留有限文本摘要，不输出分支、worktree、文件列表或命令。
    copy.summary = normalized.summary.trim().slice(0, 1000)
  }
  if (typeof normalized.passed === 'boolean') copy.passed = normalized.passed
  if (Number.isSafeInteger(normalized.exitCode)) copy.exitCode = normalized.exitCode
  const task = dashboardTask(normalized.task)
  if (task !== undefined) copy.task = task
  return copy
}

/**
 * 读取一个 workflow 的 Dashboard 投影。该函数只暴露页面渲染需要的字段，
 * 不把本地路径、命令、worktree 或 Owner 原始日志交给浏览器。
 */
export async function readDashboardSnapshot(workspace, workflowId) {
  const target = workspacePath(workspace)
  const targetWorkflowId = requireWorkflowId(workflowId)
  let raw
  try {
    raw = JSON.parse(await readFile(join(target, OWNER_RUNTIME_DIRECTORY, 'workflows', `${targetWorkflowId}.json`), 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('Dashboard workflow 状态不可用')
    try {
      raw = JSON.parse(await readFile(progressPath(target, targetWorkflowId), 'utf8'))
    } catch (projectionError) {
      if (projectionError?.code === 'ENOENT') return undefined
      throw new Error('Dashboard progress 投影不可用')
    }
  }
  let progress
  try {
    progress = progressProjection(raw)
  } catch {
    throw new Error('Dashboard progress 投影不可用')
  }
  if (progress.workflowId !== targetWorkflowId) throw new Error('Dashboard progress 投影不可用')
  const tasks = (Array.isArray(progress.tasks) ? progress.tasks : [])
    .map(dashboardTask)
    .filter(task => task !== undefined)
  const events = (await readEvents(target, targetWorkflowId))
    .map(dashboardEvent)
    .filter(event => event !== undefined)
    .slice(-100)
  const execution = dashboardExecution(progress.execution)
  const action = dashboardWorkflowAction(progress.action)
  const review = dashboardReview(progress.review)
  const convergence = dashboardConvergence(progress.convergence)
  const decisionBundle = dashboardDecisionBundle(progress.decisionBundle)
  const phase = dashboardText(progress.phase, 100)
  const mainSessionId = dashboardText(progress.mainSessionId, 300)
  return {
    workflowId: targetWorkflowId,
    status: typeof progress.status === 'string' ? progress.status : null,
    ...(phase === '' ? {} : { phase }),
    summary: typeof progress.summary === 'string' ? progress.summary : '',
    ...(execution === undefined ? {} : { execution }),
    ...(review === undefined ? {} : { review }),
    ...(convergence === undefined ? {} : { convergence }),
    ...(decisionBundle === undefined ? {} : { decisionBundle }),
    ...(action === undefined ? {} : { action }),
    ...(mainSessionId === '' ? {} : { mainSessionId }),
    tasks,
    events,
  }
}

/** 列出当前工作区已有 Dashboard 投影的 workflow，供内嵌面板选择。 */
export async function listDashboardWorkflows(workspace) {
  const target = workspacePath(workspace)
  let entries
  try {
    entries = await readdir(join(projectionDirectory(target), DASHBOARD_DIRECTORY), { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw new Error('Dashboard workflow 列表不可用')
  }
  const workflows = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let workflowId
    try {
      workflowId = requireWorkflowId(entry.name)
    } catch {
      continue
    }
    const snapshot = await readDashboardSnapshot(target, workflowId).catch(() => undefined)
    if (snapshot === undefined) continue
    workflows.push({
      workflowId,
      status: snapshot.status,
      ...(snapshot.phase === undefined ? {} : { phase: snapshot.phase }),
      ...(snapshot.action?.required === true ? { actionRequired: true } : {}),
      summary: snapshot.summary,
      taskCount: snapshot.tasks.length,
    })
  }
  return workflows.sort((left, right) => right.workflowId.localeCompare(left.workflowId))
}

function dashboardText(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function dashboardTextList(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim() !== '').map(item => item.trim().slice(0, 1000)).slice(0, 100)
    : []
}

function dashboardOperation(state) {
  const snapshot = operationPublicSnapshot(state)
  return {
    operationId: snapshot.operationId,
    status: snapshot.status,
    goal: dashboardText(snapshot.goal),
    capabilities: dashboardTextList(snapshot.capabilities),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    pending: snapshot.pending === null ? null : {
      kind: snapshot.pending.kind,
      id: snapshot.pending.id,
      question: dashboardText(snapshot.pending.question),
      ...(snapshot.pending.action === undefined ? {} : { action: dashboardText(snapshot.pending.action) }),
      ...(snapshot.pending.risk === undefined ? {} : { risk: dashboardText(snapshot.pending.risk) }),
      // 精确命令只在请求产生的原生授权现场展示，不进入 Dashboard 浏览器投影。
    },
    result: snapshot.result === null ? null : {
      summary: dashboardText(snapshot.result.summary),
      findings: dashboardTextList(snapshot.result.findings),
      evidence: dashboardTextList(snapshot.result.evidence),
      nextActions: dashboardTextList(snapshot.result.nextActions),
    },
    events: snapshot.events.slice(-100).map(event => ({
      id: event.id,
      type: event.type,
      time: event.time,
      summary: dashboardText(event.summary),
    })),
  }
}

/** 读取一个非编码 Operation 的浏览器安全投影。 */
export async function readDashboardOperationSnapshot(workspace, operationId) {
  const target = workspacePath(workspace)
  try {
    return dashboardOperation(await readOperationState(target, operationId))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error('Dashboard Operation 投影不可用')
  }
}

/** 列出当前工作区的非编码 Operation，不暴露父子会话、本地路径或原始命令。 */
export async function listDashboardOperations(workspace) {
  const target = workspacePath(workspace)
  return (await listOperationStates(target)).map(state => {
    const snapshot = dashboardOperation(state)
    return {
      operationId: snapshot.operationId,
      status: snapshot.status,
      goal: snapshot.goal,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    }
  })
}

const ACTIVE_OPERATION_WAIT_STATES = Object.freeze({
  waiting_input: {
    state: 'waiting_user_input',
    waitingFor: '用户补充信息',
    statusText: '等待主代理向用户取得补充信息',
  },
  waiting_approval: {
    state: 'waiting_user_approval',
    waitingFor: '用户授权决定',
    statusText: '等待用户决定是否批准精确动作',
  },
})

function operationPendingCommand(state) {
  return typeof state?.pending?.command === 'string' ? state.pending.command.trim() : ''
}

function operationCommands(state) {
  const commands = new Set()
  const pendingCommand = operationPendingCommand(state)
  if (pendingCommand !== '') commands.add(pendingCommand)
  if (state?.approvals !== null && typeof state?.approvals === 'object' && !Array.isArray(state.approvals)) {
    for (const approval of Object.values(state.approvals)) {
      if (typeof approval?.command === 'string' && approval.command.trim() !== '') {
        commands.add(approval.command.trim())
      }
    }
  }
  return commands
}

function operationTime(state) {
  const value = Date.parse(state?.createdAt)
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function supersedingOperation(state, states) {
  const command = operationPendingCommand(state)
  if (state?.status !== 'waiting_approval' || command === '') return undefined
  const createdAt = operationTime(state)
  return states
    .filter(candidate => (
      candidate?.id !== state.id
      && candidate?.parentSessionId === state.parentSessionId
      && operationTime(candidate) > createdAt
      && operationCommands(candidate).has(command)
    ))
    .sort((left, right) => operationTime(right) - operationTime(left))[0]
}

function staleOperationWait(state, states) {
  if (state?.status === 'waiting_input') {
    if (
      state.pending?.kind !== 'input'
      || dashboardText(state.pending?.id, 300) === ''
      || dashboardText(state.pending?.question) === ''
    ) {
      return {
        code: 'invalid_wait_contract',
        reason: '这条等待记录缺少可继续执行的补充信息契约，已不能安全恢复。',
      }
    }
    return undefined
  }
  if (state?.status !== 'waiting_approval') return undefined
  const command = operationPendingCommand(state)
  const approval = state?.approvals?.[state.pending?.id]
  if (
    state.pending?.kind !== 'approval'
    || dashboardText(state.pending?.id, 300) === ''
    || dashboardText(state.pending?.question) === ''
    || dashboardText(state.pending?.action) === ''
    || dashboardText(state.pending?.risk) === ''
    || command === ''
    || approval?.status !== 'pending'
    || approval?.command !== command
  ) {
    return {
      code: 'invalid_wait_contract',
      reason: '这条授权记录与当前 Operation 契约不一致，已不能安全继续。',
    }
  }
  if (operationCommandIsCompound(command)) {
    return {
      code: 'legacy_compound_command',
      reason: '旧版本把多个命令合并成一次授权；当前 Runtime 要求逐条执行，因此这条请求已失效。',
    }
  }
  const replacement = supersedingOperation(state, states)
  if (replacement === undefined) return undefined
  const replacementStatus = replacement.status === 'completed'
    ? '相同动作已由较新的 Operation 完成。'
    : ['failed', 'cancelled'].includes(replacement.status)
      ? '相同动作已由较新的 Operation 接管并结束。'
      : '相同动作已由较新的 Operation 接管。'
  return {
    code: 'superseded',
    reason: replacementStatus,
    supersededBy: replacement.id,
  }
}

function dashboardWaitItem(state, workspace, stale) {
  const waitState = ACTIVE_OPERATION_WAIT_STATES[state?.status]
  if (waitState === undefined) return undefined
  const latestEvent = Array.isArray(state.events) ? state.events.at(-1) : undefined
  const question = dashboardText(state.pending?.question)
  const summary = dashboardText(latestEvent?.summary)
  const pendingStartedAt = state.pending?.kind === 'approval'
    ? state.approvals?.[state.pending.id]?.requestedAt
    : state.pending?.requestedAt
  return {
    id: `operation:${state.id}`,
    source: 'operation',
    operationId: state.id,
    sessionId: dashboardText(state.parentSessionId, 200),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    title: '后台 Operation',
    goal: dashboardText(state.spec?.goal),
    state: waitState.state,
    waitingFor: waitState.waitingFor,
    statusText: waitState.statusText,
    detail: question || summary,
    ...(stale === undefined ? {} : {
      disposition: 'stale',
      staleCode: stale.code,
      staleReason: stale.reason,
      ...(stale.supersededBy === undefined ? {} : { supersededBy: stale.supersededBy }),
    }),
    ...(dashboardText(state.pending?.action) === '' ? {} : { action: dashboardText(state.pending.action) }),
    ...(dashboardText(state.pending?.risk) === '' ? {} : { risk: dashboardText(state.pending.risk) }),
    startedAt: pendingStartedAt ?? state.updatedAt ?? state.createdAt,
    updatedAt: state.updatedAt,
  }
}

async function readRunnerDaemonState(catalogRoot) {
  try {
    const state = JSON.parse(await readFile(join(projectionDirectory(catalogRoot), 'runner', 'daemon.json'), 'utf8'))
    if (state?.contract !== RUNNER_DAEMON_CONTRACT) return undefined
    const heartbeat = Date.parse(state.heartbeatAt ?? '')
    const staleAfterMs = Math.max(RUNNER_HEARTBEAT_MIN_STALE_MS, Number(state.pollMs ?? 0) * 5)
    const online = state.status === 'running' && Number.isFinite(heartbeat) && Date.now() - heartbeat <= staleAfterMs
    const activeWorkflows = Array.isArray(state.activeWorkflows) ? state.activeWorkflows : []
    const attempts = new Map()
    for (const item of activeWorkflows) {
      const workspaceId = dashboardText(item?.workspaceId, 100)
      const workflowId = dashboardText(item?.workflowId, 300)
      if (workspaceId === '' || workflowId === '') continue
      attempts.set(`${workspaceId}:${workflowId}`, {
        attemptId: dashboardText(item?.attemptId, 100) || null,
        kind: dashboardText(item?.kind, 100) || 'execution',
        phase: dashboardText(item?.phase, 100) || 'executing',
        reason: dashboardText(item?.reason, 300) || null,
        startedAt: dashboardText(item?.startedAt, 100) || null,
        deadlineAt: dashboardText(item?.deadlineAt, 100) || null,
      })
    }
    return {
      online,
      process: online ? 'online' : 'offline',
      assignment: online ? (activeWorkflows.length > 0 ? 'supervising' : 'idle') : 'offline',
      active: new Set(attempts.keys()),
      attempts,
      generation: Number.isSafeInteger(state.generation) ? state.generation : null,
      heartbeatAt: dashboardText(state.heartbeatAt, 100),
      startedAt: dashboardText(state.startedAt, 100),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    return undefined
  }
}

async function listWorkflowWaitStates(workspace) {
  const directory = join(projectionDirectory(workspace.root), 'workflows')
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const states = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      const state = JSON.parse(await readFile(join(directory, entry.name), 'utf8'))
      const workflowId = requireWorkflowId(state?.id)
      if (entry.name !== `${workflowId}.json`) continue
      states.push(state)
    } catch {
      // 单个损坏状态不会阻断其他工作流的等待投影。
    }
  }
  return states
}

function dashboardProcessIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function listAgentRuntimeStates(workspace) {
  const directory = join(projectionDirectory(workspace.root), 'runtime', 'agents')
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const states = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      const state = JSON.parse(await readFile(join(directory, entry.name), 'utf8'))
      if (state?.contract !== AGENT_RUNTIME_STATUS_CONTRACT) continue
      const sessionId = dashboardText(state.sessionId, 300)
      const role = dashboardText(state.role, 100)
      const lifecycle = dashboardText(state.lifecycle, 100)
      if (sessionId === '' || role === '' || !['running', 'idle', 'closed'].includes(lifecycle)) continue
      const processAlive = dashboardProcessIsAlive(state.processId)
      states.push({
        sessionId,
        parentSessionId: dashboardText(state.parentSessionId, 300) || null,
        role,
        workflowId: dashboardText(state.workflowId, 300) || null,
        operationId: dashboardText(state.operationId, 300) || null,
        taskId: dashboardText(state.taskId, 300) || null,
        ownerId: dashboardText(state.ownerId, 300) || null,
        lifecycle: lifecycle === 'closed' ? 'closed' : processAlive ? lifecycle : 'orphaned',
        updatedAt: dashboardText(state.updatedAt, 100),
      })
    } catch {
      // 单个损坏或正在替换的运行时状态不会阻断其他 Agent 投影。
    }
  }
  return states.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
}

function mainThreadActivity(phase) {
  if (phase === 'planning') return 'waiting_planner'
  if (phase === 'plan_revision_in_progress') return 'waiting_planner'
  if (phase === 'planning_owner_consultation') return 'waiting_subagents'
  if (phase === 'plan_revision_recovery_queued') return 'waiting_runner'
  if (phase === 'planning_recovery_queued' || phase === 'execution_recovery_queued') return 'waiting_runner'
  if (phase === 'plan_revision_retry_pending') return 'waiting_runner'
  if (phase === 'plan_reviewing') return 'waiting_plan_reviewer'
  if (phase === 'plan_arbitrating') return 'waiting_plan_reviewer'
  if (phase === 'autonomous_incident') return 'blocked_runtime'
  if (phase === 'awaiting_plan_approval' || phase === 'awaiting_registry_approval') return 'waiting_user_approval'
  if (phase === 'awaiting_revision_extension') return 'waiting_user_approval'
  if (phase === 'planning_discussion_summarizing') return 'waiting_plan_reviewer'
  if (phase === 'awaiting_main_discussion') return 'waiting_user_approval'
  if (phase === 'runner_queued' || phase === 'runner_launching') return 'waiting_runner'
  if (phase === 'owner_running' || phase === 'waiting_dependencies') return 'waiting_subagents'
  if (phase === 'handoff_replanning' || phase === 'implementation_review_required' || phase === 'implementation_repair_required') return 'waiting_subagents'
  if (phase === 'state_invariant_violation') return 'blocked_runtime'
  if (phase === 'plan_review_not_started' || phase === 'plan_review_failed' || phase === 'plan_revision_failed' || phase === 'planning_failed') return 'blocked_runtime'
  return phase
}

function workflowDashboardAction(state, phase) {
  const mainSessionId = typeof state.orchestratorSessionId === 'string' && state.orchestratorSessionId.trim() !== ''
    ? state.orchestratorSessionId.trim()
    : undefined
  const common = {
    required: true,
    ...(mainSessionId === undefined ? {} : { mainSessionId }),
  }
  const reviewerDecision = state.planReview?.status === 'needs_decision'
    || state.planningDiscussion?.source === 'plan-review-needs-decision'
  if (phase === 'awaiting_plan_approval') {
    return { ...common, kind: 'plan_approval', title: '计划等待批准', detail: '请回到创建该 Workflow 的主会话查看并处理计划审批卡片。Dashboard 保持只读。' }
  }
  if (phase === 'awaiting_registry_approval') {
    return { ...common, kind: 'registry_approval', title: 'Owner Registry 等待批准', detail: '请回到创建该 Workflow 的主会话处理完整 Registry 批次审批。Dashboard 保持只读。' }
  }
  if (phase === 'awaiting_revision_extension') {
    const decisionId = state.pendingPlanningDecision?.decisionId
    const notification = Object.values(state.mainOutbox ?? {})
      .find(item => item?.decisionId === decisionId)
    const questionActive = notification?.presentationStatus === 'active'
    return {
      ...common,
      kind: 'plan_revision_extension',
      title: '计划修订额度等待决定',
      detail: questionActive
        ? '计划已达到自动修订上限，原生决定卡片已直接在创建该 Workflow 的主会话打开；当前没有子代理仍在运行。'
        : '计划已达到自动修订上限。Runtime 正在主会话打开原生决定卡片；如果暂未出现，Runner 会继续重试。当前没有子代理仍在运行。',
    }
  }
  if (phase === 'planning_discussion_summarizing') {
    return {
      ...common,
      kind: 'planning_discussion_summarizing',
      title: reviewerDecision ? '正在汇总决策问题' : '正在总结规划现场',
      detail: reviewerDecision
        ? 'Reviewer 判定继续拆分前需要用户策略决定。只读总结子代理正在整理决策问题、当前事实和可选方向；不会继续猜测或执行代码。'
        : '用户已终止自动规划。只读总结子代理正在整理当前现场、多轮不收敛原因和可选方向；不会继续修订或执行代码。',
    }
  }
  if (phase === 'awaiting_main_discussion') {
    return {
      ...common,
      kind: 'planning_discussion_ready',
      title: reviewerDecision ? '决策问题已返回主线程' : '规划总结已返回主线程',
      detail: reviewerDecision
        ? '自动规划已暂停并保留现场。决策问题与当前事实已返回 Workflow 根会话，等待主线程与用户讨论；Runtime 不会自行选择策略。'
        : '自动规划已经终止并保留现场。总结已返回 Workflow 根会话，等待主线程与用户讨论下一步。',
    }
  }
  if (phase === 'planning_discussion_failed') {
    return {
      ...common,
      kind: 'planning_discussion_failed',
      title: '规划总结需要恢复',
      detail: '自动规划已停止且现场保留，但总结子代理未完成；Runtime 将使用持久审查事实生成兜底总结并返回主线程。',
    }
  }
  if (phase === 'plan_review_failed') {
    return { ...common, kind: 'plan_review_failed', title: '计划审查未通过', detail: '当前不是待批准状态。自动修订后仍未通过，请回到主会话根据 Reviewer 意见决定继续修订或调整范围。' }
  }
  if (phase === 'plan_revision_failed') {
    return { ...common, kind: 'plan_revision_failed', title: '计划修订已失败', detail: '计划修订已达到失败上限。请查看最后错误并决定调整需求、提高运行预算或取消 Workflow。' }
  }
  if (phase === 'plan_revision_required') {
    return { ...common, kind: 'plan_revision_required', title: '计划需要继续修订', detail: 'Reviewer 已要求修订，但当前没有 Planner 在运行；请回到主会话处理。' }
  }
  if (phase === 'plan_split_required') {
    return { ...common, kind: 'plan_split_required', title: 'DAG 节点需要继续拆分', detail: 'Reviewer 判定当前节点仍过大；Runtime 会结合相关 Owner 会诊递归展开目标节点，不应继续润色整份计划。' }
  }
  if (phase === 'plan_discovery_required') {
    return { ...common, kind: 'plan_discovery_required', title: 'DAG 等待只读调查', detail: 'Reviewer 判定缺少仓库或环境事实；Runtime 会先让相关 Owner 只读调查，再细化当前节点。' }
  }
  if (phase === 'planning_failed') {
    return { ...common, kind: 'planning_failed', title: '计划编排失败', detail: 'Runner watchdog 会先尝试有界恢复；若仍停留在这里，请回到主会话查看失败原因。' }
  }
  if (phase === 'blocked' || phase === 'failed') {
    return { ...common, kind: phase, title: phase === 'blocked' ? 'Workflow 已阻塞' : 'Workflow 执行失败', detail: '请回到主会话查看任务证据并决定恢复、调整或取消。' }
  }
  return undefined
}

function agentBySession(runtimeAgents, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  return runtimeAgents.find(agent => agent.sessionId === sessionId)
}

function dashboardActor({ sessionId, role, lifecycle, activity, updatedAt, taskId, ownerId }) {
  return {
    sessionId: dashboardText(sessionId, 300) || null,
    role,
    lifecycle,
    activity,
    ...(dashboardText(taskId, 300) === '' ? {} : { taskId: dashboardText(taskId, 300) }),
    ...(dashboardText(ownerId, 300) === '' ? {} : { ownerId: dashboardText(ownerId, 300) }),
    updatedAt: dashboardText(updatedAt, 100) || null,
  }
}

function ownerActorLifecycle(record, runtimeAgent) {
  if (record?.status === 'waiting_approval') return 'waiting_user_approval'
  if (record?.status === 'orphaned') return 'orphaned'
  if (record?.status === 'completed' || record?.status === 'committed') return 'completed'
  if (record?.status === 'failed') return 'failed'
  if (record?.status === 'blocked') return 'blocked'
  if (record?.status === 'stopped') return 'stopped'
  if (record?.status === 'starting') return 'starting'
  return runtimeAgent?.lifecycle ?? (record?.status === 'running' ? 'not_observed' : 'not_started')
}

function workflowStatusProjection(state, workspace, daemon, runtimeAgents) {
  const workflowId = dashboardText(state.id, 300)
  const runnerKey = `${workspace.id}:${workflowId}`
  const daemonActive = daemon?.active?.has(runnerKey) === true
  const runnerAttempt = daemon?.attempts?.get(runnerKey)
  const control = deriveWorkflowControl(state, { daemonActive })
  const counts = control.counts
  const phase = control.phase
  if (control.terminal) return undefined
  const mainSessionId = dashboardText(state.orchestratorSessionId ?? state.conversationRootSessionId, 300)
  const mainRuntime = agentBySession(runtimeAgents, mainSessionId)
  const terminal = ['failed', 'cancelled'].includes(state.status)
    || (state.status === 'completed' && state.finalized === true)
  const mainThread = dashboardActor({
    sessionId: mainSessionId,
    role: 'main',
    lifecycle: mainRuntime?.lifecycle ?? (terminal ? 'closed' : 'not_observed'),
    activity: mainThreadActivity(phase),
    updatedAt: mainRuntime?.updatedAt ?? state.updatedAt,
  })
  const subagents = []
  const seen = new Set()
  const addActor = actor => {
    const key = actor.sessionId ?? `${actor.role}:${actor.taskId ?? actor.activity}`
    if (seen.has(key)) return
    seen.add(key)
    subagents.push(actor)
  }
  const plannerSessionId = dashboardText(state.planningAgent?.childId, 300)
  if (plannerSessionId !== '' || ['planning', 'planned', 'registry_pending_plan'].includes(state.status)) {
    const plannerRuntime = agentBySession(runtimeAgents, plannerSessionId)
    addActor(dashboardActor({
      sessionId: plannerSessionId,
      role: 'planner',
      lifecycle: plannerRuntime?.lifecycle
        ?? (state.planningAgent?.phase === 'failed' || state.planningAgent?.phase === 'review_failed'
          ? 'failed'
          : 'not_observed'),
      activity: dashboardText(state.planningAgent?.phase, 100) || (state.status === 'planning' ? 'planning' : 'plan_submitted'),
      updatedAt: plannerRuntime?.updatedAt ?? state.planningAgent?.updatedAt ?? state.planCreatedAt,
    }))
  }
  const linkedReviewers = runtimeAgents.filter(agent => (
    agent.workflowId === workflowId && ['plan-reviewer', 'reviewer', 'memory-curator', 'memory-reviewer'].includes(agent.role)
  ))
  for (const reviewer of linkedReviewers) {
    addActor(dashboardActor({
      sessionId: reviewer.sessionId,
      role: reviewer.role,
      lifecycle: reviewer.lifecycle,
      activity: reviewer.role === 'plan-reviewer' ? 'plan_review' : reviewer.role,
      updatedAt: reviewer.updatedAt,
    }))
  }
  if (!linkedReviewers.some(agent => agent.role === 'plan-reviewer')
    && ['plan_review_not_started', 'plan_reviewing', 'awaiting_plan_approval', 'plan_revision_required'].includes(phase)) {
    addActor(dashboardActor({
      role: 'plan-reviewer',
      lifecycle: phase === 'plan_review_not_started'
        ? 'not_started'
        : phase === 'plan_reviewing' ? 'starting' : 'closed',
      activity: state.planReview?.status ?? (phase === 'plan_reviewing' ? 'plan_review' : phase),
      updatedAt: state.planReviewedAt ?? state.planningAgent?.updatedAt ?? state.planCreatedAt,
    }))
  }
  for (const record of Object.values(state.ownerRuns ?? {})) {
    const sessionId = dashboardText(record?.sessionId ?? record?.result?.sessionId, 300)
    const live = agentBySession(runtimeAgents, sessionId)
    addActor(dashboardActor({
      sessionId,
      role: 'owner',
      lifecycle: ownerActorLifecycle(record, live),
      activity: dashboardText(record?.phase ?? record?.status, 100) || 'owner_task',
      taskId: record?.taskId ?? record?.stageId,
      ownerId: record?.ownerId,
      updatedAt: live?.updatedAt ?? record?.updatedAt ?? record?.lastHeartbeatAt,
    }))
  }
  for (const agent of runtimeAgents.filter(item => item.workflowId === workflowId)) {
    if (agent.role === 'main') continue
    addActor(dashboardActor({
      sessionId: agent.sessionId,
      role: agent.role,
      lifecycle: agent.lifecycle,
      activity: agent.role,
      taskId: agent.taskId,
      ownerId: agent.ownerId,
      updatedAt: agent.updatedAt,
    }))
  }
  return {
    workflowId,
    goal: dashboardText(state.plan?.summary) || dashboardText(state.request),
    status: dashboardText(state.status, 100),
    phase,
    lifecycle: control.lifecycle,
    runnerAssignment: daemon?.online === true ? (daemonActive ? 'supervising' : 'idle') : 'offline',
    ...(runnerAttempt === undefined ? {} : { runnerAttempt }),
    execution: counts,
    mainThread,
    subagents,
    createdAt: dashboardText(state.createdAt, 100) || null,
    updatedAt: dashboardText(state.updatedAt, 100) || null,
  }
}

function operationStatusProjection(state, runtimeAgents) {
  const mainRuntime = agentBySession(runtimeAgents, state.parentSessionId)
  const operatorRuntime = agentBySession(runtimeAgents, state.childId)
  const terminal = ['completed', 'failed', 'cancelled'].includes(state.status)
  let operatorLifecycle = operatorRuntime?.lifecycle
  if (state.status === 'waiting_input') operatorLifecycle = 'waiting_user_input'
  else if (state.status === 'waiting_approval') operatorLifecycle = 'waiting_user_approval'
  else if (state.status === 'starting') operatorLifecycle ??= 'starting'
  else if (state.status === 'completed') operatorLifecycle = 'completed'
  else if (state.status === 'failed') operatorLifecycle = 'failed'
  else if (state.status === 'cancelled') operatorLifecycle = 'cancelled'
  else operatorLifecycle ??= 'not_observed'
  return {
    operationId: dashboardText(state.id, 300),
    goal: dashboardText(state.spec?.goal),
    status: dashboardText(state.status, 100),
    lifecycle: terminal ? state.status : ['waiting_input', 'waiting_approval'].includes(state.status) ? 'waiting' : 'active',
    mainThread: dashboardActor({
      sessionId: state.parentSessionId,
      role: 'main',
      lifecycle: mainRuntime?.lifecycle ?? (terminal ? 'closed' : 'not_observed'),
      activity: `operation_${state.status}`,
      updatedAt: mainRuntime?.updatedAt ?? state.updatedAt,
    }),
    subagents: [dashboardActor({
      sessionId: state.childId,
      role: 'operator',
      lifecycle: operatorLifecycle,
      activity: state.status,
      updatedAt: operatorRuntime?.updatedAt ?? state.updatedAt,
    })],
    createdAt: dashboardText(state.createdAt, 100) || null,
    updatedAt: dashboardText(state.updatedAt, 100) || null,
  }
}

function dashboardWorkflowWaitItem(state, workspace, daemon) {
  const revisionDecision = state.pendingPlanRevision?.review?.status === 'passed'
  const activeOwnerRecord = Object.values(state.ownerRuns ?? {})
    .filter(record => ['starting', 'running', 'waiting_approval'].includes(record?.status))
    .sort((left, right) => String(right.updatedAt ?? right.lastHeartbeatAt ?? right.startedAt ?? '')
      .localeCompare(String(left.updatedAt ?? left.lastHeartbeatAt ?? left.startedAt ?? '')))[0]
  const sessionId = dashboardText(
    revisionDecision
      ? state.conversationRootSessionId
      : activeOwnerRecord?.sessionId ?? state.orchestratorSessionId ?? state.planApprovedBy,
    300,
  )
  if (sessionId === '') return undefined
  const workflowId = dashboardText(state.id, 300)
  const daemonActive = daemon?.active?.has(`${workspace.id}:${workflowId}`) === true
  const control = deriveWorkflowControl(state, { daemonActive })
  const counts = control.counts
  const phase = control.phase
  const reviewerDecision = state.planReview?.status === 'needs_decision'
    || state.planningDiscussion?.source === 'plan-review-needs-decision'
  let waitState
  let waitingFor
  let statusText
  if (revisionDecision) {
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话批准 PlanRevision'
    statusText = `PlanRevision ${String(state.pendingPlanRevision.number)} 已通过独立审查，等待用户决定`
  } else if (activeOwnerRecord?.status === 'waiting_approval') {
    waitState = 'waiting_owner_approval'
    waitingFor = 'Owner 宿主授权'
    statusText = 'Owner 子代理正在等待宿主授权'
  } else if (control.command !== null && control.actionRequired !== true && daemon?.online !== true) {
    waitState = 'runner_offline'
    waitingFor = 'Runner daemon'
    statusText = `Runner daemon 未运行；恢复命令：${control.command}`
  } else if (phase === 'waiting_workflow_decision') {
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话一次性处理外部决定'
    statusText = 'Owner Workflow 正等待明确的外部输入或决定'
  } else if (phase === 'awaiting_plan_approval') {
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话批准计划'
    statusText = '计划已通过独立审查，等待用户批准执行'
  } else if (phase === 'awaiting_registry_approval') {
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话批准 Owner Registry'
    statusText = 'Owner Registry 提案等待用户决定'
  } else if (phase === 'awaiting_revision_extension') {
    const decisionId = state.pendingPlanningDecision?.decisionId
    const notification = Object.values(state.mainOutbox ?? {})
      .find(item => item?.decisionId === decisionId)
    const questionActive = notification?.presentationStatus === 'active'
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话决定是否扩展计划修订额度'
    statusText = questionActive
      ? '计划修订额度原生决定卡片已打开，等待用户选择'
      : '计划已达到自动修订上限，等待 Runtime 打开原生决定卡片'
  } else if (phase === 'planning_discussion_summarizing') {
    waitState = 'waiting_subagents'
    waitingFor = reviewerDecision ? '决策问题总结子代理' : '规划复盘总结子代理'
    statusText = reviewerDecision
      ? 'Reviewer 要求用户策略决定，正在生成只读现状与问题总结'
      : '用户已终止自动规划，正在生成只读现状总结'
  } else if (phase === 'awaiting_main_discussion') {
    waitState = 'waiting_workflow_decision'
    waitingFor = 'Workflow 根会话与用户讨论'
    statusText = reviewerDecision
      ? '自动规划已暂停，决策问题与现状总结已返回主线程'
      : '自动规划已终止，现状总结已返回主线程'
  } else if (phase === 'planning_discussion_failed') {
    waitState = 'workflow_stalled'
    waitingFor = 'Workflow Runtime 生成兜底总结'
    statusText = '自动规划已终止，总结子代理失败但现场仍保留'
  } else if (phase === 'planning_owner_consultation') {
    waitState = 'waiting_subagents'
    waitingFor = '相关 Owner 只读会诊'
    statusText = '相关 Owner 正结合各自设定和长期记忆参与 DAG 拆分'
  } else if (phase === 'plan_split_required') {
    waitState = 'waiting_runner'
    waitingFor = 'Planner 递归拆分目标节点'
    statusText = 'Reviewer 已要求拆小 DAG，而不是继续重写整份计划'
  } else if (phase === 'plan_discovery_required') {
    waitState = 'waiting_subagents'
    waitingFor = '相关 Owner 只读调查'
    statusText = 'Reviewer 已列出缺失事实，等待调查后再细化 DAG'
  } else if (phase === 'plan_revision_recovery_queued' || phase === 'plan_revision_retry_pending') {
    waitState = 'waiting_runner'
    waitingFor = 'Runner daemon 恢复 Planner'
    statusText = phase === 'plan_revision_retry_pending'
      ? '计划修订超时，等待 Runner 使用新版超时策略恢复'
      : 'Reviewer 要求修订且仍有预算，等待 Runner 自动恢复 Planner'
  } else if (phase === 'state_invariant_violation') {
    waitState = 'workflow_stalled'
    waitingFor = '新版 Workflow Runtime 重新解释持久状态'
    statusText = control.reason
  } else if (control.command !== null) {
    waitState = 'waiting_runner'
    waitingFor = `Runner 执行 ${control.command}`
    statusText = control.reason
  } else {
    return undefined
  }
  return {
    id: `workflow:${workflowId}`,
    source: 'workflow',
    workflowId,
    sessionId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    title: 'Owner Workflow',
    goal: dashboardText(state.plan?.summary) || dashboardText(state.request),
    state: waitState,
    waitingFor,
    statusText,
    detail: revisionDecision
      ? `候选摘要 ${dashboardText(state.pendingPlanRevision.planDigest, 80)}`
      : `未执行 ${counts.pendingTasks} · 执行中 ${counts.runningTasks} · 已完成 ${counts.completedTasks}`,
    runnerStatus: daemon?.online === true ? (daemonActive ? 'active' : 'online') : 'offline',
    ...counts,
    startedAt: state.planApprovedAt ?? state.createdAt,
    updatedAt: state.updatedAt ?? state.planApprovedAt ?? state.createdAt,
  }
}

/**
 * 返回所有已登记工作区的确定性运行状态、需要处理事项和遗留记录。磁盘 Workflow、
 * Operation、Agent runtime 与 Runner daemon 状态是唯一权威来源；浏览器不会得到本地路径、
 * 原始命令或进程编号。遗留项不会计入需要处理，也不会伪装成仍可继续的任务。
 */
export async function listDashboardWaits(catalogRoot) {
  const catalog = workspacePath(catalogRoot)
  const records = await readWorkspaceCatalog(catalog)
  const workspaces = records.length > 0
    ? records
    : [{ id: dashboardWorkspaceId(catalog), root: catalog, name: basename(catalog) || catalog }]
  const waits = []
  const staleWaits = []
  const statusWorkspaces = []
  const daemon = await readRunnerDaemonState(catalog)
  for (const workspace of workspaces) {
    const states = await listOperationStates(workspace.root).catch(() => [])
    const workflowStates = await listWorkflowWaitStates(workspace).catch(() => [])
    const runtimeAgents = await listAgentRuntimeStates(workspace).catch(() => [])
    for (const state of states) {
      const stale = staleOperationWait(state, states)
      const item = dashboardWaitItem(state, workspace, stale)
      if (item === undefined || item.sessionId === '') continue
      if (stale === undefined) waits.push(item)
      else staleWaits.push(item)
    }
    for (const state of workflowStates) {
      const item = dashboardWorkflowWaitItem(state, workspace, daemon)
      if (item !== undefined) waits.push(item)
    }
    const workflowIds = new Set(workflowStates.map(state => dashboardText(state.id, 300)))
    const operationIds = new Set(states.map(state => dashboardText(state.id, 300)))
    statusWorkspaces.push({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workflows: workflowStates
        .map(state => workflowStatusProjection(state, workspace, daemon, runtimeAgents))
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
      operations: states
        .map(state => operationStatusProjection(state, runtimeAgents))
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
      agents: runtimeAgents
        .filter(agent => !workflowIds.has(agent.workflowId) && !operationIds.has(agent.operationId))
        .map(agent => dashboardActor({
          sessionId: agent.sessionId,
          role: agent.role,
          lifecycle: agent.lifecycle,
          activity: agent.role,
          taskId: agent.taskId,
          ownerId: agent.ownerId,
          updatedAt: agent.updatedAt,
        })),
    })
  }
  waits.sort((left, right) => {
    const started = String(left.startedAt).localeCompare(String(right.startedAt))
    return started !== 0 ? started : left.id.localeCompare(right.id)
  })
  staleWaits.sort((left, right) => {
    const updated = String(right.updatedAt).localeCompare(String(left.updatedAt))
    return updated !== 0 ? updated : right.id.localeCompare(left.id)
  })
  return {
    contract: 'DSH_RUNTIME_STATUS_V1',
    runner: {
      process: daemon?.process ?? 'offline',
      assignment: daemon?.assignment ?? 'offline',
      generation: daemon?.generation ?? null,
      activeAttemptCount: daemon?.attempts?.size ?? 0,
      heartbeatAt: daemon?.heartbeatAt ?? null,
      startedAt: daemon?.startedAt ?? null,
    },
    workspaces: statusWorkspaces,
    waits,
    staleWaits,
  }
}

/**
 * 通过一个浏览器 SSE 连接持续发布运行状态快照。文件监听覆盖目录表及每个已登记
 * 工作区的 Operation、Workflow、Agent runtime 与 Runner 状态目录；内容未变化时不会重复发送。
 * 这里不运行周期轮询；监听器异常时主动断流，由浏览器重新建立 SSE。
 */
export async function serveDashboardWaitEvents(catalogRoot, response) {
  const catalog = workspacePath(catalogRoot)
  const watchers = new Map()
  let closed = false
  let publishTimer
  let baselineTimer
  let heartbeatTimer
  let lastPayload = ''

  const closeWatcher = watcher => {
    try { watcher.close() } catch { /* watcher 已经关闭 */ }
  }
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(publishTimer)
    clearInterval(baselineTimer)
    clearInterval(heartbeatTimer)
    for (const watcher of watchers.values()) closeWatcher(watcher)
    watchers.clear()
  }
  const disconnect = () => {
    if (closed) return
    response.destroy()
    close()
  }
  const publish = async force => {
    if (closed || response.destroyed || response.writableEnded) return
    const payload = JSON.stringify(await listDashboardWaits(catalog))
    if (!force && payload === lastPayload) return
    lastPayload = payload
    response.write(`event: waits\ndata: ${payload}\n\n`)
  }
  const watchDirectories = async () => {
    const records = await readWorkspaceCatalog(catalog)
    const roots = [catalog, ...records.map(record => record.root)]
    const operationDirectories = roots.map(root => join(projectionDirectory(root), 'operations'))
    const directories = new Set([
      join(projectionDirectory(catalog), DASHBOARD_DIRECTORY),
      ...roots.flatMap(root => {
        const runtime = projectionDirectory(root)
        return [
          runtime,
          join(runtime, 'operations'),
          join(runtime, 'workflows'),
          join(runtime, 'runner'),
          join(runtime, 'runtime'),
          join(runtime, 'runtime', 'agents'),
        ]
      }),
    ])
    for (const directory of operationDirectories) {
      if (!existsSync(directory)) continue
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        if (entry.isDirectory()) directories.add(join(directory, entry.name))
      }
    }
    for (const [directory, watcher] of watchers) {
      if (directories.has(directory) && existsSync(directory)) continue
      closeWatcher(watcher)
      watchers.delete(directory)
    }
    for (const directory of directories) {
      if (watchers.has(directory) || !existsSync(directory)) continue
      try {
        const watcher = watch(directory, { persistent: false }, () => schedulePublish())
        watcher.on('error', () => {
          closeWatcher(watcher)
          watchers.delete(directory)
          schedulePublish()
        })
        watchers.set(directory, watcher)
      } catch {
        // 父目录监听仍可捕获目录重建；单个细分目录不可监听时保持 SSE 连接。
      }
    }
    return true
  }
  const schedulePublish = () => {
    clearTimeout(publishTimer)
    publishTimer = setTimeout(() => {
      void publish(false)
        .then(() => watchDirectories())
        .catch(disconnect)
    }, 20)
    publishTimer.unref?.()
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  })
  response.flushHeaders?.()
  response.write(': waits 已连接\n\n')
  response.once('close', close)
  response.once('error', close)
  if (!await watchDirectories()) return
  await publish(true)
  baselineTimer = setInterval(schedulePublish, DASHBOARD_BASELINE_POLL_MS)
  baselineTimer.unref?.()
  heartbeatTimer = setInterval(() => {
    if (closed || response.destroyed || response.writableEnded) return
    try { response.write(': heartbeat\n\n') } catch { disconnect() }
  }, DASHBOARD_HEARTBEAT_MS)
  heartbeatTimer.unref?.()
}

function projectionEvents(projection, previous) {
  const workflowId = requireWorkflowId(projection?.workflowId)
  const tasks = Array.isArray(projection.tasks) ? projection.tasks : []
  const previousTasks = new Map(
    (Array.isArray(previous?.tasks) ? previous.tasks : [])
      .map(task => [task?.id ?? task?.taskId, task]),
  )
  const events = []
  for (const task of tasks) {
    const taskId = task?.id ?? task?.taskId
    if (typeof taskId !== 'string') continue
    const prior = previousTasks.get(taskId)
    if (prior === undefined || stableJson(prior) !== stableJson(task)) {
      events.push({ workflowId, type: 'task.updated', task: cloneJson(task, 'task') })
    }
  }
  if (events.length === 0 && stableJson(projection) !== stableJson(previous)) {
    events.push({ workflowId, type: 'progress.updated', progress: cloneJson(projection, 'progress 投影') })
  }
  return events
}

function projectionSnapshot(projection) {
  const events = projectionEvents(projection, undefined)
  return events.length > 0
    ? events
    : [{
        workflowId: requireWorkflowId(projection?.workflowId),
        type: 'progress.updated',
        progress: cloneJson(projection, 'progress 投影'),
      }]
}

function ssePayload(event) {
  const normalized = normalizeEvent(event) ?? { type: 'progress.updated', progress: event }
  return [
    `data: ${JSON.stringify(normalized)}`,
    '',
  ].join('\n') + '\n'
}

function safeJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function errorStatus(error) {
  return error?.code === 'ENOENT' ? 404 : 500
}

function safeProjectionError(error) {
  return {
    status: errorStatus(error),
    body: { error: 'Dashboard progress 投影不可用' },
  }
}

function enqueueAppend(path, operation) {
  const previous = appendQueues.get(path) ?? Promise.resolve()
  const next = previous.then(operation, operation)
  appendQueues.set(path, next)
  return next.finally(() => {
    if (appendQueues.get(path) === next) appendQueues.delete(path)
  })
}

function broadcastToInstances(workspace, workflowId, callback) {
  const target = workspacePath(workspace)
  const targetWorkflowId = requireWorkflowId(workflowId)
  for (const instance of dashboardInstances) {
    if (instance.workspace === target && instance.workflowId === targetWorkflowId) callback(instance)
  }
}

function projectionEvent(projection, previous) {
  return projectionEvents(projection, previous)
}

function createDashboardInstance(workspace, workflowId) {
  const target = workspacePath(workspace)
  const targetWorkflowId = requireWorkflowId(workflowId)
  const directory = dashboardDirectory(target, targetWorkflowId)
  const progressFile = progressPath(target, targetWorkflowId)
  const eventsFile = eventsPath(target, targetWorkflowId)
  const dashboardRoot = join(projectionDirectory(target), DASHBOARD_DIRECTORY)
  const runtimeRoot = projectionDirectory(target)
  const clients = new Set()
  const seenEvents = new Set()
  const replayedEvents = new Set()
  let replayedProjection = false
  let currentProjection
  let directoryWatcher
  let workspaceWatcher
  let projectionTimer
  let eventsTimer
  let baselineTimer
  let heartbeatTimer

  function eventKey(event) {
    return typeof event.id === 'string' && event.id !== '' ? `id:${event.id}` : `json:${stableJson(event)}`
  }

  function writeEvent(response, event) {
    if (response.destroyed || response.writableEnded) return false
    try {
      response.write(ssePayload(event))
      return true
    } catch {
      return false
    }
  }

  function removeClient(client) {
    clients.delete(client)
  }

  function addClient(response) {
    const client = { response }
    clients.add(client)
    const cleanup = () => removeClient(client)
    response.once('close', cleanup)
    response.once('error', cleanup)
    return client
  }

  function broadcast(event, { dedupe = true } = {}) {
    const normalized = normalizeEvent(event)
    if (normalized === undefined || normalized.workflowId !== targetWorkflowId) return
    const key = eventKey(normalized)
    if (dedupe && seenEvents.has(key)) return
    if (dedupe) seenEvents.add(key)
    for (const client of clients) {
      if (!writeEvent(client.response, normalized)) removeClient(client)
    }
  }

  function updateProjection(projection, { shouldBroadcast = true } = {}) {
    const previous = currentProjection
    const nextProjection = cloneJson(projection, 'progress 投影')
    if (nextProjection.workflowId !== targetWorkflowId) {
      throw new Error(`progress 投影与 Dashboard workflowId 不一致：${targetWorkflowId}`)
    }
    currentProjection = nextProjection
    if (!shouldBroadcast || stableJson(previous) === stableJson(currentProjection)) return
    for (const event of projectionEvent(currentProjection, previous)) {
      broadcast({
        ...event,
        workflowId: targetWorkflowId,
        id: randomUUID(),
        projection: currentProjection,
      }, { dedupe: false })
    }
  }

  async function loadProjection({ required = true } = {}) {
    try {
      const projection = JSON.parse(await readFile(progressFile, 'utf8'))
      const normalized = progressProjection(projection)
      if (normalized.workflowId !== targetWorkflowId) {
        throw new Error(`progress 投影与 Dashboard workflowId 不一致：${targetWorkflowId}`)
      }
      updateProjection(normalized, { shouldBroadcast: true })
      return normalized
    } catch (error) {
      if (!required && error?.code === 'ENOENT') return undefined
      throw error
    }
  }

  async function processNewEvents() {
    const events = await readEvents(target, targetWorkflowId)
    for (const event of events) broadcast(event)
  }

  function scheduleProjection() {
    clearTimeout(projectionTimer)
    projectionTimer = setTimeout(() => {
      void loadProjection({ required: false }).catch(() => undefined)
    }, 5)
    projectionTimer.unref?.()
  }

  function scheduleEvents() {
    clearTimeout(eventsTimer)
    eventsTimer = setTimeout(() => {
      void processNewEvents().catch(() => undefined)
    }, 5)
    eventsTimer.unref?.()
  }

  function closeWatcher(watcher) {
    try { watcher?.close() } catch { /* watcher 已经关闭 */ }
  }

  function attachDirectoryWatcher() {
    closeWatcher(directoryWatcher)
    if (!existsSync(directory)) return false
    try {
      directoryWatcher = watch(directory, { persistent: false }, (_eventType, filename) => {
        const name = filename?.toString()
        if (name === undefined || name === '' || name === PROGRESS_FILE || name?.startsWith(`${PROGRESS_FILE}.tmp-`)) {
          scheduleProjection()
        }
        if (name === undefined || name === '' || name === EVENTS_FILE) scheduleEvents()
      })
      directoryWatcher.on('error', () => undefined)
      return true
    } catch {
      directoryWatcher = undefined
      return false
    }
  }

  function attachWorkspaceWatcher() {
    closeWatcher(workspaceWatcher)
    const watchTarget = existsSync(dashboardRoot)
      ? dashboardRoot
      : existsSync(runtimeRoot)
        ? runtimeRoot
        : target
    const expectedName = watchTarget === dashboardRoot
      ? targetWorkflowId
      : watchTarget === runtimeRoot
        ? DASHBOARD_DIRECTORY
        : OWNER_RUNTIME_DIRECTORY
    try {
      workspaceWatcher = watch(watchTarget, { persistent: false }, (_eventType, filename) => {
        const name = filename?.toString()
        if (name === undefined || name === '' || name === expectedName) {
          if (attachDirectoryWatcher()) {
            closeWatcher(workspaceWatcher)
            workspaceWatcher = undefined
            void loadProjection({ required: false }).catch(() => undefined)
            void processNewEvents().catch(() => undefined)
          } else {
            attachWorkspaceWatcher()
          }
        }
      })
      workspaceWatcher.on('error', () => undefined)
    } catch {
      workspaceWatcher = undefined
    }
  }

  async function initialize() {
    const existingEvents = await readEvents(target, targetWorkflowId)
    for (const event of existingEvents) seenEvents.add(eventKey(event))
    try {
      const projection = await loadProjection({ required: false })
      if (projection !== undefined) updateProjection(projection, { shouldBroadcast: false })
    } catch {
      // Dashboard 可以在 runtime 尚未写出首个投影时启动；请求时仍会 fail-closed。
    }
    if (!attachDirectoryWatcher()) attachWorkspaceWatcher()
    baselineTimer = setInterval(() => {
      void Promise.all([
        loadProjection({ required: false }),
        processNewEvents(),
      ]).catch(() => undefined)
    }, DASHBOARD_BASELINE_POLL_MS)
    baselineTimer.unref?.()
    heartbeatTimer = setInterval(() => {
      for (const client of clients) {
        if (client.response.destroyed || client.response.writableEnded) {
          removeClient(client)
          continue
        }
        try { client.response.write(': heartbeat\n\n') } catch { removeClient(client) }
      }
    }, DASHBOARD_HEARTBEAT_MS)
    heartbeatTimer.unref?.()
  }

  async function serveEvents(response) {
    const projection = await loadProjection()
    const events = await readEvents(target, targetWorkflowId)
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    })
    response.flushHeaders?.()
    // 立即写入注释帧，确保代理、fetch 与浏览器都会建立流式响应，随后再发送首个真实事件。
    response.write(': dashboard 已连接\n\n')
    const client = addClient(response)
      for (const event of events) {
      const key = eventKey(event)
      if (replayedEvents.has(key)) continue
      if (!writeEvent(response, event)) {
        removeClient(client)
        return
      }
      replayedEvents.add(key)
    }
    if (!replayedProjection) {
      for (const event of projectionSnapshot(projection)) {
          if (!writeEvent(response, { ...event, workflowId: targetWorkflowId, id: randomUUID(), projection })) {
          removeClient(client)
          return
        }
      }
      replayedProjection = true
    }
  }

  async function handle(request, response) {
    if (request.method !== 'GET') {
      safeJson(response, 404, { error: 'Dashboard 只提供只读 GET 接口' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/api/progress') {
      try {
        const projection = await loadProjection()
        safeJson(response, 200, projection)
      } catch (error) {
        const safe = safeProjectionError(error)
        safeJson(response, safe.status, safe.body)
      }
      return
    }
    if (url.pathname === '/events') {
      try {
        await serveEvents(response)
      } catch (error) {
        const safe = safeProjectionError(error)
        safeJson(response, safe.status, safe.body)
      }
      return
    }
    safeJson(response, 404, { error: 'Dashboard 路径不存在' })
  }

  function receiveProjection(projection) {
    updateProjection(projection, { shouldBroadcast: true })
  }

  function receiveEvent(event) {
    broadcast(event)
  }

  async function close() {
    clearTimeout(projectionTimer)
    clearTimeout(eventsTimer)
    clearInterval(baselineTimer)
    clearInterval(heartbeatTimer)
    closeWatcher(directoryWatcher)
    closeWatcher(workspaceWatcher)
    for (const client of clients) client.response.end()
    clients.clear()
    dashboardInstances.delete(instance)
  }

  const instance = {
    workspace: target,
    workflowId: targetWorkflowId,
    handle,
    initialize,
    receiveProjection,
    receiveEvent,
    close,
  }
  return instance
}

export async function serveDashboardWorkflowEvents(workspace, workflowId, response) {
  const instance = createDashboardInstance(workspace, workflowId)
  dashboardInstances.add(instance)
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await instance.close().catch(() => undefined)
  }
  response.once('close', () => { void close() })
  response.once('error', () => { void close() })
  try {
    await instance.initialize()
    await instance.handle({ method: 'GET', url: '/events' }, response)
  } catch (error) {
    await close()
    throw error
  }
}

export async function writeProgressProjection(root, state) {
  const workspace = workspacePath(root)
  const projection = progressProjection(state)
  const workflowId = requireWorkflowId(projection.workflowId)
  const directory = dashboardDirectory(workspace, workflowId)
  const path = progressPath(workspace, workflowId)
  await mkdir(directory, { recursive: true })
  const temporary = `${path}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
  broadcastToInstances(workspace, workflowId, instance => instance.receiveProjection(projection))
  return projection
}

export async function appendProjectionEvent(root, workflowIdOrType, typeOrData = {}, maybeData) {
  const hasExplicitWorkflowId = maybeData !== undefined
  const type = hasExplicitWorkflowId ? typeOrData : workflowIdOrType
  const data = hasExplicitWorkflowId ? maybeData : typeOrData
  if (typeof type !== 'string' || type.trim() === '') throw new Error('Dashboard 事件 type 必须是非空字符串')
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dashboard 事件 data 必须是对象')
  const workflowId = requireWorkflowId(hasExplicitWorkflowId ? workflowIdOrType : data.workflowId)
  if (data.workflowId !== undefined && requireWorkflowId(data.workflowId) !== workflowId) {
    throw new Error('Dashboard 事件 workflowId 不一致')
  }
  const workspace = workspacePath(root)
  const path = eventsPath(workspace, workflowId)
  const entry = {
    ...cloneJson(data, 'Dashboard 事件 data'),
    workflowId,
    id: randomUUID(),
    time: new Date().toISOString(),
    type: type.trim(),
    event: type.trim(),
  }
  await mkdir(dashboardDirectory(workspace, workflowId), { recursive: true })
  await enqueueAppend(path, () => appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8'))
  broadcastToInstances(workspace, workflowId, instance => instance.receiveEvent(entry))
  return entry
}

export async function startDashboard(workspace, { workflowId, port = 57357 } = {}) {
  const target = workspacePath(workspace)
  const targetWorkflowId = requireWorkflowId(workflowId)
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Dashboard port 必须是 0-65535 的整数')
  }
  const instance = createDashboardInstance(target, targetWorkflowId)
  const server = createServer((request, response) => {
    void instance.handle(request, response)
  })
  instance.server = server
  dashboardInstances.add(instance)
  try {
    await instance.initialize()
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen({ host: '127.0.0.1', port }, resolveListen)
    })
  } catch (error) {
    dashboardInstances.delete(instance)
    await instance.close().catch(() => undefined)
    if (server.listening) await new Promise(resolveClose => server.close(() => resolveClose()))
    throw error
  }
  server.once('close', () => { void instance.close() })
  return {
    server,
    workflowId: targetWorkflowId,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await instance.close()
      if (server.listening) await new Promise(resolveClose => server.close(() => resolveClose()))
    },
  }
}
