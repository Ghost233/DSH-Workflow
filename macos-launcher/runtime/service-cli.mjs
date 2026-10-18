import { spawn } from 'node:child_process'
import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { serviceRequest, serviceSocket, serviceDirectory, privateDirectory, redact } from './service-control.mjs'

async function ensureServiceManager({ dataRoot, resources, home }) {
  const socket = serviceSocket(dataRoot)
  try { await serviceRequest(socket, { type: 'status' }); return socket }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await privateDirectory(serviceDirectory(dataRoot))
  const log = await open(join(serviceDirectory(dataRoot), 'manager.log'), 'a', 0o600)
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./service-manager.mjs', import.meta.url)), dataRoot, resources, home], {
      detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env, cwd: resources,
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
  throw new Error('DSH 服务管理进程未就绪，请检查 manager.log')
}

if (import.meta.main) {
  try {
    const [dataRoot, resources, home] = process.argv.slice(2)
    if (!dataRoot || !resources || !home) throw new Error('Missing service paths')
    let body = ''
    for await (const chunk of process.stdin) { body += chunk; if (body.length > 16 * 1024) throw new Error('Control request too large') }
    const request = JSON.parse(body)
    if (request.type === 'connect-desktop') throw new Error('桌面专用连接仅供本机 Electron 主进程使用。')
    if (['start-service', 'restart-service'].includes(request.type)) request.permissionMode = process.env.DSH_PERMISSION_MODE || 'workspace-write'
    if (request.type === 'connect-web') {
      request.runtimeVersion = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8')).version
    }
    const socket = ['start-service', 'authorize-notifications'].includes(request.type)
      ? await ensureServiceManager({ dataRoot, resources, home })
      : serviceSocket(dataRoot)
    let value
    try { value = await serviceRequest(socket, request) }
    catch (error) {
      if (['status', 'logs'].includes(request.type) && error.code === 'ENOENT') {
        value = { service: { state: 'stopped', ready: false, observedAt: new Date().toISOString() }, logs: [] }
      } else if (request.type === 'connect-web' && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
        throw new Error('DSH 服务未启动或暂不可用，请先启动 DSH 服务。')
      } else throw error
    }
    process.stdout.write(JSON.stringify({ ok: true, value }) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: redact(error.message), code: error.code }) + '\n')
    process.exitCode = 1
  }
}
