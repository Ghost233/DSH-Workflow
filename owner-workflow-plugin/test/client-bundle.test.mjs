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

test('运行状态同时登记会话头部、工作区、侧边栏和全屏待处理 Slot', async () => {
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
  assert.deepEqual(slotNames, [
    'conversation.session.header.actions',
    'sidebar.workspace.action',
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
  assert.match(source, /sidebar\.workspace\.action/u)
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
  assert.match(source, /dsh-synapse-switch/u)
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
