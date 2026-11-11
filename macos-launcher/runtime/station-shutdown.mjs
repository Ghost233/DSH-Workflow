import { createInterface } from 'node:readline'
import { serviceRequest, serviceSocket, serviceDirectory, redact } from './service-control.mjs'
import { webSocket, webDirectory } from './web-control.mjs'
import { stationManager, stationDescendants, stopStationProcesses } from './station-processes.mjs'

const missing = async run => {
  try { return await run() } catch (error) { if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) return null; throw error }
}

/** All confirmation happens before service shutdown; controller disposal alone does not own this operation. */
export async function shutdownStation({ dataRoot, confirm, progress = () => {} }) {
  const dailySocket = serviceSocket(dataRoot), managers = []
  let stop, primary
  const decide = async (daily, extra = []) => confirm({ needsConfirmation: daily?.needsConfirmation === true || daily?.unknown === true || daily?.changed === true || (daily?.work?.length ?? 0) > 0 || extra.length > 0,
    work: [...(daily?.work ?? []).map(row => row.label || row.id), ...extra], message: daily?.message })
  try {
    progress('正在检查 DSH 的未完成工作…')
    const daily = await missing(() => serviceRequest(dailySocket, { type: 'inspect-stop', action: 'stop' }))
    stop = daily?.stop
    const dailyManager = await stationManager(serviceDirectory(dataRoot), 'service-manager.mjs', dataRoot)
    if (dailyManager && !daily) throw new Error('日常 DSH 管理连接不可用，无法安全退出，请稍后重试。')
    if (dailyManager) managers.push(dailyManager)
    const web = await stationManager(webDirectory(dataRoot), 'global-supervisor.mjs', dataRoot)
    if (web) managers.push(web)
    if (!await decide(stop)) return false
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
