import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readDesktopHost } from '../macos-launcher/runtime/desktop-launch.mjs'
import { verifyBrowserHarnessSkills } from './build.mjs'

/** Query only an authenticated, live local DSH Host. Never guess from the launcher's PATH. */
export async function browserHarnessVersionRows({ resourcesRoot, dataRoot }) {
  const workflow = join(resourcesRoot, 'workflow')
  try { await readFile(join(workflow, 'browser-harness-plugin/package.json')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  let skill
  try {
    const fixed = await verifyBrowserHarnessSkills(workflow)
    skill = { name: 'Browser Harness Skill', source: 'App 内置浏览器技能', current: fixed.commit,
      expected: fixed.commit, status: 'bundled', note: `官方版本 ${fixed.version}；固定上游 ${fixed.commit}；随 App 交付` }
  } catch {
    skill = { name: 'Browser Harness Skill', source: 'App 内置浏览器技能', current: null,
      expected: null, status: 'error', note: '随包技能或来源摘要无法验证。' }
  }
  let cli = { name: 'browser-harness', source: 'DSH 默认 Shell', current: null, expected: null,
    status: 'unknown', actualScope: 'dsh-shell', note: 'DSH 未运行或内部插件不可达，未验证本机可用安装。' }
  try {
    if (!dataRoot) return [skill, cli]
    const host = await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop'))
    const signal = AbortSignal.timeout(7000)
    const login = await fetch(host.url, { redirect: 'manual', signal })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await login.text()
    if (!cookie) throw new Error('Host authentication unavailable')
    const rpcId = randomUUID()
    const response = await fetch(new URL('/api/browserHarness/inspect', host.url), {
      method: 'POST', signal, headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'browserHarness/inspect', payload: { args: {} } }),
    })
    const envelope = await response.json(), value = envelope.result?.value
    if (!response.ok || envelope.type !== 'server-response' || envelope.rpcId !== rpcId || envelope.result?.ok !== true
      || value?.actualScope !== 'dsh-shell' || !['installed', 'missing', 'error'].includes(value.state)) throw new Error('Invalid DSH inspection')
    if (value.state === 'installed' && (!isAbsolute(value.path ?? '') || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value.version))) throw new Error('Invalid CLI evidence')
    cli = { ...cli, current: value.state === 'installed' ? value.version : null, status: value.state,
      path: value.path ?? null, source: `DSH 默认 Shell${value.path ? ` · ${value.path}` : ''}`,
      note: value.state === 'installed' ? '当前 DSH Shell 已完成只读版本查询；不代表浏览器已连接或特定会话已授权。'
        : value.state === 'missing' ? '当前 DSH Shell 未找到 browser-harness；未安装或升级软件。' : '当前 DSH Shell 的版本查询失败。' }
  } catch { /* Keep unknown: a failed Host request never proves that the software is missing. */ }
  return [skill, cli]
}
