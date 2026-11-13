import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { browserRequire as req, clientAsset } from '../../scripts/test-runtime.mjs'

const { Context } = req('@deepseek-ai/cordis')
const { JSDOM } = req('jsdom')
const React = req('react')
const { render, fireEvent, waitFor, cleanup } = req('@testing-library/react')

test('Settings Plugins exposes actual runtime versions, repository pins, sources and drift without mutation actions', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'file:///DSH/index.html' })
  const document = dom.window.document
  const window = dom.window
  globalThis.window = window
  globalThis.document = document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const ctx = new Context()
  t.after(async () => {
    cleanup()
    await ctx.fiber.dispose()
    dom.window.close()
  })

  async function browserPlugin(path) {
    let module
    window.__ModuleLoader__ = { load: item => { module = item } }
    vm.runInNewContext(await readFile(path, 'utf8'), {
      window, document, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone,
      crypto: globalThis.crypto, AbortController, AbortSignal, TextEncoder, TextDecoder,
    })
    return module.factory(req)
  }

  const renderer = await browserPlugin(clientAsset('@deepseek-ai/dsh-client-ui-renderer', 'lib/client.js', 'packages/client/ui-renderer/lib/client.js'))
  const gateway = await browserPlugin(clientAsset('@deepseek-ai/dsh-api-gateway', 'lib/client.browser.js', 'packages/api/gateway/lib/client.browser.js'))
  const client = await browserPlugin(new URL('../client.js', import.meta.url))
  await ctx.plugin(renderer)
  ctx.slots.register({ name: 'root', children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } } }, () => null)
  await ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  const calls = []
  ctx.provide('connection', {
    interactions: 'answer',
    isLoopback: true,
    generation: { getSnapshot: () => ({ host: { home: '/fixture' } }) },
    registerGenerationSource: () => () => {},
    start: () => ({ stop() {} }),
    rpc: {
      async call(_channel, endpoint) {
        calls.push(endpoint)
        assert.equal(endpoint, 'workflowDelivery/list')
        return { ok: true, value: {
          actualScope: 'runtime-resolution',
          policy: '组件随本仓库正式 DMG 统一交付',
          rows: [
            { entryId: 'fixture-pin', moduleName: 'example-plugin', current: '1.1.0', expected: '1.2.0', source: '/actual/profile/node_modules/example-plugin', status: 'drift', enabled: true, fiberPhase: 'active', updatable: false },
            { entryId: 'fixture-unknown', moduleName: 'unresolved-plugin', current: null, expected: null, source: '运行解析来源未知', status: 'unknown', enabled: false, fiberPhase: null, updatable: false },
          ],
        } }
      },
      async *open() {},
    },
  })
  await ctx.plugin(gateway)
  await ctx.plugin({ ...client, name: 'own-client' })

  const getTab = () => ctx.slots.entries('settings.plugins.tab').find(row => row.options.id === 'workflow-delivery')
  await waitFor(() => assert.ok(getTab()))
  const entry = getTab()
  const ui = render(React.createElement(entry.component, entry.inject()))
  await waitFor(() => assert.ok(ui.getByText('example-plugin')))
  assert.ok(ui.getByText('1.1.0'))
  assert.ok(ui.getByText('1.2.0'))
  assert.ok(ui.getByText('/actual/profile/node_modules/example-plugin'))
  assert.ok(ui.getByText('版本偏差'))
  assert.ok(ui.getByText('未能核验'))
  assert.match(ui.container.textContent, /正式 DMG/)
  assert.equal(ui.queryByRole('button', { name: /安装|更新|卸载|删除/ }), null)
  fireEvent.click(ui.getByRole('button', { name: '刷新组件清单' }))
  await waitFor(() => assert.deepEqual(calls, ['workflowDelivery/list', 'workflowDelivery/list']))
})
