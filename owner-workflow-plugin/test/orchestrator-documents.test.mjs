import test from 'node:test'
import assert from 'node:assert/strict'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { ORCHESTRATOR_DOCUMENT_GUIDANCE, orchestratorDocumentPath, registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

test('主线程提示要求正式 planning 文档封套，并只通过零参数 finalizer 建立检查点', () => {
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /DSH_PLANNING_DOCUMENT_V1/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /workflow_planning_finalize/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /不得手写或传入 manifest、chains/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /所有 id 与 revision 都是非空字符串/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /先用原生 read.*再用原生 edit/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /write 只可用于确认不存在的新文件/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /Glob 必须指定项目相对的窄目录 path/u)
  assert.match(ORCHESTRATOR_DOCUMENT_GUIDANCE, /缺失的预期文档目录代表暂无记录/u)
})

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-main-docs-'))
  const root = join(parent, 'project')
  const catalog = join(parent, 'catalog')
  await mkdir(root)
  await mkdir(catalog)
  const host = await kernelNativeHost(root, { executable: true, filesystem: true, persistenceRoot: join(parent, 'sessions') })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: catalog })
  await runtime.ready
  const disposers = kernelToolDefinitions(runtime).map(definition => host.parent.agent.ctx.tools.register(definition))
  disposers.push(...registerOrchestratorDocumentGuards(host.ctx, runtime))
  disposers.push(host.ctx.tools.guard(execution => runtime.checkToolExecution(execution)))
  t.after(async () => {
    const errors = []
    for (const dispose of disposers.toReversed()) {
      try { await dispose() } catch (error) { errors.push(error) }
    }
    for (const dispose of [() => runtime.dispose(), () => host.close(), () => rm(parent, { recursive: true, force: true })]) {
      try { await dispose() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) throw new AggregateError(errors, '文档测试资源清理失败')
  })
  let count = 0
  const call = (name, arguments_) => host.ctx.tools.execute({ name, arguments: arguments_, agent: host.parent.agent,
    callId: `orchestrator-document-${++count}`, signal: new AbortController().signal })
  const execution = (file, name = 'write', extra = {}) => ({ agent: host.parent.agent, name,
    arguments: { file_path: join(root, file), ...extra } })
  return { parent, root, ctx: host.ctx, runtime, agent: host.parent.agent, call, execution }
}

async function pathFixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-main-doc-paths-'))
  const root = join(parent, 'project')
  await mkdir(root)
  t.after(() => rm(parent, { recursive: true, force: true }))
  return { parent, root }
}

test('主线程指引中的默认文档与 Ticket 搜索示例均属于真实允许写入范围', async t => {
  const { root } = await pathFixture(t)
  const defaults = ORCHESTRATOR_DOCUMENT_GUIDANCE.split('\n').find(line => line.includes('默认使用'))
  const paths = [...defaults.split('默认使用')[1].split('；')[0].matchAll(/[A-Za-z][A-Za-z0-9/<>\u4e00-\u9fff-]*\.md/g)].map(match => match[0].trim())
  assert.equal(paths.length, 3)
  const searchPaths = [...ORCHESTRATOR_DOCUMENT_GUIDANCE.matchAll(/path:"([^".][^"]*)"/g)].map(match => `${match[1]}/example.md`)
  for (const template of [...paths, ...searchPaths]) {
    const filePath = template.replace(/<[^>]+>/g, 'example')
    assert.ok(orchestratorDocumentPath({ root, cwd: root, filePath }), template)
  }
  for (const filePath of ['tickets/T-01.md', 'progress.md']) {
    assert.equal(orchestratorDocumentPath({ root, cwd: root, filePath }), undefined, 'root write boundary is unchanged')
  }
})

test('主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行', async t => {
  const { root, call } = await fixture(t)
  for (const file of ['CONTEXT.md', 'CONTEXT-MAP.md', 'docs/adr/0001.md', 'docs/specs/feature/spec.md',
    'docs/specs/feature/tickets/T-01.md', 'docs/specs/feature/progress.md']) {
    const file_path = join(root, file)
    const created = await call('write', { file_path, content: 'draft' })
    assert.equal(created.isError, false, `${file}: ${JSON.stringify(created)}`)
    assert.equal((await call('read', { file_path })).isError, false, file)
    const edited = await call('edit', { file_path, old_string: 'draft', new_string: 'ready' })
    assert.equal(edited.isError, false, `${file}: ${JSON.stringify(edited)}`)
    assert.equal(await readFile(file_path, 'utf8'), 'ready')
    await writeFile(file_path, 'external edit')
    const stale = await call('edit', { file_path, old_string: 'ready', new_string: 'stale' })
    assert.equal(stale.isError, true, `${file}: native observation must reject a stale edit`)
    assert.equal(await readFile(join(root, file), 'utf8'), 'external edit')
  }
  await writeFile(join(root, 'docs/specs/unread.md'), 'existing, unread')
  assert.equal((await call('write', { file_path: join(root, 'docs/specs/unread.md'), content: 'overwrite' })).isError, true)
  assert.equal(await readFile(join(root, 'docs/specs/unread.md'), 'utf8'), 'existing, unread')
})

