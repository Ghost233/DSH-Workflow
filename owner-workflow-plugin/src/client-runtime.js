const React = require('react')
const {
  createElement: h,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} = React

const WAIT_EVENTS_ENDPOINT = '/owner-workflow/api/waits/events'
const CLIENT_APPLIED_MARKER = '__DSH_OWNER_WORKFLOW_WAIT_SLOTS_APPLIED__'
const EMPTY_WAITS = Object.freeze([])
const EMPTY_STATUS_WORKSPACES = Object.freeze([])
const ALLOWED_STATES = new Set([
  'waiting_operator',
  'waiting_user_input',
  'waiting_user_approval',
  'waiting_runner',
  'running_owner',
  'waiting_owner_approval',
  'waiting_dependencies',
  'waiting_workflow_decision',
  'runner_offline',
  'runner_error',
  'workflow_stalled',
])

let waitSnapshot = Object.freeze({
  phase: 'idle',
  waits: EMPTY_WAITS,
  staleWaits: EMPTY_WAITS,
  runner: Object.freeze({ process: 'offline', assignment: 'offline', heartbeatAt: null, startedAt: null }),
  workspaces: EMPTY_STATUS_WORKSPACES,
  error: null,
  updatedAt: 0,
})
let waitEvents
const waitListeners = new Set()

function text(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeWait(value, disposition = 'active') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const state = text(value.state, 100)
  const id = text(value.id, 300)
  const sessionId = text(value.sessionId, 300)
  if (id === '' || sessionId === '' || !ALLOWED_STATES.has(state)) return undefined
  return Object.freeze({
    id,
    source: text(value.source, 100),
    operationId: text(value.operationId, 300),
    workflowId: text(value.workflowId, 300),
    sessionId,
    workspaceId: text(value.workspaceId, 100),
    workspaceName: text(value.workspaceName, 300),
    title: text(value.title, 200) || '后台 Operation',
    goal: text(value.goal),
    state,
    waitingFor: text(value.waitingFor, 200),
    statusText: text(value.statusText, 300),
    detail: text(value.detail),
    action: text(value.action),
    risk: text(value.risk),
    runnerStatus: text(value.runnerStatus, 100),
    totalTasks: Number.isSafeInteger(value.totalTasks) ? value.totalTasks : 0,
    pendingTasks: Number.isSafeInteger(value.pendingTasks) ? value.pendingTasks : 0,
    runningTasks: Number.isSafeInteger(value.runningTasks) ? value.runningTasks : 0,
    queuedTasks: Number.isSafeInteger(value.queuedTasks) ? value.queuedTasks : 0,
    waitingDependencyTasks: Number.isSafeInteger(value.waitingDependencyTasks) ? value.waitingDependencyTasks : 0,
    waitingDecisionTasks: Number.isSafeInteger(value.waitingDecisionTasks) ? value.waitingDecisionTasks : 0,
    completedTasks: Number.isSafeInteger(value.completedTasks) ? value.completedTasks : 0,
    disposition,
    staleCode: text(value.staleCode, 100),
    staleReason: text(value.staleReason),
    supersededBy: text(value.supersededBy, 300),
    startedAt: text(value.startedAt, 100),
    updatedAt: text(value.updatedAt, 100),
  })
}

function normalizeActor(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const role = text(value.role, 100)
  const lifecycle = text(value.lifecycle, 100)
  if (role === '' || lifecycle === '') return undefined
  return Object.freeze({
    sessionId: text(value.sessionId, 300),
    role,
    lifecycle,
    activity: text(value.activity, 100),
    taskId: text(value.taskId, 300),
    ownerId: text(value.ownerId, 300),
    updatedAt: text(value.updatedAt, 100),
  })
}

function normalizeRuntimeEntry(value, kind) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const id = text(kind === 'workflow' ? value.workflowId : value.operationId, 300)
  if (id === '') return undefined
  const mainThread = normalizeActor(value.mainThread)
  const subagents = Array.isArray(value.subagents)
    ? value.subagents.map(normalizeActor).filter(item => item !== undefined)
    : []
  return Object.freeze({
    kind,
    id,
    goal: text(value.goal),
    status: text(value.status, 100),
    phase: text(value.phase, 100) || text(value.status, 100),
    lifecycle: text(value.lifecycle, 100),
    runnerAssignment: text(value.runnerAssignment, 100),
    execution: value.execution === null || typeof value.execution !== 'object' ? {} : Object.freeze({
      totalTasks: Number.isSafeInteger(value.execution.totalTasks) ? value.execution.totalTasks : 0,
      pendingTasks: Number.isSafeInteger(value.execution.pendingTasks) ? value.execution.pendingTasks : 0,
      runningTasks: Number.isSafeInteger(value.execution.runningTasks) ? value.execution.runningTasks : 0,
      completedTasks: Number.isSafeInteger(value.execution.completedTasks) ? value.execution.completedTasks : 0,
    }),
    mainThread,
    subagents: Object.freeze(subagents),
    createdAt: text(value.createdAt, 100),
    updatedAt: text(value.updatedAt, 100),
  })
}

function normalizeStatusWorkspace(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const workspaceId = text(value.workspaceId, 100)
  if (workspaceId === '') return undefined
  return Object.freeze({
    workspaceId,
    workspaceName: text(value.workspaceName, 300) || '未命名工作区',
    workflows: Object.freeze((Array.isArray(value.workflows) ? value.workflows : [])
      .map(item => normalizeRuntimeEntry(item, 'workflow')).filter(item => item !== undefined)),
    operations: Object.freeze((Array.isArray(value.operations) ? value.operations : [])
      .map(item => normalizeRuntimeEntry(item, 'operation')).filter(item => item !== undefined)),
    agents: Object.freeze((Array.isArray(value.agents) ? value.agents : [])
      .map(normalizeActor).filter(item => item !== undefined)),
  })
}

function publishWaitSnapshot(next) {
  waitSnapshot = Object.freeze(next)
  for (const listener of waitListeners) listener()
}

function waitSnapshotFromBody(body) {
  const compatibleV1 = body?.contract === 'DSH_WAIT_LIST_V1' && Array.isArray(body.waits)
  const currentV2 = ['DSH_WAIT_LIST_V2', 'DSH_WAIT_LIST_V3'].includes(body?.contract)
    && Array.isArray(body.waits)
    && Array.isArray(body.staleWaits)
  const runtimeStatus = body?.contract === 'DSH_RUNTIME_STATUS_V1'
    && Array.isArray(body.waits)
    && Array.isArray(body.staleWaits)
    && Array.isArray(body.workspaces)
  if (!compatibleV1 && !currentV2 && !runtimeStatus) throw new Error('运行状态接口契约无效')
  const waits = body.waits.map(value => normalizeWait(value, 'active')).filter(item => item !== undefined)
  const staleWaits = compatibleV1
    ? []
    : body.staleWaits.map(value => normalizeWait(value, 'stale')).filter(item => item !== undefined)
  return {
    phase: 'ready',
    waits: Object.freeze(waits),
    staleWaits: Object.freeze(staleWaits),
    runner: runtimeStatus ? Object.freeze({
      process: text(body.runner?.process, 100) || 'offline',
      assignment: text(body.runner?.assignment, 100) || 'offline',
      heartbeatAt: text(body.runner?.heartbeatAt, 100) || null,
      startedAt: text(body.runner?.startedAt, 100) || null,
    }) : waitSnapshot.runner,
    workspaces: runtimeStatus
      ? Object.freeze(body.workspaces.map(normalizeStatusWorkspace).filter(item => item !== undefined))
      : waitSnapshot.workspaces,
    error: null,
    updatedAt: Date.now(),
  }
}

