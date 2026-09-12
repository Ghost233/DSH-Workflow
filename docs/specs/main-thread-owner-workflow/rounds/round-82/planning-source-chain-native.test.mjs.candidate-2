import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'
import { validatePlanningSourceChain } from '../src/planning-source-chain.mjs'

const execFile = promisify(execFileCallback)
const sha256 = value => createHash('sha256').update(value).digest('hex')

async function git(root, ...args) {
  const result = await execFile('git', args, {
    cwd: root,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
  })
  return String(result.stdout).trim()
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
    try { await access(new URL(path, import.meta.url)) } catch { t.skip('需要已构建的 deepseek-harness'); return undefined }
  }
  return Promise.all(modules.map(path => import(path)))
}

function declaration(document, kind) {
  const { path, sha256: digest, ...value } = document
  const meta = {
    planning_document: 'DSH_PLANNING_DOCUMENT_V1',
    document_kind: kind,
    document_id: document.id,
    document_revision: document.revision,
    ...(kind === 'ticket' ? { spec_id: document.spec.id, spec_revision: document.spec.revision } : {}),
    planning_declaration: JSON.stringify(value),
  }
  return `---\n${Object.entries(meta).map(([key, item]) => `${key}: ${item}`).join('\n')}\n---\n\n# ${document.id}\n\n`
}

function contents(document, kind, body) { return `${declaration(document, kind)}${body}\n` }

function descriptors() {
  const spec = {
    path: 'docs/specs/source-chain/spec.md',
    id: 'SPEC-25',
    revision: 'R1',
    acceptanceCriteria: ['AC-27'],
    contracts: [{ id: 'planning-source-chain-v1', revision: 'v1' }],
  }
  const ticket = {
    path: 'docs/specs/source-chain/tickets/T25.md',
    id: 'T25',
    revision: 'R1',
    spec: { id: spec.id, revision: spec.revision },
    acceptanceCriteria: [{ id: 'AC-27', specId: spec.id, specRevision: spec.revision }],
    contracts: [{ id: 'planning-source-chain-v1', revision: 'v1' }],
    dependsOn: [],
    work: { ready: [{ id: 'source-chain' }], blocked: [] },
  }
  const finalSpec = contents(spec, 'spec', 'final specification content.')
  const finalTicket = contents(ticket, 'ticket', 'final ticket content.')
  return {
    spec: { ...spec, sha256: sha256(Buffer.from(finalSpec)) },
    ticket: { ...ticket, sha256: sha256(Buffer.from(finalTicket)) },
    initialSpec: contents(spec, 'spec', 'baseline specification content.'),
    interimSpec: contents(spec, 'spec', 'interim specification content.'),
    finalSpec,
    initialTicket: contents(ticket, 'ticket', 'baseline ticket content.'),
    finalTicket,
  }
}

function manifest(documents) {
  return {
    contract: 'DSH_PLANNING_REFERENCE_MANIFEST_V1',
    spec: documents.spec,
    tickets: [documents.ticket],
  }
}

async function fixture(t, { existingDocuments = true } = {}) {
  const modules = await nativeModules(t)
  if (modules === undefined) return undefined
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  const root = await mkdtemp(join(tmpdir(), 'dsh-planning-source-chain-'))
  const documents = descriptors()
  await git(root, 'init', '-b', 'source-chain')
  await git(root, 'config', 'user.name', 'Source Chain Test')
  await git(root, 'config', 'user.email', 'source-chain@example.invalid')
  await mkdir(join(root, 'docs/specs/source-chain/tickets'), { recursive: true })
  if (existingDocuments) {
    await writeFile(join(root, documents.spec.path), documents.initialSpec)
    await writeFile(join(root, documents.ticket.path), documents.initialTicket)
  }
  await writeFile(join(root, 'code.txt'), 'baseline code\n')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'baseline')
  const baseline = { branch: 'source-chain', head: await git(root, 'rev-parse', 'HEAD') }

  const ctx = new Context()
  const fibers = []
  const runtime = createOwnerWorkflowRuntime({}, {})
  const agent = {
    id: 'main-source-agent',
    session: { id: 'main-source-session', header: { id: 'main-source-session', cwd: root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined },
  }
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
  const disposers = registerOrchestratorDocumentGuards(ctx, runtime)
  t.after(async () => { for (const dispose of disposers.toReversed()) await dispose?.() })
  t.after(ctx.tools.guard(execution => runtime.checkToolExecution(execution)))
  let count = 0
  const call = (name, arguments_) => ctx.tools.execute({
    name,
    arguments: arguments_,
    agent,
    callId: `source-chain-${++count}`,
    signal: new AbortController().signal,
  })
  return { root, ctx, runtime, agent, call, documents, baseline }
}

