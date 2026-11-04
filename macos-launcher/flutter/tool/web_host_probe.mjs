// Headless supplemental evidence uses Station's packaged Web Host.
import { fork } from 'node:child_process'
import { createInterface } from 'node:readline'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [resources, dataRoot, home, permissionMode = 'danger-full-access'] = process.argv.slice(2)
if (!resources || !dataRoot || !home) throw new Error('Pass private resources, data root and home')
const { prepareDesktopProfile } = await import(pathToFileURL(join(resources, 'workflow/macos-launcher/runtime/desktop-profile.mjs')))
const prepared = await prepareDesktopProfile({ resourcesRoot: resources, globalRoot: join(dataRoot, 'global'),
  desktopRuntimeRoot: resources, home, permissionMode })
const child = fork(join(resources, 'workflow/macos-launcher/runtime/web-host.mjs'), [
  resources, prepared.profile, join(dataRoot, 'global/.dsh-workflow/desktop'),
], { execPath: join(resources, 'node'), execArgv: ['--expose-internals'],
  cwd: prepared.profile, env: { ...process.env, DSH_HOME: home,
    DSH_AGENTS_HOME: join(home, 'agents'), PATH: [join(resources, 'bin'), resources, process.env.PATH].filter(Boolean).join(delimiter) },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
console.log(`HOST_PID=${child.pid}`)
const redact = chunk => chunk.toString().replace(/token=[^&\s]+/g, 'token=<REDACTED>')
createInterface({ input: child.stdout }).on('line', line => process.stdout.write(redact(line) + '\n'))
createInterface({ input: child.stderr }).on('line', line => process.stderr.write(redact(line) + '\n'))
child.on('message', message => {
  if (message.type === 'ready') console.log('HOST_READY')
  if (message.type === 'shutdown-complete') { shutdownComplete = true; console.log('HOST_SHUTDOWN_COMPLETE') }
  if (message.type === 'fatal') console.error(`HOST_FATAL: ${redact(message.message)}`)
})
child.on('disconnect', () => console.log('HOST_IPC_DISCONNECT'))
let stopping = false, shutdownComplete = false, forced = false
let terminateHost, killHost
function stop() {
  if (stopping) return
  stopping = true
  if (child.connected) child.send({ type: 'shutdown' })
  // Disposal ACK is distinct from natural exit; reap only this forked Host PID.
  terminateHost = setTimeout(() => {
    forced = true
    console.log('HOST_OWNER_SIGNAL=SIGTERM')
    child.kill('SIGTERM')
    killHost = setTimeout(() => { console.log('HOST_OWNER_SIGNAL=SIGKILL'); child.kill('SIGKILL') }, 5000)
    killHost.unref()
  }, 10000)
  terminateHost.unref()
}
process.stdin.on('data', stop)
process.stdin.on('end', stop)
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
child.on('exit', (code, signal) => {
  clearTimeout(terminateHost)
  clearTimeout(killHost)
  console.log(`HOST_EXIT=${code} HOST_SIGNAL=${signal}`)
  console.log(`HOST_OWNER_REAPED=true HOST_SHUTDOWN_ACK=${shutdownComplete} HOST_FORCED=${forced}`)
  // ChildProcess exit is the actual reaped-PID observation. Never rewrite its
  // raw code/signal; success belongs to acknowledged disposal + owner reclaim.
  process.exitCode = shutdownComplete ? 0 : code || 1
  process.stdin.destroy()
})
