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
    throw new Error(`测试遇到未声明的客户端依赖：${name}`)
  })
  const aliasClient = registrations[1].factory(name => {
    if (name === 'react') return React
    throw new Error(`测试遇到未声明的客户端依赖：${name}`)
  })
  const slotNames = []
  const context = {
    sessions: { open() {} },
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
    'conversation.composer',
    'conversation.session.header.actions',
    'sidebar.footer.action',
    'shell.overlay',
  ])
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
