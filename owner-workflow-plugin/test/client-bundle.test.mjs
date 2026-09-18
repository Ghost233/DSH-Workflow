import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const executeFile = promisify(execFile)
const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const CLIENT_BUNDLE = join(PLUGIN_ROOT, 'client.js')
const CLIENT_BUILDER = join(PLUGIN_ROOT, 'scripts', 'build-client.mjs')

test('only actionable kernel entries contribute deduplicated wait counts while every result remains visible', async () => {
  const source = await readFile(join(PLUGIN_ROOT, 'src/client-runtime.js'), 'utf8')
  const context = { require: () => ({ createElement: (tag, props, ...children) => ({ tag: typeof tag === 'string' ? tag : tag.name, children }) }), exports: {} }
  vm.runInNewContext(`${source}\nexports.probe = { kernelStatusForDisplay, waitSnapshotFromBody, projectRuntimeEntryToCurrentSession, workspaceEntries, activeWorkspaceEntries, waitSummary, WaitItem }`, context)
  const { kernelStatusForDisplay, waitSnapshotFromBody, projectRuntimeEntryToCurrentSession, workspaceEntries, activeWorkspaceEntries, waitSummary, WaitItem } = context.exports.probe
  const attention = (id, detail = id) => ({ id, reason: 'task_failed', responsibleParty: 'root_session',
    resumeCondition: 'bound_task_repair', detail })
  const entries = [
    { workflowId: 'failed', status: 'failed', kind: 'workflow', terminal: true, rootSessionId: 'main',
      counts: {}, recovery: {}, attention: [attention('denied', 'permission_rejected'), attention('follow-up')] },
    { workflowId: 'completed', status: 'completed', kind: 'workflow', terminal: true, rootSessionId: 'main',
      counts: { pendingTasks: 90, runningTasks: 80 }, recovery: {}, attention: [attention('old-complete')] },
    { workflowId: 'historical', status: 'historical', kind: 'workflow', terminal: true, rootSessionId: 'main',
      counts: {}, recovery: {}, attention: [attention('old-history')] },
    { workflowId: 'cancelled', status: 'cancelled', kind: 'workflow', terminal: true, rootSessionId: 'main',
      counts: { pendingTasks: 70, runningTasks: 60 }, recovery: {}, attention: [attention('old-cancel')] },
    { workflowId: 'running', status: 'running', kind: 'workflow', terminal: false, rootSessionId: 'main',
      counts: { pendingTasks: 2, runningTasks: 1 }, recovery: {}, attention: [attention('blocked-one'), attention('blocked-two'),
        { ...attention('old-isolated'), reason: 'isolated_execution_unconfirmed' }] },
  ]
  const body = { contract: 'DSH_KERNEL_STATUS_V1', runner: { status: 'running' }, workspaces: [{ workspaceId: 'test', workflows: entries }] }
  const projection = kernelStatusForDisplay(body)
  assert.deepEqual(Array.from(projection.waits, item => item.id), [
    'running:blocked-one', 'running:blocked-two',
  ])
  assert.equal(projection.staleWaits[0].detail, 'permission_rejected')
  assert.equal(waitSummary(projection.waits), '未执行 2 · 执行中 1')
  assert.deepEqual(Array.from(projection.staleWaits, item => item.id), ['failed:denied', 'failed:follow-up', 'running:old-isolated'])
  assert.deepEqual(Array.from(workspaceEntries(projection.workspaces[0]), item => item.workflowId), ['failed', 'historical', 'running'])
  assert.deepEqual(Array.from(projection.workspaces[0].workflows, item => item.workflowId),
    ['failed', 'completed', 'historical', 'cancelled', 'running'])
  const normalized = waitSnapshotFromBody(body)
  assert.equal(normalized.runner.process, 'online')
  assert.equal(normalized.staleWaits[0].terminal, true)
  const rendered = JSON.stringify(WaitItem({ item: normalized.staleWaits[0], now: Date.now() }))
  assert.match(rendered, /任务已结束/)
  assert.doesNotMatch(rendered, /已等待|同一后台子代理正以可续接状态等待/)
  assert.deepEqual(Array.from(activeWorkspaceEntries(normalized.workspaces[0]), item => item.id), ['running'])
  const failed = normalized.workspaces[0].workflows.find(item => item.id === 'failed')
  assert.equal(failed.terminal, true)
  assert.equal(projectRuntimeEntryToCurrentSession(failed, { currentSessionId: 'main' }, { byId: { main: { id: 'main' } } }).id, 'failed')
})

