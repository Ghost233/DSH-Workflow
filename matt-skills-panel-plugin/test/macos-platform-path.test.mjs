import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlatform, composePlatform } from '../src/host/platform/index.js'
import nodePath from 'node:path'
import { keyOf, currentOs } from '../src/shared/workspaceKey.js'
import { normalizeWorkspacePath, parentWorkspaceDir, canonicalWorkspaceKey } from '../src/host/workspaceKey.js'
import { workspaceNormOf, resolveWorkspaceEntry } from '../src/client/kernel/api-workspace.js'
import { getRoot, mdPath } from '../src/host/tracker/backends/markdown/path.js'
import { getScratchRoot } from '../src/host/tracker/backends/markdown/issues-locate.js'
import { createPublishFlow } from '../src/host/publishFlow.js'
import { createPlatformChannel } from '../src/host/platformChannel.js'
import { createSkillProbe } from '../src/host/skillProbe.js'

test('Matt rejects unsupported platforms before resolving or opening programs', async () => {
  const calls = []
  const ctx = { get(name) {
    if (name === 'subprocess') return { resolveExecutable: async name => { calls.push(name); return name }, spawn: args => { calls.push(args); return {} } }
    if (name === 'fs') return {}
  } }
  for (const os of ['win32', 'linux', 'unknown']) {
    await assert.rejects(createPlatform(ctx, os), /platform unsupported/)
  }
  assert.deepEqual(calls, [])
})

test('Matt keeps macOS home paths and visible file and folder opening', async () => {
  const calls = []
  const fs = {}
  const ctx = { get(name) {
    if (name === 'fs') return fs
    if (name === 'subprocess') return { resolveExecutable: async name => name === 'open' ? '/usr/bin/open' : null, spawn: args => { calls.push(args.argv); return {} } }
  } }
  const platform = await createPlatform(ctx, 'darwin', { homedir: () => '/Users/Matt', env: {} })
  assert.equal(platform.os, 'darwin')
  assert.equal(platform.fs, fs)
  assert.equal(await platform.getHome(), '/Users/Matt')
  assert.equal(await platform.path.joinHome('Skills', 'Case.md'), '/Users/Matt/Skills/Case.md')
  assert.equal((await platform.openFolder('/Users/Matt/Project')).ok, true)
  assert.equal((await platform.openFile('/Users/Matt/Project/Case.md')).ok, true)
  assert.deepEqual(calls, [['/usr/bin/open', '/Users/Matt/Project'], ['/usr/bin/open', '/Users/Matt/Project/Case.md']])
})

test('macOS workspace keys preserve case and backslashes as filename characters', () => {
  const platform = { os: 'darwin', path: nodePath.posix }
  assert.equal(keyOf(' /Users/Matt/Folder\\Name// '), '/Users/Matt/Folder\\Name')
  assert.equal(normalizeWorkspacePath('/Users/Matt/Folder\\', platform), '/Users/Matt/Folder\\')
  assert.equal(parentWorkspaceDir('/Users/Matt/Folder\\Name/Sub'), '/Users/Matt/Folder\\Name')
  assert.equal(parentWorkspaceDir('/'), null)
  assert.equal(currentOs(), 'darwin')
})

test('workspace root anchoring retains a macOS filename containing a backslash', async () => {
  const platform = { os: 'darwin', path: nodePath.posix }
  const selected = '/Users/Matt/Folder\\Name/Sub'
  const root = '/Users/Matt/Folder\\Name'
  const fs = { lstat: async path => path === root + '/.git' ? { type: 'directory' } : null }
  assert.equal(await canonicalWorkspaceKey(selected, { getPlatform: async () => platform, getFs: () => fs }), root)
})

test('client workspace lookup preserves macOS path case and literal backslashes', async () => {
  const path = '/Users/Matt/Project\\Name'
  assert.equal(workspaceNormOf(path + '/'), path)
  const expected = { id: 'case-sensitive', path }
  const workspaces = { list: { getSnapshot: () => ({ items: [{ id: 'other', path: path.toLowerCase() }, expected] }) }, create() { throw new Error('must reuse registered workspace') } }
  assert.deepEqual(await resolveWorkspaceEntry(workspaces, path), { wid: 'case-sensitive', entry: expected })
})

test('Markdown paths retain macOS filename characters and public effort layout', async () => {
  const cwd = '/Users/Matt/Project\\Name'
  const ctx = { cwd }
  assert.equal(getRoot({ refId: 'Notes\\Current' }, ctx), cwd + '/Notes\\Current')
  assert.equal(mdPath({ refId: 'Notes\\Current' }, 'issue', '7', ctx), cwd + '/Notes\\Current/issues/07-untitled.md')
  assert.equal(await getScratchRoot(ctx), cwd + '/.scratch')
})

test('public platform composition also rejects unsupported adapter overrides', async () => {
  await assert.rejects(composePlatform({ get() {} }, 'linux', () => ({})), /platform unsupported/)
})

test('missing CLI guidance exposes only macOS installation without executing a command', async () => {
  const forbid = () => { throw new Error('no external command expected') }
  const flow = createPublishFlow({ DEFAULT_CWD: '/Users/Matt/Project', resolveGit: async () => '/mock/git', resolveGh: async () => null, getGhLastError: () => '', runGh: forbid, execProc: forbid })
  const host = await flow.handleInitPublish({ name: 'project' })
  assert.equal(host.errorKind, 'no-gh')
  for (const prompt of [host.prompt]) {
    assert.match(prompt, /brew install gh/)
    assert.doesNotMatch(prompt, /Windows|Linux|winget|scoop|apt install/)
  }

})

test('platform channel preserves the injected macOS service without another platform implementation', async () => {
  const platform = { os: 'darwin', path: nodePath.posix, getHome: async () => '/Users/Matt' }
  const ctx = { get: name => name === 'platform' ? platform : undefined }
  const channel = createPlatformChannel({ ctx })
  assert.equal(await channel.getPlatform(), platform)
})

test('registered skill source preserves a literal macOS backslash directory name', async () => {
  const sourcePath = '/Users/Matt/.agents/skills/Plan\\'
  const skills = { get: async () => ({ path: sourcePath }) }
  const ctx = { get: name => name === 'skills' ? skills : undefined }
  const platform = { os: 'darwin', path: nodePath.posix, getHome: async () => '/Users/Matt' }
  const probe = createSkillProbe({ ctx, getPlatform: async () => platform })
  const result = await probe.probeSkill('Plan', 'en')
  assert.equal(result.ok, true)
  assert.equal(result.sourcePath, sourcePath)
  assert.match(result.detail, /source:/)
})

test('platform channel refuses an explicitly unsupported injected platform', async () => {
  const platform = { os: 'win32', path: nodePath.posix, getHome: async () => '/Users/Matt' }
  const channel = createPlatformChannel({ ctx: { get: name => name === 'platform' ? platform : undefined } })
  await assert.rejects(channel.getPlatform(), /platform unsupported/)
})
