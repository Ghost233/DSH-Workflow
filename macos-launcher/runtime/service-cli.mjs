import { spawn } from 'node:child_process'
import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { SERVICE_MANAGER_GENERATION, serviceRequest, serviceSocket, serviceDirectory, privateDirectory, redact } from './service-control.mjs'

async function ensureServiceManager({ dataRoot, resources, home, requestType }) {
  const socket = serviceSocket(dataRoot)
  const usable = status => {
    if (['start-service', 'update-plugins'].includes(requestType) && status.managerGeneration !== SERVICE_MANAGER_GENERATION) {
      throw new Error('检测到旧版后台管理器，已保留现有服务与任务。请先保存工作，从菜单栏选择“退出 Station 并停止全部服务”，再重新打开 Station。')
    }
    return { socket }
  }
  try {
    return usable(await serviceRequest(socket, { type: 'status' }))
  }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
  if (process.env.DSH_STATION_OWNS_MANAGERS !== '1') {
    await privateDirectory(serviceDirectory(dataRoot))
    const log = await open(join(serviceDirectory(dataRoot), 'manager.log'), 'a', 0o600)
    try {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./service-manager.mjs', import.meta.url)), dataRoot, resources, home], {
        stdio: ['ignore', log.fd, log.fd], cwd: resources,
      })
      await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject) })
      child.unref()
    } finally { await log.close() }
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    try { return usable(await serviceRequest(socket, { type: 'status' })) }
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
    if (['connect-desktop', 'desktop-session', 'desktop-drag'].includes(request.type)) {
      throw new Error('此请求仅供 Station 随包桌面客户端使用。')
    }
    if (['start-service', 'restart-service'].includes(request.type)) request.permissionMode = process.env.DSH_PERMISSION_MODE || 'workspace-write'
    if (request.type === 'connect-web') {
      request.runtimeVersion = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8')).version
    }
    const manager = ['start-service', 'authorize-notifications', 'update-plugins'].includes(request.type)
      ? await ensureServiceManager({ dataRoot, resources, home, requestType: request.type })
      : { socket: serviceSocket(dataRoot) }
    if (['inspect-stop', 'stop-service', 'restart-service'].includes(request.type)) {
      const status = await serviceRequest(manager.socket, { type: 'status' })
      if (status.managerGeneration !== SERVICE_MANAGER_GENERATION) {
        throw new Error('检测到旧版后台管理器。请从菜单栏退出 Station，再重新打开。')
      }
    }
    let value
    const timeout = request.type === 'update-plugins' ? 0 : request.type === 'restart-service' ? 55_000 : undefined
    try { value = await serviceRequest(manager.socket, request, timeout) }
    catch (error) {
      if (['status', 'logs'].includes(request.type) && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
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
