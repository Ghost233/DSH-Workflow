import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { access, lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { delimiter, isAbsolute, join } from 'node:path'
import { privateDirectory } from './service-control.mjs'
import { promisify } from 'node:util'
import { feishuRuntimeDirectory } from './feishu-runtime-directory.mjs'
import { initializeDedicatedRepository } from './superagent-dedicated-repository.mjs'

const run = promisify(execFile)

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`

export async function superagentExecutable(value, fallback) {
  const name = value || fallback
  if (!isAbsolute(name) && (name.includes('/') || !/^[A-Za-z0-9._-]+$/.test(name))) throw new Error(`无效的命令路径：${name}`)
  const candidates = isAbsolute(name) ? [name] : [...new Set([...(process.env.PATH ?? '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])]
    .filter(isAbsolute).map(path => join(path, name))
  for (const path of candidates) {
    try { if ((await lstat(await realpath(path))).isFile()) { await access(path, constants.X_OK); return path } } catch { /* Try the next location. */ }
  }
  throw new Error(`找不到可执行命令：${name}`)
}

export async function resolveLarkExecutable(resources, value = '') {
  if (value) return superagentExecutable(value, 'lark-cli')
  if (resources) {
    const bundled = join(resources, 'bin/lark-cli')
    try { return await superagentExecutable(bundled, 'lark-cli') } catch { /* Older installations may use the user's CLI. */ }
  }
  return superagentExecutable('', 'lark-cli')
}

async function ownedScript(directory, label, body) {
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 20)
  const path = join(directory, `${label}-${digest}.sh`)
  try { await writeFile(path, body, { flag: 'wx', mode: 0o700 }) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)
      || !(info.mode & 0o100) || await readFile(path, 'utf8') !== body) throw new Error('账号入口已被修改，已保留原文件。')
  }
  return path
}

/** Bind CLI calls to selected profiles without changing any existing gh or Feishu configuration. */
export async function prepareSuperagentAccounts({ directory, project, resources }) {
  if (!project.githubLogin || !project.ghConfigDir) throw new Error('请先选择 GitHub 账号和其 gh 配置目录。')
  const gh = await superagentExecutable(project.ghExecutable, 'gh')
  const env = { ...process.env, GH_CONFIG_DIR: project.ghConfigDir, GH_HOST: 'github.com' }
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) delete env[name]
  try {
    const token = (await run(gh, ['auth', 'token', '--hostname', 'github.com', '--user', project.githubLogin],
      { env, timeout: 60_000, maxBuffer: 1024 * 1024 })).stdout.trim()
    if (!token || /[\r\n\0]/.test(token)) throw new Error('missing token')
    const { stdout } = await run(gh, ['api', 'user', '--jq', '.login'], { env: { ...env, GH_TOKEN: token }, timeout: 60_000, maxBuffer: 1024 * 1024 })
    let login = stdout.trim()
    try { login = JSON.parse(login).login ?? login } catch { /* gh --jq emits the login as plain text. */ }
    if (String(login).toLowerCase() !== project.githubLogin.toLowerCase()) throw new Error('wrong account')
  } catch { throw new Error('无法验证项目选中的 gh 账号，请检查对应账号的独立配置目录。') }
  const scripts = join(directory, 'station-accounts')
  await privateDirectory(scripts)
  const github = await ownedScript(scripts, 'github', [
    '#!/bin/sh', 'set -eu', 'unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN',
    `export GH_CONFIG_DIR=${quote(project.ghConfigDir)}`, 'export GH_HOST=github.com',
    `token=$(${quote(gh)} auth token --hostname github.com --user ${quote(project.githubLogin)})`,
    '[ -n "$token" ] || exit 1', 'export GH_TOKEN="$token"', `exec ${quote(gh)} "$@"`, '',
  ].join('\n'))
  let feishu, feishuAppId, previousFeishu
  if (project.feishuConfigDir) {
    const bundled = project.larkExecutable === '@bundled'
    if (bundled && !resources) throw new Error('缺少随应用交付的飞书连接组件。')
    let lark
    if (bundled) { await superagentExecutable(join(resources, 'bin/lark-cli'), 'lark-cli'); lark = 'lark-cli' }
    else lark = await superagentExecutable(project.larkExecutable, 'lark-cli')
    const runtimeConfig = await feishuRuntimeDirectory(project.feishuConfigDir)
    const body = configDir => [
      '#!/bin/sh', 'set -eu', `export LARKSUITE_CLI_CONFIG_DIR=${quote(configDir)}`,
      ...(project.feishuProfile ? ['unset LARK_APP_ID LARK_APP_SECRET LARKSUITE_CLI_APP_ID LARKSUITE_CLI_APP_SECRET LARKSUITE_CLI_BRAND',
        `export LARKSUITE_CLI_PROFILE=${quote(project.feishuProfile)}`] : []),
      `exec ${quote(lark)} "$@"`, '',
    ].join('\n')
    feishu = await ownedScript(scripts, 'feishu', body(runtimeConfig))
    const previousDigest = createHash('sha256').update(body(project.feishuConfigDir)).digest('hex').slice(0, 20)
    previousFeishu = join(scripts, `feishu-${previousDigest}.sh`)
    try {
      const { stdout } = await run(feishu, ['auth', 'status'], { timeout: 60_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, ...(bundled ? { PATH: `${join(resources, 'bin')}${delimiter}${process.env.PATH ?? ''}` } : {}),
          LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } })
      const status = JSON.parse(stdout.slice(stdout.indexOf('{')))
      if (!/^cli_[A-Za-z0-9]+$/.test(status.appId) || status.identities?.bot?.status !== 'ready') throw new Error('invalid bot')
      feishuAppId = status.appId
    } catch { throw new Error('无法读取所选飞书机器人的登录状态，请检查 lark-cli 配置。') }
  }
  let prepare = project.prepare ?? ''
  if (project.deploymentMode === 'dedicated') await initializeDedicatedRepository({ project, github })
  if (project.deploymentMode !== 'dedicated' && project.authorName && project.authorEmail && prepare.trim()) {
    const script = await ownedScript(scripts, 'prepare', [
      '#!/bin/sh', 'set -eu', `/bin/sh -c ${quote(prepare)}`,
      'task=$(cd "$DSH_SUPERAGENT_DIR" && pwd -P)',
      'top=$(git -C "$task" rev-parse --path-format=absolute --show-toplevel)',
      '[ "$(cd "$top" && pwd -P)" = "$task" ] || { echo "任务目录不是独立仓库根目录" >&2; exit 1; }',
      'common=$(git -C "$task" rev-parse --path-format=absolute --git-common-dir)',
      'common=$(cd "$common" && pwd -P)',
      'case "$common/" in "$task/"*) ;; *) echo "任务仓库共享了外部 Git 目录" >&2; exit 1 ;; esac',
      `git -C "$task" config --local user.name ${quote(project.authorName)}`,
      `git -C "$task" config --local user.email ${quote(project.authorEmail)}`, '',
    ].join('\n'))
    prepare = quote(script)
  }
  return { github, feishu, feishuAppId, prepare, previousFeishu }
}
