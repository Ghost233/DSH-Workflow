import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createWorkflowMacWindowPresence } from './desktop-window-presence.mjs'

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 })
  const app = new EventEmitter(), windows = [], calls = []
  let dockVisible = true, menu
  app.dock = { isVisible: () => dockVisible, show: async () => { dockVisible = true; calls.push('show') }, hide: () => { dockVisible = false; calls.push('hide') } }
  const tray = new EventEmitter()
  Object.assign(tray, { setToolTip: () => {}, setContextMenu: value => { menu = value }, destroy: () => calls.push('dispose') })
  const controller = createWorkflowMacWindowPresence({ app, BrowserWindow: { getAllWindows: () => windows }, Tray: function() { return tray },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) }, Menu: { buildFromTemplate: rows => rows }, iconPath: '/icon.png',
    locale: () => ({ messages: { aboutProduct: 'DSH', openApplication: 'Open', quitApplication: 'Quit' } }),
    open: () => calls.push('open'), quit: () => calls.push('quit') })
  t.after(() => controller.dispose())
  const window = () => {
    const w = new EventEmitter(); w.visible = false; w.minimized = false; w.destroyed = false
    w.isVisible = () => w.visible; w.isMinimized = () => w.minimized; w.isDestroyed = () => w.destroyed
    w.change = (event, values) => { Object.assign(w, values); w.emit(event) }
    windows.push(w); app.emit('browser-window-created', {}, w); return w
  }
  return { app, window, calls, controller, visible: () => dockVisible, menu: () => menu }
}

test('hidden client remains in the menu bar, shows in Dock on open, and hides after close', async t => {
  const f = fixture(t), w = f.window(); await Promise.resolve()
  assert.equal(f.visible(), false)
  w.change('show', { visible: true }); await Promise.resolve()
  assert.equal(f.visible(), true)
  w.change('hide', { visible: false }); t.mock.timers.tick(1100)
  assert.equal(f.visible(), false)
  f.menu()[0].click(); assert.equal(f.calls.at(-1), 'open')
  f.menu()[2].click(); assert.equal(f.calls.at(-1), 'quit')
  w.change('show', { visible: true }); await Promise.resolve()
  assert.equal(f.visible(), true)
})

test('other open or minimized client windows keep the Dock entry', async t => {
  const f = fixture(t), a = f.window(), b = f.window()
  a.change('show', { visible: true }); b.change('minimize', { minimized: true })
  a.change('hide', { visible: false }); await Promise.resolve()
  assert.equal(f.visible(), true)
  b.change('closed', { destroyed: true }); t.mock.timers.tick(1100)
  assert.equal(f.visible(), false)
  assert.equal(b.listenerCount('show'), 0)
})

test('rapid reopen/close still hides after the Electron hide cooldown; quit removes its tray', async t => {
  const f = fixture(t), w = f.window(); await Promise.resolve()
  w.change('show', { visible: true }); await Promise.resolve()
  w.change('hide', { visible: false })
  assert.equal(f.visible(), true)
  t.mock.timers.tick(1100)
  assert.equal(f.visible(), false)
  f.app.emit('will-quit')
  assert.equal(f.calls.filter(x => x === 'dispose').length, 1)
  assert.equal(f.app.listenerCount('browser-window-created'), 0)
})
