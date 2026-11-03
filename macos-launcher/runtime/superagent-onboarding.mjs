import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { listSuperagentGithubAccounts, listSuperagentProjects } from './superagent-projects.mjs'
import { resolveLarkExecutable, superagentExecutable } from './superagent-accounts.mjs'
import { listFeishuBots, registerFeishuBot } from './superagent-feishu-setup.mjs'

const exec = promisify(execFile)
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_REPO', 'GH_DEBUG'].includes(key)))

/** Use the selected gh account for read-only discovery without switching a global account. */
export async function githubDiscovery({ account, repository, action, accounts, dataRoot, projectId, run = exec }) {
  const known = accounts ?? await listSuperagentGithubAccounts()
  let existing
  if (!accounts && dataRoot && projectId) {
    existing = (await listSuperagentProjects(dataRoot)).find(row => row.id === projectId)
    if (existing?.githubLogin && existing.ghConfigDir) known.push({ login: existing.githubLogin, directory: existing.ghConfigDir })
  }
  if (!account || !loginPattern.test(account.login ?? '') || !isAbsolute(account.directory ?? '')
    || !known.some(row => row.login === account.login && row.directory === account.directory)) throw new Error('请选择已登录的 GitHub 账号。')
  const gh = await superagentExecutable(existing?.githubLogin === account.login && existing?.ghConfigDir === account.directory
    ? existing.ghExecutable : '', 'gh')
  const env = { ...cleanEnv(), GH_CONFIG_DIR: account.directory, GH_HOST: 'github.com' }
  try {
    const token = (await run(gh, ['auth', 'token', '--hostname', 'github.com', '--user', account.login], { env, timeout: 30_000 })).stdout.trim()
    if (!token || /[\r\n\0]/.test(token)) throw new Error('missing token')
    const authenticated = { ...env, GH_TOKEN: token }
    const call = async args => JSON.parse((await run(gh, ['api', ...args], { env: authenticated, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })).stdout)
    const user = await call(['user'])
    if (String(user.login).toLowerCase() !== account.login.toLowerCase() || !Number.isSafeInteger(user.id)) throw new Error('account mismatch')
    if (action === 'repositories') {
      const pages = await call(['--paginate', '--slurp', 'user/repos?per_page=100&visibility=all&affiliation=owner,collaborator,organization_member&sort=updated'])
      if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw new Error('invalid repository list')
      return { user: { login: user.login, id: user.id }, repositories: pages.flat().filter(row => repoPattern.test(row.full_name ?? '')
        && row.archived !== true && row.permissions?.push === true && typeof row.default_branch === 'string')
        .map(row => ({ name: row.full_name, private: row.private === true, defaultBranch: row.default_branch })) }
    }
    if (action === 'branches') {
      if (!repoPattern.test(repository ?? '')) throw new Error('invalid repository')
      const pages = await call(['--paginate', '--slurp', `repos/${repository}/branches?per_page=100`])
      if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw new Error('invalid branch list')
      return { branches: pages.flat().map(row => row.name).filter(name => typeof name === 'string' && name.length > 0 && name.length < 256) }
    }
    throw new Error('invalid action')
  } catch { throw new Error('无法读取所选账号的 GitHub 仓库，请检查登录状态和仓库权限。') }
}

function githubRemote(value) {
  const ssh = /^git@github\.com:([^\s/]+\/[^\s/]+?)(?:\.git)?\/?$/i.exec(value)
  if (ssh) return ssh[1].toLowerCase()
  try {
    const url = new URL(value)
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'github.com') return ''
    const path = url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/i, '')
    return repoPattern.test(path) ? path.toLowerCase() : ''
  } catch { return '' }
}

/** Inspect Git metadata only; never change the selected project or expose remote credentials. */
export async function inspectLocalProject({ directory, repository }) {
  if (!isAbsolute(directory ?? '') || !repoPattern.test(repository ?? '')) throw new Error('请选择 GitHub 仓库和本地项目目录。')
  const path = await realpath(directory)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  env.GIT_OPTIONAL_LOCKS = '0'
  try {
    const root = (await exec('git', ['-C', path, 'rev-parse', '--show-toplevel'], { env, timeout: 10_000 })).stdout.trim()
    const remotes = (await exec('git', ['-C', root, 'config', '--local', '--get-regexp', '^remote\\..*\\.url$'],
      { env, timeout: 10_000 })).stdout.trim().split('\n').map(line => line.replace(/^\S+\s+/, ''))
    if (!remotes.some(value => githubRemote(value) === repository.toLowerCase())) throw new Error('wrong repository')
    return { root: await realpath(root), matches: true }
  } catch { throw new Error('所选目录不是该 GitHub 仓库的本地项目，请选择对应的 Git 仓库。') }
}

