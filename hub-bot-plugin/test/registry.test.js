/**
 * OwnerRegistry: the owner registry of the hub-bot spec's data model (docs/specs/hub-bot-plugin.md「数据模型」).
 * Rows are JSON documents in the store's owner table; the registry owns validation, the chief bootstrap, the
 * created/pending lifecycle, and stable per-identity ids.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry, RegistryError } from '../src/registry.js'

/** A registry over a fresh store in a temp dir. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-registry-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  return { registry, store, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('chief bootstrap creates the chief row once, pending, without touching it on restart', () => {
  const { registry, cleanup } = fixture()
  try {
    const first = registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
    assert.equal(first.created, true)
    assert.equal(first.owner.id, 'chief')
    assert.equal(first.owner.role, 'chief')
    assert.equal(first.owner.kind, 'repo')
    assert.equal(first.owner.cwd, '/Volumes/home')
    assert.equal(first.owner.sessionId, null)
    assert.equal(first.owner.status, 'pending')
    registry.bindSession('chief', 'session-abc')
    const again = registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
    assert.equal(again.created, false)
    assert.equal(again.owner.sessionId, 'session-abc')
    assert.equal(again.owner.status, 'created')
  } finally { cleanup() }
})

test('create validates per kind: repo needs workspace+cwd, dir needs cwd, scratch allocates its own', () => {
  const { registry, cleanup } = fixture()
  try {
    assert.throws(() => registry.create({ kind: 'repo', cwd: '/x' }), RegistryError)
    assert.throws(() => registry.create({ kind: 'repo', workspace: 'W' }), RegistryError)
    assert.throws(() => registry.create({ kind: 'dir' }), RegistryError)
    assert.throws(() => registry.create({ kind: 'nope', cwd: '/x' }), RegistryError)
    const repo = registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/repos/DSH-Workflow' })
    assert.equal(repo.id, 'repo-DSH-Workflow')
    assert.equal(repo.status, 'pending')
    assert.equal(repo.sessionId, null)
    const dir = registry.create({ kind: 'dir', cwd: '/Users/ghost/notes' })
    assert.ok(dir.id.startsWith('dir-'))
    const scratch = registry.create({ kind: 'scratch' })
    assert.equal(scratch.kind, 'scratch')
    assert.equal(scratch.transient, true)
    assert.equal(scratch.recycled, false)
    assert.ok(scratch.cwd.includes('scratch'), 'scratch cwd allocated under scratchRoot: ' + scratch.cwd)
  } finally { cleanup() }
})

test('create is idempotent per identity: creating the same repo twice returns the existing row', () => {
  const { registry, cleanup } = fixture()
  try {
    const a = registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/repos/DSH-Workflow' })
    registry.bindSession(a.id, 'session-1')
    const b = registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/repos/DSH-Workflow' })
    assert.equal(b.id, a.id)
    assert.equal(b.sessionId, 'session-1')
    assert.equal(registry.list().filter(o => o.id === a.id).length, 1)
  } finally { cleanup() }
})

test('dir identity is its cwd: same path maps to the same row', () => {
  const { registry, cleanup } = fixture()
  try {
    const a = registry.create({ kind: 'dir', cwd: '/Users/ghost/notes' })
    const b = registry.create({ kind: 'dir', cwd: '/Users/ghost/notes' })
    assert.equal(a.id, b.id)
    const c = registry.create({ kind: 'dir', cwd: '/Users/ghost/other' })
    assert.notEqual(c.id, a.id)
  } finally { cleanup() }
})

test('bindSession marks created; markSessionMissing resets to pending with a null session', () => {
  const { registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    registry.bindSession(owner.id, 'session-9')
    assert.equal(registry.get(owner.id).status, 'created')
    registry.markSessionMissing(owner.id)
    const row = registry.get(owner.id)
    assert.equal(row.status, 'pending')
    assert.equal(row.sessionId, null)
  } finally { cleanup() }
})

test('invalidateSessionForTest points the row at a dangling session id without touching status', () => {
  const { registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    registry.bindSession(owner.id, 'session-live')
    registry.invalidateSessionForTest(owner.id, 'session-dangling')
    const row = registry.get(owner.id)
    assert.equal(row.sessionId, 'session-dangling')
    assert.equal(row.status, 'created')
  } finally { cleanup() }
})

test('unknown ids throw RegistryError; list sorts chief first', () => {
  const { registry, cleanup } = fixture()
  try {
    assert.equal(registry.get('nope'), undefined)
    assert.throws(() => registry.bindSession('nope', 's'), RegistryError)
    registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
    registry.create({ kind: 'repo', workspace: 'AAA', cwd: '/a' })
    const list = registry.list()
    assert.equal(list[0].id, 'chief')
    assert.ok(list.some(o => o.workspace === 'AAA'))
  } finally { cleanup() }
})
