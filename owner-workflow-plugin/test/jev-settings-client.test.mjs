import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const req = createRequire(new URL('../../deepseek-harness/packages/test-support/client-runtime/package.json', import.meta.url))
const { Context } = req('@deepseek-ai/cordis')
const { JSDOM } = req('jsdom')
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'file:///DSH/index.html' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = req('react')
const { renderToStaticMarkup } = req('react-dom/server')
const { render, fireEvent, waitFor, cleanup } = req('@testing-library/react')

async function browserPlugin(path, window, document) {
  const modules = []
  window.__ModuleLoader__ = { load: item => modules.push(item) }
  vm.runInNewContext(await readFile(new URL(path, import.meta.url), 'utf8'), {
    window, document, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone,
    crypto: globalThis.crypto, AbortController, AbortSignal, TextEncoder, TextDecoder,
  })
  return modules[0].factory(name => name === '@deepseek-ai/dsh-client-ui-primitives'
    ? { MarkdownText: () => null } : req(name))
}

async function fixture(t) {
  const window = { location: { protocol: 'file:' } }
  const document = { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const renderer = await browserPlugin('../../deepseek-harness/packages/client/ui-renderer/lib/client.js', window, document)
  const settings = await browserPlugin('../../deepseek-harness/packages/client/ui-settings/lib/client.js', window, document)
  const gateway = await browserPlugin('../../deepseek-harness/packages/api/gateway/lib/client.js', window, document)
  const own = await browserPlugin('../client.js', window, document)
  await ctx.plugin(renderer)
  ctx.slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'root' },
    'conversation.composer': { kind: 'chain', scope: 'root' },
    'conversation.session.header.actions': { kind: 'list', scope: 'root' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
    'settings.section': { kind: 'list', scope: 'root' },
    'plugins.item': { kind: 'list', scope: 'root' },
  } }, () => null)
  ctx.provide('sessions', { open() {}, list: { getSnapshot: () => ({ current: undefined }), subscribe: () => () => {} } })
  ctx.provide('uiSession', { sessionStatus: { getSnapshot: () => new Map(), subscribe: () => () => {} }, adapter: { current: { value: { key: undefined }, subscribe: () => () => {} } } })
  ctx.provide('sidebarRight', { openTab() {} })
  ctx.provide('sidebarRightTabs', { register() { return () => {} } })
  let namespaces = []
  const defaultEngine = { url: 'https://api.typesafe.ai', upstreamModel: 'jev-latest', modelName: '', credentialRef: 'TYPESAFE_API_KEY', enabled: true, timeoutMs: 5000 }
  const values = new Map([
    ['workflow-jev-center', { engines: [defaultEngine] }],
    ['workflow-agent-monitor', { checkIntervalMs: 60000, noOutputThreshold: 5 }],
  ])
  const writes = [], credentials = [], calls = []
  const host = {
    settings: {
      describe: async () => ({ ok: true, value: { writable: true, present: true, namespaces: namespaces.map(ns => ({ ns, revision: 0, autoGenerate: false, value: structuredClone(values.get(ns)), user: {}, base: structuredClone(values.get(ns)), schema: { type: 'object', dict: {} } })) } }),
      mutate: async (ns, ops) => {
        writes.push({ ns, ops: JSON.parse(JSON.stringify(ops)) })
        for (const op of ops) values.set(ns, { ...values.get(ns), [op.path[0]]: structuredClone(op.value) })
        return { ok: true, value: { ns, revision: writes.length, autoGenerate: false, value: structuredClone(values.get(ns)), user: structuredClone(values.get(ns)), base: {}, schema: { type: 'object', dict: {} } } }
      },
    },
    credentials: { set: async (ref, value) => { credentials.push({ ref, value }); return { ok: true, value: undefined } } },
    jevCenter: { testConnection: async modelName => ({ ok: true, value: { ok: true, model: 'jev-actual-version', answers: { connectivity: { type: 'noul', noul: 1 } }, elapsedMs: 23 } }) },
  }
  await ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  ctx.provide('connection', { isLoopback: true, generation: { getSnapshot: () => ({ host: { home: '/fixture' } }) }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }), rpc: {
    async call(channel, endpoint, payload) {
      calls.push({ channel, endpoint, payload: structuredClone(payload) })
      if (endpoint === 'settings/describe') return host.settings.describe()
      if (endpoint === 'settings/mutate') return host.settings.mutate(payload.args.ns, payload.args.ops)
      if (endpoint === 'credentials/set') return host.credentials.set(payload.args.ref, payload.args.value)
      if (endpoint === 'jevCenter/testConnection') return host.jevCenter.testConnection(payload.args.modelName)
      throw new Error(`unexpected Connection endpoint: ${endpoint}`)
    },
    async *open() {},
  } })
  let gatewayFork = ctx.plugin(gateway)
  await gatewayFork
  await ctx.plugin({ name: 'standard-remotes', inject: ['remote', 'typert'], apply: child => {
    child.effect(() => child.remote.$mount(req('@deepseek-ai/dsh-api-settings-controller/remote').default))
  } })
  await ctx.plugin({ ...own, name: 'own-client' })
  let settingsFork
  return { ctx, writes, credentials, calls, async loadSettings(served = [...values.keys()]) {
    namespaces = served
    settingsFork = ctx.plugin({ ...settings, name: 'standard-settings-client' })
    await settingsFork
    await ctx.configForms.describe().ensure()
  }, async serve(served) { namespaces = served; await ctx.configForms.describe().load() }, async unloadSettings() { await settingsFork.dispose() },
  async unloadRemote() { await gatewayFork.dispose() }, async loadRemote() {
    gatewayFork = ctx.plugin(gateway); await gatewayFork
    await waitFor(() => assert.ok(ctx.get('remote.settings')))
    await waitFor(() => assert.ok(ctx.get('configForms')))
    await ctx.configForms.describe().ensure()
  } }
}

