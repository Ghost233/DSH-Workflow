import test from 'node:test'
import assert from 'node:assert/strict'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { orchestratorDocumentPath, registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-main-docs-'))
  const root = join(parent, 'project')
  await mkdir(root)
  const runtime = createOwnerWorkflowRuntime({}, {})
  const agent = { id: 'main-docs', session: { header: { cwd: root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
  runtime.orchestratorRoots.set(agent.id, root)
  t.after(async () => { await runtime.dispose(); await rm(parent, { recursive: true, force: true }) })
  const call = (file, name = 'write', extra = {}) => ({ agent, name, arguments: { file_path: join(root, file), ...extra } })
  return { parent, root, runtime, agent, call }
}

test('主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行', async t => {
  const { root, runtime, call } = await fixture(t)
  const hooks = new Map()
  const disposers = registerOrchestratorDocumentGuards({
    fs: { processPath: target => target.targetKey },
    on(event, callback, options) { assert.deepEqual(options, { global: true, prepend: true }); hooks.set(event, callback); return () => hooks.delete(event) },
  }, runtime)
  for (const file of ['CONTEXT.md', 'CONTEXT-MAP.md', 'docs/adr/0001.md', 'docs/specs/feature/spec.md',
    'docs/specs/feature/tickets/T-01.md', 'docs/specs/feature/progress.md']) {
    const actor = call(file)
    assert.equal(runtime.checkToolExecution(actor), undefined, file)
    const target = { targetKey: actor.arguments.file_path, displayPath: file }
    const createIntent = { kind: 'create' }
    assert.equal(await hooks.get('fs/write-intent')(target, actor, () => createIntent), createIntent)
    await mkdir(join(actor.arguments.file_path, '..'), { recursive: true })
    await writeFile(actor.arguments.file_path, 'draft')
    actor.name = 'edit'
    assert.equal(runtime.checkToolExecution(actor), undefined)
    const editIntent = { version: 'observed-version' }
    assert.equal(await hooks.get('fs/edit-intent')(target, actor, () => editIntent), editIntent)
    await assert.rejects(async () => hooks.get('fs/edit-intent')(target, actor, () => { throw new Error('stale observation') }), /stale observation/)
    assert.equal(await readFile(join(root, file), 'utf8'), 'draft')
  }
  for (const dispose of disposers) dispose()
  assert.equal(hooks.size, 0)
})

test('文档例外不放开代码、治理文件、状态、升级参数和其他写入工具', async t => {
  const { root, runtime, call } = await fixture(t)
  for (const file of ['README.md', 'src/app.mjs', 'docs/other.md', 'docs/specs/run.js',
    'docs/specs/AGENTS.md', 'docs/adr/CLAUDE.md', 'docs/specs/SKILL.md',
    'docs/specs/.codex/policy.md', '.owner-workflow/owners.md', '.dsh-workflow/state.md', '.git/config',
    'docs/superpowers/specs/design.md', 'docs/superpowers/plans/plan.md',
    'docs/analysis/session/discussion-record.md', '.scratch/feature/issues/T-01.md',
    '.scratch/feature/other.md', 'docs/specs/../../src/app.md']) {
    assert.match(runtime.checkToolExecution(call(file)), /主会话不能直接调用/, file)
    assert.equal(runtime.checkFilesystemWrite({ displayPath: join(root, file) }, call(file)).kind, 'deny', file)
  }
  for (const name of ['bash', 'pwsh', 'apply_patch', 'str_replace_editor', 'mcp__filesystem__write_file']) {
    assert.match(runtime.checkToolExecution(call('CONTEXT.md', name)), /主会话不能直接调用/)
  }
  assert.match(runtime.checkToolExecution(call('CONTEXT.md', 'write', { sandbox_permissions: 'danger-full-access' })), /主会话不能直接调用/)
  assert.match(runtime.checkToolExecution({ ...call('CONTEXT.md'), arguments: {} }), /主会话不能直接调用/)
})

test('解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入', async t => {
  const { root, runtime, call } = await fixture(t)
  const hooks = new Map()
  registerOrchestratorDocumentGuards({ fs: { processPath: target => target.targetKey },
    on(event, callback) { hooks.set(event, callback) } }, runtime)
  const actor = call('docs/specs/spec.md')
  assert.equal(runtime.checkToolExecution(actor), undefined)
  assert.throws(() => hooks.get('fs/write-intent')({ targetKey: actor.arguments.file_path }, { ...actor, name: 'custom_writer' },
    () => assert.fail('non-native mutation reached provider')), /主会话只能/)
  for (const path of [join(root, 'src/code.md'), join(root, 'docs/specs/other.md')]) {
    assert.throws(() => hooks.get('fs/write-intent')({ displayPath: actor.arguments.file_path, targetKey: path }, actor,
      () => assert.fail('denied target reached provider')), /主会话只能/)
  }
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await symlink(join(root, 'src'), join(root, 'docs/specs'))
  assert.throws(() => hooks.get('fs/write-intent')({ displayPath: actor.arguments.file_path, targetKey: actor.arguments.file_path }, actor,
    () => assert.fail('link reached provider')), /主会话只能/)
})

test('路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标', async t => {
  const { parent, root } = await fixture(t)
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

test('只读子代理不继承文档例外，Owner 和停用模式沿用原策略', async t => {
  const { root, runtime, agent, call } = await fixture(t)
  for (const role of ['planner', 'plan-reviewer', 'reviewer', 'memory-curator', 'memory-reviewer', 'operator']) {
    runtime.agentRoles.set(agent.id, { role, workflowRoot: root })
    assert.match(runtime.checkFilesystemWrite({ displayPath: join(root, 'CONTEXT.md') }, call('CONTEXT.md')).reason, /只读/)
  }
  runtime.agentRoles.delete(agent.id)
  runtime.activeOwners.set(agent.id, { owner: { id: 'docs-owner' }, worktree: root })
  assert.equal(runtime.checkToolExecution(call('src/code.mjs')), undefined)
  runtime.activeOwners.delete(agent.id)
  agent.ctx = undefined
  assert.equal(runtime.checkToolExecution(call('src/code.mjs')), undefined)
  assert.equal(runtime.checkFilesystemWrite({ displayPath: join(root, 'src/code.mjs') }, call('src/code.mjs')), undefined)
})

test('真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝', async t => {
  const { parent, root } = await fixture(t)
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
