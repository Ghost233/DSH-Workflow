import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkBrowserHarnessUpstream, readPinnedBrowserHarness, stageBrowserHarnessSkills, verifyBrowserHarnessSkills } from '../browser-harness-plugin/build.mjs'
import { copyProjectIntegration, verifyProjectIntegration } from '../macos-launcher/project-resources.mjs'
import { probeBrowserHarness } from '../browser-harness-plugin/probe.mjs'
import BrowserHarness from '../browser-harness-plugin/index.mjs'
import { ownerPeer } from '../agent-observation-plugin/test/gateway-peer.mjs'

test('the built-in skill carries the pinned original documents and rejects changed packaged bytes', async t => {
  const destination = await mkdtemp(join(tmpdir(), 'workflow-browser-skill-'))
  t.after(() => rm(destination, { recursive: true, force: true }))
  const root = resolve('.')
  const metadata = await stageBrowserHarnessSkills(root, destination)
  assert.equal(metadata.commit, 'c6a941287424f32e2d20c7b7b892c8493f46808d')
  assert.equal(metadata.version, '0.1.13')
  const skill = join(destination, 'browser-harness-plugin/skills/browser-harness/references/SKILL.md')
  assert.deepEqual(await readFile(skill), await readFile(join(root, 'vendor/browser-harness/SKILL.md')))
  assert.ok(metadata.files['interaction-skills/uploads.md'])
  await verifyBrowserHarnessSkills(destination)
  await writeFile(skill, 'different instructions')
  await assert.rejects(verifyBrowserHarnessSkills(destination), /SKILL.md/)
})

test('the normal project packager seals the Browser Harness skill and its source commit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const destination = join(root, 'workflow')
  const manifest = await copyProjectIntegration(resolve('.'), destination)
  assert.equal(manifest.input.browserHarness.commit, 'c6a941287424f32e2d20c7b7b892c8493f46808d')
  const metadata = await verifyBrowserHarnessSkills(destination)
  assert.ok(metadata.files['interaction-skills/iframes.md'])
  await verifyProjectIntegration(resolve('.'), destination)
})

test('fixed skill inputs reject an absent checkout, a dirty checkout and a gitlink mismatch', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-pin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const run = async (cwd, ...args) => (await promisify(execFile)('git', ['-C', cwd, ...args])).stdout.trim()
  await run(root, 'init', '-q')
  await run(root, 'update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/browser-harness`)
  await assert.rejects(readPinnedBrowserHarness(root))
  const upstream = join(root, 'vendor/browser-harness')
  await mkdir(upstream, { recursive: true })
  await run(upstream, 'init', '-q')
  for (const [path, content] of Object.entries({ 'SKILL.md': 'official skill', 'install.md': 'official setup', LICENSE: 'MIT', 'pyproject.toml': 'version = "0.1.13"\n' })) {
    await writeFile(join(upstream, path), content)
  }
  await run(upstream, 'add', '.')
  await run(upstream, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture')
  const commit = await run(upstream, 'rev-parse', 'HEAD')
  await assert.rejects(readPinnedBrowserHarness(root), /gitlink/)
  await run(root, 'update-index', '--cacheinfo', `160000,${commit},vendor/browser-harness`)
  assert.equal((await readPinnedBrowserHarness(root)).commit, commit)
  await writeFile(join(upstream, 'SKILL.md'), 'uncommitted skill')
  await assert.rejects(readPinnedBrowserHarness(root), /tracked changes/)
})

test('upstream checking reports changes and network failures without changing the fixed submodule', async () => {
  const before = await promisify(execFile)('git', ['-C', 'vendor/browser-harness', 'rev-parse', 'HEAD'])
  const requests = []
  const changed = await checkBrowserHarnessUpstream(resolve('.'), { fetch: async url => {
    requests.push(url)
    return Response.json(url.endsWith('commits/main')
      ? { sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } }
      : { truncated: false, tree: [{ type: 'blob', path: 'SKILL.md', sha: 'c'.repeat(40) }] })
  } })
  assert.equal(changed.state, 'update-available')
  assert.ok(changed.changed.includes('SKILL.md'))
  assert.equal(requests.length, 2)
  const failed = await checkBrowserHarnessUpstream(resolve('.'), { fetch: async () => { throw new Error('offline') } })
  assert.equal(failed.state, 'check-failed')
  assert.equal(failed.latest, null)
  assert.equal((await promisify(execFile)('git', ['-C', 'vendor/browser-harness', 'rev-parse', 'HEAD'])).stdout, before.stdout)
})

