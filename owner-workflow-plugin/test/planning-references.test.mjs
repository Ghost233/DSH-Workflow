import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validatePlanningReferences } from '../src/planning-references.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-planning-references-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const spec = { path: 'docs/specs/x/spec.md', id: 'SPEC-X', revision: 'R1', acceptanceCriteria: ['AC-1', 'AC-2'], contracts: [{ id: 'C-1', revision: 'v1' }] }
  const ticket = (id, ac = 'AC-1') => ({ path: `docs/specs/x/tickets/${id}.md`, id, revision: 'R1', spec: { id: 'SPEC-X', revision: 'R1' }, acceptanceCriteria: [{ id: ac, specId: 'SPEC-X', specRevision: 'R1' }], contracts: [{ id: 'C-1', revision: 'v1' }], dependsOn: [], work: { ready: [{ id: `${id}:implementation` }], blocked: [] } })
  const manifest = { contract: 'DSH_PLANNING_REFERENCE_MANIFEST_V1', spec, tickets: [ticket('T-1'), ticket('T-2', 'AC-2')] }
  const save = async (document, kind = document === spec ? 'spec' : 'ticket', overrides = {}) => {
    const { path, sha256, ...declaration } = document
    const meta = { planning_document: 'DSH_PLANNING_DOCUMENT_V1', document_kind: kind, document_id: document.id, document_revision: document.revision, ...(kind === 'ticket' ? { spec_id: document.spec.id, spec_revision: document.spec.revision } : {}), ...overrides }
    const content = `---\n${Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join('\n')}\nplanning_declaration: ${JSON.stringify(declaration)}\n---\n\n# ${document.id}\n\nHuman-authored requirements remain subject to review.\n`
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
    document.sha256 = digest(content)
    return content
  }
  await save(spec)
  for (const document of manifest.tickets) await save(document)
  return { root, manifest, save, ticket, validate: () => validatePlanningReferences({ root, manifest }) }
}

test('real selected documents retain complete cross-ticket AC references, multiple segments and fixed content', async t => {
  const f = await fixture(t), a = f.manifest.tickets[0]
  a.acceptanceCriteria.push({ id: 'AC-2', specId: 'SPEC-X', specRevision: 'R1' })
  a.work.ready.push({ id: 'T-1:consumer' })
  await f.save(a)
  const result = await f.validate()
  assert.equal(result.contract, 'DSH_PLANNING_REFERENCE_SET_V1')
  assert.deepEqual(result.tickets[0].acceptanceCriteria, a.acceptanceCriteria)
  assert.equal(result.ready.length, 3)
  assert.equal(result.blocked.length, 0)
  assert.equal(result.spec.content, await readFile(join(f.root, f.manifest.spec.path), 'utf8'))
  const original = result.spec.content
  await writeFile(join(f.root, f.manifest.spec.path), 'later draft')
  assert.equal(result.spec.content, original)
  assert.deepEqual(result.tickets[0].work.ready.map(x => x.id), ['T-1:implementation', 'T-1:consumer'])
})

test('mixed readiness preserves explicit blockers and blocks dependent tickets while unrelated work remains ready', async t => {
  const f = await fixture(t), [a, b] = f.manifest.tickets
  a.work = { ready: [], blocked: [{ id: 'T-1:implementation', reason: 'Unresolved interface' }] }
  b.dependsOn = ['T-1']
  const independent = f.ticket('T-3'); f.manifest.tickets.push(independent)
  for (const d of f.manifest.tickets) await f.save(d)
  const result = await f.validate()
  assert.deepEqual(result.ready.map(x => x.ticketId), ['T-3'])
  assert.ok(result.blocked.some(x => x.ticketId === 'T-1'))
  assert.ok(result.blocked.some(x => x.ticketId === 'T-2'))
})