test('等待列表客户端产物与源码一致并登记正式、本地两个模块编号', async () => {
  await executeFile(process.execPath, [CLIENT_BUILDER, '--check'])
  const registrations = []
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(registration) { registrations.push(registration) },
      },
    },
  })
  assert.deepEqual(registrations.map(item => item.id), [
    'dsh-owner-workflow',
    'dsh-owner-workflow-local-ui',
  ])
})

test('运行状态和 Owner 输入限制只登记官方 Slot', async () => {
  const registrations = []
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  const style = { dataset: {} }
  const document = {
    querySelector: () => null,
    createElement: () => style,
    head: { appendChild() {} },
  }
  vm.runInNewContext(source, {
    document,
    window: {
      __ModuleLoader__: {
        load(registration) { registrations.push(registration) },
      },
    },
  })
  const hooks = () => undefined
  const React = {
    createElement: () => undefined,
    useEffect: hooks,
    useMemo: hooks,
    useRef: hooks,
    useState: hooks,
    useSyncExternalStore: hooks,
  }
  const client = registrations[0].factory(name => {
    if (name === 'react') return React
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText() {} }
    throw new Error(`测试遇到未声明的客户端依赖：${name}`)
  })
  const aliasClient = registrations[1].factory(name => {
    if (name === 'react') return React
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText() {} }
    throw new Error(`测试遇到未声明的客户端依赖：${name}`)
  })
  const slotNames = []
  const context = {
    sessions: { open() {}, list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} } },
    uiSession: { pendingInteractions: { getSnapshot: () => new Map(), subscribe: () => () => {} } },
    sidebarRightTabs: { register() { return () => {} } },
    sidebarRight: { openTab() {} },
    effect(callback) { callback() },
    slots: {
      inject(name, factory) {
        slotNames.push(name)
        factory()
      },
      register() { return () => {} },
    },
  }
  client.apply(context)
  aliasClient.apply({ ...context })
  assert.match(style.textContent, /@media \(max-width:520px\)/)
  assert.match(style.textContent, /title="主线程维护需求、Spec 和 Ticket；统一 Runner 按模块 Owner 执行、验证和交付。"/)
  assert.match(style.textContent, /font-size:0!important/)
  assert.deepEqual(slotNames, [
    'sidebar.right.pane.tab',
    'sidebar.right.pane.tab',
    'conversation.composer',
    'conversation.composer',
    'conversation.session.header.actions',
    'conversation.session.header.actions',
    'sidebar.footer.action',
    'shell.overlay',
  ])
})

