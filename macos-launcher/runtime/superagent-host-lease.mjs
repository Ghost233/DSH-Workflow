import { lstat, readFile, unlink } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const pathOf = directory => join(directory, 'station-host.json')
const identity = pid => {
  const options = { encoding: 'utf8', maxBuffer: 1024 * 1024 }
  const start = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], options).trim()
  const command = execFileSync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], options).trim()
  return { start, command }
}

/** Never consider a project stopped while its last owned Host is still alive. */
export async function requireSuperagentHostStopped(directory) {
  const path = pathOf(directory)
  let info
  try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Superagent 进程记录不安全，已保留。')
  const record = JSON.parse(await readFile(path, 'utf8'))
  if (!Number.isSafeInteger(record.pid) || record.pid < 2 || typeof record.start !== 'string' || typeof record.marker !== 'string') throw new Error('Superagent 进程记录无效，已保留。')
  try { process.kill(record.pid, 0) }
  catch (error) {
    if (error.code !== 'ESRCH') throw error
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    return
  }
  let current
  try { current = identity(record.pid) }
  catch (error) {
    try { process.kill(record.pid, 0) } catch (gone) {
      if (gone.code === 'ESRCH') { await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e }); return }
    }
    throw new Error('无法核验上一次 Superagent 进程，请检查进程记录。', { cause: error })
  }
  if (current.start !== record.start || !current.command.includes(record.marker)) {
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    return
  }
  throw new Error('上一次 Superagent 进程仍在退出，请稍后再试；未更改项目配置。')
}

export function recordSuperagentHost(directory, pid, marker) {
  if (!Number.isSafeInteger(pid) || pid < 2 || typeof marker !== 'string' || !marker) throw new Error('Superagent 进程标识无效。')
  const current = identity(pid)
  if (!current.start || !current.command.includes(marker)) throw new Error('无法核验新 Superagent 进程。')
  writeFileSync(pathOf(directory), JSON.stringify({ pid, start: current.start, marker }) + '\n', { flag: 'wx', mode: 0o600 })
}

export async function releaseSuperagentHost(directory, pid) {
  const path = pathOf(directory)
  try {
    const record = JSON.parse(await readFile(path, 'utf8'))
    if (record.pid === pid) await unlink(path)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
