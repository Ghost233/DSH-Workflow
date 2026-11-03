import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const fields = ['repository', 'githubLogin', 'ghConfigDir', 'ghExecutable', 'feishuConfigDir', 'larkExecutable',
  'localProjectDir', 'executionRoot', 'prepare', 'authorName', 'authorEmail', 'feishuChatId']
const file = directory => join(directory, 'station-binding.json')
const fingerprint = (project, accounts) => createHash('sha256').update(JSON.stringify([
  ...fields.map(key => project[key] ?? ''), accounts.github, accounts.feishu ?? '', accounts.feishuAppId ?? '', accounts.prepare ?? '',
  ...(project.feishuProfile ? [project.feishuProfile] : []),
  ...(project.deploymentMode ? [project.deploymentMode] : []),
])).digest('hex')

/** Do not resume historical tickets under a different repository, identity, or execution directory. */
export async function checkSuperagentBinding({ directory, project, accounts, hasTickets }) {
  let previous
  try {
    const info = await lstat(file(directory))
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('项目绑定记录权限不安全。')
    previous = JSON.parse(await readFile(file(directory), 'utf8'))
    if (!/^[a-f0-9]{64}$/.test(previous.fingerprint)) throw new Error('项目绑定记录无效。')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const next = fingerprint(project, accounts)
  // Only the wrapper's config-directory spelling changed; every binding and identity still participates.
  const matchesPreviousWrapper = typeof accounts.previousFeishu === 'string'
    && previous?.fingerprint === fingerprint(project, { ...accounts, feishu: accounts.previousFeishu })
  if (hasTickets && previous?.fingerprint !== next && !matchesPreviousWrapper) {
    throw new Error('此 Superagent 已有任务历史，不能更换仓库、账号、机器人或执行目录；请恢复原设置或新建项目。原有任务和文件均已保留。')
  }
  return next
}

/** Persist the binding before the upstream executor is resumed. */
export async function saveSuperagentBinding(directory, fingerprint) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('项目绑定记录无效。')
  const temporary = join(directory, `station-binding.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify({ fingerprint }) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, file(directory))
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