function connectWaitEvents() {
  if (waitEvents !== undefined) return
  if (typeof EventSource !== 'function') {
    publishWaitSnapshot({
      ...waitSnapshot,
      phase: 'error',
      error: '当前浏览器不支持运行状态实时连接',
    })
    return
  }
  publishWaitSnapshot({ ...waitSnapshot, phase: 'connecting', error: null })
  waitEvents = new EventSource(WAIT_EVENTS_ENDPOINT, { withCredentials: true })
  waitEvents.onopen = () => {
    publishWaitSnapshot({
      ...waitSnapshot,
      phase: waitSnapshot.updatedAt === 0 ? 'connecting' : 'ready',
      error: null,
    })
  }
  waitEvents.addEventListener('waits', event => {
    try {
      publishWaitSnapshot(waitSnapshotFromBody(JSON.parse(event.data)))
    } catch (error) {
      publishWaitSnapshot({
        phase: 'error',
        waits: waitSnapshot.waits,
        staleWaits: waitSnapshot.staleWaits,
        runner: waitSnapshot.runner,
        workspaces: waitSnapshot.workspaces,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: waitSnapshot.updatedAt,
      })
    }
  })
  waitEvents.onerror = () => {
    publishWaitSnapshot({
      phase: 'disconnected',
      waits: waitSnapshot.waits,
      staleWaits: waitSnapshot.staleWaits,
      runner: waitSnapshot.runner,
      workspaces: waitSnapshot.workspaces,
      error: '实时连接已断开，正在重连',
      updatedAt: waitSnapshot.updatedAt,
    })
  }
}

function subscribeWaits(listener) {
  waitListeners.add(listener)
  if (waitListeners.size === 1) connectWaitEvents()
  return () => {
    waitListeners.delete(listener)
    if (waitListeners.size !== 0) return
    waitEvents?.close()
    waitEvents = undefined
  }
}

function useWaitSnapshot() {
  return useSyncExternalStore(subscribeWaits, () => waitSnapshot, () => waitSnapshot)
}

function useDismissOnOutsidePointer(rootRef, open, setOpen) {
  useEffect(() => {
    if (!open) return undefined
    const dismiss = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open, rootRef, setOpen])
}

function useNow(open) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])
  return now
}

function elapsedText(startedAt, now) {
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start)) return '未知'
  const total = Math.max(0, Math.floor((now - start) / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}

function waitStatus(state) {
  if (state === 'waiting_user_input') return { label: '等待信息', tone: 'input' }
  if (state === 'waiting_user_approval') return { label: '等待授权', tone: 'approval' }
  if (state === 'waiting_owner_approval') return { label: 'Owner 等待授权', tone: 'approval' }
  if (state === 'waiting_workflow_decision') return { label: '等待决定', tone: 'input' }
  if (state === 'runner_offline') return { label: 'Runner 离线', tone: 'error' }
  if (state === 'runner_error') return { label: '执行异常', tone: 'error' }
  if (state === 'workflow_stalled') return { label: '流程停滞', tone: 'error' }
  if (state === 'waiting_runner') return { label: '等待接管', tone: 'runner' }
  if (state === 'waiting_dependencies') return { label: '等待依赖', tone: 'dependency' }
  if (state === 'running_owner') return { label: 'Owner 执行中', tone: 'running' }
  return { label: '运行中', tone: 'running' }
}

function waitIdentifier(item) {
  return item.workflowId || item.operationId
}

function workflowTotals(waits) {
  return waits.reduce((total, item) => ({
    workflows: total.workflows + (item.source === 'workflow' ? 1 : 0),
    pending: total.pending + (item.source === 'workflow' ? item.pendingTasks : 0),
    running: total.running + (item.source === 'workflow' ? item.runningTasks : 0),
  }), { workflows: 0, pending: 0, running: 0 })
}

function waitSummary(waits, staleCount = 0) {
  const workflow = workflowTotals(waits)
  const operationCount = waits.filter(item => item.source === 'operation').length
  const parts = []
  if (workflow.workflows > 0) parts.push(`未执行 ${workflow.pending}`, `执行中 ${workflow.running}`)
  if (operationCount > 0) parts.push(`Operation ${operationCount}`)
  if (staleCount > 0) parts.push(`遗留 ${staleCount}`)
  return parts.length > 0 ? parts.join(' · ') : '当前没有等待事项'
}

function nativeInteractionWaits(sessions) {
  const labels = {
    approval: { state: 'waiting_user_approval', goal: '等待权限批准', waitingFor: '用户授权' },
    question: { state: 'waiting_user_input', goal: '等待补充信息', waitingFor: '用户回答' },
    'plan-review': { state: 'waiting_workflow_decision', goal: '等待计划审查', waitingFor: '用户审查' },
  }
  return Object.values(sessions.byId ?? {}).flatMap(session => {
    const selected = labels[session.pendingInteraction]
    if (selected === undefined) return []
    const startedAt = Number.isFinite(session.updatedAt)
      ? new Date(session.updatedAt).toISOString()
      : new Date().toISOString()
    return [{
      id: `native:${session.id}:${session.pendingInteraction}`,
      source: 'native',
      operationId: '',
      workflowId: '',
      sessionId: session.id,
      workspaceId: '',
      workspaceName: '',
      title: session.displayTitle || session.title || `会话 ${session.id}`,
      goal: selected.goal,
      state: selected.state,
      waitingFor: selected.waitingFor,
      statusText: 'Harness 原生交互正在目标会话等待处理',
      detail: '点击返回请求产生的会话，在原始上下文中完成处理。',
      action: '',
      risk: '',
      runnerStatus: '',
      totalTasks: 0,
      pendingTasks: 0,
      runningTasks: 0,
      queuedTasks: 0,
      waitingDependencyTasks: 0,
      waitingDecisionTasks: 0,
      completedTasks: 0,
      disposition: 'active',
      staleCode: '',
      staleReason: '',
      supersededBy: '',
      startedAt,
      updatedAt: startedAt,
    }]
  })
}

function mergeActionWaits(snapshot, sessions) {
  const merged = [...snapshot.waits]
  const seen = new Set(merged.map(item => `${item.sessionId}:${item.state}`))
  for (const item of nativeInteractionWaits(sessions)) {
    const key = `${item.sessionId}:${item.state}`
    if (!seen.has(key)) merged.push(item)
  }
  return merged
}

function WaitDetails({ item }) {
  const identifier = waitIdentifier(item)
  return h('details', { className: 'dsh-owner-wait-details' },
    h('summary', null, '查看详情'),
    h('div', { className: 'dsh-owner-wait-detail-body' },
      h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '等待对象：'), item.waitingFor || '未知'),
      h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '运行状态：'), item.statusText || '等待中'),
      item.action === '' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '待定动作：'), item.action),
      item.risk === '' ? null : h('div', { className: 'dsh-owner-wait-line dsh-owner-wait-risk' }, h('b', null, '风险：'), item.risk),
      item.source !== 'workflow' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '任务统计：'), `未执行 ${item.pendingTasks} · 执行中 ${item.runningTasks} · 等待依赖 ${item.waitingDependencyTasks} · 已完成 ${item.completedTasks}`),
      h('div', { className: 'dsh-owner-wait-id', title: identifier }, identifier),
    ),
  )
}

