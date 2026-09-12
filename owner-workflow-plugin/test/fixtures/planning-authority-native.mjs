import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createOwnerWorkflowRuntime } from '../../src/runtime.mjs'
import { registerOrchestratorDocumentGuards } from '../../src/orchestrator-documents.mjs'
import { validatePlanningSourceChain } from '../../src/planning-source-chain.mjs'

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
    '../../../deepseek-harness/vendor/cordis/lib/index.js',
    '../../../deepseek-harness/packages/core/system-prompt/lib/index.js',
    '../../../deepseek-harness/packages/core/tools/lib/index.js',
    '../../../deepseek-harness/packages/fs/fs-local/lib/index.js',
    '../../../deepseek-harness/packages/fs/fs-observation-policy/lib/index.js',
    '../../../deepseek-harness/packages/fs/tool-fs/lib/index.js',
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

async function fixture(t, { existingDocuments = true, setup } = {}) {
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
  if (setup !== undefined) await setup(root)
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'baseline')
  const baseline = { branch: 'source-chain', head: await git(root, 'rev-parse', 'HEAD') }

  const ctx = new Context()
  const fibers = []
  const runtime = createOwnerWorkflowRuntime(ctx, {})
  const agent = {
    id: 'main-source-agent',
    session: { id: 'main-source-agent', header: { id: 'main-source-agent', cwd: root } },
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


export { fixture, manifest, writeBoundDocuments, sourceInput, git }