test('local availability comes from the DSH shell path and disables telemetry for the version call', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'owned tools'), log = join(root, 'observed')
  await mkdir(bin)
  const path = join(bin, 'browser-harness')
  await writeFile(path, '#!/bin/sh\n[ "$1" = --version ] || exit 9\nprintf "%s" "$BH_TELEMETRY" > "$PROBE_LOG"\nprintf "0.1.13\\n"\n', { mode: 0o755 })
  const shell = {
    resolve: request => request,
    execute: async spec => ({ result: async () => {
      try {
        const value = await promisify(execFile)('/bin/bash', ['-c', spec.command], {
          cwd: root, env: { PATH: bin, PROBE_LOG: log, ...spec.env }, timeout: spec.timeoutMs,
        })
        return { exitCode: 0, stdout: { text: value.stdout }, stderr: { text: value.stderr } }
      } catch (error) { return { exitCode: error.code, stdout: { text: error.stdout }, stderr: { text: error.stderr } } }
    } }),
  }
  const installed = await probeBrowserHarness(shell)
  assert.deepEqual({ state: installed.state, path: installed.path, version: installed.version }, { state: 'installed', path, version: '0.1.13' })
  assert.equal(installed.actualScope, 'dsh-shell')
  assert.equal(await readFile(log, 'utf8'), '0')
  await rm(path)
  assert.equal((await probeBrowserHarness(shell)).state, 'missing')
  await writeFile(path, '#!/bin/sh\nexit 8\n', { mode: 0o755 })
  const broken = await probeBrowserHarness(shell)
  assert.equal(broken.state, 'error')
  assert.equal(broken.path, path)
})

test('the authenticated DSH plugin queries a real Shell provider and returns its executable evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-host-'))
  const previousPath = process.env.PATH, previousLog = process.env.BROWSER_PROBE_LOG
  const bin = join(root, 'bin'), log = join(root, 'version-query')
  await mkdir(bin)
  await writeFile(join(bin, 'browser-harness'), '#!/bin/sh\n[ "$1" = --version ] || exit 9\nprintf "%s" "$BH_TELEMETRY" > "$BROWSER_PROBE_LOG"\necho 0.1.13\n', { mode: 0o755 })
  process.env.PATH = `${bin}:/usr/bin:/bin`
  process.env.BROWSER_PROBE_LOG = log
  const req = createRequire(new URL('../deepseek-harness/apps/cli/package.json', import.meta.url))
  const { Context } = req('@deepseek-ai/cordis')
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    previousPath === undefined ? delete process.env.PATH : process.env.PATH = previousPath
    previousLog === undefined ? delete process.env.BROWSER_PROBE_LOG : process.env.BROWSER_PROBE_LOG = previousLog
    await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(req('@deepseek-ai/dsh-subprocess-local').default)
  await ctx.plugin(req('@deepseek-ai/dsh-bash-local').default, { cwd: root })
  await ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  await ctx.plugin(req('@deepseek-ai/dsh-api-remote-access').default)
  await ctx.plugin(req('@deepseek-ai/dsh-api-gateway').default)
  await ctx.plugin(BrowserHarness)
  const actual = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'browserHarness', method: 'inspect', args: {} })
  assert.equal(actual.state, 'installed')
  assert.equal(actual.version, '0.1.13')
  assert.equal(actual.path, join(bin, 'browser-harness'))
  assert.equal(await readFile(log, 'utf8'), '0')
})