function WaitItem({ item, now, openSession }) {
  const status = waitStatus(item.state)
  const navigate = event => {
    if (event.target?.closest?.('details')) return
    openSession?.(item.sessionId)
  }
  return h('li', {
    className: `dsh-owner-wait-item dsh-owner-wait-item-${status.tone} dsh-owner-wait-item-actionable`,
    role: 'button',
    tabIndex: 0,
    onClick: navigate,
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') navigate(event)
    },
  },
    h('div', { className: 'dsh-owner-wait-card-head' },
      h('span', { className: `dsh-owner-wait-status dsh-owner-wait-status-${status.tone}` }, status.label),
      h('span', { className: 'dsh-owner-wait-elapsed' }, `已等待 ${elapsedText(item.startedAt, now)}`),
    ),
    h('div', { className: 'dsh-owner-wait-goal' }, item.goal || (item.source === 'workflow' ? 'Owner Workflow' : '后台 Operation')),
    item.detail === '' ? null : h('div', { className: 'dsh-owner-wait-current' }, item.detail),
    h(WaitDetails, { item }),
    h('div', { className: 'dsh-owner-wait-note' },
      item.source === 'workflow'
        ? item.state === 'waiting_owner_approval'
          ? '点击返回 Owner 子代理会话处理精确授权；主流程已经保留任务与审批状态。'
          : item.state === 'runner_offline' || item.state === 'runner_error' || item.state === 'workflow_stalled' || item.state === 'waiting_workflow_decision'
          ? '请在主对话处理该执行状态；现场和任务记录已保留。'
          : 'Runner 会继续驱动 Harness 内的 Owner 子代理，不会额外调用模型。'
        : item.state === 'waiting_operator'
          ? '后台完成后会自动回到主对话。'
          : item.source === 'native'
            ? '点击返回请求产生的会话；授权或问询只在原始现场处理。'
            : '请在主对话处理；同一后台子代理正以可续接状态等待，并非失败或被中断。处理后结果会继续转回这里。',
    ),
  )
}

function StaleWaitItem({ item, now }) {
  return h('li', { className: 'dsh-owner-wait-item dsh-owner-wait-item-stale' },
    h('div', { className: 'dsh-owner-wait-card-head' },
      h('span', { className: 'dsh-owner-wait-status dsh-owner-wait-status-stale' }, '已失效'),
      h('span', { className: 'dsh-owner-wait-elapsed' }, `创建于 ${elapsedText(item.startedAt, now)}前`),
    ),
    h('div', { className: 'dsh-owner-wait-goal' }, item.goal || '后台 Operation'),
    h('div', { className: 'dsh-owner-wait-stale-reason' }, item.staleReason || '这条记录已不能继续处理。'),
    h('details', { className: 'dsh-owner-wait-details' },
      h('summary', null, '查看记录'),
      h('div', { className: 'dsh-owner-wait-detail-body' },
        item.detail === '' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '原等待信息：'), item.detail),
        h('div', { className: 'dsh-owner-wait-id', title: item.operationId }, item.operationId),
      ),
    ),
  )
}

function WaitList({ waits, now, label, stale = false, openSession }) {
  if (waits.length === 0) {
    return h('div', { className: 'dsh-owner-wait-empty' }, '当前没有需要处理的事项。')
  }
  return h('ul', { className: 'dsh-owner-wait-list', 'aria-label': label },
    waits.map(item => stale
      ? h(StaleWaitItem, { key: item.id, item, now })
      : h(WaitItem, { key: item.id, item, now, openSession })),
  )
}

function WaitSection({ title, waits, now, label, openSession }) {
  if (waits.length === 0) return null
  return h('section', { className: 'dsh-owner-wait-section' },
    h('div', { className: 'dsh-owner-wait-section-title' },
      h('span', null, title),
      h('span', { className: 'dsh-owner-wait-section-count' }, waits.length),
    ),
    h(WaitList, { waits, now, label, openSession }),
  )
}

function StaleWaitSection({ waits, now, label, children }) {
  if (waits.length === 0) return null
  return h('details', { className: 'dsh-owner-wait-stale-section' },
    h('summary', null,
      h('span', null, '遗留记录'),
      h('span', { className: 'dsh-owner-wait-stale-count' }, waits.length),
    ),
    children ?? h(WaitList, { waits, now, label, stale: true }),
  )
}

function HeaderWaitAction({ sessionId, useSessions, openSession }) {
  const snapshot = useWaitSnapshot()
  const sessions = useSessions(value => value)
  const actionWaits = useMemo(() => mergeActionWaits(snapshot, sessions), [snapshot, sessions])
  const waits = useMemo(
    () => actionWaits.filter(item => item.sessionId === sessionId),
    [actionWaits, sessionId],
  )
  const staleWaits = useMemo(
    () => snapshot.staleWaits.filter(item => item.sessionId === sessionId),
    [snapshot.staleWaits, sessionId],
  )
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const now = useNow(open)
  useDismissOnOutsidePointer(rootRef, open, setOpen)

  const total = waits.length + staleWaits.length
  const summary = waitSummary(waits, staleWaits.length)
  useEffect(() => {
    if (total === 0 && open) setOpen(false)
  }, [total, open])

  if (total === 0) return null
  return h('div', { ref: rootRef, className: 'dsh-owner-wait-root' },
    h('button', {
      type: 'button',
      className: waits.length > 0 ? 'dsh-owner-wait-trigger' : 'dsh-owner-wait-trigger dsh-owner-wait-trigger-stale',
      'aria-expanded': open,
      'aria-label': `查看 ${waits.length} 个主动等待和 ${staleWaits.length} 个遗留事项`,
      onClick: () => setOpen(value => !value),
    },
    h('span', { className: waits.length > 0 ? 'dsh-owner-wait-dot' : 'dsh-owner-wait-dot dsh-owner-wait-dot-stale', 'aria-hidden': 'true' }),
    waits.length > 0 ? summary : `遗留 ${staleWaits.length}`,
    h('span', { className: open ? 'dsh-owner-wait-chevron dsh-owner-wait-chevron-open' : 'dsh-owner-wait-chevron' }, '⌄')),
    open
      ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-wait-menu-header' },
          h('div', { className: 'dsh-owner-wait-menu-title' },
            h('span', null, '当前会话等待中心'),
            h('span', { className: 'dsh-owner-wait-menu-summary' }, summary),
          ),
          waits.length === 0
            ? h('div', { className: 'dsh-owner-wait-empty dsh-owner-wait-empty-active' }, '当前会话没有正在等待的后台 Operation。')
            : h(WaitSection, { title: '需要处理', waits, now, label: '当前会话主动等待列表', openSession }),
          h(StaleWaitSection, { waits: staleWaits, now, label: '当前会话遗留等待列表' }),
        )
      : null,
  )
}

function groupWaitsBySession(waits, sessions) {
  const groups = new Map()
  for (const item of waits) {
    let group = groups.get(item.sessionId)
    if (group === undefined) {
      const session = sessions.byId[item.sessionId]
      group = {
        sessionId: item.sessionId,
        title: session?.displayTitle || `会话 ${item.sessionId}`,
        waits: [],
      }
      groups.set(item.sessionId, group)
    }
    group.waits.push(item)
  }
  return [...groups.values()]
}

function sessionBelongsToWorkspace(sessionId, workspaceSessionIds, sessions) {
  const workspaceSessions = new Set(workspaceSessionIds)
  const visited = new Set()
  let currentId = sessionId
  while (currentId !== undefined && !visited.has(currentId)) {
    if (workspaceSessions.has(currentId)) return true
    visited.add(currentId)
    currentId = sessions.byId[currentId]?.parentId
  }
  return false
}

function workspaceForWait(item, sessions, workspaces) {
  const workspace = workspaces.items.find(candidate => (
    sessionBelongsToWorkspace(item.sessionId, candidate.sessionIds, sessions)
  ))
  if (workspace !== undefined) {
    return { id: workspace.workspaceId, title: workspace.title }
  }
  return {
    id: item.workspaceId || 'unassigned',
    title: item.workspaceName || '未分组',
  }
}