test('Exec 授权只接管自己的审批并在右侧展示完整内容', async () => {
  const registrations = []
  vm.runInNewContext(await readFile(CLIENT_BUNDLE, 'utf8'), {
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} } },
    window: { __ModuleLoader__: { load(item) { registrations.push(item) } } },
  })
  const React = {
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    useEffect: effect => { effect() },
    useMemo: value => value(),
    useRef: value => ({ current: value }),
    useState: value => [value, () => {}],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const MarkdownText = () => {}
  const client = registrations[0].factory(name => name === 'react' ? React
    : name === '@deepseek-ai/dsh-client-ui-primitives' ? { MarkdownText } : undefined)
  const slots = []
  const opened = []
  const types = []
  client.apply({
    sessions: { open() {}, list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} } },
    uiSession: { pendingInteractions: { getSnapshot: () => new Map(), subscribe: () => () => {} } },
    sidebarRightTabs: { register(definition) { types.push(definition); return () => {} } },
    sidebarRight: { openTab(...args) { opened.push(args) } },
    effect(callback) { callback() },
    slots: { inject(_name, callback) { callback() }, register(definition, component) { slots.push({ definition, component }); return () => {} } },
  })
  assert.equal(types[0].kind, 'owner-exec-approval')
  const takeover = slots.find(item => item.definition.name === 'conversation.composer' && item.definition.priority === -1)
  const pending = { kind: 'approval', toolName: 'workflow_exec_task', sessionId: 'main', key: 'approval-1',
    reason: '任务：删除旧模块\n预计步骤：\n1. 检查依赖\n2. 删除模块', answer: async () => {} }
  assert.equal(takeover.definition.select({ pendingInteraction: pending }), pending)
  assert.equal(takeover.definition.select({ pendingInteraction: { ...pending, toolName: 'bash' } }), null)
  const composerElement = takeover.component({ matched: pending })
  composerElement.tag(composerElement.props)
  assert.equal(opened.length, 1)
  assert.equal(opened[0][0], 'owner-exec-approval')
  assert.equal(opened[0][1].params.sessionId, 'main')
  const tab = slots.find(item => item.definition.name === 'sidebar.right.pane.tab')
  const panel = tab.component({ useTabInfo: () => ({ tab: { navigation: { params: { sessionId: 'main' } } } }) })
  assert.equal(panel.children[1].children[0].tag, MarkdownText)
  assert.match(panel.children[1].children[0].props.text, /### 预计步骤\n\n1\. 检查依赖\n2\. 删除模块/u)
})

test('Owner 问询保留底部原生卡，并可在 DSH 右侧查看和回答同一请求', async () => {
  const registrations = []
  vm.runInNewContext(await readFile(CLIENT_BUNDLE, 'utf8'), {
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} } },
    window: { __ModuleLoader__: { load(item) { registrations.push(item) } } },
  })
  const React = {
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    useEffect: effect => { effect() }, useMemo: value => value(), useRef: value => ({ current: value }),
    useState: value => [value, () => {}], useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const MarkdownText = () => {}
  const client = registrations[0].factory(name => name === 'react' ? React
    : name === '@deepseek-ai/dsh-client-ui-primitives' ? { MarkdownText } : undefined)
  const opened = [], slots = [], answers = []
  let notify = () => {}
  const question = { kind: 'question', key: 'question:1', sessionId: 'main',
    questions: [{ id: 'registry-123', header: '执行权限', question: '应用 Owner 范围？', detail: '### 变更\n- 新增 `api/**`',
      options: [{ label: '取消' }, { label: '应用这批职责' }], multiSelect: false }],
    answer: async value => { answers.push(value) } }
  let current = new Map([['main', question]])
  client.apply({
    sessions: { open() {}, list: { getSnapshot: () => ({ current: 'main' }), subscribe: () => () => {} } },
    uiSession: { pendingInteractions: { getSnapshot: () => current, subscribe(listener) { notify = listener; return () => {} } } },
    sidebarRightTabs: { register() { return () => {} } },
    sidebarRight: { openTab(...args) { opened.push(args) } },
    effect(callback) { callback() },
    slots: { inject(_name, callback) { callback() }, register(definition, component) {
      slots.push({ definition, component }); return () => {}
    } },
  })
  assert.deepEqual(opened.map(item => item[0]), ['owner-question-detail'])
  notify()
  assert.equal(opened.length, 1, 'the same pending question must not repeatedly reopen the Sidebar')
  const side = slots.find(item => item.definition.key === 'dsh-owner-workflow/question-detail')
  const element = side.component({ useTabInfo: () => ({ tab: { navigation: { params: { sessionId: 'main' } } } }) })
  const panel = element.tag(element.props)
  assert.equal(panel.children[2].children[0].tag, MarkdownText)
  assert.equal(panel.children[2].children[0].props.text, question.questions[0].detail)
  panel.children[3].children[1].props.onClick()
  await Promise.resolve()
  assert.deepEqual(JSON.parse(JSON.stringify(answers)),
    [{ answers: [{ id: 'registry-123', selected: ['应用这批职责'] }] }])
  assert.equal(slots.filter(item => item.definition.name === 'conversation.composer').length, 2,
    'Owner questions must continue to use the DSH native composer')
  const opener = slots.find(item => item.definition.id === 'owner-workflow-question-detail')
  const header = opener.component({ sessionId: 'main', useSessionPendingInteraction: select => select(current) })
  const button = header.tag(header.props)
  button.props.onClick()
  assert.equal(opened.length, 2, 'the conversation header must reopen a closed side detail')
  current = new Map([['main', { ...question, key: 'question:2', questions: [{ ...question.questions[0], id: 'unrelated-question' }] }]])
  notify()
  assert.equal(opened.length, 2, 'unrelated DSH questions must not be claimed')
})

