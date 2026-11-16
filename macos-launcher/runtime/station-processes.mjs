import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'

const exec = promisify(execFile)
export async function stationProcessTable() {
  const scan = exec('/bin/ps', ['-axww', '-o', 'pid=,ppid=,pgid=,uid=,stat=,lstart=,command='], { maxBuffer: 4 * 1024 * 1024 })
  const { stdout } = await scan
  return new Map(stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line)
    if (!match || match[5].includes('Z')) return []
    const [, pid, parent, group, uid, , start, command] = match
    if (Number(pid) === scan.child.pid) return []
    return [[Number(pid), { pid: Number(pid), parent: Number(parent), group: Number(group), uid: Number(uid), start: start.replace(/\s+/g, ' '), command }]]
  }))
}
export const sameStationProcess = (a, b) => a && b && a.uid === process.getuid() && a.uid === b.uid && a.start === b.start && a.command === b.command

export async function stationManager(directory, marker, dataRoot, table) {
  const path = join(directory, 'manager.json')
  let info
  try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.mode & 0o077) throw new Error('后台管理记录不安全，未终止进程。')
  const record = JSON.parse(await readFile(path, 'utf8'))
  const current = (table ?? await stationProcessTable()).get(record.pid)
  if (!current) return null
  const scope = `${marker} ${dataRoot}`
  if (current.pid <= 1 || current.pid === process.pid || current.uid !== process.getuid()
    || !(current.command.endsWith(scope) || current.command.includes(scope + ' '))) throw new Error('后台进程身份不匹配，未终止进程。')
  return current
}

export function stationDescendants(roots, table) {
  const found = new Map()
  let parents = new Set(roots)
  while (parents.size) {
    const children = [...table.values()].filter(row => parents.has(row.parent) && row.uid === process.getuid() && !found.has(row.pid) && row.pid !== process.pid)
    for (const row of children) found.set(row.pid, row)
    parents = new Set(children.map(row => row.pid))
  }
  return [...found.values()].reverse()
}