/** List only chats and members visible to the selected bot. */
export async function feishuChoices({ resources, bot, chatId, action, run = exec }) {
  if (!bot || !isAbsolute(bot.directory ?? '')) throw new Error('请先选择飞书机器人。')
  const lark = await resolveLarkExecutable(resources, bot.executable === '@bundled' ? '' : bot.executable)
  const env = { ...process.env, LARKSUITE_CLI_CONFIG_DIR: bot.directory,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' }
  for (const key of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARKSUITE_CLI_APP_ID', 'LARKSUITE_CLI_APP_SECRET',
    'LARKSUITE_CLI_BRAND', 'GH_TOKEN', 'GITHUB_TOKEN']) delete env[key]
  if (bot.profile) env.LARKSUITE_CLI_PROFILE = bot.profile
  else delete env.LARKSUITE_CLI_PROFILE
  if (action === 'check') {
    if (!/^oc_[A-Za-z0-9]+$/.test(chatId ?? '')) throw new Error('请选择飞书群。')
    const { chats, truncated } = await feishuChoices({ resources, bot, action: 'chats', run })
    const joined = chats.some(chat => chat.id === chatId)
    let historyReadable = false
    if (joined) {
      try {
        const result = JSON.parse((await run(lark, ['im', '+chat-messages-list', '--as', 'bot', '--chat-id', chatId,
          '--page-size', '1', '--format', 'json'], { env, timeout: 30_000, maxBuffer: 1024 * 1024 })).stdout)
        historyReadable = result.ok === true
      } catch { /* Missing permissions are presented as an incomplete check, without exposing group messages. */ }
    }
    return { joined, groupListComplete: !truncated, historyReadable, eventSubscription: 'unverified' }
  }
  const args = action === 'chats' ? ['im', '+chat-list', '--as', 'bot', '--page-all', '--page-size', '100', '--page-limit', '1000', '--format', 'json']
    : ['im', '+chat-members-list', '--as', 'bot', '--chat-id', chatId, '--member-types', 'user', '--page-all', '--page-size', '100', '--page-limit', '1000', '--format', 'json']
  if (action !== 'chats' && (action !== 'members' || !/^oc_[A-Za-z0-9]+$/.test(chatId ?? ''))) throw new Error('请选择飞书群。')
  try {
    const response = JSON.parse((await run(lark, args, { env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })).stdout)
    if (response.ok !== true || !response.data) throw new Error('invalid response')
    if (action === 'chats') return { chats: (response.data.chats ?? []).filter(row => /^oc_[A-Za-z0-9]+$/.test(row.chat_id ?? ''))
      .map(row => ({ id: row.chat_id, name: row.name || '未命名群聊' })), truncated: response.meta?.pagination?.complete === false }
    const members = (response.data.users ?? []).filter(row => /^ou_[A-Za-z0-9]+$/.test(row.member_id ?? ''))
      .map(row => ({ id: row.member_id, name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : row.member_id }))
    const unresolved = members.filter(row => row.name === row.id || /^用户\d{4,}$/.test(row.name))
    const deadline = Date.now() + 8000
    let next = 0
    await Promise.all(Array.from({ length: Math.min(4, unresolved.length) }, async () => {
      for (;;) {
        const member = unresolved[next++]
        const remaining = deadline - Date.now()
        if (!member || remaining <= 0) return
        try {
          const result = JSON.parse((await run(lark, ['contact', '+get-user', '--as', 'bot', '--user-id', member.id, '--format', 'json'],
            { env, timeout: Math.min(4000, remaining), maxBuffer: 1024 * 1024 })).stdout)
          const user = result.data?.user ?? result.data
          if (result.ok === true && typeof user?.name === 'string' && user.name.trim()) member.name = user.name.trim()
        } catch { /* Keep the group-provided name and ID when profile access is unavailable. */ }
      }
    }))
    return { members, namesIncomplete: members.some(row => row.name === row.id || /^用户\d{4,}$/.test(row.name)),
      truncated: Boolean(response.data.truncations?.length) || response.meta?.pagination?.complete === false }
  } catch { throw new Error('无法读取飞书群或成员。请确认机器人已加入群聊，并已获得读取群及成员的权限（群成员需要 im:chat.members:read）；新增权限后按飞书提示审批或发布应用。') }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [action, dataRoot, resources] = process.argv.slice(2)
    if (action === 'feishu-register') {
      process.stdin.resume()
      const bot = await registerFeishuBot({ dataRoot, resources, emit: event => process.stdout.write(JSON.stringify(event) + '\n') })
      process.stdout.write(JSON.stringify({ type: 'ready', bot }) + '\n')
      process.stdin.pause()
    } else {
      let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 64 * 1024) throw new Error('请求过大。') }
      const input = text.trim() ? JSON.parse(text) : {}
      const value = action === 'repositories' || action === 'branches' ? await githubDiscovery({ ...input, action, dataRoot })
        : action === 'inspect-project' ? await inspectLocalProject(input)
          : action === 'feishu-bots' ? await listFeishuBots({ dataRoot, resources })
          : ['feishu-chats', 'feishu-members', 'feishu-check'].includes(action) ? await feishuChoices({ ...input, resources, action: action.slice(7) })
            : (() => { throw new Error('无效的向导请求。') })()
      process.stdout.write(JSON.stringify({ ok: true, value }) + '\n')
    }
  } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); process.exitCode = 1 }
}
