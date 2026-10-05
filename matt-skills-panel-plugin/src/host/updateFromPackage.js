import { existsSync, readFileSync } from 'node:fs'

// The derived panel is updated with DSH Workflow, never by the upstream npm updater.
export function createUpdatePhoneHandlers() {
  const packaged = new URL('../package.json', import.meta.url)
  const path = existsSync(packaged) ? packaged : new URL('../../package/package.json', import.meta.url)
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  const status = () => ({ snapshot: {
    runningVersion: manifest.version, installedVersion: manifest.version,
    latestVersion: null, canInstall: false, blockedReason: 'managed-by-workflow',
    job: { state: 'idle', message: '此面板由 DSH Workflow 构建更新。' },
  }, manual: null })
  return {
    handleUpdateStatus: status,
    handleUpdateCheck: status,
    handleUpdateInstall() { throw new Error('此派生版随 DSH Workflow 更新，请更新主项目并重新构建。') },
  }
}