for (const scenario of ['missing-file', 'changed-content', 'wrong-digest', 'duplicate-ticket', 'duplicate-path', 'missing-revision', 'wrong-identity', 'wrong-source', 'unknown-ac', 'wrong-ac-version', 'unknown-contract', 'wrong-contract-version', 'missing-dependency', 'cyclic-dependency', 'duplicate-segment', 'empty-work', 'all-blocked', 'empty-tickets', 'declaration-forgery']) test(`rejects ${scenario} without modifying planning files`, async t => {
  const f = await fixture(t), [a, b] = f.manifest.tickets
  if (scenario === 'missing-file') await rm(join(f.root, a.path))
  if (scenario === 'changed-content') await writeFile(join(f.root, a.path), 'concurrent edit')
  if (scenario === 'wrong-digest') a.sha256 = '0'.repeat(64)
  if (scenario === 'duplicate-ticket') f.manifest.tickets.push(structuredClone(a))
  if (scenario === 'duplicate-path') b.path = a.path
  if (scenario === 'missing-revision') { delete a.revision; await f.save(a) }
  if (scenario === 'wrong-identity') await f.save(a, 'ticket', { document_id: 'T-OTHER' })
  if (scenario === 'wrong-source') { a.spec.revision = 'R0'; await f.save(a) }
  if (scenario === 'unknown-ac') { a.acceptanceCriteria[0].id = 'AC-404'; await f.save(a) }
  if (scenario === 'wrong-ac-version') { a.acceptanceCriteria[0].specRevision = 'R0'; await f.save(a) }
  if (scenario === 'unknown-contract') { a.contracts[0].id = 'C-404'; await f.save(a) }
  if (scenario === 'wrong-contract-version') { a.contracts[0].revision = 'v0'; await f.save(a) }
  if (scenario === 'missing-dependency') { a.dependsOn = ['T-404']; await f.save(a) }
  if (scenario === 'cyclic-dependency') { a.dependsOn = ['T-2']; b.dependsOn = ['T-1']; await f.save(a); await f.save(b) }
  if (scenario === 'duplicate-segment') { a.work.ready.push(structuredClone(a.work.ready[0])); await f.save(a) }
  if (scenario === 'empty-work') { a.work = { ready: [], blocked: [] }; await f.save(a) }
  if (scenario === 'all-blocked') for (const d of f.manifest.tickets) { d.work = { ready: [], blocked: [{ id: `${d.id}:implementation`, reason: 'Need facts' }] }; await f.save(d) }
  if (scenario === 'empty-tickets') f.manifest.tickets = []
  if (scenario === 'declaration-forgery') { a.acceptanceCriteria = [{ id: 'AC-2', specId: 'SPEC-X', specRevision: 'R1' }] }
  const files = await Promise.all([f.manifest.spec, a, b].map(async d => [d.path, await readFile(join(f.root, d.path)).catch(() => null)]))
  await assert.rejects(f.validate, /Planning references:/)
  for (const [path, bytes] of files) assert.deepEqual(await readFile(join(f.root, path)).catch(() => null), bytes)
})

for (const path of ['docs/analysis/spec.md', 'docs/superpowers/specs/spec.md', '../escape.md', 'AGENTS.md']) test(`rejects disallowed planning path ${path}`, async t => {
  const f = await fixture(t)
  f.manifest.spec.path = path
  await assert.rejects(f.validate, /Planning references:/)
})

test('linked document source cannot cross the existing document boundary', async t => {
  const f = await fixture(t), a = f.manifest.tickets[0]
  await rm(join(f.root, a.path))
  await symlink(join(f.root, f.manifest.spec.path), join(f.root, a.path))
  await assert.rejects(f.validate, /Planning references:/)
})

test('unready contract blocks its consumers while independent work remains available', async t => {
  const f = await fixture(t)
  f.manifest.spec.contracts[0].status = 'blocked'
  f.manifest.tickets[1].contracts = []
  await f.save(f.manifest.spec); await f.save(f.manifest.tickets[1])
  const result = await f.validate()
  assert.deepEqual(result.ready.map(x => x.ticketId), ['T-2'])
  assert.ok(result.blocked.some(x => x.ticketId === 'T-1'))
})

test('a ticket retains its independent ready segment alongside a declared blocked segment', async t => {
  const f = await fixture(t), [a, b] = f.manifest.tickets
  a.work.blocked.push({ id: 'T-1:future', reason: 'Unresolved optional follow-up' })
  b.dependsOn = ['T-1']
  await f.save(a); await f.save(b)
  const result = await f.validate()
  assert.deepEqual(result.ready.map(x => x.segment.id), ['T-1:implementation'])
  assert.ok(result.blocked.some(x => x.segment.id === 'T-1:future'))
  assert.ok(result.blocked.some(x => x.ticketId === 'T-2'))
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.tickets[0].acceptanceCriteria))
})

test('invalid UTF-8 cannot produce content that differs from its bound byte digest', async t => {
  const f = await fixture(t), a = f.manifest.tickets[0]
  const bytes = Buffer.concat([await readFile(join(f.root, a.path)), Buffer.from([0xff])])
  await writeFile(join(f.root, a.path), bytes); a.sha256 = digest(bytes)
  await assert.rejects(f.validate, /Planning references:/)
})

test('a UTF-8 BOM cannot be silently removed from the bound source content', async t => {
  const f = await fixture(t), a = f.manifest.tickets[0]
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(join(f.root, a.path))])
  await writeFile(join(f.root, a.path), bytes); a.sha256 = digest(bytes)
  await assert.rejects(f.validate, /Planning references:/)
})
