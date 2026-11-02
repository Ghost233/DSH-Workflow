import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { privateDirectory } from './service-control.mjs'
import { listSuperagentProjects } from './superagent-projects.mjs'
import { resolveLarkExecutable } from './superagent-accounts.mjs'

const exec = promisify(execFile)
const envFor = (directory, profile) => {
  const env = { ...process.env, LARKSUITE_CLI_CONFIG_DIR: directory,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' }
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARKSUITE_CLI_APP_ID',
    'LARKSUITE_CLI_APP_SECRET', 'LARKSUITE_CLI_BRAND', 'LARKSUITE_CLI_PROFILE', 'OPENCLAW_HOME', 'HERMES_HOME']) delete env[key]
  if (profile) env.LARKSUITE_CLI_PROFILE = profile
  return env
}

/** Read existing CLI profiles without changing their selected identity or credentials. */
export async function listFeishuBots({ dataRoot, resources, run = exec }) {
  let lark
  try { lark = await resolveLarkExecutable(resources) }
  catch { return { available: false, bots: [] } }
  const managed = join(resolve(dataRoot), 'superagent-feishu')
  const entries = await readdir(managed, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const candidates = [join(homedir(), '.lark-cli'), ...entries.filter(row => row.isDirectory()).map(row => join(managed, row.name)),
    ...(await listSuperagentProjects(dataRoot)).map(row => row.feishuConfigDir).filter(Boolean)]
  const bots = []
  for (const directory of [...new Set(candidates)]) {
    if (!isAbsolute(directory)) continue
    let profiles
    try { profiles = JSON.parse((await run(lark, ['profile', 'list'], { env: envFor(directory), timeout: 15_000, maxBuffer: 1024 * 1024 })).stdout) }
    catch { continue }
    if (!Array.isArray(profiles)) continue
    for (const profile of profiles) {
      if (typeof profile.name !== 'string' || !/^cli_[A-Za-z0-9]+$/.test(profile.appId ?? '')) continue
      try {
        const env = envFor(directory, profile.name)
        const [mode, status] = await Promise.all([
          run(lark, ['config', 'strict-mode'], { env, timeout: 15_000 }),
          run(lark, ['auth', 'status', '--json'], { env, timeout: 15_000 }),
        ])
        const state = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')))
        const ready = /strict-mode:\s*bot\b/.test(mode.stdout) && state.appId === profile.appId && state.identities?.bot?.status === 'ready'
        bots.push({ directory, profile: profile.name, appId: profile.appId, name: profile.name === profile.appId ? '飞书机器人' : profile.name,
          executable: resolve(lark) === resolve(resources, 'bin/lark-cli') ? '@bundled' : lark, ready })
      } catch { /* A broken profile is not offered as a working bot. */ }
    }
  }
  return { available: true, bots }
}

/** Stream the official QR URL; keep credentials inside the CLI's isolated configuration. */
export async function registerFeishuBot({ dataRoot, resources, emit, input = process.stdin, run = exec, spawnProcess = spawn }) {
  const lark = await resolveLarkExecutable(resources)
  const parent = join(resolve(dataRoot), 'superagent-feishu')
  await privateDirectory(parent)
  const directory = join(parent, randomUUID())
  await mkdir(directory, { mode: 0o700 })
  const env = envFor(directory), child = spawnProcess(lark, ['config', 'init', '--new', '--brand', 'feishu', '--lang', 'zh'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let cancelled = false, sent = false, force
  const cancel = () => {
    cancelled = true; child.kill('SIGTERM')
    force = setTimeout(() => child.kill('SIGKILL'), 5000); force.unref()
  }
  input.once('end', cancel)
  for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', line => {
    if (sent) return
    const match = line.replace(/\x1b\[[0-9;]*m/g, '').match(/https:\/\/(?:open\.feishu\.cn|open\.larksuite\.com)\/[^\s"'<>]+/)
    if (!match) return
    const url = match[0]
    try { if (new URL(url).pathname !== '/page/cli') return } catch { return }
    sent = true; emit({ type: 'qr', url })
  })
  let code
  try { code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }) }
  finally { input.removeListener('end', cancel); clearTimeout(force) }
  if (cancelled) throw new Error('已取消飞书扫码。')
  if (code !== 0 || !sent) throw new Error('飞书扫码配置未完成，请重试。')
  try {
    await run(lark, ['config', 'strict-mode', 'bot'], { env, timeout: 30_000 })
    const state = JSON.parse((await run(lark, ['auth', 'status', '--json'], { env, timeout: 30_000 })).stdout)
    if (!/^cli_[A-Za-z0-9]+$/.test(state.appId ?? '') || state.identities?.bot?.status !== 'ready') throw new Error('bot not ready')
    const profileEnv = envFor(directory, state.appId)
    const mode = await run(lark, ['config', 'strict-mode'], { env: profileEnv, timeout: 15_000 })
    if (!/strict-mode:\s*bot\b/.test(mode.stdout)) throw new Error('bot identity is not restricted')
    return { directory, profile: state.appId, appId: state.appId, name: '新飞书机器人',
      executable: resolve(lark) === resolve(resources, 'bin/lark-cli') ? '@bundled' : lark, ready: true }
  } catch { throw new Error('已创建飞书应用，但机器人身份尚未就绪；配置已保留，请刷新机器人列表。') }
}
