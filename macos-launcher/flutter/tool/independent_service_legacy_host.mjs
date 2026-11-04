import { fork } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { prepareDesktopProfile } from '../../runtime/desktop-profile.mjs'
import { readDesktopHost } from '../../runtime/desktop-launch.mjs'
import { redact } from '../../runtime/service-control.mjs'

// An independently owned Host stands in for an already-running installation.
// This fixture owns only the freshly staged profile and process, never user work.
const [resources, dataRoot, home] = process.argv.slice(2)
if (!resources || !dataRoot || !home) throw new Error('Pass owned resources, data and home')
const runtime = resources
const profile = await prepareDesktopProfile({ resourcesRoot: resources, desktopRuntimeRoot: runtime, globalRoot: join(dataRoot, 'global'), home, permissionMode: 'workspace-write' })
const child = fork(join(resources, 'workflow/macos-launcher/runtime/web-host.mjs'),
  [resources, profile.profile, join(dataRoot, 'global/.dsh-workflow/desktop')], {
    execPath: join(resources, 'node'), execArgv: ['--expose-internals'], cwd: profile.profile,
    env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', line => process.stderr.write(redact(line) + '\n'))
let closing = false, terminate, force
child.on('message', message => {
  if (message?.type === 'ready') {
    void (async () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        try { return await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop')) }
        catch (error) { if (error.code !== 'ENOENT') throw error; await delay(20) }
      }
      throw new Error('Legacy Host did not publish its receipt')
    })().then(receipt => {
      if (receipt.pid !== child.pid) throw new Error('Legacy fixture receipt does not identify its real Host')
      process.stdout.write(JSON.stringify({ pid: child.pid, instanceId: receipt.lease }) + '\n')
    }).catch(error => { console.error(redact(error.stack)); close(); process.exitCode = 1 })
  }
})
child.once('error', error => { console.error(redact(error.stack)); process.exitCode = 1 })
child.once('close', code => {
  clearTimeout(terminate); clearTimeout(force)
  if (!closing) process.exitCode = code || 1
})
function close() {
  if (closing) return
  closing = true
  if (child.connected) child.send({ type: 'shutdown' }, () => {})
  terminate = setTimeout(() => child.kill('SIGTERM'), 10_000)
  force = setTimeout(() => child.kill('SIGKILL'), 15_000)
}
process.once('SIGTERM', close); process.once('SIGINT', close)
