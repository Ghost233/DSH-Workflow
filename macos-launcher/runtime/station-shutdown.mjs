import { createInterface } from 'node:readline'
import { serviceRequest, serviceSocket, serviceDirectory, redact } from './service-control.mjs'
import { webSocket, webDirectory } from './web-control.mjs'
import { superagentSocket, superagentDirectory } from './superagent-service.mjs'
import { listSuperagentProjects } from './superagent-projects.mjs'
import { stationManager, stationDescendants, stopStationProcesses } from './station-processes.mjs'

const missing = async run => {
  try { return await run() } catch (error) { if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) return null; throw error }
}

/** All confirmation happens before service shutdown; controller disposal alone does not own this operation. */
export async function shutdownStation({ dataRoot, confirm, progress = () => {} }) {
  const dailySocket = serviceSocket(dataRoot), managers = [], agents = []
  let stop, primary
  const decide = async (daily, extra = []) => confirm({ needsConfirmation: daily?.needsConfirmation === true || daily?.unknown === true || daily?.changed === true || (daily?.work?.length ?? 0) > 0 || extra.length > 0,
    work: [...(daily?.work ?? []).map(row => row.label || row.id), ...extra], message: daily?.message })
  try {
    progress('正在检查 DSH 与 Superagent 的未完成工作…')
    const daily = await missing(() => serviceRequest(dailySocket, { type: 'inspect-stop', action: 'stop' }))
    stop = daily?.stop
    const dailyManager = await stationManager(serviceDirectory(dataRoot), 'service-manager.mjs', dataRoot)
    if (dailyManager && !daily) throw new Error('日常 DSH 管理连接不可用，无法安全退出，请稍后重试。')
    if (dailyManager) managers.push(dailyManager)
    const projects = await listSuperagentProjects(dataRoot)
    if (!projects.some(row => row.id === 'legacy')) projects.push({ id: 'legacy', name: '原有 Superagent' })
    const warnings = []
    for (const project of projects) {
      const socket = superagentSocket(dataRoot, project.id)
      const status = await missing(() => serviceRequest(socket, { type: 'status' }, 10000))
      const manager = await stationManager(superagentDirectory(dataRoot, project.id), 'superagent-service.mjs manager', dataRoot)
      if (manager && !status) throw new Error(`${project.name} 管理连接不可用，无法安全退出。`)
      if (!status) continue
      if (manager) managers.push(manager)
      if (status.service?.state === 'stopped') continue
      agents.push({ project, socket })
      try {
        const opened = await serviceRequest(socket, { type: 'open' }, 10000)
        const response = await fetch(new URL('/orchestrator/api/tickets?state=open&limit=1', opened.url), {
          headers: { 'x-orchestrator-request': '1' }, signal: AbortSignal.timeout(5000) })
        const page = await response.json()
        if (!response.ok || !Number.isSafeInteger(page.total)) throw new Error('unknown tickets')
        if (page.total) warnings.push(`${project.name}：${page.total} 个未完工单`)
      } catch { warnings.push(`${project.name}：任务状态无法确认`) }
    }
    const web = await stationManager(webDirectory(dataRoot), 'global-supervisor.mjs', dataRoot)
    if (web) managers.push(web)
    if (!await decide(stop, warnings)) return false
    const descendants = new Map((await stationDescendants(managers)).map(row => [row.pid, row]))
    if (stop && !stop.stopped) {
      progress('正在停止日常 DSH 服务…')
      for (;;) {
        const value = await serviceRequest(dailySocket, { type: 'stop-service', operationId: stop.operationId, confirmed: true }, 45000)
        stop = value.stop
        if (!stop || stop.stopped) break
        if (!await decide(stop)) return false
      }
    }
    for (const { project, socket } of agents) {
      progress(`正在停止 Superagent：${project.name}…`)
      for (const row of await stationDescendants(managers)) descendants.set(row.pid, row)
      const value = await serviceRequest(socket, { type: 'stop' }, 310000)
      if (value.service?.state !== 'stopped') throw new Error(`${project.name} 尚未停止。`)
    }
    progress('正在关闭 Web 访问…')
    await missing(() => serviceRequest(webSocket(dataRoot), { type: 'recycle-web' }, 45000))
    progress('正在回收后台管理器、MCP 和辅助进程…')
    for (const row of await stationDescendants(managers)) descendants.set(row.pid, row)
    await stopStationProcesses(managers)
    await stopStationProcesses([...descendants.values()], { force: true })
    return true
  } catch (error) { primary = error; throw error } finally {
    try { if (stop?.operationId) await missing(() => serviceRequest(dailySocket, { type: 'cancel-stop', operationId: stop.operationId }, 5000)) }
    catch (cleanup) { if (primary) console.error(`退出检查清理失败：${redact(cleanup.message)}`); else throw cleanup }
  }
}

if (import.meta.main) {
  const reader = createInterface({ input: process.stdin }), input = reader[Symbol.asyncIterator]()
  const send = value => process.stdout.write(JSON.stringify(value) + '\n')
  try {
    const stopped = await shutdownStation({ dataRoot: process.argv[2], progress: message => send({ type: 'progress', message }),
      confirm: async value => { send({ type: 'inspection', value }); const line = await input.next(); return !line.done && JSON.parse(line.value).confirmed === true } })
    send({ type: 'result', stopped })
  } catch (error) { send({ type: 'error', message: redact(error.message) }); process.exitCode = 1 }
  finally { reader.close(); process.stdin.destroy() }
}
