import { execFile } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const contains = (parent, child) => {
  const path = relative(parent, child)
  return path === '' || path !== '..' && !path.startsWith('../') && !isAbsolute(path)
}

/** Resolve the selected repository and shared Git metadata without modifying either. */
export async function protectedProjectPaths(localProjectDir, executionRoot) {
  if (!isAbsolute(localProjectDir) || !isAbsolute(executionRoot)) throw new Error('请先选择本地项目和独立执行目录。')
  const project = await realpath(localProjectDir), work = await realpath(executionRoot)
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  env.GIT_OPTIONAL_LOCKS = '0'
  let output
  try {
    output = (await run('git', ['-C', project, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { env, maxBuffer: 1024 * 1024 })).stdout.trim().split('\n')
  } catch { throw new Error('所选本地项目不是可读取的 Git 仓库。') }
  if (output.length !== 3 || output.some(path => !isAbsolute(path))) throw new Error('无法确定本地项目的 Git 目录。')
  const paths = [...new Set(await Promise.all(output.map(path => realpath(resolve(path)))))]
  if (paths.some(path => contains(path, work) || contains(work, path))) throw new Error('执行目录不能与本地项目或其 Git 目录重叠。')
  return paths.filter(path => !paths.some(other => other !== path && contains(other, path)))
}

/** Deny writes to the existing project even when an executor uses an absolute path. */
export async function feishuEventPaths(configDir, appId) {
  if (!configDir || !appId) return undefined
  if (!isAbsolute(configDir) || !/^cli_[A-Za-z0-9]+$/.test(appId)) throw new Error('飞书事件目录无效。')
  const events = resolve(await realpath(configDir), 'events'), bot = resolve(events, appId)
  for (const path of [events, bot]) {
    try { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('飞书事件目录不安全。') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { events, bot }
}

export function superagentSandboxArguments(paths, writableRoots, { credential, onlyExecutable, feishuEvents } = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.some(path => !isAbsolute(path) || path.includes('\0'))) throw new Error('缺少受保护的项目目录。')
  if (!Array.isArray(writableRoots) || !writableRoots.length || writableRoots.some(path => !isAbsolute(path) || path.includes('\0'))) throw new Error('缺少 Superagent 可写目录。')
  if (writableRoots.some(root => paths.some(path => contains(path, root)))) throw new Error('Superagent 可写目录不能位于受保护项目中。')
  const allowed = writableRoots.map(path => `(subpath ${JSON.stringify(path)})`)
  if (feishuEvents) {
    const { events, bot } = feishuEvents
    if (!isAbsolute(events) || !isAbsolute(bot) || !contains(events, bot) || bot === events
      || paths.some(path => contains(path, events) || contains(path, bot))) throw new Error('飞书事件目录不能位于受保护项目中。')
    allowed.push(`(literal ${JSON.stringify(events)})`, `(subpath ${JSON.stringify(bot)})`)
  }
  if (credential !== undefined) {
    if (!isAbsolute(credential) || credential.includes('\0') || /[\\[\]\\^$*+?(){}|]/.test(credential)
      || paths.some(path => contains(path, credential))) throw new Error('共享凭据路径不能安全加入 Superagent 沙箱。')
    const pattern = '^' + credential.replaceAll('.', '[.]') + '[.]' + '[0-9a-f]'.repeat(12) + '[.]tmp$'
    allowed.push(`(literal ${JSON.stringify(credential)})`, `(literal ${JSON.stringify(credential + '.lock')})`, `(regex #${JSON.stringify(pattern)})`)
  }
  const rules = paths.map(path => `(deny file-write* (subpath ${JSON.stringify(path)}))`)
  if (onlyExecutable !== undefined) {
    if (!isAbsolute(onlyExecutable) || onlyExecutable.includes('\0')) throw new Error('启动检查程序路径无效。')
    rules.push('(deny process-exec)', `(allow process-exec (literal ${JSON.stringify(onlyExecutable)}))`)
  }
  return ['-p', ['(version 1)', '(allow default)', '(deny file-write*)', '(allow file-write* (literal "/dev/null"))',
    `(allow file-write* ${allowed.join(' ')})`, ...rules].join(' ')]
}
