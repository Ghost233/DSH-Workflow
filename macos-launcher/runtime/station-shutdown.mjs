import { setTimeout as delay } from 'node:timers/promises'
import { serviceDirectory, redact } from './service-control.mjs'
import { webDirectory } from './web-control.mjs'
import { sameStationProcess, stationManager, stationDescendants, stationProcessTable } from './station-processes.mjs'

export const STATION_SHUTDOWN_MS = 10_000

/** Graceful shutdown of all owners starts together; every survivor shares one deadline. */
export async function shutdownStation({ dataRoot, deadline = Date.now() + STATION_SHUTDOWN_MS,
  stationPid, progress = () => {}, report = () => {} }) {
  const timeBudget = Number.isFinite(deadline) ? deadline - Date.now() : STATION_SHUTDOWN_MS
  const end = performance.now() + Math.max(0, Math.min(STATION_SHUTDOWN_MS, timeBudget))
  const tracked = new Map(), managers = new Map(), signalled = new Map()
  const signal = (row, name) => {
    try { process.kill(row.pid, name) }
    catch (error) { if (error.code !== 'ESRCH') report(error) }
  }
  const roles = [[serviceDirectory(dataRoot), 'service-manager.mjs'], [webDirectory(dataRoot), 'global-supervisor.mjs']]
  progress('正在停止 Station 服务…')
  let readManagers = true
  for (;;) {
    const table = await stationProcessTable()
    if (readManagers) {
      readManagers = false
      // Releases before Station owned its managers left independently running processes.
      const records = await Promise.allSettled(roles.map(([directory, marker]) => stationManager(directory, marker, dataRoot, table)))
      for (const record of records) {
        if (record.status === 'rejected') report(record.reason)
        else if (record.value) managers.set(record.value.pid, record.value)
      }
    }
    const roots = [process.pid]
    if (stationPid > 1 && stationPid === process.ppid) roots.push(stationPid)
    const groups = new Set()
    const ownGroup = table.get(process.pid)?.group
    if (ownGroup === process.pid || (stationPid > 1 && ownGroup === stationPid)) groups.add(ownGroup)
    if (roots.includes(stationPid) && table.get(stationPid)?.group === stationPid) groups.add(stationPid)
    for (const row of managers.values()) {
      if (sameStationProcess(row, table.get(row.pid))) {
        roots.push(row.pid)
        tracked.set(row.pid, row)
        if (row.group === row.pid) groups.add(row.group)
      }
    }
    for (const row of stationDescendants(roots, table)) tracked.set(row.pid, row)
    // Group membership also finds helpers already reparented before the first snapshot.
    for (const row of table.values()) {
      if (groups.has(row.group) && row.uid === process.getuid() && row.pid !== stationPid && row.pid !== process.pid) {
        tracked.set(row.pid, row)
      }
    }
    // Retain identities of reparented children and explicitly revisit their subtrees.
    const remaining = [...tracked.values()].filter(row => sameStationProcess(row, table.get(row.pid)))
    for (const row of stationDescendants(remaining.map(row => row.pid), table)) tracked.set(row.pid, row)
    const live = [...tracked.values()].filter(row => sameStationProcess(row, table.get(row.pid)))
    if (!live.length) return true
    const timeLeft = end - performance.now()
    if (timeLeft <= 0) {
      progress('已到退出期限，正在强制结束剩余进程…')
      for (const row of live) signal(row, 'SIGKILL')
      return true
    }
    for (const row of live) {
      if (managers.has(row.pid) || roots.includes(row.parent) || !sameStationProcess(tracked.get(row.parent), table.get(row.parent))) {
        if (!sameStationProcess(signalled.get(row.pid), row)) {
          signalled.set(row.pid, row)
          signal(row, 'SIGTERM')
        }
      }
    }
    await delay(Math.min(100, timeLeft))
  }
}

if (import.meta.main) {
  const [dataRoot, deadline, ownParent] = process.argv.slice(2)
  try {
    await shutdownStation({ dataRoot, deadline: deadline ? Number(deadline) : undefined,
      stationPid: ownParent === 'station-parent' ? process.ppid : undefined,
      progress: message => console.log(JSON.stringify({ type: 'progress', message })),
      report: error => console.error(redact(error.message)) })
    console.log(JSON.stringify({ type: 'result', stopped: true }))
  } catch (error) {
    console.error(redact(error.message))
    process.exitCode = 1
  }
}
