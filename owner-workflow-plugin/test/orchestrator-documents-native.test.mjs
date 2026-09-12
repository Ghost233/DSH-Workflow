import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

async function nativeModules(t) {
  const modules = [
    '../../deepseek-harness/vendor/cordis/lib/index.js',
    '../../deepseek-harness/packages/core/system-prompt/lib/index.js',
    '../../deepseek-harness/packages/core/tools/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-local/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-observation-policy/lib/index.js',
    '../../deepseek-harness/packages/fs/tool-fs/lib/index.js',
  ]
  // The plugin's unit suite also runs without the optional built Harness checkout.
  for (const path of modules) {
    try { await access(new URL(path, import.meta.url)) } catch { t.skip('需要已构建的 deepseek-harness'); return }
  }
  return Promise.all(modules.map(path => import(path)))
}

test('真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护', async t => {
  const modules = await nativeModules(t)
  if (modules === undefined) return
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-main-docs-'))
  const ctx = new Context()
  const fibers = []
  const runtime = createOwnerWorkflowRuntime({}, {})
  const agent = { id: 'native-main', session: { header: { cwd: root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
  runtime.orchestratorRoots.set(agent.id, root)
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  })
  fibers.push(await ctx.plugin(SystemPrompt.default))
  fibers.push(await ctx.plugin(Tools.default))
  fibers.push(await ctx.plugin(LocalFs.default, { cwd: root }))
  fibers.push(await ctx.plugin(FsPolicy))
  fibers.push(await ctx.plugin(ToolFs))
  registerOrchestratorDocumentGuards(ctx, runtime)
  ctx.tools.guard(exec => runtime.checkToolExecution(exec))
  let count = 0
  const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
    callId: `docs-${++count}`, signal: new AbortController().signal })
  const file_path = join(root, 'docs/specs/feature/spec.md')
  assert.equal((await call('write', { file_path, content: 'draft' })).isError, false)
  assert.equal(await readFile(file_path, 'utf8'), 'draft')
  assert.equal((await call('read', { file_path })).isError, false)
  assert.equal((await call('edit', { file_path, old_string: 'draft', new_string: 'ready' })).isError, false)
  assert.equal(await readFile(file_path, 'utf8'), 'ready')
  await writeFile(file_path, 'external edit')
  assert.equal((await call('edit', { file_path, old_string: 'ready', new_string: 'stale' })).isError, true)
  assert.equal(await readFile(file_path, 'utf8'), 'external edit')
  await writeFile(join(root, 'CONTEXT.md'), 'existing, unread')
  assert.equal((await call('write', { file_path: join(root, 'CONTEXT.md'), content: 'overwrite' })).isError, true)
  assert.equal(await readFile(join(root, 'CONTEXT.md'), 'utf8'), 'existing, unread')
  assert.equal((await call('write', { file_path: join(root, 'src/code.js'), content: 'code' })).isError, true)
  await assert.rejects(access(join(root, 'src/code.js')), { code: 'ENOENT' })
})

test('真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档', async t => {
  const modules = await nativeModules(t)
  if (modules === undefined) return
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  for (const nested of [false, true]) await t.test(nested ? '会话位于 docs 子目录' : '会话位于项目根', async t => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-preflight-docs-'))
    const fibers = []
    const disposers = []
    let runtime
    t.after(async () => {
      const errors = []
      // Register before setup; a failed release must not prevent the rest or rm.
      for (const dispose of [
        ...disposers.toReversed(),
        ...fibers.toReversed().map(fiber => () => fiber.dispose()),
        () => runtime?.dispose(),
        () => rm(parent, { recursive: true, force: true }),
      ]) {
        try { await dispose?.() } catch (error) { errors.push(error) }
      }
      if (errors.length > 0) throw new AggregateError(errors, '文档测试资源清理失败')
    })
    const project = join(parent, 'project')
    const alias = join(parent, 'project-alias')
    await mkdir(join(project, 'docs'), { recursive: true })
    const canonicalRoot = await realpath(project)
    await symlink(canonicalRoot, alias)
    const git = args => execFileSync('git', args, { cwd: project, stdio: 'pipe', timeout: 10_000 })
    git(['init', '-b', 'main'])
    git(['config', 'user.email', 'document-fixture@example.invalid'])
    git(['config', 'user.name', 'Document fixture'])
    await writeFile(join(project, 'README.md'), 'fixture')
    git(['add', 'README.md'])
    git(['commit', '-m', 'fixture'])

    const ctx = new Context()
    runtime = createOwnerWorkflowRuntime({}, {})
    const agent = { id: 'preflight-main', session: { id: 'preflight-main', header: { cwd: nested ? join(alias, 'docs') : alias } },
      ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
    fibers.push(await ctx.plugin(SystemPrompt.default))
    fibers.push(await ctx.plugin(Tools.default))
    fibers.push(await ctx.plugin(LocalFs.default, { cwd: project }))
    fibers.push(await ctx.plugin(FsPolicy))
    fibers.push(await ctx.plugin(ToolFs))
    disposers.push(...registerOrchestratorDocumentGuards(ctx, runtime))
    disposers.push(ctx.tools.guard(exec => runtime.checkToolExecution(exec)))

    const preflight = await runtime.preflightWorkflow(agent)
    assert.equal(preflight.root, canonicalRoot)
    assert.equal(preflight.canStart, true)
    assert.notEqual(preflight.root, alias)
    let count = 0
    const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
      callId: `preflight-docs-${++count}`, signal: new AbortController().signal })
    const paths = [join(alias, 'docs/specs/topic/spec.md'), join(canonicalRoot, 'docs/specs/topic/spec.md'),
      nested ? 'specs/topic/spec.md' : 'docs/specs/topic/spec.md']
    const created = await call('write', { file_path: paths[0], content: 'draft-0' })
    assert.equal(created.isError, false, JSON.stringify(created))
    for (const [index, file_path] of paths.entries()) {
      assert.equal((await call('read', { file_path })).isError, false)
      assert.equal((await call('edit', { file_path, old_string: `draft-${index}`, new_string: `draft-${index + 1}` })).isError, false)
      assert.equal((await call('write', { file_path, content: `draft-${index + 1}` })).isError, false)
      assert.equal(await readFile(paths[1], 'utf8'), `draft-${index + 1}`)
    }
    // Equivalent spellings share observation identity; an external edit still invalidates it.
    await writeFile(paths[1], 'external change')
    assert.equal((await call('edit', { file_path: paths[0], old_string: 'draft-3', new_string: 'stale' })).isError, true)
    assert.equal(await readFile(paths[1], 'utf8'), 'external change')
    await symlink(join(canonicalRoot, 'docs/specs'), join(project, 'docs/shortcut'))
    for (const file of ['docs/shortcut/blocked.md', 'src/code.js', 'docs/analysis/report.md']) {
      assert.equal((await call('write', { file_path: join(alias, file), content: 'blocked' })).isError, true, file)
    }
    await assert.rejects(access(join(project, 'docs/specs/blocked.md')), { code: 'ENOENT' })
    // This fix does not bypass the existing clean-base gate for newly written documents.
    assert.equal((await runtime.preflightWorkflow(agent)).canStart, false)
  })
})