function groupWaitsByWorkspace(waits, sessions, workspaces) {
  const groups = new Map()
  for (const item of waits) {
    const workspace = workspaceForWait(item, sessions, workspaces)
    let group = groups.get(workspace.id)
    if (group === undefined) {
      group = { workspaceId: workspace.id, title: workspace.title, waits: [], sessions: [] }
      groups.set(workspace.id, group)
    }
    group.waits.push(item)
  }
  const order = new Map(workspaces.items.map((workspace, index) => [workspace.workspaceId, index]))
  return [...groups.values()]
    .map(group => ({ ...group, sessions: groupWaitsBySession(group.waits, sessions) }))
    .sort((left, right) => (
      (order.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER)
    ))
}

function WorkspaceWaitGroups({ groups, now, stale = false, openSession }) {
  return groups.map(workspace => h('section', {
    key: workspace.workspaceId,
    className: stale
      ? 'dsh-owner-wait-workspace-group dsh-owner-wait-workspace-group-stale'
      : 'dsh-owner-wait-workspace-group',
  },
  h('div', { className: 'dsh-owner-wait-workspace-title', title: workspace.workspaceId },
    h('span', null, workspace.title),
    h('span', { className: 'dsh-owner-wait-workspace-count' }, workspace.waits.length),
  ),
  workspace.sessions.map(group => h('section', {
    key: group.sessionId,
    className: stale ? 'dsh-owner-wait-group dsh-owner-wait-group-stale' : 'dsh-owner-wait-group',
  },
  h('div', { className: 'dsh-owner-wait-group-title', title: group.sessionId }, group.title),
  h(WaitList, {
    waits: group.waits,
    now,
    label: `${workspace.title}中${group.title}的${stale ? '遗留' : '主动'}等待列表`,
    stale,
    openSession,
  }))),
  ))
}

const STATUS_TABS = Object.freeze([
  { id: 'attention', label: '需要处理' },
  { id: 'overview', label: '总览' },
  { id: 'main', label: '主线程' },
  { id: 'subagents', label: '子代理' },
])

const ACTIVITY_LABELS = Object.freeze({
  initializing: '初始化 Workflow', planning: '生成计划', registry_pending_plan: '等待重新规划',
  plan_submitted: '计划已提交', plan_review_not_started: 'Reviewer 未启动', plan_reviewing: '审查计划',
  awaiting_plan_approval: '等待计划批准', awaiting_registry_approval: '等待 Registry 批准',
  plan_revision_required: '等待修订计划', plan_review_failed: '计划审查失败', planning_failed: '规划失败',
  runner_queued: '等待 Runner 接管', runner_launching: 'Runner 正在启动', owner_running: '执行 Owner 任务',
  waiting_dependencies: '等待 DAG 依赖', waiting_workflow_decision: '等待 Workflow 决策',
  finalizing: '收尾与合并', implementation_review_required: '等待实现审查', completed: '已经完成',
  blocked: '流程阻塞', failed: '执行失败', cancelled: '已经取消', plan_review: '审查计划',
  initial: '生成初版计划', revision: '修订计划', reviewing: '等待 Reviewer',
  waiting_planner: '等待 Planner 回报', waiting_plan_reviewer: '等待 Plan Reviewer 回报',
  waiting_user_approval: '等待用户授权或批准', waiting_runner: '等待 Runner 接管',
  waiting_subagents: '等待子代理执行或回报', blocked_runtime: 'Runtime 流程已阻塞',
  operation_starting: '启动 Operation', operation_running: '执行 Operation',
  operation_waiting_input: '等待用户补充信息', operation_waiting_approval: '等待用户授权',
  operation_completed: 'Operation 已完成', operation_failed: 'Operation 失败', operation_cancelled: 'Operation 已取消',
})

function activityLabel(activity) {
  return ACTIVITY_LABELS[activity] || activity || '没有活动阶段'
}

function roleLabel(role) {
  if (role === 'main') return '主线程'
  if (role === 'planner') return 'Planner'
  if (role === 'plan-reviewer') return 'Plan Reviewer'
  if (role === 'owner') return 'Owner'
  if (role === 'operator') return 'Operator'
  if (role === 'reviewer') return 'Implementation Reviewer'
  if (role === 'memory-curator') return 'Memory Curator'
  if (role === 'memory-reviewer') return 'Memory Reviewer'
  return role || '子代理'
}

function lifecycleStatus(lifecycle) {
  if (lifecycle === 'running' || lifecycle === 'active') return { label: '运行中', tone: 'running' }
  if (lifecycle === 'idle') return { label: '空闲', tone: 'idle' }
  if (lifecycle === 'starting') return { label: '启动中', tone: 'runner' }
  if (lifecycle === 'waiting' || lifecycle === 'waiting_user_input') return { label: '等待输入', tone: 'input' }
  if (lifecycle === 'waiting_user_approval') return { label: '等待授权', tone: 'approval' }
  if (lifecycle === 'completed') return { label: '已完成', tone: 'completed' }
  if (lifecycle === 'closed') return { label: '已关闭', tone: 'closed' }
  if (lifecycle === 'stopped') return { label: '已停止', tone: 'closed' }
  if (lifecycle === 'blocked') return { label: '已阻塞', tone: 'error' }
  if (lifecycle === 'failed') return { label: '失败', tone: 'error' }
  if (lifecycle === 'cancelled') return { label: '已取消', tone: 'closed' }
  if (lifecycle === 'orphaned') return { label: '已失联', tone: 'error' }
  if (lifecycle === 'not_started') return { label: '未启动', tone: 'closed' }
  if (lifecycle === 'not_observed') return { label: '未观测', tone: 'dependency' }
  return { label: lifecycle || '未知', tone: 'dependency' }
}

function RuntimeActorCard({ actor, context, openSession }) {
  const status = lifecycleStatus(actor.lifecycle)
  const canOpen = actor.sessionId !== '' && typeof openSession === 'function'
  const open = () => { if (canOpen) openSession(actor.sessionId) }
  return h('article', {
    className: canOpen ? 'dsh-runtime-actor dsh-runtime-actor-actionable' : 'dsh-runtime-actor',
    role: canOpen ? 'button' : undefined,
    tabIndex: canOpen ? 0 : undefined,
    onClick: canOpen ? open : undefined,
    onKeyDown: canOpen ? event => { if (event.key === 'Enter' || event.key === ' ') open() } : undefined,
  },
  h('div', { className: 'dsh-runtime-card-head' },
    h('span', { className: 'dsh-runtime-card-title' }, roleLabel(actor.role)),
    h('span', { className: `dsh-runtime-state dsh-runtime-state-${status.tone}` }, status.label),
  ),
  h('div', { className: 'dsh-runtime-activity' }, activityLabel(actor.activity)),
  context === '' ? null : h('div', { className: 'dsh-runtime-context' }, context),
  actor.taskId === '' ? null : h('div', { className: 'dsh-runtime-meta' }, `Task ${actor.taskId}${actor.ownerId === '' ? '' : ` · ${actor.ownerId}`}`),
  actor.sessionId === '' ? null : h('div', { className: 'dsh-runtime-id', title: actor.sessionId }, actor.sessionId),
  )
}

function RuntimeOverviewCard({ entry }) {
  const status = lifecycleStatus(entry.lifecycle)
  return h('article', { className: 'dsh-runtime-overview-card' },
    h('div', { className: 'dsh-runtime-card-head' },
      h('span', { className: 'dsh-runtime-card-title' }, entry.kind === 'workflow' ? 'Workflow' : 'Operation'),
      h('span', { className: `dsh-runtime-state dsh-runtime-state-${status.tone}` }, status.label),
    ),
    h('div', { className: 'dsh-runtime-goal' }, entry.goal || entry.id),
    h('div', { className: 'dsh-runtime-activity' }, activityLabel(entry.phase)),
    entry.kind !== 'workflow' ? null : h('div', { className: 'dsh-runtime-meta' },
      `未执行 ${entry.execution.pendingTasks} · 执行中 ${entry.execution.runningTasks} · 已完成 ${entry.execution.completedTasks}`,
    ),
    h('div', { className: 'dsh-runtime-id', title: entry.id }, entry.id),
  )
}

