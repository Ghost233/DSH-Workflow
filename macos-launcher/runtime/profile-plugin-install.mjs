import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPluginConfiguration, readStartupChecklist } from './plugin-configuration.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'

// The Web UI is unavailable before the startup checklist passes. Use the same
// DSH package operations outside the Host to install missing requirements.
async function install(names) {
  const resources = fileURLToPath(new URL('../../../', import.meta.url))
  const config = await readPluginConfiguration(resources)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dataRoot = join(homedir(), 'Library/Application Support/DSH Workflow')
  const required = new Set(await readStartupChecklist(dataRoot, config, resources))
  if (!names.length || names.some(name => !required.has(name))) throw new Error('请指定本地启动检查名单中的包名')
  let status
  try { status = await serviceRequest(serviceSocket(dataRoot), { type: 'status' }) }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
  if (status?.service && !['stopped', 'failed'].includes(status.service.state)) {
    throw new Error('请先停止 DSH 服务，或在运行中的 DSH 插件页面安装')
  }
  const installAnchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(installAnchor)
  const { runProfilePnpm } = require('@deepseek-ai/dsh-plugin-manager/operations')
  const { withFileLock } = require('@deepseek-ai/dsh-atomic-write')
  const dir = join(home, 'profiles/desktop')
  const result = await withFileLock(join(dir, 'package.json'), () => runProfilePnpm(
    { profile: 'desktop', dir, home, cwd: dir, installAnchor },
    ['add', ...new Set(names), '--ignore-scripts', `--registry=${config.registry}`],
    { command: join(resources, 'bin/pnpm'), execution: 'cli', outputBytes: 16384, lookupTimeoutMs: 60000,
      onOutput: (message, stream) => process[stream].write(message) },
  ), { waitMs: 120000 })
  if (result.exitCode !== 0) throw new Error(`安装失败，日志：${result.logPath}`)
}

if (import.meta.main) {
  try { await install(process.argv.slice(2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
