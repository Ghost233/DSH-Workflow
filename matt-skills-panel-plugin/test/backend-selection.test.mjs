import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceCwd } from '../src/host/workspaceCwd.js'
import { createDetectionService } from '../src/host/tracker/detection/detectionService.js'
import path from 'node:path'

function fixture(choice) {
  const cwd = '/Users/Matt/GhostCodexInspect'
  const fs = {
    resolve: async (file, options) => path.posix.resolve(options?.cwd || cwd, file),
    readText: async file => {
      if (file === cwd + '/docs/agents/issue-tracker.md') return '# Issue 跟踪器：GitHub\n\n工单保存在 GitHub Issues，使用 gh CLI。'
      throw new Error('ENOENT')
    },
    listDir: async () => [{ name: 'docs' }],
  }
  const platform = { fs, path: path.posix }
  let preflights = 0, matches = 0
  const registry = {
    has: id => ['github', 'markdown'].includes(id), bound: () => undefined,
    describe: (_handle, id) => ({ backend: id, refId: cwd }),
    select: async () => { matches++; return { backendId: null, source: 'fallback' } },
    get: () => ({ preflight: async () => { preflights++; return { ok: true } } }),
    preflight: async () => { preflights++; return { ok: true } },
  }
  const detection = createDetectionService({ registry, getPlatform: async () => platform,
    getChoiceStore: async () => ({ getWorkspace: async () => choice ? { ok: true, found: true, backendId: choice, rev: 2 } : { ok: true, found: false } }) })
  const api = createWorkspaceCwd({ ctx: { get: () => fs }, DEFAULT_CWD: cwd, canonicalKey: async value => value,
    getPlatform: async () => platform, getTrackerRegistry: async () => registry, getDetectionService: async () => detection })
  return { api, cwd, counts: () => ({ preflights, matches }) }
}

test('the fast selection endpoint honors standard Matt GitHub initialization without preflight or a second backend choice', async () => {
  const f = fixture()
  const result = await f.api.handleSelection({ cwd: f.cwd })
  assert.equal(result.ok, true)
  assert.equal(result.selection.backendId, 'github')
  assert.equal(result.selection.source, 'explicit')
  assert.deepEqual(f.counts(), { preflights: 0, matches: 0 })
})

test('the fast selection endpoint preserves the same saved user choice precedence as normal detection', async () => {
  const f = fixture('markdown')
  const result = await f.api.handleSelection({ cwd: f.cwd })
  assert.equal(result.selection.backendId, 'markdown')
  assert.equal(result.selection.rev, 2)
  assert.deepEqual(f.counts(), { preflights: 0, matches: 0 })
})

import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('the exportable source tree includes every built-in backend and its real dependencies', async t => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const plugin = 'matt-skills-panel-plugin/'
  // Simulate the source that can reach a fresh checkout; ignored workstation files cannot hide missing modules.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', plugin + 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  const snapshot = await mkdtemp(path.join(tmpdir(), 'matt-exported-backends-'))
  t.after(() => rm(snapshot, { recursive: true, force: true }))
  await writeFile(path.join(snapshot, 'package.json'), '{"type":"module"}')
  for (const file of files) {
    const target = path.join(snapshot, file.slice(plugin.length))
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(root, file), target)
  }
  for (const [id, exported] of [['github', 'githubModule'], ['gitlab', 'gitlabBackend'], ['markdown', 'markdownModule']]) {
    const module = await import(pathToFileURL(path.join(snapshot, 'src/host/tracker/backends', id, 'index.js')).href)
    assert.equal(module[exported].id, id)
  }
  await import(pathToFileURL(path.join(snapshot, 'src/host/logPkg/host.js')).href)
})