function workspaceEntries(workspace) {
  return [...workspace.workflows, ...workspace.operations]
}

function actorWithPendingInteraction(actor, actionWaits) {
  const wait = actionWaits.find(item => item.sessionId === actor.sessionId)
  if (wait?.state === 'waiting_user_approval' || wait?.state === 'waiting_owner_approval') {
    return { ...actor, lifecycle: 'waiting_user_approval' }
  }
  if (wait?.state === 'waiting_user_input' || wait?.state === 'waiting_workflow_decision') {
    return { ...actor, lifecycle: 'waiting_user_input' }
  }
  return actor
}

function MainThreadGroups({ workspaces, actionWaits, openSession }) {
  return workspaces.map(workspace => {
    const bySession = new Map()
    for (const entry of workspaceEntries(workspace)) {
      if (entry.mainThread === undefined) continue
      const key = entry.mainThread.sessionId || `${entry.kind}:${entry.id}`
      const current = bySession.get(key)
      if (current === undefined || String(entry.updatedAt).localeCompare(String(current.entry.updatedAt)) > 0) {
        bySession.set(key, { actor: entry.mainThread, entry })
      }
    }
    for (const actor of workspace.agents.filter(item => item.role === 'main')) {
      if (!bySession.has(actor.sessionId)) bySession.set(actor.sessionId, { actor, entry: undefined })
    }
    return h('section', { key: workspace.workspaceId, className: 'dsh-runtime-workspace' },
      h('div', { className: 'dsh-runtime-workspace-title' }, workspace.workspaceName),
      bySession.size === 0
        ? h('div', { className: 'dsh-owner-wait-empty' }, '没有可观测的主线程。')
        : h('div', { className: 'dsh-runtime-grid' }, [...bySession.values()].map(({ actor, entry }, index) => h(RuntimeActorCard, {
            key: actor.sessionId || `${workspace.workspaceId}:main:${index}`,
            actor: actorWithPendingInteraction(actor, actionWaits),
            context: entry?.goal || '',
            openSession,
          }))),
    )
  })
}

function subagentCategory(role) {
  if (role === 'planner' || role === 'plan-reviewer') return '规划与审查'
  if (role === 'owner') return 'Owner 执行'
  if (role === 'operator') return 'Operation'
  if (role === 'reviewer' || role === 'memory-curator' || role === 'memory-reviewer') return '交付与记忆审查'
  return '其他子代理'
}

function SubagentGroups({ workspaces, actionWaits, openSession }) {
  return workspaces.map(workspace => {
    const actors = []
    const seen = new Set()
    for (const entry of workspaceEntries(workspace)) {
      for (const actor of entry.subagents) {
        const key = actor.sessionId || `${entry.id}:${actor.role}:${actor.taskId}:${actor.activity}`
        if (seen.has(key)) continue
        seen.add(key)
        actors.push({ actor, context: entry.goal })
      }
    }
    for (const actor of workspace.agents.filter(item => item.role !== 'main')) {
      const key = actor.sessionId || `${actor.role}:${actor.activity}`
      if (seen.has(key)) continue
      seen.add(key)
      actors.push({ actor, context: '' })
    }
    const categories = new Map()
    for (const item of actors) {
      const category = subagentCategory(item.actor.role)
      if (!categories.has(category)) categories.set(category, [])
      categories.get(category).push(item)
    }
    return h('section', { key: workspace.workspaceId, className: 'dsh-runtime-workspace' },
      h('div', { className: 'dsh-runtime-workspace-title' }, workspace.workspaceName),
      actors.length === 0
        ? h('div', { className: 'dsh-owner-wait-empty' }, '没有子代理状态。')
        : [...categories.entries()].map(([category, items]) => h('section', { key: category, className: 'dsh-runtime-category' },
            h('div', { className: 'dsh-runtime-category-title' }, category),
            h('div', { className: 'dsh-runtime-grid' }, items.map(({ actor, context }, index) => h(RuntimeActorCard, {
              key: actor.sessionId || `${category}:${index}`,
              actor: actorWithPendingInteraction(actor, actionWaits),
              context,
              openSession,
            }))),
          )),
    )
  })
}

function RuntimeStatusTabs({ snapshot, statusWorkspaces, actionGroups, actionWaits, staleWaits, now, showRunner, openSession }) {
  const [tab, setTab] = useState('attention')
  const entries = statusWorkspaces.flatMap(workspaceEntries)
  let content
  if (tab === 'attention') {
    content = actionGroups.length === 0
      ? h('div', { className: 'dsh-owner-wait-empty dsh-owner-wait-empty-active' }, '当前没有需要处理的事项。')
      : h(WorkspaceWaitGroups, { groups: actionGroups, now, openSession })
  } else if (tab === 'overview') {
    content = h(React.Fragment, null,
      showRunner ? h('section', { className: 'dsh-runtime-runner' },
        h('div', { className: 'dsh-runtime-card-head' },
          h('span', { className: 'dsh-runtime-card-title' }, 'Runner'),
          h('span', { className: `dsh-runtime-state dsh-runtime-state-${snapshot.runner.process === 'online' ? 'running' : 'error'}` }, snapshot.runner.process === 'online' ? '在线' : '离线'),
        ),
        h('div', { className: 'dsh-runtime-activity' }, snapshot.runner.assignment === 'supervising' ? '正在监督 Workflow' : snapshot.runner.assignment === 'idle' ? '空闲，等待接管' : '没有运行'),
        snapshot.runner.heartbeatAt === null ? null : h('div', { className: 'dsh-runtime-meta' }, `心跳 ${snapshot.runner.heartbeatAt}`),
      ) : null,
      statusWorkspaces.map(workspace => h('section', { key: workspace.workspaceId, className: 'dsh-runtime-workspace' },
        h('div', { className: 'dsh-runtime-workspace-title' }, workspace.workspaceName),
        workspaceEntries(workspace).length === 0
          ? h('div', { className: 'dsh-owner-wait-empty' }, '当前没有 Workflow 或 Operation。')
          : h('div', { className: 'dsh-runtime-grid' }, workspaceEntries(workspace).map(entry => h(RuntimeOverviewCard, { key: `${entry.kind}:${entry.id}`, entry }))),
      )),
    )
  } else if (tab === 'main') {
    content = h(MainThreadGroups, { workspaces: statusWorkspaces, actionWaits, openSession })
  } else {
    content = h(SubagentGroups, { workspaces: statusWorkspaces, actionWaits, openSession })
  }
  return h(React.Fragment, null,
    h('div', { className: 'dsh-runtime-tabs', role: 'tablist', 'aria-label': '运行状态分类' },
      STATUS_TABS.map(item => h('button', {
        key: item.id,
        type: 'button',
        role: 'tab',
        'aria-selected': tab === item.id,
        className: tab === item.id ? 'dsh-runtime-tab dsh-runtime-tab-active' : 'dsh-runtime-tab',
        onClick: () => setTab(item.id),
      }, item.label, item.id === 'attention' && actionWaits.length > 0
        ? h('span', { className: 'dsh-runtime-tab-count' }, actionWaits.length)
        : null)),
    ),
    content,
    tab === 'attention' ? h(StaleWaitSection, { waits: staleWaits, now, label: '遗留等待列表' }) : null,
    entries.length === 0 && tab !== 'attention' && statusWorkspaces.length === 0
      ? h('div', { className: 'dsh-owner-wait-empty' }, '尚未收到运行状态。')
      : null,
  )
}

