import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { serviceRequest, privateDirectory, SERVICE_PROTOCOL, redact } from './service-control.mjs'
import { webDirectory, webSocket } from './web-control.mjs'

async function ensureWeb({ dataRoot, resources }) {
  const socket = webSocket(dataRoot)
  try { await serviceRequest(socket, { type: 'status' }); return socket }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await privateDirectory(webDirectory(dataRoot))
  const log = await open(join(webDirectory(dataRoot), 'manager.log'), 'a', 0o600)
  try {
    const environment = { ...process.env }
    delete environment.DSH_LAUNCH_PASSWORD
    const child = spawn(process.execPath, [fileURLToPath(new URL('./global-supervisor.mjs', import.meta.url)), dataRoot], {
      detached: true, stdio: ['ignore', log.fd, log.fd], env: environment, cwd: resources,
    })
    await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject) })
    child.unref()
  } finally { await log.close() }
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await serviceRequest(socket, { type: 'status' }); return socket }
    catch (error) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
      await delay(50)
    }
  }
  throw new Error('Web 访问管理进程未就绪，请检查 Web 日志。')
}

if (import.meta.main) {
  try {
    const [dataRoot, resources] = process.argv.slice(2)
    if (!dataRoot || !resources) throw new Error('Missing Web service paths')
    let body = ''
    for await (const chunk of process.stdin) { body += chunk; if (body.length > 16 * 1024) throw new Error('Control request too large') }
    const request = JSON.parse(body)
    if (['start-web', 'set-password'].includes(request.type)) request.password = process.env.DSH_LAUNCH_PASSWORD
    if (request.type === 'start-web') request.allowLanSettings = process.env.DSH_ALLOW_LAN_SETTINGS === '1'
    const socket = request.type === 'start-web' ? await ensureWeb({ dataRoot, resources }) : webSocket(dataRoot)
    let value
    try { value = await serviceRequest(socket, request) }
    catch (error) {
      if (['status', 'logs', 'recycle-web'].includes(request.type) && error.code === 'ENOENT') {
        value = { protocol: SERVICE_PROTOCOL, web: { state: 'stopped', ready: false, observedAt: new Date().toISOString() }, logs: [] }
      } else throw error
    }
    process.stdout.write(JSON.stringify({ ok: true, value }) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: redact(error.message), code: error.code }) + '\n')
    process.exitCode = 1
  }
}