async function writeBoundDocuments(value) {
  const { root, call, documents } = value
  const specPath = join(root, documents.spec.path)
  const ticketPath = join(root, documents.ticket.path)
  assert.equal((await call('read', { file_path: specPath })).isError, false)
  assert.equal((await call('edit', {
    file_path: specPath,
    old_string: 'baseline specification content.',
    new_string: 'interim specification content.',
  })).isError, false)
  assert.equal((await call('read', { file_path: specPath })).isError, false)
  assert.equal((await call('edit', {
    file_path: specPath,
    old_string: 'interim specification content.',
    new_string: 'final specification content.',
  })).isError, false)
  assert.equal((await call('read', { file_path: ticketPath })).isError, false)
  assert.equal((await call('edit', {
    file_path: ticketPath,
    old_string: 'baseline ticket content.',
    new_string: 'final ticket content.',
  })).isError, false)
  return [
    { path: documents.spec.path, callIds: ['source-chain-2', 'source-chain-4'] },
    { path: documents.ticket.path, callIds: ['source-chain-6'] },
  ]
}

function sourceInput(value, chains) {
  return {
    root: value.root,
    cwd: value.root,
    manifest: manifest(value.documents),
    baseline: value.baseline,
    source: { agentId: value.agent.id, sessionId: value.agent.session.header.id, chains },
  }
}

test('首次原生创建尚未进入 HEAD 的 Spec/Ticket，缺失基线 blob 正确作为 null', async t => {
  const value = await fixture(t, { existingDocuments: false })
  if (value === undefined) return
  const { root, call, documents } = value
  const indexBefore = await readFile(join(root, '.git/index'))
  assert.equal((await call('write', { file_path: join(root, documents.spec.path), content: documents.finalSpec })).isError, false)
  assert.equal((await call('write', { file_path: join(root, documents.ticket.path), content: documents.finalTicket })).isError, false)
  const chains = [
    { path: documents.spec.path, callIds: ['source-chain-1'] },
    { path: documents.ticket.path, callIds: ['source-chain-2'] },
  ]
  const prepared = await value.runtime.preparePlanningCheckpoint(value.agent, {
    manifest: manifest(documents), baseline: value.baseline, chains,
  }, new AbortController().signal)
  assert.equal(prepared.phase, 'source-validated')
  for (const chain of prepared.source.source.chains) {
    assert.equal(chain.records[0].prepared.before.sha256, null)
    assert.equal(chain.records[0].prepared.finalIntent.kind, 'createIfAbsent')
  }
  assert.equal(prepared.checkpointCreated, false)
  assert.deepEqual(await readFile(join(root, '.git/index')), indexBefore)
  assert.equal(await git(root, 'rev-parse', 'HEAD'), value.baseline.head)
})

test('真实 Harness 原生 edit 链绑定 T05 引用和实际 Git baseline，并由只读 Runtime 入口返回 source-validated', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const chains = await writeBoundDocuments(value)
  const indexBefore = await readFile(join(value.root, '.git/index'))
  const direct = await validatePlanningSourceChain(sourceInput(value, chains))
  assert.equal(direct.contract, 'DSH_PLANNING_SOURCE_CHAIN_V1')
  assert.equal(Object.isFrozen(direct), true)
  assert.equal(Object.isFrozen(direct.source.chains[0].records[0].prepared), true)
  assert.equal(direct.source.chains[0].records.length, 2)
  assert.equal(direct.source.chains[1].records.length, 1)
  assert.equal(direct.source.chains[0].records.at(-1).terminal.after.sha256, value.documents.spec.sha256)
  assert.equal(direct.source.chains[1].records.at(-1).terminal.after.sha256, value.documents.ticket.sha256)

  const prepared = await value.runtime.preparePlanningCheckpoint(value.agent, {
    manifest: manifest(value.documents),
    baseline: value.baseline,
    chains,
  }, new AbortController().signal)
  assert.equal(prepared.contract, 'DSH_PLANNING_CHECKPOINT_PREPARATION_V1')
  assert.equal(prepared.phase, 'source-validated')
  assert.equal(prepared.checkpointCreated, false)
  assert.equal(prepared.executionAuthorized, false)
  assert.equal(prepared.source.baseline.head, value.baseline.head)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
  assert.equal(await git(value.root, 'symbolic-ref', '--short', 'HEAD'), value.baseline.branch)
  assert.deepEqual(await readFile(join(value.root, '.git/index')), indexBefore)
})

