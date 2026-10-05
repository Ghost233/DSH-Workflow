// Headless supplemental evidence uses the unchanged packaged Desktop Host.
// It does not cover NSWorkspace, Electron windows, or native Desktop startup.
import { fork } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [resources, dataRoot, home] = process.argv.slice(2)
if (!resources || !dataRoot || !home) throw new Error('Pass private resources, data root and home')
const desktop = join(resources, 'desktop/DeepSeek Harness.app/Contents')
const runtime = join(desktop, 'Resources/app/dsh')
const { prepareDesktopProfile } = await import(pathToFileURL(join(resources, 'workflow/macos-launcher/runtime/desktop-profile.mjs')))
const prepared = await prepareDesktopProfile({ resourcesRoot: resources, globalRoot: join(dataRoot, 'global'),
  desktopRuntimeRoot: runtime, home, permissionMode: 'danger-full-access' })
const child = fork(join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'), [
  runtime, prepared.profile, join(desktop, 'Resources/runtime/primary-runtime'),
  join(desktop, 'Resources/runtime/pnpm/bin/pnpm.cjs'), join(desktop, 'MacOS'),
], { execPath: join(desktop, 'MacOS/DeepSeek Harness'), execArgv: ['--expose-internals'],
  cwd: prepared.profile, env: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
console.log(`HOST_PID=${child.pid}`)
const redact = chunk => chunk.toString().replace(/token=[^&\s]+/g, 'token=<REDACTED>')
child.stdout.on('data', chunk => process.stdout.write(redact(chunk)))
child.stderr.on('data', chunk => process.stderr.write(redact(chunk)))
child.on('message', message => {
  if (message.type === 'ready') console.log('HOST_READY')
  if (message.type === 'fatal') console.error(`HOST_FATAL: ${redact(message.message)}`)
})
let stopping = false
let forceStop
function stop() {
  if (stopping) return
  stopping = true
  if (child.connected) child.send({ type: 'shutdown' })
  forceStop = setTimeout(() => child.kill('SIGKILL'), 10000)
  forceStop.unref()
}
process.stdin.on('data', stop)
process.stdin.on('end', stop)
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
child.on('exit', (code, signal) => {
  clearTimeout(forceStop)
  console.log(`HOST_EXIT=${code} HOST_SIGNAL=${signal}`)
  process.exitCode = code ?? 1
  process.stdin.destroy()
})