test('运行状态只通过可重连 SSE 接收更新，并按当前工作区和当前会话过滤', async () => {
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  assert.match(source, /\/owner-workflow\/api\/waits\/events/u)
  assert.match(source, /new EventSource/u)
  assert.match(source, /waitEvents\.onopen/u)
  assert.match(source, /实时连接已断开，正在重连/u)
  assert.match(source, /dsh-owner-wait-workspace-group/u)
  assert.doesNotMatch(source, /sidebar\.workspace\.action/u)
  assert.match(source, /currentSessionContext/u)
  assert.match(source, /sessions\.current/u)
  assert.match(source, /waitBelongsToCurrentContext/u)
  assert.match(source, /currentStatusWorkspaces/u)
  assert.match(source, /archivedSessionIds/u)
  assert.match(source, /TERMINAL_LIFECYCLES/u)
  assert.doesNotMatch(source, /groupWaitsByWorkspace/u)
  assert.doesNotMatch(source, /WAIT_ENDPOINT/u)
  assert.doesNotMatch(source, /refreshWaits/u)
  assert.doesNotMatch(source, /dsh-owner-wait-refresh/u)
})

test('运行状态按需要处理、总览、主线程和子代理分类显示确定性状态', async () => {
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  assert.match(source, /DSH_RUNTIME_STATUS_V1/u)
  assert.match(source, /需要处理/u)
  assert.match(source, /总览/u)
  assert.match(source, /主线程/u)
  assert.match(source, /子代理/u)
  assert.match(source, /空闲，等待接管/u)
  assert.match(source, /未观测/u)
  assert.match(source, /已关闭/u)
  assert.match(source, /已阻塞/u)
  assert.match(source, /waiting_owner_approval/u)
  assert.match(source, /Owner 等待授权/u)
  assert.match(source, /Runner 离线/u)
  assert.match(source, /未执行.*执行中/u)
  assert.match(source, /Runner 会继续驱动 Harness 内的 Owner 子代理/u)
  assert.match(source, /同一后台子代理正以可续接状态等待，并非失败或被中断/u)
  assert.match(source, /pendingInteraction/u)
  assert.match(source, /ctx\.sessions\.open/u)
  assert.doesNotMatch(source, /dsh-synapse-switch/u)
  assert.match(source, /运行状态/u)
  const styleStart = source.indexOf('.dsh-owner-wait-root')
  const styleEnd = source.indexOf('`.trim()', styleStart)
  const inboxStyles = source.slice(styleStart, styleEnd)
  assert.ok(styleStart >= 0 && styleEnd > styleStart)
  assert.doesNotMatch(inboxStyles, /#[0-9a-f]{3,8}|rgba?\(|hsla?\(/iu)
  assert.match(inboxStyles, /--dsw-alias-bg-layer-2/u)
  assert.match(inboxStyles, /--dsw-alias-state-warn-primary/u)
  assert.match(inboxStyles, /--dsw-alias-state-error-primary/u)
  assert.match(inboxStyles, /--dsw-alias-state-business-primary/u)
})

test('侧栏运行状态使用视口定位，避免被侧栏裁剪和遮住底部操作区', async () => {
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  assert.match(source, /position: 'fixed'/u)
  assert.match(source, /window\.innerHeight - rect\.top \+ 8/u)
  assert.match(source, /window\.innerWidth <= 720 \? 8 : rect\.right \+ 8/u)
})
