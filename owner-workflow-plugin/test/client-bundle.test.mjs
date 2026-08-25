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

test('行动收件箱同时登记会话头部、侧边栏和全屏浮层 Slot', async () => {
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
    'sidebar.footer.action',
    'shell.overlay',
  ])
})

test('等待列表客户端显示 Runner 与 Owner 任务执行统计', async () => {
  const source = await readFile(CLIENT_BUNDLE, 'utf8')
  assert.match(source, /waiting_runner/u)
  assert.match(source, /running_owner/u)
  assert.match(source, /Runner 离线/u)
  assert.match(source, /未执行.*执行中/u)
  assert.match(source, /Runner 会继续驱动 Harness 内的 Owner 子代理/u)
  assert.match(source, /pendingInteraction/u)
  assert.match(source, /ctx\.sessions\.open/u)
  assert.match(source, /dsh-synapse-switch/u)
  assert.match(source, /行动收件箱/u)
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
