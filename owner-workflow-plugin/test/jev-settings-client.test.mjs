import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

async function fixture(t, hostCtx) {
  const window = { location: { protocol: 'file:' } }
  const document = { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
  const ctx = new Context()
  t.after(async () => { cleanup(); await ctx.fiber.dispose() })
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
    ['workflow-agent-monitor', { checkIntervalMs: 60000, noOutputThreshold: 5, jevModelName: '', semanticWaitMs: 180000, semanticThreshold: 5, debugEvidence: false }],
  ])
  const writes = [], credentials = [], calls = []
  let monitorState = { engineAvailability: { available: false, color: 'red', code: 'AUTHENTICATION_FAILED', reason: 'JEV 鉴权失败（HTTP 401）' },
    availableModels: ['quick'], alerts: [{ at: 1000, agentId: 'child-agent', role: 'child', kind: 'semantic-stall', reason: '持续思考疑似停滞' }], agents: [] }
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
    agentMonitor: { snapshot: async () => ({ ok: true, value: structuredClone(monitorState) }) },
  }
  await ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  ctx.provide('connection', { isLoopback: true, generation: { getSnapshot: () => ({ host: { home: '/fixture' } }) }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }), rpc: {
    async call(channel, endpoint, payload) {
      calls.push({ channel, endpoint, payload: structuredClone(payload) })
      if (hostCtx) {
        const [namespace, method] = endpoint.split('/')
        return { ok: true, value: JSON.parse(JSON.stringify(await hostCtx.typertGateway.invoke({ namespace, method, args: payload.args }))) }
      }
      if (endpoint === 'settings/describe') return host.settings.describe()
      if (endpoint === 'settings/mutate') return host.settings.mutate(payload.args.ns, payload.args.ops)
      if (endpoint === 'credentials/set') return host.credentials.set(payload.args.ref, payload.args.value)
      if (endpoint === 'jevCenter/testConnection') return host.jevCenter.testConnection(payload.args.modelName)
      if (endpoint === 'agentMonitor/snapshot') return host.agentMonitor.snapshot()
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
  return { ctx, writes, credentials, calls, setMonitorState(value) { monitorState = value }, async loadSettings(served = [...values.keys()]) {
    namespaces = served
    settingsFork = ctx.plugin({ ...settings, name: 'standard-settings-client' })
    await settingsFork
    await ctx.configForms.describe().ensure()
  }, async serve(served) { namespaces = served; await ctx.configForms.describe().load() }, async unloadSettings() { await settingsFork.dispose() },
  async unloadRemote() { await gatewayFork.dispose() }, async loadRemote() {
    gatewayFork = ctx.plugin(gateway); await gatewayFork
    const deadline = Date.now() + 1000
    while (!ctx.get('remote.settings') || !ctx.get('configForms')) {
      if (Date.now() >= deadline) throw new Error('Client settings providers did not restore')
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    await ctx.configForms.describe().ensure()
  } }
}

async function realSettingsHost(t, { includeMonitor = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'jev-native-real-settings-')), dir = join(root, 'profiles/test')
  const bundle = join(dir, 'node_modules/jev-settings-fixture')
  const { boot, initProfile, readProfilePatches } = req('@deepseek-ai/dsh-app-boot')
  const { default: center } = await import('../src/jev-center-plugin.mjs')
  const native = includeMonitor ? Object.fromEntries([
    ['llm', 'dsh-llm'], ['sessions', 'dsh-session'], ['projections', 'dsh-session-projection'],
    ['prompt', 'dsh-system-prompt'], ['tools', 'dsh-tools'], ['agents', 'dsh-agent'],
  ].map(([name, module]) => [name, req(`@deepseek-ai/${module}`).default])) : {}
  const { default: monitorPlugin } = includeMonitor ? await import('../src/agent-monitor-plugin.mjs') : {}
  initProfile(dir, ['jev-settings-fixture'])
  await mkdir(bundle, { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"jev-native-settings-test"}')
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'jev-settings-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' }, { id: 'settings', name: 'cordis:settings' },
    { id: 'credentials', name: 'cordis:credentials', config: { path: join(root, '.credentials.yaml'), watch: false } },
    { id: 'workflow-jev-center', name: 'cordis:jev-center' },
    ...Object.keys(native).map(name => ({ id: name, name: `cordis:${name}` })),
    ...includeMonitor ? [{ id: 'workflow-agent-monitor', name: 'cordis:agent-monitor', config: { directory: join(root, 'monitor-journal') } }] : [],
  ] }]))
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const profile = { name: 'test', startedBundles: ['jev-settings-fixture'], dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: join(root, 'package.json'), cwd: root, home: root, overlays: [] }
  const ctx = await boot('jev-native-settings-test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), c => {
    c.provide('profileContext', profile)
    c.provide('appReady', { onReady: listener => { listener(); return () => {} } })
    Object.assign(c.loader.builtins, { editor: req('@deepseek-ai/dsh-config-editor').default,
      settings: req('@deepseek-ai/dsh-settings').default, credentials: req('@deepseek-ai/dsh-credentials-local').default,
      'jev-center': center, ...native, ...includeMonitor ? { 'agent-monitor': monitorPlugin } : {} })
  })
  t.after(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  await ctx.plugin(req('@deepseek-ai/dsh-api-gateway').default)
  await ctx.plugin(req('@deepseek-ai/dsh-api-settings-controller').default)
  return ctx
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

test('native Settings creates, selects, edits, disables and deletes engines without replacing other configurations or their credentials', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'quick' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(ui.getByRole('status').textContent, '配置已保存'))
  fireEvent.click(ui.getByRole('button', { name: '新增配置' }))
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'full' } })
  fireEvent.change(ui.getByLabelText('服务 URL'), { target: { value: 'https://second.example.test' } })
  fireEvent.change(ui.getByLabelText('凭据引用'), { target: { value: 'JEV_FULL_KEY' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(f.ctx.configForms.get('workflow-jev-center').getSnapshot().value.engines.length, 2))
  fireEvent.click(ui.getByRole('button', { name: '测试连接' }))
  await waitFor(() => assert.equal(f.calls.filter(call => call.endpoint === 'jevCenter/testConnection').at(-1)?.payload.args.modelName, 'full'))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /连接成功/))
  fireEvent.change(ui.getByLabelText('JEV 引擎配置列表'), { target: { value: '0' } })
  assert.equal(ui.getByLabelText('服务 URL').value, 'https://api.typesafe.ai')
  fireEvent.click(ui.getByLabelText('启用'))
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(f.ctx.configForms.get('workflow-jev-center').getSnapshot().value.engines[0].enabled, false))
  assert.equal(f.ctx.configForms.get('workflow-jev-center').getSnapshot().value.engines[1].enabled, true)
  fireEvent.click(ui.getByRole('button', { name: '删除配置' }))
  await waitFor(() => assert.equal(f.ctx.configForms.get('workflow-jev-center').getSnapshot().value.engines.length, 1))
  assert.equal(f.ctx.configForms.get('workflow-jev-center').getSnapshot().value.engines[0].modelName, 'full')
  assert.equal(f.calls.some(call => call.endpoint === 'credentials/unset'), false)
})