test('冻结只读审核允许后继文档编辑，修改用户 checkout 的动作仍阻止并发写入', async t => {
  const { root, runtime, call, agent } = await fixture(t)
  const file_path = join(root, 'docs/specs/feature/spec.md')
  assert.equal((await call('write', { file_path, content: 'R1' })).isError, false)
  const { result: workflowId } = await runtime.store.transact({ type: 'workflow.create', id: 'planning-wf', root,
    rootSessionId: agent.id, request: 'Keep frozen sources stable', baseCommit: 'base' })
  const { result: actionId } = await runtime.store.transact({ type: 'action.enqueue', workflowId, kind: 'review_plan', key: 'R1', input: {} })
  await call('read', { file_path })
  const edited = await call('edit', { file_path, old_string: 'R1', new_string: 'R2' })
  assert.equal(edited.isError, false)
  assert.equal(await readFile(file_path, 'utf8'), 'R2')
  assert.equal(await runtime.withPlanningSourceWrite(agent, async () => 'short checkpoint lease'), 'short checkpoint lease')
  await runtime.store.transact({ type: 'action.claim', actionId, token: 'review', hostId: 'test' })
  await runtime.store.transact({ type: 'action.failed', actionId, token: 'review', reason: 'report rejected' })
  assert.equal((await call('edit', { file_path, old_string: 'R2', new_string: 'R3' })).isError, false,
    'an uncertain read-only reviewer retains its frozen source instead of holding the authoring checkout')
  const plan = normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Document checkout mutation fixture',
    owners: [{ id: 'docs', name: 'Docs', description: 'Documentation module', scope: ['docs/**'], exclude: [] }],
    tasks: [{ id: 'docs-task', title: 'docs-task', role: 'work', ownerId: 'docs', dependsOn: [], resources: [],
      write: ['docs/**'], verify: ['unit'], done: ['Documentation contract remains valid.'] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
  })
  await runtime.store.transact({
    type: 'plan.propose', workflowId, parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'fixture' },
    sources: { snapshotDigest: 'checkout-source', codeBaseline: { sourceHead: 'base', checkpointCommit: 'checkout-change' } },
    review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: '/review' },
  })
  const mutator = Object.values((await runtime.store.read()).actions).find(action => action.kind === 'prepare_revision')
  assert.equal(mutator.input.checkpointCommit, 'checkout-change', 'the engine derives the checkout mutator from accepted sources')
  const rejected = await call('edit', { file_path, old_string: 'R3', new_string: 'R4' })
  assert.equal(rejected.isError, true)
  assert.match(JSON.stringify(rejected), /Project checkout is being changed/)
  assert.equal(await readFile(file_path, 'utf8'), 'R3')
  await assert.rejects(runtime.withPlanningSourceWrite(agent, () => assert.fail('checkout mutation must not start')), /Project checkout is being changed/)
})

test('文档例外不放开代码、治理文件、状态和其他写入工具', async t => {
  const { root, runtime, call, execution } = await fixture(t)
  for (const file of ['README.md', 'src/app.mjs', 'docs/other.md', 'docs/specs/run.js',
    'docs/specs/AGENTS.md', 'docs/adr/CLAUDE.md', 'docs/specs/SKILL.md',
    'docs/specs/.codex/policy.md', '.owner-workflow/owners.md', '.dsh-workflow/state.md', '.git/config',
    'docs/superpowers/specs/design.md', 'docs/superpowers/plans/plan.md',
    'docs/analysis/session/discussion-record.md', '.scratch/feature/issues/T-01.md',
    '.scratch/feature/other.md', 'docs/specs/../../src/app.md']) {
    const actor = execution(file)
    assert.match(runtime.checkToolExecution(actor), /planning documents/, file)
    const result = await call('write', { file_path: actor.arguments.file_path, content: 'blocked' })
    assert.equal(result.isError, true, `${file}: ${JSON.stringify(result)}`)
  }
  for (const name of ['bash', 'pwsh', 'apply_patch', 'str_replace_editor', 'mcp__filesystem__write_file']) {
    assert.match(runtime.checkToolExecution(execution('CONTEXT.md', name)), /Owner task in the controlled Workflow/)
  }
  assert.match(runtime.checkToolExecution({ ...execution('CONTEXT.md'), arguments: {} }), /planning documents/)
})

