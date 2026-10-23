import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { stripTimeConfigRefs } from '../scripts/lib/transpile-unit.mts'

function clientModule(path, globals = {}) {
  const source = stripTimeConfigRefs(readFileSync(new URL(`../src/client/${path}`, import.meta.url), 'utf8'))
  const { code } = transformSync(source, { loader: path.endsWith('.ts') ? 'ts' : 'js', format: 'cjs', target: 'es2020' })
  const exports = {}, context = { exports, module: { exports }, ...globals }
  vm.runInNewContext(code, context, { filename: path })
  return context.module.exports
}

test('client fallback routing keeps distinct macOS case and literal backslashes', () => {
  const { workspaceNormOf } = clientModule('kernel/api-workspace.ts')
  const { absHandoffPath, isReusableBlank } = clientModule('kernel/api-naming.ts')
  const cwd = '/Users/Matt/Folder\\Name'
  assert.equal(workspaceNormOf(cwd + '//'), cwd)
  assert.notEqual(workspaceNormOf(cwd), workspaceNormOf(cwd.toLowerCase()))
  assert.notEqual(workspaceNormOf(cwd), workspaceNormOf('/Users/Matt/Folder/Name'))
  assert.equal(absHandoffPath(cwd, 'handoff.md'), cwd + '/.scratch/handoff/handoff.md')
  const row = { blank: true, cwd, header: { agentPreset: 'ptc' } }
  assert.equal(isReusableBlank(row, cwd), true)
  assert.equal(isReusableBlank(row, cwd.toLowerCase()), false)
})

test('the new workspace overview groups roots while preserving macOS filename characters', () => {
  const { computeWsOverviewRows, wsDisplayOf } = clientModule('views/SettingsWorkspaces.ts')
  const root = '/Users/Matt/Folder\\Name'
  const paths = [root, root + '/sub', '/Users/Matt/folder\\Name', '/Users/Matt/Folder/Name']
  const result = computeWsOverviewRows(paths, { [root]: { backendId: 'github', source: 'explicit' } }, {
    normKeyOf: value => value,
    rootKeyOf: value => value === root || value.startsWith(root + '/') ? root : value,
    resolveRoot: value => value,
    modulesOrder: ['github'],
  })
  assert.equal(result.total, 3)
  assert.equal(result.boundCount, 1)
  assert.equal(result.rows[0].cwd, root)
  assert.deepEqual(Array.from(result.rows[0].members), [root, root + '/sub'])
  assert.equal(wsDisplayOf(root, 1), 'Folder\\Name')
})

function skillClient(reply) {
  return clientModule('views/skillDetail/PixelSkillOps.ts', {
    host: { call: (_method, args) => Promise.resolve(reply(args)) },
    setTimeout, clearTimeout, SKILL_SKELETON_DELAY_MS: 2000,
    tr: key => key,
  })
}

test('provider skill details pass cwd and keep their cache within each workspace', async () => {
  const calls = []
  const api = skillClient(args => { calls.push(args); return { ok: true, md: args.cwd, path: args.cwd + '/SKILL.md' } })
  const first = { cwd: '/Users/Matt/Case' }, second = { cwd: '/Users/Matt/case' }
  api.pixelOpenDetail(first, 'pr', {})
  await Promise.resolve()
  api.pixelOpenDetail(second, 'pr', {})
  await Promise.resolve()
  assert.equal(first.pixelDetail.mdEn, first.cwd)
  assert.equal(second.pixelDetail.mdEn, second.cwd)
  assert.deepEqual(calls.map(row => row.cwd), [first.cwd, second.cwd])
  api.pixelOpenDetail(first, 'pr', {})
  assert.equal(calls.length, 2)
  assert.equal(first.pixelDetail.phase, 'ready')
})

test('provider failure offers retry while an explicitly missing document stays missing', async () => {
  let response = { ok: false, missing: false }
  const api = skillClient(() => response), store = { cwd: '/Users/Matt/Project' }
  api.pixelOpenDetail(store, 'pr', {})
  await Promise.resolve()
  assert.equal(store.pixelDetail.isMissing, false)
  assert.equal(store.pixelDetail.phase, 'error')
  response = { ok: true, md: '# PR', path: '/Users/Matt/Project/pr/SKILL.md' }
  api.pixelRetryDetail(store)
  await Promise.resolve()
  assert.equal(store.pixelDetail.phase, 'ready')
  response = { ok: false, missing: true }
  api.pixelOpenDetail(store, 'absent', {})
  await Promise.resolve()
  assert.equal(store.pixelDetail.isMissing, true)
})

test('the derived update entry cannot mount the npm updater', () => {
  const source = readFileSync(new URL('../src/client/views/UpdateEntryHost.ts', import.meta.url), 'utf8')
  const { code } = transformSync(source, { loader: 'ts', format: 'iife', globalName: 'workflowUpdater' })
  const result = vm.runInNewContext(code + '\nworkflowUpdater.UpdateEntryHost()', {
    get React() { assert.fail('the disabled updater must not mount a component') },
    get __DshUpdateEntry() { assert.fail('the disabled updater must not load the npm update entry') },
  })
  assert.equal(result, null)
})
