import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, writeFile, rm, realpath, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

import { composeKernelLaunch } from '../../scripts/kernel-launch-composition.mjs'
import { composeApprovalPatches } from '../../approve-for-me-workflow-plugin/compose-patch.mjs'
import { hostPackageMap } from '../../scripts/project-plugins.mjs'
import { installProjectResolver } from '../../scripts/project-plugin-resolver.mjs'
import { launchWebHost, assertWebPortAvailable } from '../../scripts/web-host-lifecycle.mjs'

const workflowRoot = fileURLToPath(new URL('../../', import.meta.url))
const flattened = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flattened(row.config) : [])])

export function portPatch(entries, port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535')
  const servers = flattened(entries).filter(row => row.name === '@deepseek-ai/dsh-host-webserver' && row.disabled !== true)
  if (servers.length !== 1 || !servers[0].id) throw new Error('Expected one named DSH Web server')
  return { id: servers[0].id, config: { ...structuredClone(servers[0].config ?? {}), port } }
}

export function authenticatedUrl(logText) {
  const line = logText.split(/\r?\n/).find(item => item.startsWith('dsh web: http://') && item.includes('token='))
  if (!line) throw new Error('DSH did not publish an authenticated browser URL')
  const value = line.slice('dsh web: '.length).split(' ')[0]
  const url = new URL(value)
  if (url.hostname !== '127.0.0.1' || !url.searchParams.has('token')) throw new Error('Unexpected DSH browser URL')
  return url.toString()
}

async function waitForAuthenticatedUrl(logPath, signal) {
  for (let attempt = 0; attempt < 100; attempt++) {
    signal?.throwIfAborted()
    const log = await readFile(logPath, 'utf8')
    try { return authenticatedUrl(log) } catch (error) {
      if (!String(error.message).startsWith('DSH did not publish')) throw error
    }
    await delay(100, undefined, { signal })
  }
  throw new Error('DSH became healthy but did not publish an authenticated browser URL')
}

/** Boot the upstream Web profile with only the project's immutable owned overlay. */
export async function launchPackagedWeb({ resourcesRoot, workspace, port, signal, onReady = () => {} }) {
  signal?.throwIfAborted()
  await assertWebPortAvailable(port)
  signal?.throwIfAborted()
  const resources = await realpath(resourcesRoot)
  const catalog = await realpath(workspace)
  const workflow = join(resources, 'workflow')
  const anchor = join(resources, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(anchor)) throw new Error('Packaged DSH runtime is missing')
  const manifest = JSON.parse(readFileSync(anchor, 'utf8'))
  if (manifest.name !== '@deepseek-ai/dsh') throw new Error('Packaged DSH identity mismatch')
  const installed = JSON.parse(readFileSync(join(workflow, 'dsh-runtime.json'), 'utf8'))
  if (manifest.version !== installed.version) throw new Error('Packaged DSH version mismatch')
  const packages = {
    'dsh-owner-workflow': workflow,
    'dsh-sol-efficiency': join(workflow, 'sol-efficiency-plugin'),
    'dsh-approve-for-me-workflow': join(workflow, 'approve-for-me-workflow-plugin'),
  }
  for (const [name, root] of Object.entries(packages)) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    if (pkg.name !== name) throw new Error(`Packaged plugin identity mismatch: ${name}`)
  }
  const hostPackages = hostPackageMap(anchor)
  signal?.throwIfAborted()
  const hooks = installProjectResolver({ anchor, packages, hostPackages, directory: workflow })
  let launchDirectory
  try {
    const boot = createRequire(anchor)('@deepseek-ai/dsh-app-boot')
    const home = process.env.DSH_HOME || join(process.env.HOME, '.dsh')
    const profile = boot.loadProfile('dsh', 'web', anchor, home)
    const homePatch = join(home, 'cordis.patch.yml')
    const layers = [...profile.layers.map(layer => layer.patches), profile.patches,
      existsSync(homePatch) ? boot.loadOverlayPatches('dsh', homePatch) : []]
    const entries = boot.composeEntries(layers)
    const patches = [
      ...composeApprovalPatches(entries),
      ...composeKernelLaunch(entries, { projectRoot: workflow, catalogRoot: catalog }),
      portPatch(entries, port),
    ]
    signal?.throwIfAborted()
    launchDirectory = await mkdtemp(join(tmpdir(), 'dsh-workflow-app-'))
    const patchPath = join(launchDirectory, 'launch.patch.yml')
    await writeFile(patchPath, JSON.stringify(patches, null, 2) + '\n', { mode: 0o600 })
    const runner = join(workflow, 'macos-launcher', 'runtime', 'run-dsh.mjs')
    return await launchWebHost({
      argv: [process.execPath, runner, resources, '--profile', 'web', '--patch', patchPath, '--no-open'],
      cwd: catalog,
      port,
      logRoot: join(catalog, '.dsh-workflow', 'web-host', 'logs'),
      signal,
      onReady: async ({ logPath, ...state }) => {
        const url = await waitForAuthenticatedUrl(logPath, signal)
        onReady({ ...state, logPath, url })
      },
    })
  } finally {
    hooks.deregister()
    if (launchDirectory) await rm(launchDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [resourcesRoot, workspace, rawPort] = process.argv.slice(2)
  const port = Number(rawPort)
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const parent = process.ppid
  const parentWatch = setInterval(() => { if (process.ppid !== parent) controller.abort() }, 1000)
  parentWatch.unref()
  try {
    if (!resourcesRoot || !workspace || !/^\d+$/.test(rawPort ?? '')) throw new Error('Usage: web-launch.mjs RESOURCES WORKSPACE PORT')
    const result = await launchPackagedWeb({ resourcesRoot, workspace, port, signal: controller.signal,
      onReady: state => process.stdout.write(`DSH_WORKFLOW_READY\t${JSON.stringify(state)}\n`) })
    process.exitCode = result.stopped ? 0 : result.code ?? 1
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  } finally {
    clearInterval(parentWatch)
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
