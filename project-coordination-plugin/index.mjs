import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Coordination } from './src/coordination.mjs'
import { Workspaces } from './src/workspaces.mjs'
import { GitHub } from './src/github.mjs'
import { TobsBridge } from './src/tobs-bridge.mjs'
import { CoordinationRuntime } from './src/runtime.mjs'
import { validateConfiguration } from './src/configuration.mjs'
import { githubTokenProvider } from './src/github-credentials.mjs'

export const name = 'dsh-workflow-project-coordination'
export const inject = { botharness: { required: false }, workspaceRegistry: { required: true }, agents: { required: true } }
export const Config = z.object({
  directory: z.string(),
  configurationFile: z.string().default('').description('负责人、仓库与常设授权的本地 JSON 文件；留空保持待配置。'),
})
export async function apply(ctx, config) {
  const log = message => console.info(`[project-coordination] ${message}`)
  if (!config.configurationFile) { log('Project coordination is awaiting repository/team authorization.'); return }
  const configuration = validateConfiguration(JSON.parse(await readFile(config.configurationFile, 'utf8')))
  const core = ctx.get('botharness')
  if (!core) { log('Project coordination is waiting for Tobs; no task was started.'); return }
  const service = new Coordination({ path: join(config.directory, 'coordination.sqlite'), configuration })
  const workspaces = new Workspaces({ store: service.store })
  const abort = new AbortController()
  const github = new GitHub({ service, signal: abort.signal,
    token: githubTokenProvider({ executable: configuration.ghExecutable, signal: abort.signal }) })
  const bridge = new TobsBridge({ service, core, defineTool, workspaces, workspaceRegistry: ctx.get('workspaceRegistry'), github })
  const runtime = new CoordinationRuntime({ service, bridge, github, core, log })
  ctx.effect(() => async () => { abort.abort(); bridge.close(); await runtime.close(); service.close() })
  bridge.start(ctx.get('agents'))
  const principal = configuration.members.find(member => member.role === 'principal').bot
  const principalSession = core.runtime.currentOrchestratorSessionId(principal)
  if ([...bridge.disposers.keys()].some(agent => agent.session.id === principalSession)) {
    log(`Mounted project_work on existing principal Session ${principalSession}.`)
  }
  runtime.start()
}

export default { name, inject, Config, apply }