test('native ConfigForms reads actual Host schema values and retains accepted edits after a real Settings Remote mutation', async t => {
  const host = await realSettingsHost(t)
  const engine = { url: 'http://127.0.0.1:1', upstreamModel: 'fixture-model', modelName: 'quick', credentialRef: 'JEV_FIXTURE_KEY', enabled: true, timeoutMs: 5000 }
  await host.settings.update('workflow-jev-center', { engines: [engine] })
  const f = await fixture(t, host)
  await f.loadSettings(['workflow-jev-center'])
  const scope = f.ctx.configForms.get('workflow-jev-center')
  const view = f.ctx.configForms.describe().namespace('workflow-jev-center')
  assert.equal(scope.getSnapshot().status, 'ready', f.ctx.settingsSchema.validate(f.ctx.settingsSchema.rehydrate(view.schema), view.value))
  assert.deepEqual(scope.getSnapshot().value.engines, [engine])
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  assert.equal(ui.getByLabelText('调用模型名（留空沿用上游模型名）').value, 'quick')
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'hard' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.equal(ui.getByRole('status').textContent, '配置已保存'))
  assert.equal(ui.getByLabelText('调用模型名（留空沿用上游模型名）').value, 'hard')
  assert.equal(host.get('jevCenter').describe()[0].modelName, 'hard')
  await React.act(async () => { await f.ctx.configForms.describe().load() })
  assert.equal(scope.getSnapshot().value.engines[0].modelName, 'hard')
})