function statusWorkspaceSessions(workspace) {
  return workspaceEntries(workspace).flatMap(entry => [
    entry.mainThread?.sessionId,
    ...entry.subagents.map(actor => actor.sessionId),
  ]).concat(workspace.agents.map(actor => actor.sessionId)).filter(Boolean)
}

function statusWorkspaceBelongsToSessions(workspace, sessionIds, sessions, workspaceName) {
  if (workspace.workspaceName === workspaceName) return true
  return statusWorkspaceSessions(workspace).some(sessionId => sessionBelongsToWorkspace(sessionId, sessionIds, sessions))
}

function WorkspaceWaitAction({ workspaceName, sessionIds, useSessions, openSession }) {
  const snapshot = useWaitSnapshot()
  const sessions = useSessions(value => value)
  const actionWaits = useMemo(() => mergeActionWaits(snapshot, sessions), [snapshot, sessions])
  const waits = useMemo(
    () => actionWaits.filter(item => sessionBelongsToWorkspace(item.sessionId, sessionIds, sessions)),
    [actionWaits, sessionIds, sessions],
  )
  const staleWaits = useMemo(
    () => snapshot.staleWaits.filter(item => sessionBelongsToWorkspace(item.sessionId, sessionIds, sessions)),
    [snapshot.staleWaits, sessionIds, sessions],
  )
  const groups = useMemo(() => groupWaitsBySession(waits, sessions), [waits, sessions])
  const statusWorkspaces = useMemo(
    () => snapshot.workspaces.filter(workspace => statusWorkspaceBelongsToSessions(workspace, sessionIds, sessions, workspaceName)),
    [snapshot.workspaces, sessionIds, sessions, workspaceName],
  )
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(undefined)
  const rootRef = useRef(null)
  const now = useNow(open)
  useDismissOnOutsidePointer(rootRef, open, setOpen)

  useEffect(() => {
    if (!open) {
      setMenuStyle(undefined)
      return undefined
    }
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      setMenuStyle({
        position: 'fixed',
        left: window.innerWidth <= 720 ? 8 : rect.right + 8,
        top: Math.max(8, rect.top),
        maxHeight: Math.max(96, window.innerHeight - Math.max(8, rect.top) - 16),
      })
    }
    positionMenu()
    window.addEventListener('resize', positionMenu)
    return () => window.removeEventListener('resize', positionMenu)
  }, [open])

  const activeCount = statusWorkspaces.reduce((total, workspace) => total + workspaceEntries(workspace).length, 0)
  const summary = `待处理 ${waits.length} · 活动 ${activeCount}`
  const actionGroups = groups.length === 0 ? [] : [{
    workspaceId: statusWorkspaces[0]?.workspaceId || workspaceName,
    title: workspaceName,
    waits,
    sessions: groups,
  }]

  return h('div', { ref: rootRef, className: 'dsh-owner-workspace-inbox-root' },
    h('button', {
      type: 'button',
      className: 'dsh-owner-workspace-inbox-trigger',
      'aria-expanded': open,
      'aria-label': `${workspaceName} 运行状态，${waits.length} 个需要处理`,
      title: summary,
      onClick: event => { event.stopPropagation(); setOpen(value => !value) },
    },
    h('span', { 'aria-hidden': 'true' }, '◎'),
    waits.length > 0 ? h('span', { className: 'dsh-owner-workspace-inbox-badge' }, waits.length) : null,
    ['error', 'disconnected'].includes(snapshot.phase) ? h('span', { className: 'dsh-owner-wait-error-mark', title: snapshot.error || '运行状态暂不可用' }, '!') : null),
    open && menuStyle !== undefined
      ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-workspace-inbox-menu', style: menuStyle },
          h('div', { className: 'dsh-owner-wait-menu-title' },
            h('div', null,
              h('div', null, `${workspaceName} · 运行状态`),
              h('div', { className: 'dsh-owner-wait-menu-summary' }, summary),
            ),
          ),
          ['error', 'disconnected'].includes(snapshot.phase)
            ? h('div', { className: 'dsh-owner-wait-warning' }, snapshot.error)
            : null,
          h(RuntimeStatusTabs, {
            snapshot,
            statusWorkspaces,
            actionGroups,
            actionWaits: waits,
            staleWaits,
            now,
            showRunner: true,
            openSession,
          }),
        )
      : null,
  )
}

function SidebarWaitAction({ wide, useSessions, useWorkspaces, openSession }) {
  const snapshot = useWaitSnapshot()
  const sessions = useSessions(value => value)
  const workspaces = useWorkspaces(value => value)
  const actionWaits = useMemo(() => mergeActionWaits(snapshot, sessions), [snapshot, sessions])
  const groups = useMemo(
    () => groupWaitsByWorkspace(actionWaits, sessions, workspaces),
    [actionWaits, sessions, workspaces],
  )
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(undefined)
  const rootRef = useRef(null)
  const now = useNow(open)
  useDismissOnOutsidePointer(rootRef, open, setOpen)

  useEffect(() => {
    if (!open) {
      setMenuStyle(undefined)
      return undefined
    }
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      setMenuStyle({
        position: 'fixed',
        left: window.innerWidth <= 720 ? 8 : rect.right + 8,
        bottom: window.innerHeight - rect.top + 8,
        maxHeight: Math.max(96, Math.min(680, rect.top - 24)),
      })
    }
    positionMenu()
    window.addEventListener('resize', positionMenu)
    return () => window.removeEventListener('resize', positionMenu)
  }, [open, wide])

  const staleCount = snapshot.staleWaits.length
  const activeCount = snapshot.workspaces.reduce((total, workspace) => total + workspaceEntries(workspace).length, 0)
  const summary = `待处理 ${actionWaits.length} · 活动 ${activeCount}${staleCount > 0 ? ` · 遗留 ${staleCount}` : ''}`

  return h('div', { ref: rootRef, className: 'dsh-owner-wait-sidebar-root' },
    h('button', {
      type: 'button',
      className: wide ? 'dsh-owner-wait-sidebar-trigger dsh-owner-wait-sidebar-wide' : 'dsh-owner-wait-sidebar-trigger',
      'aria-expanded': open,
      'aria-label': `运行状态，${actionWaits.length} 个需要处理`,
      title: wide ? undefined : summary,
      onClick: () => setOpen(value => !value),
    },
    h('span', { className: 'dsh-owner-wait-sidebar-icon', 'aria-hidden': 'true' }, '◎'),
    wide ? h('span', { className: 'dsh-owner-wait-sidebar-label' }, '运行状态') : null,
    actionWaits.length > 0 ? h('span', { className: 'dsh-owner-wait-badge' }, actionWaits.length) : null,
    staleCount > 0 ? h('span', { className: 'dsh-owner-wait-stale-badge', title: `${staleCount} 个遗留记录` }, staleCount) : null,
    ['error', 'disconnected'].includes(snapshot.phase) ? h('span', { className: 'dsh-owner-wait-error-mark', title: snapshot.error || '运行状态暂不可用' }, '!') : null),
    open && menuStyle !== undefined
      ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-wait-menu-sidebar', style: menuStyle },
          h('div', { className: 'dsh-owner-wait-menu-title' },
            h('div', null,
              h('div', null, '运行状态'),
              h('div', { className: 'dsh-owner-wait-menu-summary' }, summary),
            ),
          ),
          ['error', 'disconnected'].includes(snapshot.phase)
            ? h('div', { className: 'dsh-owner-wait-warning' }, snapshot.error)
            : null,
          h(RuntimeStatusTabs, {
            snapshot,
            statusWorkspaces: snapshot.workspaces,
            actionGroups: groups,
            actionWaits,
            staleWaits: snapshot.staleWaits,
            now,
            showRunner: true,
            openSession,
          }),
        )
      : null,
  )
}

