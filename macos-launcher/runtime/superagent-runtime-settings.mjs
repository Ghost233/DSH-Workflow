import { setTimeout as delay } from 'node:timers/promises'

/** Apply one project's settings through the upstream revision-checked management interface. */
export async function applySuperagentProjectSettings({ url, project, accounts, beforeResume = async () => {} }) {
  const base = new URL('/orchestrator/api/', url)
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port) throw new Error('无效的 Superagent 本地地址。')
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(new URL(path, base), { method, headers: { 'x-orchestrator-request': '1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Superagent 设置失败（HTTP ${response.status}），请检查项目账号和配置。`)
    return response.json()
  }
  const ready = async (matches = () => true) => {
    let state
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        state = await request('state')
        if (state?.setup?.accounts && ['ready', 'paused'].includes(state.health?.runtime?.state) && matches(state)) return state
      } catch { /* The upstream plugin is restarting after a settings save. */ }
      await delay(200)
    }
    throw new Error(state?.setup?.feishuProblem?.detail || state?.setup?.problem?.detail || 'Superagent 账号配置未就绪。')
  }
  const save = async (name, value, revision) => {
    const result = await request(`settings/${encodeURIComponent(name)}`, 'PUT', { value, revision })
    if (result.restarting) { await delay(50); await ready() }
  }
  let settings = await request('settings')
  const github = settings.sources?.find(row => row.id === 'github')
  if (!github?.installed) throw new Error('Superagent 的 GitHub 来源不可用。')
  const githubValue = { ...github.value, enabled: true, config: { ...github.value.config,
    repository: project.repository, cli: accounts.github } }
  if (JSON.stringify(githubValue) !== JSON.stringify(github.value)) await save('source:github', githubValue, github.revision)
  const state = await ready(value => String(value.setup.accounts.agent).toLowerCase() === project.githubLogin.toLowerCase()
    && String(value.setup.accounts.repository).toLowerCase() === project.repository.toLowerCase())
  if (String(state.setup.accounts.agent).toLowerCase() !== project.githubLogin.toLowerCase()) throw new Error('GitHub 实际登录账号与项目选择不一致。')
  settings = await request('settings')
  const feishu = settings.sources?.find(row => row.id === 'feishu')
  const preserve = project.legacy === true && project.preserveLegacyPolicy === true
  if (accounts.feishu && !feishu?.installed) throw new Error('Superagent 的飞书来源不可用。')
  if (feishu?.installed) {
    const value = { ...feishu.value, enabled: Boolean(accounts.feishu), config: { ...feishu.value.config, cli: accounts.feishu ?? '',
      ...(project.feishuChatId ? { chats: [{ chatId: project.feishuChatId, listen: 'mentions' }] } : preserve ? {} : { chats: [] }) } }
    if (JSON.stringify(value) !== JSON.stringify(feishu.value)) await save('source:feishu', value, feishu.revision)
    if (accounts.feishu) {
      const current = await ready(value => value.setup.accounts.feishu?.appId === accounts.feishuAppId)
      if (current.setup.feishuProblem) throw new Error(current.setup.feishuProblem.detail || '飞书机器人配置未就绪。')
    }
  }
  settings = await request('settings')
  const policy = settings.blocks?.policy
  if (!policy) throw new Error('Superagent 来源权限设置不可用。')
  const githubAllowed = [...new Set((project.githubAllowed ?? '').split(/[,\s]+/).filter(Boolean))].map(id => ({ id }))
  const sourcePolicies = { ...policy.value.sources,
    ...(githubAllowed.length || !preserve ? { github: { ...policy.value.sources.github, allowed: githubAllowed } } : {}),
    ...(accounts.feishu ? { feishu: { ...policy.value.sources.feishu,
      ...(project.feishuAllowedId ? { allowed: [{ id: project.feishuAllowedId }] } : preserve ? {} : { allowed: [] }) } } : {}) }
  const policyValue = { ...policy.value, sources: sourcePolicies }
  if (JSON.stringify(policyValue) !== JSON.stringify(policy.value)) await save('policy', policyValue, policy.revision)
  settings = await request('settings')
  const executor = settings.blocks?.executor
  if (!executor) throw new Error('Superagent 执行设置不可用。')
  const value = { ...executor.value, directory: project.executionRoot, prepare: accounts.prepare ?? project.prepare }
  if (JSON.stringify(value) !== JSON.stringify(executor.value)) await save('executor', value, executor.revision)
  await beforeResume()
  await request('executor/pause', 'POST', { paused: project.executionEnabled !== true })
}
