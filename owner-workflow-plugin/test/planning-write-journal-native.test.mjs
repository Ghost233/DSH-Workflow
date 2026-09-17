import test from 'node:test'
import assert from 'node:assert/strict'
import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { renameSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'
import { readPlanningWriteJournal } from '../src/planning-write-journal.mjs'
import { createPlanningNativeAgent } from './fixtures/planning-native-agent.mjs'
import { planningDocumentRuntime } from './fixtures/planning-document-runtime.mjs'

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function nativeModules(t) {
  const modules = [
    '../../deepseek-harness/vendor/cordis/lib/index.js',
    '../../deepseek-harness/packages/core/system-prompt/lib/index.js',
    '../../deepseek-harness/packages/core/tools/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-local/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-observation-policy/lib/index.js',
    '../../deepseek-harness/packages/fs/tool-fs/lib/index.js',
  ]
  for (const path of modules) {
    try { await access(new URL(path, import.meta.url)) } catch { t.skip('需要已构建的 deepseek-harness'); return }
  }
  return Promise.all(modules.map(path => import(path)))
}

async function fixture(t, { downstreamObservedFailure = false } = {}) {
  const modules = await nativeModules(t)
  if (modules === undefined) return undefined
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  const root = await mkdtemp(join(tmpdir(), 'dsh-planning-write-journal-'))
  const ctx = new Context()
  const fibers = []
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  fibers.push(await ctx.plugin(SystemPrompt.default))
  fibers.push(await ctx.plugin(Tools.default))
  fibers.push(await ctx.plugin(LocalFs.default, { cwd: root }))
  fibers.push(await ctx.plugin(FsPolicy))
  fibers.push(await ctx.plugin(ToolFs))
  const agent = await createPlanningNativeAgent(t, ctx, root, 'main-journal-agent')
  const runtime = planningDocumentRuntime(ctx, root, agent)
  const disposers = registerOrchestratorDocumentGuards(ctx, runtime)
  t.after(async () => { for (const dispose of disposers.toReversed()) await dispose?.() })
  t.after(ctx.tools.guard(exec => runtime.checkToolExecution(exec)))
  if (downstreamObservedFailure) {
    ctx.on('fs/observed', () => { throw new Error('downstream observation failure') }, { global: true })
  }
  let count = 0
  const call = (name, arguments_) => ctx.tools.execute({
    name,
    arguments: arguments_,
    agent,
    callId: `main-journal-${++count}`,
    signal: new AbortController().signal,
  })
  return { root, ctx, runtime, agent, call }
}

function byCall(journal, callId) {
  const found = journal.records.find(record => record.prepared?.call.callId === callId)
  assert.ok(found, `missing journal call ${callId}`)
  return found
}

test('真实 Harness create → read → edit 使用原生 CAS，写入不可消费的完整 native provenance 链', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, call } = value
  const filePath = join(root, 'docs/specs/topic/spec.md')
  const created = await call('write', { file_path: filePath, content: 'draft\n' })
  assert.equal(created.isError, false, JSON.stringify(created))
  assert.equal((await call('read', { file_path: filePath })).isError, false)
  const edited = await call('edit', { file_path: filePath, old_string: 'draft', new_string: 'ready' })
  assert.equal(edited.isError, false, JSON.stringify(edited))
  assert.equal(await readFile(filePath, 'utf8'), 'ready\n')

  const journal = await readPlanningWriteJournal({ root })
  assert.equal(journal.records.length, 2, 'read does not manufacture a write record')
  const create = byCall(journal, 'main-journal-1')
  const edit = byCall(journal, 'main-journal-3')
  assert.notEqual(create.journalId, edit.journalId)
  for (const record of [create, edit]) {
    assert.equal(record.prepared.call.agentId, 'main-journal-agent')
    assert.equal(record.prepared.call.sessionId, 'main-journal-agent')
    assert.equal(record.prepared.call.rootCallId, record.prepared.call.callId)
    assert.equal(record.terminal.status, 'native-observed')
    assert.equal(record.terminal.completeness, 'complete')
    assert.equal(record.checkpointEligible, false)
    assert.equal(record.terminal.checkpointEligible, false)
  }
  assert.deepEqual(create.prepared.finalIntent, { kind: 'createIfAbsent' })
  assert.equal(create.prepared.before.sha256, null)
  assert.equal(create.terminal.after.sha256, hash('draft\n'))
  assert.deepEqual(edit.prepared.finalIntent, { kind: 'replaceIfVersion', version: edit.prepared.before.version })
  assert.equal(edit.prepared.before.sha256, hash('draft\n'))
  assert.equal(edit.terminal.after.sha256, hash('ready\n'))
})

test('真实 CAS stale 在 prepared 后无同调用 observed，明确保留 unknown 而不把 isError 伪造成失败', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, ctx, call } = value
  const filePath = join(root, 'docs/specs/topic/stale.md')
  assert.equal((await call('write', { file_path: filePath, content: 'draft' })).isError, false)
  assert.equal((await call('read', { file_path: filePath })).isError, false)
  const nativeEdit = ctx.fs.editText.bind(ctx.fs)
  let intercepted = 0
  Object.defineProperty(ctx.fs, 'editText', { configurable: true, value: async (...args) => {
    intercepted += 1
    await writeFile(filePath, 'external replacement', 'utf8')
    return nativeEdit(...args)
  } })
  const stale = await call('edit', { file_path: filePath, old_string: 'draft', new_string: 'ready' })
  assert.equal(intercepted, 1)
  assert.equal(stale.isError, true)
  assert.equal(await readFile(filePath, 'utf8'), 'external replacement')
  const record = byCall(await readPlanningWriteJournal({ root }), 'main-journal-3')
  assert.equal(record.prepared.phase, 'prepared')
  assert.equal(record.terminal.status, 'unknown')
  assert.equal(record.terminal.reason, 'no-same-call-native-observation')
  assert.equal(record.terminal.checkpointEligible, false)
})

