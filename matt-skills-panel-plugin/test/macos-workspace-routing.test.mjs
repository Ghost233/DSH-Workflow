import test from 'node:test'
import assert from 'node:assert/strict'
import nodePath from 'node:path'
import { isReusableBlank, absHandoffPath } from '../src/client/kernel/api-naming.js'
import { cwdBasename } from '../src/client/kernel/store-prefs.js'
import { repoShortName } from '../src/client/kernel/store-switch.js'
import { lcWorkspaceNameOf } from '../src/client/views/labels/labelColorErrors.js'
import { createWorkspaceCwd } from '../src/host/workspaceCwd.js'
import { withLabelColorsWriter } from '../src/tracker/rooms/markdown/label-colors.js'
import { createPickerShell } from '../src/host/pickerShell.js'
import { subwsMarkRootShown, subwsMarkRelOf } from '../src/client/views/SubworkspaceMark.js'
import { classifyError } from '../src/tracker/kernel/preflight.js'
import { classifyGhError } from '../src/tracker/rooms/github/errors.js'
import { classifyGlabError } from '../src/tracker/rooms/gitlab/errors.js'

test('session reuse and handoff paths retain macOS case and literal backslashes', () => {
  const cwd = '/Users/Matt/Project\\Name'
  const row = { blank: true, cwd, header: { agentPreset: 'ptc' } }
  assert.equal(isReusableBlank(row, cwd), true)
  assert.equal(isReusableBlank(row, cwd.toLowerCase()), false)
  assert.equal(absHandoffPath('/Users/Matt/Project\\', 'handoff.md'), '/Users/Matt/Project\\/.scratch/handoff/handoff.md')
  for (const name of [cwdBasename(cwd), repoShortName({ name: cwd }), lcWorkspaceNameOf(cwd)]) assert.equal(name, 'Project\\Name')
})

test('workspace label operations select the exact macOS session policy', async () => {
  for (const [cwd, other] of [['/Users/Matt/Case', '/Users/Matt/case'], ['/Users/Matt/Folder\\Name', '/Users/Matt/Folder/Name']]) {
    let context
    const sessions = { list: () => [{ id: 'exact', header: { cwd } }, { id: 'other', header: { cwd: other } }] }
    const sandboxPolicy = { resolve: ({ session }) => ({ sourceSession: session.id }) }
    const ctx = { get: name => ({ sessions, sandboxPolicy })[name] }
    const tracker = { setLabelColors: async (_repo, _changes, op) => { context = op; return { ok: true, data: { applied: [], failed: [] } } } }
    const registry = { has: id => id === 'markdown', select: async () => ({ backendId: 'markdown' }), get: () => tracker, describe: () => ({ backend: 'markdown', refId: cwd }) }
    const platform = { os: 'darwin', path: nodePath.posix }
    const api = createWorkspaceCwd({ ctx, DEFAULT_CWD: cwd, canonicalKey: async path => path, getPlatform: async () => platform, getTrackerRegistry: async () => registry,
      openSession: async (openedCwd, options) => {
        assert.equal(openedCwd, cwd)
        assert.equal(options.write, true)
        assert.equal(options.resolveSelection().backendId, 'markdown')
        return { ok: true, canWrite: true, repoRef: registry.describe(), call: fn => fn(tracker, {}) }
      }, getDecisionFn: async () => ({ decideBackend() {} }), getDetectionService: async () => ({ detect: async () => ({ outlet: { backendId: 'markdown', canWrite: true } }) }) })
    assert.equal((await api.handleSetLabelColors({ cwd, changes: [] })).ok, true)
    assert.equal(context.sessionId, 'exact')
    assert.deepEqual(context.sandboxPolicy, { sourceSession: 'exact' })
  }
})

test('different macOS workspace spellings do not share the label writer queue', async () => {
  for (const [cwd, other] of [['/Users/Matt/Case', '/Users/Matt/case'], ['/Users/Matt/Folder\\Name', '/Users/Matt/Folder/Name']]) {
    let release
    const barrier = new Promise(resolve => { release = resolve })
    const first = withLabelColorsWriter({ cwd }, null, () => barrier)
    let secondEntered = false
    const second = withLabelColorsWriter({ cwd: other }, null, () => { secondEntered = true })
    try {
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
      assert.equal(secondEntered, true)
    } finally { release(); await Promise.all([first, second]) }
  }
})

test('same macOS workspace still serializes label changes across trailing slashes', async () => {
  let release
  const barrier = new Promise(resolve => { release = resolve })
  const events = []
  const first = withLabelColorsWriter({ cwd: '/Users/Matt/Same' }, null, async () => { events.push('first'); await barrier; events.push('released') })
  const second = withLabelColorsWriter({ cwd: '/Users/Matt/Same/' }, null, () => { events.push('second') })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(events, ['first'])
  release(); await Promise.all([first, second])
  assert.deepEqual(events, ['first', 'released', 'second'])
})

test('picker file URLs retain their absolute macOS path including colon filenames', async () => {
  const calls = []
  const platform = { path: nodePath.posix, openFile: async path => { calls.push(path); return { ok: true } }, openFolder: async path => { calls.push(path); return { ok: true } } }
  const picker = createPickerShell({ DEFAULT_CWD: '/Users/Matt', getPlatform: async () => platform })
  assert.equal((await picker.handleOpenPath({ path: 'file:///Users/Matt/Folder%5CName/file.md' })).ok, true)
  assert.equal((await picker.handleOpenPath({ path: 'file:///D:/file.md' })).ok, true)
  assert.deepEqual(calls, ['/Users/Matt/Folder\\Name/file.md', '/D:/file.md'])
})

test('CLI failure classification retains POSIX and network/auth contracts without CMD error compatibility', () => {
  for (const classify of [classifyError, classifyGhError, classifyGlabError]) {
    // GitLab now returns the classification with its fallback metadata.
    const kind = text => { const result = classify(text); return typeof result === 'string' ? result : result.kind }
    assert.equal(kind('command not found'), 'env')
    assert.equal(kind('ENOENT'), 'env')
    assert.equal(kind('permission denied'), 'auth')
    assert.equal(kind('connection timed out'), 'network')
    assert.equal(kind("'glab' is not recognized as an internal or external command"), 'network')
  }
})

test('subworkspace display preserves macOS literal backslash segments', () => {
  const root = '/Users/Matt'
  const cwd = '/Users/Matt/Project\\Name/Sub'
  assert.equal(subwsMarkRootShown(root, cwd), root)
  assert.equal(subwsMarkRelOf(root, cwd), 'Project\\Name › Sub')
  assert.equal(subwsMarkRelOf('/Users/Matt/Project', '/Users/Matt/ProjectOther/Sub'), 'Users › Matt › ProjectOther › Sub')
})
