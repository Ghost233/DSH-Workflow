import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Git 跟踪的项目级 Owner 配置和责任域真源。 */
export const OWNER_CONFIGURATION_DIRECTORY = '.owner-workflow'

/** 每个 Owner 的配置与长期资料都归入这个目录。 */
export const OWNER_COLLECTION_DIRECTORY = 'owners'

/** Owner 文件夹内的正式职责描述。 */
export const OWNER_DESCRIPTOR_FILE = 'owner.md'

/** Owner 文件夹内的长期知识目录。 */
export const OWNER_MEMORY_DIRECTORY = 'memory'

/** 只属于当前机器/进程的工作流运行状态。 */
export const OWNER_RUNTIME_DIRECTORY = '.dsh-workflow'

export const RUNTIME_GITIGNORE_CONTENT = [
  '# 由 DSH Owner Workflow 创建。',
  '# 本目录只保存本机运行状态；配置和长期资料不要放在这里。',
  `# 项目配置：../${OWNER_CONFIGURATION_DIRECTORY}/`,
  `# Owner 配置与长期存储：../${OWNER_CONFIGURATION_DIRECTORY}/${OWNER_COLLECTION_DIRECTORY}/<owner-id>/`,
  '*',
  '!.gitignore',
  '',
].join('\n')

/**
 * 初始化 Runtime 目录自己的 Git 边界。
 *
 * 文件使用 `wx` 创建：并发初始化是幂等的，项目已有的自定义规则不会被覆盖。
 */
export async function ensureRuntimeGitignore(runtimeDirectory) {
  const directory = resolve(runtimeDirectory)
  await mkdir(directory, { recursive: true })
  const path = join(directory, '.gitignore')
  try {
    await writeFile(path, RUNTIME_GITIGNORE_CONTENT, { encoding: 'utf8', flag: 'wx' })
    return { path, created: true }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    return { path, created: false }
  }
}

/** Runtime 自动生成的未跟踪边界文件不应被当成业务工作区改动。 */
export function isGeneratedRuntimeGitignore(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/').replace(/^\.\//u, '')
  return normalized === `${OWNER_RUNTIME_DIRECTORY}/.gitignore`
    || normalized.includes(`/${OWNER_RUNTIME_DIRECTORY}/.gitignore`)
}
