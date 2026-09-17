import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { registerOrchestratorDocumentGuards } from '../../src/orchestrator-documents.mjs'
import { ensureRuntimeGitignore } from '../../src/project-layout.mjs'
import { createPlanningNativeAgent } from './planning-native-agent.mjs'
import { planningDocumentRuntime } from './planning-document-runtime.mjs'

const execFile = promisify(execFileCallback)
export const sha256 = value => createHash('sha256').update(value).digest('hex')

export async function git(root, ...args) {
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
  const { path, sha256: sourceHash, ...value } = document
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

function content(document, kind, body) { return `${declaration(document, kind)}${body}\n` }

function documents() {
  const spec = {
    path: 'docs/specs/checkpoint/spec.md',
    id: 'SPEC-25-KERNEL',
    revision: 'R1',
    acceptanceCriteria: ['AC-27'],
    contracts: [{ id: 'planning-checkpoint-v1', revision: 'v1' }],
  }
  const ticket = {
    path: 'docs/specs/checkpoint/tickets/T25.md',
    id: 'T25-KERNEL',
    revision: 'R1',
    spec: { id: spec.id, revision: spec.revision },
    acceptanceCriteria: [{ id: 'AC-27', specId: spec.id, specRevision: spec.revision }],
    contracts: [{ id: 'planning-checkpoint-v1', revision: 'v1' }],
    dependsOn: [],
    work: { ready: [{ id: 'checkpoint-kernel' }], blocked: [] },
  }
  const finalSpec = content(spec, 'spec', 'final checkpoint specification.')
  const finalTicket = content(ticket, 'ticket', 'final checkpoint ticket.')
  return {
    spec: { ...spec, sha256: sha256(Buffer.from(finalSpec)) },
    ticket: { ...ticket, sha256: sha256(Buffer.from(finalTicket)) },
    initialSpec: content(spec, 'spec', 'baseline checkpoint specification.'),
    finalSpec,
    initialTicket: content(ticket, 'ticket', 'baseline checkpoint ticket.'),
    finalTicket,
  }
}

export function manifest(value) {
  return { contract: 'DSH_PLANNING_REFERENCE_MANIFEST_V1', spec: value.spec, tickets: [value.ticket] }
}

export function trustedAuthorize(counter) {
  return async ({ authorizationId }) => {
    counter.calls += 1
    if (authorizationId !== undefined) assert.equal(authorizationId, 'test-grant-1')
    return {
      contract: 'DSH_TEST_CONTROLLED_PLANNING_GRANT_V1',
      id: 'test-grant-1',
      binding: 'controlled-test-authorizer',
    }
  }
}

export async function fixture(t, { agentId = 'main-checkpoint-agent' } = {}) {
  const modules = await nativeModules(t)
  if (modules === undefined) return undefined
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  const root = await mkdtemp(join(tmpdir(), 'dsh-planning-checkpoint-'))
  const docs = documents()
  await git(root, 'init', '-b', 'checkpoint')
  await git(root, 'config', 'user.name', 'Checkpoint Test')
  await git(root, 'config', 'user.email', 'checkpoint@example.invalid')
  await mkdir(join(root, 'docs/specs/checkpoint/tickets'), { recursive: true })
  await writeFile(join(root, docs.spec.path), docs.initialSpec)
  await writeFile(join(root, docs.ticket.path), docs.initialTicket)
  await writeFile(join(root, 'code.txt'), 'baseline code\n')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'baseline')
  const baseline = { branch: 'checkpoint', head: await git(root, 'rev-parse', 'HEAD') }
  await ensureRuntimeGitignore(join(root, '.dsh-workflow'))
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
  const agent = await createPlanningNativeAgent(t, ctx, root, agentId)
  const runtime = planningDocumentRuntime(ctx, root, agent)
  const disposers = registerOrchestratorDocumentGuards(ctx, runtime)
  t.after(async () => { for (const dispose of disposers.toReversed()) await dispose?.() })
  t.after(ctx.tools.guard(execution => runtime.checkToolExecution(execution)))
  let count = 0
  const call = (name, arguments_) => ctx.tools.execute({
    name,
    arguments: arguments_,
    agent,
    callId: `checkpoint-source-${++count}`,
    signal: new AbortController().signal,
  })
  return { root, docs, baseline, agent, call }
}

export async function createBoundSource(value) {
  const spec = join(value.root, value.docs.spec.path)
  const ticket = join(value.root, value.docs.ticket.path)
  assert.equal((await value.call('read', { file_path: spec })).isError, false)
  assert.equal((await value.call('edit', {
    file_path: spec,
    old_string: 'baseline checkpoint specification.',
    new_string: 'final checkpoint specification.',
  })).isError, false)
  assert.equal((await value.call('read', { file_path: ticket })).isError, false)
  assert.equal((await value.call('edit', {
    file_path: ticket,
    old_string: 'baseline checkpoint ticket.',
    new_string: 'final checkpoint ticket.',
  })).isError, false)
  return [
    { path: value.docs.spec.path, callIds: ['checkpoint-source-2'] },
    { path: value.docs.ticket.path, callIds: ['checkpoint-source-4'] },
  ]
}

export function request(value, chains, id = 'checkpoint-1') {
  return {
    id,
    manifest: manifest(value.docs),
    baseline: value.baseline,
    source: { agentId: value.agent.id, sessionId: value.agent.session.header.id, chains },
    reason: 'real native planning checkpoint test',
    parentSnapshotId: null,
  }
}

export async function indexBytes(root) { return readFile(join(root, '.git/index')) }