test('缺失尾项、跨文件借用、incomplete terminal 与暂存用户变更均拒绝而不修复来源或 index', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const chains = await writeBoundDocuments(value)
  const input = sourceInput(value, chains)
  await assert.rejects(validatePlanningSourceChain({ ...input, source: {
    ...input.source,
    chains: [
      { path: chains[0].path, callIds: ['source-chain-2'] },
      chains[1],
    ],
  } }), /Planning source chain: FINAL_DOCUMENT_MISMATCH/)

  await assert.rejects(validatePlanningSourceChain({ ...input, source: {
    ...input.source,
    chains: [
      { path: chains[0].path, callIds: ['source-chain-6'] },
      { path: chains[1].path, callIds: ['source-chain-2', 'source-chain-4'] },
    ],
  } }), /prepared\.target\.path/)

  const terminalPath = join(value.root, '.dsh-workflow/planning-write-journal/terminal', `${sha256('source-chain-2')}.json`)
  const terminal = JSON.parse(await readFile(terminalPath, 'utf8'))
  terminal.completeness = 'incomplete'
  await writeFile(terminalPath, `${JSON.stringify(terminal)}\n`)
  await assert.rejects(validatePlanningSourceChain(input), /Planning source chain: INCOMPLETE_RECORD/)

  await writeFile(join(value.root, 'code.txt'), 'staged user change\n')
  await git(value.root, 'add', 'code.txt')
  const staged = await git(value.root, 'diff', '--cached', '--name-only')
  await assert.rejects(validatePlanningSourceChain(input), /Planning source chain: STAGED_CHANGES/)
  assert.equal(await git(value.root, 'diff', '--cached', '--name-only'), staged)
})

test('已提交的旧来源保留在 journal 时，新 baseline 上仅选择新的原生链仍可验证', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  await writeBoundDocuments(value)
  await git(value.root, 'add', value.documents.spec.path, value.documents.ticket.path)
  await git(value.root, 'commit', '-m', 'first bound planning source')
  const secondBaseline = { branch: value.baseline.branch, head: await git(value.root, 'rev-parse', 'HEAD') }
  const secondSpec = contents(value.documents.spec, 'spec', 'second baseline specification content.')
  const secondTicket = contents(value.documents.ticket, 'ticket', 'second baseline ticket content.')
  const secondDocuments = {
    spec: { ...value.documents.spec, sha256: sha256(Buffer.from(secondSpec)) },
    ticket: { ...value.documents.ticket, sha256: sha256(Buffer.from(secondTicket)) },
  }
  const specPath = join(value.root, secondDocuments.spec.path)
  const ticketPath = join(value.root, secondDocuments.ticket.path)
  assert.equal((await value.call('read', { file_path: specPath })).isError, false)
  assert.equal((await value.call('edit', {
    file_path: specPath,
    old_string: 'final specification content.',
    new_string: 'second baseline specification content.',
  })).isError, false)
  assert.equal((await value.call('read', { file_path: ticketPath })).isError, false)
  assert.equal((await value.call('edit', {
    file_path: ticketPath,
    old_string: 'final ticket content.',
    new_string: 'second baseline ticket content.',
  })).isError, false)
  const second = await validatePlanningSourceChain({
    root: value.root,
    cwd: value.root,
    manifest: manifest(secondDocuments),
    baseline: secondBaseline,
    source: {
      agentId: value.agent.id,
      sessionId: value.agent.session.header.id,
      chains: [
        { path: secondDocuments.spec.path, callIds: ['source-chain-8'] },
        { path: secondDocuments.ticket.path, callIds: ['source-chain-10'] },
      ],
    },
  })
  assert.equal(second.source.chains[0].records.length, 1)
  assert.equal(second.source.chains[0].records[0].prepared.call.callId, 'source-chain-8')
  assert.equal(second.source.chains[1].records[0].prepared.call.callId, 'source-chain-10')
})

test('真实 Runtime 入口不接受其他主 agent 复用来源，也不接受有父会话的 child', async t => {
  const value = await fixture(t)
  if (value === undefined) return
  const chains = await writeBoundDocuments(value)
  const input = { manifest: manifest(value.documents), baseline: value.baseline, chains }
  const other = {
    id: 'other-source-agent',
    session: { id: 'other-source-session', header: { id: 'other-source-session', cwd: value.root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined },
  }
  value.runtime.orchestratorRoots.set(other.id, value.root)
  await assert.rejects(value.runtime.preparePlanningCheckpoint(other, input, new AbortController().signal), /IDENTITY_MISMATCH/)

  const child = {
    id: 'child-source-agent',
    session: { id: 'child-source-session', header: { id: 'child-source-session', cwd: value.root, meta: { parentSession: value.agent.session.header.id } } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined },
  }
  value.runtime.orchestratorRoots.set(child.id, value.root)
  await assert.rejects(value.runtime.preparePlanningCheckpoint(child, input, new AbortController().signal), /仅允许 Owner 模式的主线程调用/)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
})