test('native success followed by downstream observed failure remains native-observed but incomplete', async t => {
  const value = await fixture(t, { downstreamObservedFailure: true })
  if (value === undefined) return
  const { root, call } = value
  const filePath = join(root, 'docs/specs/topic/downstream.md')
  const result = await call('write', { file_path: filePath, content: 'native bytes' })
  assert.equal(result.isError, true)
  assert.equal(await readFile(filePath, 'utf8'), 'native bytes')
  const record = byCall(await readPlanningWriteJournal({ root }), 'main-journal-1')
  assert.equal(record.terminal.status, 'native-observed')
  assert.equal(record.terminal.completeness, 'incomplete')
  assert.equal(record.terminal.checkpointEligible, false)
  assert.equal(record.terminal.after.sha256, hash('native bytes'))
})

test('相同真实 callId 的重放不会覆盖 prepared/terminal 或再次修改文档', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, agent, ctx, call } = value
  const filePath = join(root, 'docs/specs/topic/duplicate.md')
  assert.equal((await call('write', { file_path: filePath, content: 'first' })).isError, false)
  const replay = await ctx.tools.execute({
    name: 'write',
    arguments: { file_path: filePath, content: 'must not replace' },
    agent,
    callId: 'main-journal-1',
    signal: new AbortController().signal,
  })
  assert.equal(replay.isError, true)
  assert.equal(await readFile(filePath, 'utf8'), 'first')
  const journal = await readPlanningWriteJournal({ root })
  assert.equal(journal.records.length, 1)
  assert.equal(byCall(journal, 'main-journal-1').terminal.completeness, 'complete')
})

test('native 成功后 terminal 发布失败保留 prepared-only 与真实字节，不回滚或伪造 terminal', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, ctx, call } = value
  const outside = await mkdtemp(join(tmpdir(), 'dsh-planning-write-terminal-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const base = join(root, '.dsh-workflow', 'planning-write-journal')
  const terminal = join(base, 'terminal')
  const movedTerminal = join(base, 'terminal-before-publication')
  ctx.on('fs/observed', () => {
    renameSync(terminal, movedTerminal)
    symlinkSync(outside, terminal)
  }, { global: true })
  const filePath = join(root, 'docs/specs/topic/terminal-failure.md')
  const result = await call('write', { file_path: filePath, content: 'actual native bytes' })
  assert.equal(result.isError, true)
  assert.equal(await readFile(filePath, 'utf8'), 'actual native bytes')
  const prepared = JSON.parse(await readFile(join(base, 'prepared', `${hash('main-journal-1')}.json`), 'utf8'))
  assert.equal(prepared.phase, 'prepared')
  await assert.rejects(access(join(movedTerminal, `${hash('main-journal-1')}.json`)), { code: 'ENOENT' })
  const linkStat = await lstat(terminal)
  assert.equal(linkStat.isSymbolicLink(), true)
})

test('BOM 使原始字节与 decoded text 不可逆时保留 native-observed 但拒绝 complete', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, call } = value
  const filePath = join(root, 'docs/specs/topic/bom.md')
  await mkdir(join(root, 'docs/specs/topic'), { recursive: true })
  const original = Buffer.from('\ufeffdraft', 'utf8')
  await writeFile(filePath, original)
  assert.equal((await call('read', { file_path: filePath })).isError, false)
  assert.equal((await call('edit', { file_path: filePath, old_string: 'draft', new_string: 'ready' })).isError, false)
  const record = byCall(await readPlanningWriteJournal({ root }), 'main-journal-2')
  assert.equal(record.prepared.before.sha256, hash(original))
  assert.equal(record.prepared.before.rawRoundTrip, false)
  assert.equal(record.terminal.status, 'native-observed')
  assert.equal(record.terminal.completeness, 'incomplete')
  assert.equal(record.terminal.checkpointEligible, false)
})

test('越界文档和状态目录链接在原生 mutation 前拒绝，且没有额外文档权限或 journal 记录', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const { root, call } = value
  const codePath = join(root, 'src/code.mjs')
  const denied = await call('write', { file_path: codePath, content: 'blocked' })
  assert.equal(denied.isError, true)
  await assert.rejects(access(codePath), { code: 'ENOENT' })
  assert.equal((await readPlanningWriteJournal({ root })).records.length, 0)

  const outside = await mkdtemp(join(tmpdir(), 'dsh-planning-write-journal-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  await symlink(outside, join(root, '.dsh-workflow'))
  const document = join(root, 'docs/specs/topic/blocked.md')
  const unsafe = await call('write', { file_path: document, content: 'blocked' })
  assert.equal(unsafe.isError, true)
  await assert.rejects(access(document), { code: 'ENOENT' })
  const linkStat = await lstat(join(root, '.dsh-workflow'))
  assert.equal(linkStat.isSymbolicLink(), true)
})
