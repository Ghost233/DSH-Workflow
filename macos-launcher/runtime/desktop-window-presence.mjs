/** macOS keeps a menu-bar entry while the Dock represents open client windows. */
export function createWorkflowMacWindowPresence({ app, BrowserWindow, Tray, Menu, nativeImage, iconPath, locale, open, quit }) {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 }))
  const windows = new Map()
  let disposed = false, retry, showing, lastHide = -Infinity
  const synchronize = () => {
    clearTimeout(retry)
    if (disposed) return
    for (const [window, events] of windows) if (window.isDestroyed()) {
      for (const event of events) window.removeListener(event, synchronize)
      windows.delete(window)
    }
    const present = BrowserWindow.getAllWindows().some(window => !window.isDestroyed() && (window.isVisible() || window.isMinimized()))
    if (present) {
      if (!app.dock.isVisible() && !showing) showing = app.dock.show().then(() => { showing = undefined; synchronize() }, error => {
        showing = undefined; console.error('Desktop Dock could not be shown:', error.message)
      })
    } else if (app.dock.isVisible()) {
      // Electron ignores repeated hide calls less than one second apart.
      const remaining = 1100 - (Date.now() - lastHide)
      if (remaining > 0) retry = setTimeout(synchronize, remaining)
      else { app.dock.hide(); lastHide = Date.now() }
    }
  }
  const attach = (_event, window) => {
    const events = ['show', 'hide', 'minimize', 'restore', 'closed']
    for (const event of events) window.on(event, synchronize)
    windows.set(window, events)
    queueMicrotask(synchronize)
  }
  const relabel = () => {
    const { messages } = locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: open },
      { type: 'separator' },
      { label: messages.quitApplication, click: quit },
    ]))
  }
  const dispose = () => {
    if (disposed) return
    disposed = true; clearTimeout(retry)
    app.removeListener('browser-window-created', attach)
    app.removeListener('will-quit', dispose)
    for (const [window, events] of windows) for (const event of events) window.removeListener(event, synchronize)
    windows.clear(); tray.destroy()
  }
  app.on('browser-window-created', attach)
  app.once('will-quit', dispose)
  for (const window of BrowserWindow.getAllWindows()) attach(null, window)
  tray.on('click', open)
  relabel()
  return { relabel, dispose }
}
