import { execFile } from 'node:child_process'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { privateDirectory } from './service-control.mjs'

const exec = promisify(execFile)
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`

export function dedicatedPrepare(repo, branch) {
  return ['set -eu', `repo=${quote(repo)}`, `base=${quote(`refs/heads/${branch}`)}`,
    'ref="refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"', 'git check-ref-format "$ref"',
    'git -C "$repo" fetch --no-tags --no-write-fetch-head origin "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-$base}:$ref"',
    'git -C "$repo" worktree add -b "agent/$DSH_SUPERAGENT_NAME" -- "$DSH_SUPERAGENT_DIR" "$ref"'].join('\n')
}

/** Clone only into the empty Station-owned checkout; keep personal repositories out of this path. */
export async function initializeDedicatedRepository({ project, github, run = exec }) {
  const repo = resolve(project.localProjectDir), tasks = resolve(project.executionRoot), parent = dirname(repo)
  if (basename(repo) !== 'repo' || basename(tasks) !== 'tasks' || dirname(tasks) !== parent) throw new Error('Superagent 专用目录布局无效。')
  for (const path of [parent, repo, tasks]) await privateDirectory(path, { create: false })
  const marker = JSON.parse(await readFile(join(parent, 'station-workspace.json'), 'utf8'))
  if (marker.repository !== project.repository) throw new Error('Superagent 专用仓库记录不匹配。')
  const ready = join(parent, 'repository-ready')
  try {
    const info = await lstat(ready)
    if (!info.isFile() || info.isSymbolicLink() || await readFile(ready, 'utf8') !== project.repository) throw new Error('Superagent 仓库准备记录无效。')
    return
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if ((await readdir(repo)).length) throw new Error('专用仓库目录已有未完成的数据，请检查后重试；文件已保留。')
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  try {
    await run('git', ['-c', 'init.templateDir=', '-c', 'credential.helper=', '-c',
      `credential.https://github.com.helper=!${quote(github)} auth git-credential`, 'clone', '--quiet', '--',
      `https://github.com/${project.repository}.git`, repo], { env, timeout: 600_000, maxBuffer: 1024 * 1024 })
    if (project.authorName && project.authorEmail) {
      await run('git', ['-C', repo, 'config', '--local', 'user.name', project.authorName], { env })
      await run('git', ['-C', repo, 'config', '--local', 'user.email', project.authorEmail], { env })
    }
    await writeFile(ready, project.repository, { flag: 'wx', mode: 0o600 })
  } catch { throw new Error('无法准备 Superagent 专用仓库，请检查 GitHub 权限、网络和磁盘空间；已有文件保留。') }
}
