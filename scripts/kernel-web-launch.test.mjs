import '../sol-efficiency-plugin/test/workspace-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { createRequire } from 'node:module'
import net from 'node:net'
import { spawn } from 'node:child_process'

test('daily shell uses the real CLI, discovers every project plugin and drains its own host with the profile intact', { timeout: 45_000 }, async () => {
  const source = resolve('.'), root = await mkdtemp(join(tmpdir(), 'ukr-cli-launch-'))
  const project = join(root, 'distribution'), catalog = join(root, 'catalog'), home = join(root, 'home')
  const profileDir = join(home, 'profiles/web')
  let child, running, result, output = ''
  try {
    await mkdir(project); await mkdir(catalog)
    for (const name of ['scripts', 'owner-workflow-plugin', 'sol-efficiency-plugin', 'approve-for-me-workflow-plugin']) {
      await cp(join(source, name), join(project, name), { recursive: true, filter: path => !['node_modules', 'vendor', '.git'].includes(basename(path)) })
    }
    for (const name of ['start-owner-workflow.sh', 'package.json', 'project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) await cp(join(source, name), join(project, name))
    for (const name of ['deepseek-harness', 'owner-workflow-plugin/vendor', 'owner-workflow-plugin/node_modules']) await symlink(join(source, name), join(project, name))
    const modules = join(project, '.dsh-workflow/plugins/node_modules'); await mkdir(modules, { recursive: true })
    await symlink(join(source, 'deepseek-harness/node_modules/.pnpm/semver@7.8.5/node_modules/semver'), join(modules, 'semver'))
    const { initProfile } = createRequire(join(source, 'deepseek-harness/apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
    initProfile(profileDir, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-experimental-agent-team-profile', '@deepseek-ai/dsh-experimental-agent-team-web-profile'], 'startup')
    const scope = join(profileDir, 'node_modules/@deepseek-ai')
    await mkdir(scope, { recursive: true })
    for (const directory of ['agent-team-profile', 'agent-team-web-profile']) {
      await symlink(join(source, 'deepseek-harness/packages/experimental', directory),
        join(scope, `dsh-experimental-${directory}`))
    }
    const probe = net.createServer()
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
    const custom = [
      { id: 'webserver', config: { host: '127.0.0.1', port } },
      { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
      { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true }, { id: 'session-title-llm', disabled: true },
      { id: 'settings', config: { path: join(home, 'settings.yaml'), watch: false } },
      { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions') } },
    ]
    const profilePath = join(profileDir, 'cordis.patch.yml')
    await writeFile(profilePath, JSON.stringify(custom)); const original = await readFile(profilePath, 'utf8')
    child = spawn(join(project, 'start-owner-workflow.sh'), [], { cwd: catalog,
      env: { ...process.env, DSH_HOME: home, DSH_PROFILE: 'web' }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    running = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { result = { code, signal }; resolve(result) }) })
    const deadline = Date.now() + 30_000
    let health
    while (!result && Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/owner-workflow/api/health`, { signal: AbortSignal.timeout(300) })
        health = await response.json()
        if (response.ok && health.ready && output.includes(health.instanceId)) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.equal(health?.ready, true, `actual daily CLI host must become ready: ${output}`)
    assert.ok(output.includes(health.instanceId), 'supervisor must announce the actual host instance')
    assert.deepEqual(health.components, { owner: 'ready', sol: 'ready', approval: 'ready' })
    child.kill('SIGTERM'); await running
    assert.deepEqual(result, { code: 0, signal: null }, output)
    assert.equal(await readFile(profilePath, 'utf8'), original)
    assert.equal((await readdir(join(project, '.dsh-workflow/plugins'))).some(name => name.startsWith('kernel-launch-')), false)
    await assert.rejects(fetch(`http://127.0.0.1:${port}/owner-workflow/api/health`, { signal: AbortSignal.timeout(300) }))
  } finally {
    if (child && !result) child.kill('SIGTERM')
    await running
    await rm(root, { recursive: true, force: true })
  }
})
