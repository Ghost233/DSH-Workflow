import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { verifyDesktopRuntime } from '../deepseek-harness/apps/desktop/src/runtime-tree.ts'
import { smokePreparedRuntime } from '../deepseek-harness/apps/desktop/scripts/smoke-prepared-runtime.ts'
import { DesktopHostProcess } from '../deepseek-harness/apps/desktop/src/host-process.ts'
import { prepareDesktopProfile } from './runtime/desktop-profile.mjs'

const [application] = process.argv.slice(2)
if (!application) throw new Error('Pass the production Desktop application path')
const relocated = await mkdtemp(join(tmpdir(), 'workflow-desktop-relocated-'))
try {
  const container = join(relocated, 'Application.app')
  await cp(application, container, { recursive: true, verbatimSymlinks: true })
  const workflowResources = existsSync(join(container, 'Contents/Resources/desktop/DeepSeek Harness.app'))
    ? join(container, 'Contents/Resources') : undefined
  const app = workflowResources ? join(workflowResources, 'desktop/DeepSeek Harness.app') : container
  const resources = join(app, 'Contents/Resources')
  if (existsSync(join(resources, 'dsh-source-runtime.json'))) throw new Error('Desktop still depends on the source workspace')
  const dsh = join(resources, 'app/dsh')
  const version = JSON.parse(await readFile(join(resources, 'app/package.json'), 'utf8')).version
  const descriptor = await verifyDesktopRuntime(dsh, version, { platform: 'darwin', arch: process.arch })
  const executable = join(app, 'Contents/MacOS/DeepSeek Harness')
  await promisify(execFile)('codesign', ['--verify', '--deep', '--strict', app])
  await smokePreparedRuntime(dsh, executable, join(resources, 'runtime'), descriptor)
  if (workflowResources) {
    const home = join(relocated, 'home')
    const globalRoot = join(home, 'global')
    const { profile } = await prepareDesktopProfile({ resourcesRoot: workflowResources, desktopRuntimeRoot: dsh,
      globalRoot, home, permissionMode: 'workspace-write' })
    await writeFile(join(profile, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n')
    const host = new DesktopHostProcess(executable, dsh, profile, undefined,
      { ...process.env, DSH_HOME: home, NODE_OPTIONS: '' }, undefined, join(resources, 'runtime/primary-runtime'),
      { pnpm: join(resources, 'runtime/pnpm/bin/pnpm.cjs'), nodeBin: join(resources, 'runtime/bin') })
    let timer
    try {
      const ready = await Promise.race([host.start(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Packaged Owner Host readiness exceeded 120 seconds')), 120_000)
      })])
      const login = await fetch(ready.url, { redirect: 'manual' })
      const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const response = await fetch(new URL('/owner-workflow/api/health', ready.url), { headers: { cookie } })
      const health = await response.json()
      if (!response.ok || health.ready !== true || health.components?.owner !== 'ready') {
        throw new Error(`Packaged Owner Host is not ready: ${JSON.stringify(health)}`)
      }
      process.stdout.write('Relocated launcher: Desktop profile, Owner readiness and Matt panel composition passed\n')
    } finally { clearTimeout(timer); await host.stop() }
  }
  process.stdout.write(`Relocated Desktop ${process.arch}: runtime integrity, Host, frontend and Office smoke passed\n`)
} finally {
  await rm(relocated, { recursive: true, force: true })
}