function FloatingActionInbox({ useSessions, useWorkspaces, openSession }) {
  const snapshot = useWaitSnapshot()
  const sessions = useSessions(value => value)
  const workspaces = useWorkspaces(value => value)
  const waits = useMemo(() => mergeActionWaits(snapshot, sessions), [snapshot, sessions])
  const groups = useMemo(
    () => groupWaitsByWorkspace(waits, sessions, workspaces),
    [waits, sessions, workspaces],
  )
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const now = useNow(open)
  useDismissOnOutsidePointer(rootRef, open, setOpen)
  if (waits.length === 0) return null
  return h('div', { ref: rootRef, className: 'dsh-owner-action-inbox-floating' },
    h('button', {
      type: 'button',
      className: 'dsh-owner-action-inbox-floating-trigger',
      'aria-expanded': open,
      'aria-label': `有 ${waits.length} 个需要处理事项`,
      onClick: () => setOpen(value => !value),
    }, h('span', { 'aria-hidden': 'true' }, '⏳'), h('span', null, waits.length)),
    open
      ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-action-inbox-floating-menu' },
          h('div', { className: 'dsh-owner-wait-menu-title' }, h('span', null, '需要处理'), h('span', { className: 'dsh-owner-wait-menu-summary' }, `待处理 ${waits.length}`)),
          h(WorkspaceWaitGroups, { groups, now, openSession }),
        )
      : null,
  )
}