test('解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入', async t => {
  const { root, ctx, runtime, call, execution } = await fixture(t)
  const actor = execution('docs/specs/spec.md')
  assert.equal(runtime.checkToolExecution(actor), undefined)
  assert.match(runtime.checkToolExecution({ ...actor, name: 'custom_writer' }), /Owner task in the controlled Workflow/)
  const drift = runtime.checkFilesystemWrite({ displayPath: actor.arguments.file_path,
    targetKey: join(root, 'src/code.md') }, actor, ctx)
  assert.equal(drift.kind, 'deny', 'the native resolved target wins over a forged display path')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await symlink(join(root, 'src'), join(root, 'docs/specs'))
  const target = join(root, 'docs/specs/spec.md')
  const result = await call('write', { file_path: target, content: 'blocked' })
  assert.equal(result.isError, true, JSON.stringify(result))
  await assert.rejects(readFile(join(root, 'src/spec.md')), { code: 'ENOENT' })
})

test('路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标', async t => {
  const { parent, root } = await pathFixture(t)
  const check = filePath => orchestratorDocumentPath({ root, cwd: root, filePath })
  assert.equal(check('CONTEXT.md'), join(await realpath(root), 'CONTEXT.md'))
  assert.equal(check(join(parent, 'other/docs/specs/spec.md')), undefined)
  assert.equal(check('docs/specs/../specs/spec.md'), undefined)
  assert.equal(check('docs\\specs\\spec.md'), undefined)
  await mkdir(join(root, 'docs/specs'), { recursive: true })
  await writeFile(join(root, 'source'), 'code')
  await link(join(root, 'source'), join(root, 'docs/specs/hard.md'))
  await symlink(join(parent, 'missing'), join(root, 'docs/specs/dangling.md'))
  await symlink(join(root, 'source'), join(root, 'docs/specs/soft.md'))
  await mkdir(join(root, 'docs/specs/directory.md'))
  for (const file of ['hard.md', 'dangling.md', 'soft.md', 'directory.md']) assert.equal(check(`docs/specs/${file}`), undefined)
  const alias = join(parent, 'alias')
  await symlink(root, alias)
  assert.equal(orchestratorDocumentPath({ root: alias, cwd: alias, filePath: join(alias, 'CONTEXT.md') }), join(await realpath(root), 'CONTEXT.md'))
  assert.equal(orchestratorDocumentPath({ root, cwd: join(root, 'docs'), filePath: 'specs/new.md' }), join(await realpath(root), 'docs/specs/new.md'))
  assert.equal(orchestratorDocumentPath({ root, cwd: parent, filePath: join(root, 'CONTEXT.md') }), undefined)
})

// Native root binding and unrelated-root exclusion are covered by kernel-root-scope.test.mjs.
// Owner source authority is covered by native-owner-kernel.test.mjs, and the read-only
// process boundary is covered by native-kernel-effects.test.mjs; no legacy role maps are fixtures here.

test('真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝', async t => {
  const { parent, root } = await pathFixture(t)
  const canonicalRoot = await realpath(root)
  const alias = join(parent, 'project-alias')
  await symlink(canonicalRoot, alias)
  await mkdir(join(root, 'docs/specs'), { recursive: true })
  const check = (cwd, filePath) => orchestratorDocumentPath({ root: canonicalRoot, cwd, filePath })
  const target = join(canonicalRoot, 'docs/specs/spec.md')
  assert.equal(check(alias, join(alias, 'docs/specs/spec.md')), target)
  assert.equal(check(join(alias, 'docs'), join(alias, 'docs/specs/spec.md')), target)
  assert.equal(check(join(alias, 'docs'), 'specs/spec.md'), target)
  assert.equal(check(alias, target), target)

  await symlink(canonicalRoot, join(root, 'self'))
  await symlink(join(canonicalRoot, 'docs/specs'), join(root, 'docs/shortcut'))
  await symlink(join(parent, 'missing'), join(root, 'docs/specs/dangling.md'))
  await writeFile(join(root, 'source'), 'code')
  await link(join(root, 'source'), join(root, 'docs/specs/hard.md'))
  for (const file of ['self/docs/specs/spec.md', 'docs/shortcut/spec.md', 'docs/specs/dangling.md',
    'docs/specs/hard.md', 'docs/specs/AGENTS.md', 'docs/analysis/report.md',
    'docs/superpowers/specs/spec.md', 'docs/superpowers/plans/plan.md', '.scratch/topic/issues/T-01.md']) {
    assert.equal(check(alias, join(alias, file)), undefined, file)
  }
  assert.equal(check(join(alias, 'docs/shortcut'), 'spec.md'), undefined, 'relative cwd must not hide an internal link')
  assert.equal(check(join(alias, 'self'), 'docs/specs/spec.md'), undefined, 'self link must not become a new root')
  assert.equal(check(alias, join(parent, 'sibling/docs/specs/spec.md')), undefined)
})
