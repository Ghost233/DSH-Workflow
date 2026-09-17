import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkLaunchReady } from './harness-runtime.mjs'
import { prepare, releaseLock, pluginDirectory } from './project-plugins.mjs'
import { composeKernelLaunch } from './kernel-launch-composition.mjs'
import { launchWebHost, assertWebPortAvailable } from './web-host-lifecycle.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

export function configuredWebPort(entries) {
  const matches = flatten(entries).filter(row => row.name === '@deepseek-ai/dsh-host-webserver' && row.disabled !== true)
  if (matches.length !== 1) throw new Error('Kernel launch requires one active native Web server')
  const value = matches[0].config?.port
  // This is the fixed official no-argument Web default. Arbitrary expressions
  // belong to DSH and must not be evaluated or silently replaced by this launcher.
  const port = value === undefined || value?.__jsExpr === 'ctx.webStartup.port ?? 3080' ? 3080 : value
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Cannot bind readiness to the configured Web port; preserve the profile and report its unresolved port expression')
  return port
}

/** Single no-argument host behind start-owner-workflow.sh.
 * No profile/preset installer, daemon or legacy Runner. */
export async function launchKernelWeb({ projectRoot = repository, catalogRoot = process.cwd(), signal,
  onReady = ({ port, instanceId, logPath }) => process.stderr.write(`DSH Web ready: http://127.0.0.1:${port}/ (${instanceId})\nLog: ${logPath}\n`) } = {}) {
  const project = await realpath(projectRoot), catalog = await realpath(catalogRoot)
  const harness = join(project, 'deepseek-harness'), anchor = join(harness, 'apps/cli/package.json')
  if (process.env.DSH_PROFILE && process.env.DSH_PROFILE !== 'web') throw new Error('The daily workflow entry requires the existing Web profile; DSH_PROFILE selects another profile')
  if (!await checkLaunchReady(harness)) throw new Error('The official DSH build is not ready for its fixed source; run the explicit build command before launch')
  const boot = createRequire(anchor)('@deepseek-ai/dsh-app-boot')
  const home = process.env.DSH_HOME || join(process.env.HOME, '.dsh')
  const profile = boot.loadProfile('dsh', 'web', anchor, home)
  const userPatch = join(home, 'cordis.patch.yml')
  const layers = [...profile.layers.map(layer => layer.patches), profile.patches,
    existsSync(userPatch) ? boot.loadOverlayPatches('dsh', userPatch) : []]
  const port = configuredWebPort(boot.composeEntries(layers))
  // Refuse an occupied port before project preparation mutates its launch metadata.
  await assertWebPortAvailable(port)
  let launchDirectory, prepared = false
  try {
    const state = await prepare(project, anchor, process.pid, { scope: 'owned' }); prepared = true
    const entries = boot.composeEntries([...layers, boot.loadOverlayPatches('dsh', state.patch)])
    if (configuredWebPort(entries) !== port) throw new Error('Project plugin composition unexpectedly changed the Web port')
    launchDirectory = await mkdtemp(join(pluginDirectory(project), 'kernel-launch-'))
    const patch = join(launchDirectory, 'composition.patch.yml')
    await writeFile(patch, JSON.stringify(composeKernelLaunch(entries, { projectRoot: project, catalogRoot: catalog }), null, 2) + '\n', { mode: 0o600 })
    return await launchWebHost({ argv: [process.execPath, join(project, 'scripts/project-plugins.mjs'), 'run', project, 'web', '--patch', patch, '--no-open'],
      cwd: catalog, port, logRoot: join(catalog, '.dsh-workflow/web-host/logs'), signal,
      environment: { ...process.env, DSH_OWNER_WORKFLOW_CATALOG_ROOT: catalog },
      onReady })
  } finally {
    if (launchDirectory) await rm(launchDirectory, { recursive: true, force: true })
    if (prepared) await releaseLock(pluginDirectory(project), process.pid)
  }
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  try {
    if (process.argv.length !== 2) throw new Error('The workflow launcher accepts no arguments')
    const result = await launchKernelWeb({ signal: controller.signal })
    process.exitCode = result.stopped ? 0 : result.code ?? 1
  } catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
}
