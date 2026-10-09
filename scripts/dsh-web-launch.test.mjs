import './harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { createRequire } from 'node:module'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { dshReadiness } from './dsh-readiness.mjs'

test('the no-argument source Web entry starts the real CLI and preserves user profile values', { timeout: 45_000 }, async () => {
  const source = resolve('.'), root = await mkdtemp(join(tmpdir(), 'ukr-cli-launch-'))
  const project = join(root, 'distribution'), catalog = join(root, 'catalog'), home = join(root, 'home')
  const profileDir = join(home, 'profiles/web')
  let child, running, result, output = ''
  try {
    await mkdir(project); await mkdir(catalog)
    for (const name of ['scripts', 'agent-observation-plugin']) {
      await cp(join(source, name), join(project, name), { recursive: true, filter: path => !['node_modules', 'vendor', '.git'].includes(basename(path)) })
    }
    await mkdir(join(project, 'matt-skills-panel-plugin'), { recursive: true })
    await cp(join(source, 'matt-skills-panel-plugin/package'), join(project, 'matt-skills-panel-plugin/package'), { recursive: true })
    await mkdir(join(project, 'vendor'), { recursive: true })
    await cp(join(source, 'vendor/mattpocock-skills-zh'), join(project, 'vendor/mattpocock-skills-zh'), { recursive: true })
    for (const name of ['start-dsh-workflow.sh', 'package.json', 'project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) await cp(join(source, name), join(project, name))
    for (const name of ['deepseek-harness', 'agent-observation-plugin/vendor', 'agent-observation-plugin/node_modules']) await symlink(join(source, name), join(project, name))
    const modules = join(project, '.dsh-workflow/plugins/node_modules'); await mkdir(modules, { recursive: true })
    await symlink(join(source, 'deepseek-harness/node_modules/.pnpm/semver@7.8.5/node_modules/semver'), join(modules, 'semver'))
    const manifest = JSON.parse(await readFile(join(project, 'project-plugins.json'), 'utf8'))
    const locked = JSON.parse(await readFile(join(project, 'project-plugins.lock.json'), 'utf8'))
    const dependencies = {}, reused = []
    for (const item of manifest.plugins.filter(item => item.startup === true && item.package !== 'billion-context')) {
      const pin = locked.plugins.find(entry => entry.package === item.package)
      for (const candidate of [join(source, '.dsh-workflow/plugins/node_modules', item.package), join(process.env.HOME, '.dsh/profiles/web/node_modules', item.package)]) {
        const installed = await readFile(join(candidate, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error })
        if (installed?.name !== item.package || installed.version !== pin.version) continue
        const destination = join(modules, item.package)
        await mkdir(join(destination, '..'), { recursive: true })
        await symlink(candidate, destination)
        dependencies[item.package] = pin.version; reused.push(item.package); break
      }
    }
    await writeFile(join(project, '.dsh-workflow/plugins/package.json'), JSON.stringify({ name: 'dsh-workflow-project-plugins', private: true, dependencies }))
    const { initProfile, loadOverlayPatches, composeEntries } = createRequire(join(source, 'deepseek-harness/apps/cli/package.json'))('@deepseek-ai/dsh-app-boot')
    initProfile(profileDir, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-experimental-agent-team-profile'], 'startup')
    const scope = join(profileDir, 'node_modules/@deepseek-ai')
    await mkdir(scope, { recursive: true })
    for (const directory of ['agent-team-profile']) {
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
    await writeFile(profilePath, JSON.stringify([...custom, { insert: [{ id: 'daily-launch-observer', name: join(project, 'scripts/fixtures/jev-daily-plugin-observer.mjs') }] }]))
    const platformBin = join(root, 'platform-bin')
    await mkdir(platformBin)
    await writeFile(join(platformBin, 'uname'), '#!/bin/sh\nprintf "Linux\\n"\n', { mode: 0o755 })
    await writeFile(join(platformBin, 'pnpm'), '#!/bin/sh\nprintf "daily fixture: dependency installation forbidden\\n" >&2\nexit 77\n', { mode: 0o755 })
    child = spawn(join(project, 'start-dsh-workflow.sh'), [], { cwd: catalog,
      env: { ...process.env, PATH: `${platformBin}:${process.env.PATH}`, DSH_HOME: home, DSH_PROFILE: 'web' }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    running = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { result = { code, signal }; resolve(result) }) })
    const deadline = Date.now() + 30_000
    while (!result && Date.now() < deadline && !output.includes('DSH Web ready:')) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.match(output, /DSH Web ready: http:\/\/127\.0\.0\.1:/, `actual daily CLI host must become ready: ${output}`)
    const instanceId = /DSH Web ready: [^\r\n]+ \(([^)]+)\)/.exec(output)?.[1]
    assert.ok(instanceId, 'supervisor must announce its actual launch instance')
    const logPath = /Log: ([^\r\n]+)/.exec(output)?.[1]
    const hostLog = logPath ? await readFile(logPath, 'utf8') : ''
    const authenticated = hostLog.split(/\r?\n/).find(line => line.startsWith('dsh web: http://'))
    assert.ok(authenticated, 'the launched DSH publishes its authenticated Connection URL to its private log')
    const url = new URL(authenticated.slice('dsh web: '.length).split(' ')[0])
    const login = await fetch(url, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await login.text()
    const ready = await dshReadiness(url, { cookie })
    assert.equal(ready.ready, true)
    assert.ok(ready.plugins.length > 0, 'official DSH plugin manager observes the serving runtime')
    const actualResponse = await fetch(`http://127.0.0.1:${port}/daily-launch-fixture/plugins`, { headers: { cookie } })
    const diagnostic = hostLog.split('\n').filter(line => /daily-launch-observer|jev-daily-plugin-observer|ERROR|error|Error/.test(line))
      .join('\n').replace(/([?&]token=)[^\s&"']+/g, '$1[REDACTED]')
    assert.equal(actualResponse.status, 200, `actual runtime plugin results must be observable separately from profile registration; ${diagnostic}`)
    const actual = await actualResponse.json()
    const observer = actual.plugins.find(entry => entry.id === 'daily-launch-observer')
    assert.equal(observer?.hasRuntime, true, 'the serving observer itself must have an actual runtime')
    assert.equal(observer.state, actual.observerState, 'Loader and the serving observer must agree on its active state')
    console.log(JSON.stringify({ dailyRuntime: { observer, services: actual.services,
      plugins: actual.plugins.filter(entry => ['workflow-jev-center', 'workflow-agent-monitor'].includes(entry.id)) } }))
    assert.deepEqual(actual.services, { jevCenter: true, agentMonitor: true }, JSON.stringify(actual))
    const centerResponse = await fetch(`http://127.0.0.1:${port}/jev-center/api/config`, { headers: { cookie } })
    assert.equal(centerResponse.status, 200, `actual center HTTP service: ${diagnostic}`)
    const center = await centerResponse.json()
    assert.deepEqual(center.engines, [])
    const monitorResponse = await fetch(`http://127.0.0.1:${port}/agent-monitor/api/status`, { headers: { cookie } })
    assert.equal(monitorResponse.status, 200, `actual monitor HTTP service: ${diagnostic}`)
    const monitor = await monitorResponse.json()
    assert.equal(monitor.configuration.ns, 'workflow-agent-monitor')
    assert.equal(monitor.configuration.value.checkIntervalMs, 60000)
    assert.equal(monitor.engineAvailability.code, 'MODEL_NOT_SELECTED')
    const receipt = JSON.parse(await readFile(join(project, '.dsh-workflow/plugins/launch.json'), 'utf8'))
    const results = manifest.plugins.filter(item => item.startup === true).map(item => {
      const prepared = receipt.installed.some(entry => entry.package === item.package)
      const entry = actual.plugins.find(entry => entry.package === item.package && entry.id === `project-${item.entryId}`)
      const reason = output.split('\n').find(line => line.includes(`跳过 ${item.package}：`))
      const skipped = Boolean(reason)
      assert.equal(prepared || skipped, true, `each selected plugin must report its real preparation result: ${item.package}`)
      const active = entry?.state === actual.observerState && entry?.hasRuntime === true
      if (prepared) assert.equal(active, true, `prepared plugin must actually activate: ${item.package}`)
      else assert.equal(active, false, `skipped plugin must not claim activation: ${item.package}`)
      return { package: item.package, artifactReused: reused.includes(item.package), prepared, active, skipped,
        ...(reason ? { reason } : {}) }
    })
    assert.equal(results.find(item => item.package === 'billion-context').skipped, true, 'missing fixed artifact is a real failure, with installation blocked')
    assert.match(output, /其余插件已准备，可以继续启动 DSH/)
    console.log(JSON.stringify({ dailyStartupPluginResults: results }))
    child.kill('SIGTERM'); await running
    assert.deepEqual(result, { code: 0, signal: null }, output)
    const profilePatches = loadOverlayPatches('dsh', profilePath)
    assert.deepEqual(profilePatches.filter(row => custom.some(original => original.id === row.id)), custom)
    const registered = composeEntries([profilePatches])
    for (const id of ['workflow-jev-center', 'workflow-agent-monitor']) assert.equal(registered.filter(row => row.id === id).length, 1)
    assert.equal((await readdir(join(project, '.dsh-workflow/plugins'))).some(name => name.startsWith('dsh-launch-')), false)
    await assert.rejects(dshReadiness(url, { cookie, signal: AbortSignal.timeout(300) }))
  } finally {
    if (child && !result) child.kill('SIGTERM')
    await running
    await rm(root, { recursive: true, force: true })
  }
})