test('native Settings and Plugins receive JEV configuration pages only while their Host namespaces are served', async t => {
  const f = await fixture(t)
  assert.equal(f.ctx.slots.entries('settings.section').length, 0)
  assert.ok(f.ctx.slots.entries('sidebar.footer.action').some(entry => entry.options.id === 'owner-workflow-waits'))
  await f.loadSettings()
  assert.deepEqual(f.ctx.slots.entries('settings.section').map(entry => entry.options.label), ['JEV 中心', '代理监控'])
  assert.deepEqual(f.ctx.slots.entries('plugins.item').map(entry => entry.options.label), ['JEV 中心', '代理监控'])
  const entry = f.ctx.slots.entries('settings.section')[0]
  const html = renderToStaticMarkup(React.createElement(entry.component, entry.inject()))
  assert.match(html, /上游模型名/)
  assert.match(html, /保存配置/)
  assert.doesNotMatch(html, /<iframe/)
  await f.serve(['workflow-agent-monitor'])
  assert.deepEqual(f.ctx.slots.entries('settings.section').map(entry => entry.options.label), ['代理监控'])
  await f.serve([])
  assert.equal(f.ctx.slots.entries('plugins.item').length, 0)
  assert.ok(f.ctx.slots.entries('sidebar.footer.action').some(entry => entry.options.id === 'owner-workflow-waits'))
})

test('the native JEV configuration page lets users edit and save through ConfigForms on the Desktop carrier', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.change(ui.getByLabelText('上游模型名'), { target: { value: 'jev-custom-upstream' } })
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'quick' } })
  fireEvent.change(ui.getByLabelText('请求超时（毫秒）'), { target: { value: '7000' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(f.writes.length, 1))
  assert.deepEqual(f.writes[0], { ns: 'workflow-jev-center', ops: [{ op: 'set', path: ['engines'], value: [{ url: 'https://api.typesafe.ai', upstreamModel: 'jev-custom-upstream', modelName: 'quick', credentialRef: 'TYPESAFE_API_KEY', enabled: true, timeoutMs: 7000 }] }] })
  assert.equal(ui.getByRole('status').textContent, '配置已保存')
})

test('native JEV credentials are saved separately through the standard credential Remote', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.change(ui.getByLabelText('凭据引用'), { target: { value: 'JEV_QUICK_KEY' } })
  fireEvent.change(ui.getByLabelText('密钥'), { target: { value: 'native-private-key' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 凭据' }))
  await waitFor(() => assert.deepEqual(f.credentials, [{ ref: 'JEV_QUICK_KEY', value: 'native-private-key' }]))
  assert.equal(f.writes.length, 0)
  assert.equal(ui.getByLabelText('密钥').value, '')
  assert.equal(ui.container.textContent.includes('native-private-key'), false)
})

test('native monitor settings save their interval and threshold and do not depend on JEV configuration', async t => {
  const f = await fixture(t)
  await f.loadSettings(['workflow-agent-monitor'])
  const entry = f.ctx.slots.entries('plugins.item').find(entry => entry.options.id === 'workflow-agent-monitor')
  const ui = render(React.createElement(entry.component, { ...entry.inject(), view: 'page' }))
  t.after(cleanup)
  fireEvent.change(ui.getByLabelText('检查间隔（毫秒）'), { target: { value: '120000' } })
  fireEvent.change(ui.getByLabelText('连续无输出告警次数'), { target: { value: '3' } })
  fireEvent.submit(ui.getByRole('form', { name: '代理监控设置' }))
  await waitFor(() => assert.equal(ui.getByRole('status').textContent, '配置已保存'))
  assert.deepEqual(f.writes, [{ ns: 'workflow-agent-monitor', ops: [{ op: 'set', path: ['checkIntervalMs'], value: 120000 }, { op: 'set', path: ['noOutputThreshold'], value: 3 }] }])
  assert.equal(f.credentials.length, 0)
})

test('removing and restoring ConfigForms removes native configuration pages while the Owner interface remains active', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  await f.unloadSettings()
  assert.equal(f.ctx.slots.entries('settings.section').length, 0)
  assert.ok(f.ctx.slots.entries('sidebar.footer.action').some(entry => entry.options.id === 'owner-workflow-waits'))
  await f.loadSettings()
  assert.equal(f.ctx.slots.entries('settings.section').length, 2)
})

test('native connection testing mounts its descriptor and sends only the saved model name through Connection RPC', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'quick' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(ui.getByRole('status').textContent, '配置已保存'))
  fireEvent.click(ui.getByRole('button', { name: '测试连接' }))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /jev-actual-version/))
  assert.match(ui.getByRole('status').textContent, /23/)
  assert.deepEqual(f.calls.filter(call => call.endpoint === 'jevCenter/testConnection'), [{ channel: '/api', endpoint: 'jevCenter/testConnection', payload: { args: { modelName: 'quick' } } }])
})

test('late Remote replacement withdraws and reinstalls native settings without blocking the Owner interface', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  await f.unloadRemote()
  assert.equal(f.ctx.slots.entries('settings.section').length, 0)
  assert.ok(f.ctx.slots.entries('sidebar.footer.action').some(entry => entry.options.id === 'owner-workflow-waits'))
  await f.loadRemote()
  assert.equal(f.ctx.slots.entries('settings.section').length, 2)
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.click(ui.getByRole('button', { name: '测试连接' }))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /jev-actual-version/))
})