test('native Settings clearly reports an enabled model-name conflict and leaves actual Host configuration unchanged', async t => {
  const host = await realSettingsHost(t)
  const engine = { url: 'http://127.0.0.1:1', upstreamModel: 'fixture-model', modelName: 'quick', credentialRef: 'JEV_FIXTURE_KEY', enabled: true, timeoutMs: 5000 }
  await host.settings.update('workflow-jev-center', { engines: [engine] })
  const f = await fixture(t, host)
  await f.loadSettings(['workflow-jev-center'])
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-jev-center')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  fireEvent.click(ui.getByRole('button', { name: '新增配置' }))
  fireEvent.change(ui.getByLabelText('调用模型名（留空沿用上游模型名）'), { target: { value: 'quick' } })
  fireEvent.submit(ui.getByRole('form', { name: 'JEV 引擎配置' }))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /调用模型名.*重复/))
  assert.equal(host.get('jevCenter').describe().length, 1)
  assert.equal(f.calls.filter(call => call.endpoint === 'settings/mutate').length, 0)
})

test('native monitor Settings expose semantic controls and read red engine reasons and alerts through the Desktop Remote carrier', async t => {
  const f = await fixture(t)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-agent-monitor')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  assert.equal(ui.getByLabelText('语义检测起始等待（毫秒）').value, '180000')
  assert.equal(ui.getByLabelText('连续明确语义异常告警次数').value, '5')
  assert.equal(ui.getByLabelText('记录调试会话片段').checked, false)
  await waitFor(() => assert.equal(ui.getByRole('option', { name: 'quick' }).value, 'quick'))
  fireEvent.change(ui.getByLabelText('JEV 调用模型名'), { target: { value: 'quick' } })
  fireEvent.change(ui.getByLabelText('语义检测起始等待（毫秒）'), { target: { value: '120000' } })
  fireEvent.click(ui.getByLabelText('记录调试会话片段'))
  fireEvent.submit(ui.getByRole('form', { name: '代理监控设置' }))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /配置已保存/))
  const saved = f.ctx.configForms.get('workflow-agent-monitor').getSnapshot().value
  assert.equal(saved.jevModelName, 'quick')
  assert.equal(saved.semanticWaitMs, 120000)
  assert.equal(saved.debugEvidence, true)
  await waitFor(() => assert.match(ui.getByRole('alert').textContent, /JEV 鉴权失败.*401/))
  assert.match(ui.getByRole('log').textContent, /child-agent.*semantic-stall/)
  assert.ok(f.calls.some(call => call.endpoint === 'agentMonitor/snapshot' && Object.keys(call.payload.args).length === 0))
  assert.equal(f.calls.some(call => call.endpoint.includes('agentMonitor/') && call.endpoint !== 'agentMonitor/snapshot'), false)
  assert.doesNotMatch(ui.container.innerHTML, /iframe|agent-monitor\/api\/status/)
})

