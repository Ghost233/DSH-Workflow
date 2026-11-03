import { createHash } from 'node:crypto'
import { lstat, realpath, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { privateDirectory } from './service-control.mjs'

/** Keep the official CLI's Unix socket below macOS's path limit without moving credentials. */
export async function feishuRuntimeDirectory(configDir) {
  const target = await realpath(configDir)
  if (!(await lstat(target)).isDirectory()) throw new Error('飞书配置目录无效。')
  const hash = createHash('sha256').update(target).digest('hex').slice(0, 16)
  const parent = `/private/tmp/dsh-lark-${process.getuid()}-${hash}`
  await privateDirectory(parent)
  const path = join(parent, 'config')
  try { await symlink(target, path) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const info = await lstat(path)
  if (!info.isSymbolicLink() || info.uid !== process.getuid() || await realpath(path) !== target) {
    throw new Error('飞书运行目录入口不安全，已保留原文件。')
  }
  return path
}
