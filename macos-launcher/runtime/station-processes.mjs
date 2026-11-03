import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const exec = promisify(execFile)
async function processes() {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,ppid=,uid=,lstart=,command='])
  return new Map(stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line)
    return match ? [[Number(match[1]), { pid: Number(match[1]), parent: Number(match[2]), uid: Number(match[3]), start: match[4].replace(/\s+/g, ' '), command: match[5] }]] : []
  }))
}
const same = (a, b) => a && b && a.uid === process.getuid() && a.uid === b.uid && a.start === b.start && a.command === b.command

export async function stationManager(directory, marker, dataRoot) {
  const path = join(directory, 'manager.json')
  let info
  try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.mode & 0o077) throw new Error('后台管理记录不安全，未终止进程。')
  const record = JSON.parse(await readFile(path, 'utf8'))
  const current = (await processes()).get(record.pid)
  if (!current) return null
  const scope = `${marker} ${dataRoot}`
  if (current.pid <= 1 || current.pid === process.pid || current.uid !== process.getuid()
    || !(current.command.endsWith(scope) || current.command.includes(scope + ' '))) throw new Error('后台进程身份不匹配，未终止进程。')
  return current
}

export async function stationDescendants(managers) {
  const table = await processes(), found = new Map()
  let parents = managers.filter(Boolean).map(row => row.pid)
  while (parents.length) {
    const children = [...table.values()].filter(row => parents.includes(row.parent) && row.uid === process.getuid() && !found.has(row.pid) && row.pid !== process.pid)
    for (const row of children) found.set(row.pid, row)
    parents = children.map(row => row.pid)
  }
  return [...found.values()].reverse()
}

/** Check PID identity again after shutdown; never kill by executable name. */
export async function stopStationProcesses(records, { force = false } = {}) {
  const table = await processes()
  for (const row of records) if (same(row, table.get(row.pid))) {
    try { process.kill(row.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  let remaining = []
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await processes()
    remaining = records.filter(row => same(row, current.get(row.pid)))
    if (!remaining.length) return
    await delay(100)
  }
  if (force) {
    const current = await processes()
    for (const row of remaining) if (same(row, current.get(row.pid))) {
      try { process.kill(row.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    await delay(100)
    const after = await processes()
    remaining = remaining.filter(row => same(row, after.get(row.pid)))
  }
  if (remaining.length) throw new Error(`仍有受管进程未退出（PID：${remaining.map(row => row.pid).join("、")}）。Station 已保留，请重试退出。`)
}
