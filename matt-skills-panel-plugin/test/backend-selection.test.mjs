import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceCwd } from '../src/host/workspaceCwd.js'
import * as decision from '../src/tracker/detection/backendDecision.js'
import path from 'node:path'

function fixture(choice) {
  const cwd = '/Users/Matt/GhostCodexInspect'
  let selected = choice, reads = 0, preflights = 0, matches = 0
  const fs = {
    resolve: async (file, options) => path.posix.resolve(options?.cwd || cwd, file),
    readText: async file => {
      reads++
      if (file === cwd + '/docs/agents/workspace.yaml' && selected) return JSON.stringify({ version: 2, backendId: selected, pickedAt: 2, source: 'user' })
      if (file === cwd + '/docs/agents/issue-tracker.md') return '# Issue 跟踪器：GitHub\n\n工单保存在 GitHub Issues，使用 gh CLI。'
      throw new Error('ENOENT')
    },
    listDir: async () => [{ name: 'docs' }],
  }
  const platform = { fs, path: path.posix }
  const registry = {
    has: id => ['github', 'markdown'].includes(id),
    describe: (_handle, id) => ({ backend: id, refId: cwd }),
    select: async () => { matches++; return { backendId: null, source: 'fallback' } },
    get: () => ({ preflight: async () => { preflights++; return { ok: true } } }),
    preflight: async () => { preflights++; return { ok: true } },
  }
  const api = createWorkspaceCwd({ ctx: { get: () => fs }, DEFAULT_CWD: '', canonicalKey: async value => value,
    getPlatform: async () => platform, getTrackerRegistry: async () => registry, getDecisionFn: async () => decision })
  return { api, cwd, select: value => { selected = value }, counts: () => ({ preflights, matches }), reads: () => reads }
}

test('the fast selection endpoint honors standard Matt GitHub initialization without preflight or a second backend choice', async () => {
  const f = fixture()
  const result = await f.api.handleSelection({ cwd: f.cwd })
  assert.equal(result.ok, true)
  assert.equal(result.selection.backendId, 'github')
  assert.equal(result.selection.source, 'explicit')
  assert.deepEqual(f.counts(), { preflights: 0, matches: 0 })
})

test('the fast selection endpoint reads the saved workspace-file choice ahead of the declaration and sees edits immediately', async () => {
  const f = fixture('markdown')
  const result = await f.api.handleSelection({ cwd: f.cwd })
  assert.equal(result.selection.backendId, 'markdown')
  assert.equal(result.selection.source, 'explicit')
  f.select('github')
  assert.equal((await f.api.handleSelection({ cwd: f.cwd })).selection.backendId, 'github')
  assert.deepEqual(f.counts(), { preflights: 0, matches: 0 })
})

test('the fast selection endpoint leaves an unknown workspace unselected without reading another directory', async () => {
  const f = fixture('markdown')
  const result = await f.api.handleSelection({ cwd: '   ' })
  assert.equal(result.selection.backendId, null)
  assert.equal(result.selection.reason, 'workspace-not-ready')
  assert.equal(f.reads(), 0)
  assert.deepEqual(f.counts(), { preflights: 0, matches: 0 })
})

import { execFileSync } from 'node:child_process'
import { mkdtemp, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('the exportable package includes every built-in backend and its real dependencies', async t => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const plugin = 'matt-skills-panel-plugin/'
  // TS/YAML inputs are committed; the standard build creates the complete runtime tree.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', plugin + 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  for (const id of ['github', 'gitlab', 'markdown']) assert.ok(files.includes(plugin + `src/tracker/rooms/${id}/index.ts`))
  const snapshot = await mkdtemp(path.join(tmpdir(), 'matt-exported-backends-'))
  t.after(() => rm(snapshot, { recursive: true, force: true }))
  await cp(fileURLToPath(new URL('../package/', import.meta.url)), snapshot, { recursive: true })
  for (const [id, exported] of [['github', 'githubModule'], ['gitlab', 'gitlabBackend'], ['markdown', 'markdownModule']]) {
    const module = await import(pathToFileURL(path.join(snapshot, 'tracker/rooms', id, 'index.js')).href)
    assert.equal(module[exported].id, id)
  }
  await import(pathToFileURL(path.join(snapshot, 'lib/logFromPackage.js')).href)
})