function installStyles() {
  if (document.querySelector('style[data-owner-workflow-waits]') !== null) return
  const style = document.createElement('style')
  style.dataset.ownerWorkflowWaits = 'true'
  style.textContent = `
.dsh-owner-wait-root,.dsh-owner-wait-sidebar-root,.dsh-owner-workspace-inbox-root{position:relative}
.dsh-owner-wait-trigger{min-height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:7px;align-items:center;gap:6px;padding:3px 7px;font-size:12px;display:inline-flex}
.dsh-owner-wait-trigger:hover,.dsh-owner-wait-trigger:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-owner-wait-trigger-stale{color:var(--dsw-alias-label-tertiary)}
.dsh-owner-wait-dot{width:7px;height:7px;background:var(--dsw-alias-state-warn-primary);border-radius:50%;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent)}
.dsh-owner-wait-dot-stale{background:var(--dsw-alias-label-tertiary);box-shadow:none}
.dsh-owner-wait-chevron{font-size:14px;transition:transform .12s}.dsh-owner-wait-chevron-open{transform:rotate(180deg)}
.dsh-owner-wait-menu{z-index:220;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l2);border-radius:13px;box-shadow:var(--dsw-shadow-lv3);padding:8px;position:absolute;overflow:auto;overscroll-behavior:contain}
.dsh-owner-wait-menu-header{width:430px;max-width:min(460px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 130px));top:calc(100% + 6px);left:0}
.dsh-owner-wait-menu-sidebar,.dsh-owner-workspace-inbox-menu{width:460px;max-width:min(480px,calc(100vw - 80px))}
.dsh-owner-wait-menu-title{min-height:38px;font-size:13px;font-weight:650;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--dsw-specific-menu);padding:3px 7px 9px;position:sticky;top:-8px;z-index:2}
.dsh-owner-wait-menu-summary{color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:400;white-space:nowrap;margin-top:2px}
.dsh-owner-wait-section{margin-top:3px}.dsh-owner-wait-section-title{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;padding:3px 4px 7px;text-transform:none}.dsh-owner-wait-section-count{min-width:16px;height:16px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-warn-primary);border-radius:8px;font-size:10px;line-height:16px;text-align:center}
.dsh-owner-wait-list{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;list-style:none}
.dsh-owner-wait-item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:10px;padding:10px 11px}
.dsh-owner-wait-item-actionable{cursor:pointer}.dsh-owner-wait-item-actionable:hover,.dsh-owner-wait-item-actionable:focus-visible{outline:0;background:var(--dsw-alias-interactive-bg-hover);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 20%,transparent)}
.dsh-owner-wait-item-running{border-left-color:var(--dsw-alias-state-business-primary)}.dsh-owner-wait-item-runner{border-left-color:var(--dsw-alias-state-warn-primary)}.dsh-owner-wait-item-dependency{border-left-color:var(--dsw-alias-label-tertiary)}.dsh-owner-wait-item-error{border-left-color:var(--dsw-alias-state-error-primary)}.dsh-owner-wait-item-input{border-left-color:var(--dsw-alias-state-business-primary)}.dsh-owner-wait-item-stale{border-left-color:var(--dsw-alias-label-tertiary);opacity:.86}
.dsh-owner-wait-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
.dsh-owner-wait-status{height:19px;border-radius:10px;font-size:10px;font-weight:650;line-height:19px;padding:0 7px}.dsh-owner-wait-status-running{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.dsh-owner-wait-status-runner{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}.dsh-owner-wait-status-dependency{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.dsh-owner-wait-status-error{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,var(--dsw-alias-bg-layer-2))}.dsh-owner-wait-status-input{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.dsh-owner-wait-status-approval{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}.dsh-owner-wait-status-stale{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-owner-wait-elapsed{color:var(--dsw-alias-label-tertiary);font-size:10px;white-space:nowrap}
.dsh-owner-wait-goal{font-size:12px;font-weight:600;line-height:18px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.dsh-owner-wait-current,.dsh-owner-wait-stale-reason{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;background:var(--dsw-alias-interactive-bg-hover);border-radius:7px;margin-top:7px;padding:7px 8px;overflow-wrap:anywhere}.dsh-owner-wait-stale-reason{color:var(--dsw-alias-label-tertiary)}
.dsh-owner-wait-details{margin-top:7px}.dsh-owner-wait-details>summary{width:max-content;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;list-style:none}.dsh-owner-wait-details>summary::-webkit-details-marker{display:none}.dsh-owner-wait-details>summary:after{content:'›';display:inline-block;margin-left:4px;transition:transform .12s}.dsh-owner-wait-details[open]>summary:after{transform:rotate(90deg)}
.dsh-owner-wait-detail-body{border-top:1px solid var(--dsw-alias-border-l1);margin-top:7px;padding-top:7px}.dsh-owner-wait-line{font-size:11px;line-height:17px;overflow-wrap:anywhere}.dsh-owner-wait-line b{font-weight:600}.dsh-owner-wait-risk{color:var(--dsw-alias-state-error-primary)}.dsh-owner-wait-id{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:5px}
.dsh-owner-wait-note{color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;line-height:15px;margin-top:8px;padding-top:7px}
.dsh-owner-wait-empty,.dsh-owner-wait-warning{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:11px}.dsh-owner-wait-empty-active{background:var(--dsw-alias-bg-layer-2);border-radius:9px;margin-bottom:7px}.dsh-owner-wait-warning{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger);border-radius:8px;margin-bottom:7px}
.dsh-owner-wait-stale-section{border-top:1px solid var(--dsw-alias-border-l1);margin-top:9px;padding-top:7px}.dsh-owner-wait-stale-section>summary{color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;padding:4px;list-style:none}.dsh-owner-wait-stale-section>summary::-webkit-details-marker{display:none}.dsh-owner-wait-stale-section>summary:before{content:'›';font-size:14px;transition:transform .12s}.dsh-owner-wait-stale-section[open]>summary:before{transform:rotate(90deg)}.dsh-owner-wait-stale-section[open]>summary{margin-bottom:6px}.dsh-owner-wait-stale-count{min-width:16px;height:16px;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;font-size:10px;line-height:16px;text-align:center}
.dsh-owner-wait-sidebar-root{width:100%}.dsh-owner-wait-sidebar-trigger{box-sizing:border-box;width:40px;height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:7px;margin:auto;position:relative}.dsh-owner-wait-sidebar-trigger:hover,.dsh-owner-wait-sidebar-trigger:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.dsh-owner-wait-sidebar-wide{width:100%;justify-content:flex-start;padding:0 10px}.dsh-owner-wait-sidebar-icon{font-size:15px;line-height:1}.dsh-owner-wait-sidebar-label{font-size:13px;flex:1;text-align:left}.dsh-owner-wait-badge{min-width:17px;height:17px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-warn-primary);border-radius:9px;font-size:10px;line-height:17px;text-align:center;padding:0 4px}.dsh-owner-wait-stale-badge{min-width:17px;height:17px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);border-radius:9px;font-size:10px;line-height:17px;text-align:center;padding:0 4px}.dsh-owner-wait-error-mark{width:15px;height:15px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-error-primary);border-radius:50%;font-size:10px;line-height:15px;text-align:center}
.dsh-owner-workspace-inbox-trigger{min-width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:0;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:0 4px;font-size:12px}.dsh-owner-workspace-inbox-trigger:hover,.dsh-owner-workspace-inbox-trigger:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.dsh-owner-workspace-inbox-badge{min-width:14px;height:14px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-warn-primary);border-radius:7px;font-size:9px;line-height:14px;text-align:center;padding:0 3px}.dsh-owner-workspace-inbox-menu{z-index:420}
.dsh-owner-wait-workspace-group{border-top:1px solid var(--dsw-alias-border-l2);padding-top:9px;margin-top:8px}.dsh-owner-wait-workspace-group:first-of-type{border-top:0;margin-top:0}.dsh-owner-wait-workspace-title{font-size:12px;font-weight:650;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:1px 4px 4px}.dsh-owner-wait-workspace-count{min-width:18px;height:18px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border-radius:9px;font-size:10px;font-weight:500;line-height:18px;text-align:center;padding:0 3px}.dsh-owner-wait-group{border-left:1px solid var(--dsw-alias-border-l1);padding:7px 0 0 9px;margin:3px 0 0 5px}.dsh-owner-wait-group:first-of-type{margin-top:0}.dsh-owner-wait-group-title{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:0 4px 5px}
.dsh-runtime-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:3px;margin:1px 0 9px;position:sticky;top:40px;z-index:2}.dsh-runtime-tab{min-width:0;height:28px;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:7px;cursor:pointer;font-size:11px;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:4px}.dsh-runtime-tab:hover,.dsh-runtime-tab:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.dsh-runtime-tab-active{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv1)}.dsh-runtime-tab-count{min-width:15px;height:15px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-warn-primary);border-radius:8px;font-size:9px;line-height:15px;padding:0 2px}
.dsh-runtime-runner,.dsh-runtime-overview-card,.dsh-runtime-actor{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 11px}.dsh-runtime-runner{margin-bottom:9px}.dsh-runtime-workspace{border-top:1px solid var(--dsw-alias-border-l2);padding-top:9px;margin-top:9px}.dsh-runtime-workspace:first-of-type{border-top:0;margin-top:0}.dsh-runtime-workspace-title{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:650;padding:0 3px 7px}.dsh-runtime-grid{display:grid;grid-template-columns:1fr;gap:7px}.dsh-runtime-category{margin-top:8px}.dsh-runtime-category:first-of-type{margin-top:0}.dsh-runtime-category-title{color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:600;padding:0 3px 5px}.dsh-runtime-card-head{display:flex;align-items:center;justify-content:space-between;gap:9px}.dsh-runtime-card-title{font-size:12px;font-weight:650}.dsh-runtime-state{height:19px;border-radius:10px;font-size:10px;font-weight:650;line-height:19px;padding:0 7px;white-space:nowrap}.dsh-runtime-state-running{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.dsh-runtime-state-idle,.dsh-runtime-state-completed{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.dsh-runtime-state-runner,.dsh-runtime-state-approval{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}.dsh-runtime-state-input{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.dsh-runtime-state-error{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,var(--dsw-alias-bg-layer-2))}.dsh-runtime-state-closed,.dsh-runtime-state-dependency{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover)}.dsh-runtime-goal{font-size:12px;font-weight:600;line-height:18px;margin-top:7px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.dsh-runtime-activity{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;margin-top:6px}.dsh-runtime-context{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;margin-top:5px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.dsh-runtime-meta{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;margin-top:5px}.dsh-runtime-id{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:5px}.dsh-runtime-actor-actionable{cursor:pointer}.dsh-runtime-actor-actionable:hover,.dsh-runtime-actor-actionable:focus-visible{outline:0;background:var(--dsw-alias-interactive-bg-hover);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent)}
.dsh-owner-action-inbox-floating{pointer-events:auto;position:fixed;right:18px;top:54px;z-index:520}.dsh-owner-action-inbox-floating-trigger{min-width:48px;height:34px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-state-warn-primary);border:0;border-radius:17px;box-shadow:var(--dsw-shadow-lv3);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 11px;font-size:12px;font-weight:650}.dsh-owner-action-inbox-floating-trigger:hover,.dsh-owner-action-inbox-floating-trigger:focus-visible{background:var(--dsw-alias-state-warn-secondary);outline:2px solid var(--dsw-alias-state-warn-label)}.dsh-owner-action-inbox-floating-menu{width:440px;max-width:min(460px,calc(100vw - 28px));max-height:min(650px,calc(100vh - 105px));top:42px;right:0;position:absolute}
@media (max-width:720px){.dsh-owner-wait-menu-header{right:0;left:auto}.dsh-owner-wait-menu-sidebar,.dsh-owner-workspace-inbox-menu{width:min(430px,calc(100vw - 24px));max-width:none}}
  `.trim()
  document.head.appendChild(style)
}

exports.inject = ['slots', 'sessions']

exports.apply = function apply(ctx) {
  // 正式包名与本地开发别名意外同时进入启动图时，只允许第一份客户端占用 Slot。
  if (window[CLIENT_APPLIED_MARKER] === true) return
  installStyles()
  const openSession = sessionId => {
    // 运行状态面板位于 Synapse 全屏层之上；跳转现场前先切回原生对话视图。
    document.querySelector('.dsh-synapse-switch [data-view="dialog"]')?.click?.()
    ctx.sessions.open(sessionId)
  }
  const HeaderAction = props => h(HeaderWaitAction, { ...props, openSession })
  const WorkspaceAction = props => h(WorkspaceWaitAction, { ...props, openSession })
  const SidebarAction = props => h(SidebarWaitAction, { ...props, openSession })
  const FloatingInbox = props => h(FloatingActionInbox, { ...props, openSession })
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'owner-workflow-waits',
      order: 30,
      label: '需要处理',
    }, HeaderAction),
  )
  ctx.slots.inject(
    'sidebar.workspace.action',
    () => ctx.slots.register({
      name: 'sidebar.workspace.action',
      id: 'owner-workflow-workspace-inbox',
      order: 10,
      label: '工作区运行状态',
    }, WorkspaceAction),
  )
  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'owner-workflow-waits',
      order: 10,
      label: '运行状态',
    }, SidebarAction),
  )
  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'owner-workflow-action-inbox',
      order: 40,
      label: '需要处理',
    }, FloatingInbox),
  )
  window[CLIENT_APPLIED_MARKER] = true
}

exports.default = { inject: exports.inject, apply: exports.apply }