test('actual Host monitor schema reads defaults and retains semantic settings through native ConfigForms and read-only Remote status', async t => {
  const host = await realSettingsHost(t, { includeMonitor: true })
  await host.settings.update('workflow-jev-center', { engines: [{ url: 'http://127.0.0.1:1', upstreamModel: 'fixture', modelName: 'quick', credentialRef: 'JEV_FIXTURE_KEY', enabled: true, timeoutMs: 5000 }] })
  const f = await fixture(t, host)
  await f.loadSettings(['workflow-agent-monitor'])
  const scope = f.ctx.configForms.get('workflow-agent-monitor')
  assert.equal(scope.getSnapshot().status, 'ready')
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-agent-monitor')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  assert.equal(ui.getByLabelText('语义检测起始等待（毫秒）').value, '180000')
  assert.equal(ui.getByLabelText('记录调试会话片段').checked, false)
  await waitFor(() => assert.equal(ui.getByRole('option', { name: 'quick' }).value, 'quick'))
  fireEvent.change(ui.getByLabelText('JEV 调用模型名'), { target: { value: 'quick' } })
  fireEvent.change(ui.getByLabelText('语义检测起始等待（毫秒）'), { target: { value: '150000' } })
  fireEvent.change(ui.getByLabelText('连续明确语义异常告警次数'), { target: { value: '3' } })
  fireEvent.click(ui.getByLabelText('记录调试会话片段'))
  fireEvent.submit(ui.getByRole('form', { name: '代理监控设置' }))
  await waitFor(() => assert.equal(ui.getByRole('status').textContent, '配置已保存'))
  const hostValue = host.settings.describe().find(item => item.ns === 'workflow-agent-monitor').value
  assert.deepEqual([hostValue.jevModelName, hostValue.semanticWaitMs, hostValue.semanticThreshold, hostValue.debugEvidence], ['quick', 150000, 3, true])
  await React.act(async () => { await f.ctx.configForms.describe().load() })
  assert.equal(scope.getSnapshot().value.semanticWaitMs, 150000)
  assert.equal(ui.getByLabelText('连续明确语义异常告警次数').value, '3')
  assert.ok(f.calls.some(call => call.endpoint === 'agentMonitor/snapshot'))
  assert.equal(f.calls.some(call => call.endpoint === 'jevCenter/testConnection'), false)
})

test('monitor status handles absent, late, withdrawn and recovered services without confusing their causes or exposing mutations', async t => {
  const f = await fixture(t)
  f.setMonitorState(undefined)
  await f.loadSettings()
  const entry = f.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'workflow-agent-monitor')
  const ui = render(React.createElement(entry.component, entry.inject()))
  t.after(cleanup)
  await waitFor(() => assert.match(ui.getByRole('alert').textContent, /代理监控状态暂不可用/))
  assert.doesNotMatch(ui.getByRole('alert').textContent, /引擎缺失/)
  f.setMonitorState({ engineAvailability: { available: true, color: 'green', modelName: 'quick' }, availableModels: ['quick'], alerts: [], agents: [] })
  fireEvent.click(ui.getByRole('button', { name: '刷新监控状态' }))
  await waitFor(() => assert.ok(ui.getByText('JEV 引擎可用')))
  f.setMonitorState({ engineAvailability: { available: false, color: 'red', code: 'ENGINE_DISABLED', reason: 'JEV 引擎已停用', modelName: 'quick' }, availableModels: [], alerts: [{ role: 'child', agentId: 'child-agent', attemptId: 'child-agent:3', at: 1000, kind: 'no-output', reason: '连续无输出' }], agents: [] })
  fireEvent.click(ui.getByRole('button', { name: '刷新监控状态' }))
  await waitFor(() => assert.match(ui.getByRole('alert').textContent, /引擎已停用/))
  assert.equal(ui.getByRole('alert').className, 'dsh-monitor-engine-unavailable')
  assert.match(ui.getByRole('log').textContent, /子代理.*child-agent.*no-output.*child-agent:3.*连续无输出/)
  await React.act(async () => { await f.unloadRemote() })
  assert.equal(f.ctx.slots.entries('settings.section').length, 0)
  assert.ok(f.ctx.slots.entries('sidebar.footer.action').some(item => item.options.id === 'owner-workflow-waits'))
  f.setMonitorState({ engineAvailability: { available: false, color: 'red', code: 'TIMEOUT', reason: 'JEV 请求超时' }, availableModels: ['quick'], alerts: [], agents: [] })
  await React.act(async () => { await f.loadRemote() })
  const restored = f.ctx.slots.entries('settings.section').find(item => item.options.id === 'workflow-agent-monitor')
  ui.rerender(React.createElement(restored.component, restored.inject()))
  await waitFor(() => assert.match(ui.getByRole('alert').textContent, /请求超时/))
  assert.equal(f.calls.some(call => call.endpoint.includes('agentMonitor/') && call.endpoint !== 'agentMonitor/snapshot'), false)
})
