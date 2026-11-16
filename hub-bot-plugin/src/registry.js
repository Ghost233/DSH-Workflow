/**
 * The owner registry (规格 docs/specs/hub-bot-plugin.md「数据模型」负责人注册表).
 *
 * One JSON document per owner in the store's owner table:
 *   { id, role, kind, workspace?, cwd, sessionId, status, transient, recycled, createdAt, updatedAt }
 *   kind: 'repo' (workspace + repo dir) | 'dir' (plain directory) | 'scratch' (allocated temp dir, transient)
 *   role: 'chief' (the L1 router) | 'owner' (L2)
 *   status: 'pending' (registered, no Session yet) | 'created' (Session bound)
 *
 * Ids are stable per identity: the chief is 'chief'; repos are 'repo-<workspace>'; dirs are 'dir-<hash of cwd>';
 * scratches are unique per allocation. Stability is what lets a deleted owner Session be rebuilt into the same row.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** A registry rule violation: unknown id, bad kind, missing identity fields. Carries a machine-readable code like TaskError (双轴审查 P2). */
export class RegistryError extends Error {
  constructor(message, code = 'registry-error') {
    super(message)
    this.name = 'RegistryError'
    this.code = code
  }
}

const KINDS = new Set(['repo', 'dir', 'scratch'])

/** The id one owner identity maps to: stable for repo/dir, unique for scratch. */
function ownerIdFor({ kind, workspace, cwd }, ids) {
  if (kind === 'repo') return 'repo-' + workspace
  if (kind === 'dir') return 'dir-' + createHash('sha256').update(cwd).digest('hex').slice(0, 12)
  return 'scr-' + ids.uuid()
}

export class OwnerRegistry {
  /**
   * @param {import('./store.js').Store} store - opened hub-bot store.
   * @param {{ scratchRoot: string, now?: () => string, ids?: { uuid: () => string } }} options
   */
  constructor(store, options) {
    if (!options?.scratchRoot) throw new RegistryError('OwnerRegistry requires a scratchRoot')
    this.store = store
    this.scratchRoot = options.scratchRoot
    this.now = options.now ?? (() => new Date().toISOString())
    this.ids = options.ids ?? { uuid: () => randomUUID() }
  }

  #read(id) {
    const raw = this.store.db.prepare('SELECT value FROM owner WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  #write(row) {
    this.store.db.prepare('INSERT OR REPLACE INTO owner (id, value) VALUES (?, ?)').run(row.id, JSON.stringify(row))
    return row
  }

  /** One owner row by id, or undefined. */
  get(id) {
    return this.#read(id)
  }

  /** All rows, chief first, then creation order. */
  list() {
    const rows = this.store.db.prepare('SELECT value FROM owner').all()
      .map(raw => JSON.parse(String(raw.value)))
    return rows.sort((a, b) => (b.role === 'chief') - (a.role === 'chief') || a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * Registers the L1 chief owner exactly once: the row appears at plugin start with status 'pending'; an existing
   * row (and its bound Session) is returned untouched, so restarts never unbind the chief.
   */
  ensureChief({ cwd, workspace }) {
    const existing = this.#read('chief')
    if (existing) return { owner: existing, created: false }
    if (!cwd) throw new RegistryError('ensureChief requires cwd')
    const at = this.now()
    const owner = this.#write({
      id: 'chief', role: 'chief', kind: 'repo', workspace: workspace ?? null, cwd,
      sessionId: null, status: 'pending', transient: false, recycled: false, createdAt: at, updatedAt: at,
    })
    return { owner, created: true }
  }

  /**
   * Creates (or returns the existing row for) one dynamic owner. repo needs workspace+cwd; dir needs cwd; scratch
   * allocates its own directory under scratchRoot and is marked transient. Identity ids make re-creation idempotent.
   */
  create({ kind, cwd, workspace }) {
    if (!KINDS.has(kind)) throw new RegistryError('create_owner: kind must be repo, dir, or scratch, got "' + kind + '"')
    if (kind === 'repo') {
      if (!workspace || typeof workspace !== 'string') throw new RegistryError('create_owner(repo) requires workspace')
      if (!cwd || typeof cwd !== 'string') throw new RegistryError('create_owner(repo) requires cwd')
    }
    if (kind === 'dir' && (!cwd || typeof cwd !== 'string')) {
      throw new RegistryError('create_owner(dir) requires cwd — the directory is the identity, never a guess')
    }
    const id = ownerIdFor({ kind, workspace, cwd }, this.ids)
    const existing = this.#read(id)
    if (existing) return existing
    const at = this.now()
    if (kind === 'scratch') {
      cwd = join(this.scratchRoot, id)
      mkdirSync(cwd, { recursive: true })
    }
    return this.#write({
      id, role: 'owner', kind, workspace: workspace ?? null, cwd,
      sessionId: null, status: 'pending',
      transient: kind === 'scratch', recycled: false, createdAt: at, updatedAt: at,
    })
  }

  /** Binds a live Session to an owner: the lazy-creation transition pending → created. */
  bindSession(id, sessionId) {
    const row = this.#require(id)
    return this.#write({ ...row, sessionId, status: 'created', updatedAt: this.now() })
  }

  /**
   * Lifecycle: the scratch owner's directory was recycled (issue #70). The row — including its sessionId —
   * is retained: 注册表保留 recycled 记录, 会话历史保留可查. recycled rows never recycle twice.
   */
  markRecycled(id) {
    const row = this.#require(id)
    return this.#write({ ...row, recycled: true, recycledAt: this.now(), updatedAt: this.now() })
  }

  /** The owner's Session was found gone: forget it so the next route lazily recreates one. */
  markSessionMissing(id) {
    const row = this.#require(id)
    return this.#write({ ...row, sessionId: null, status: 'pending', updatedAt: this.now() })
  }

  /**
   * Proof aid for the "deleted Session rebuilds" acceptance path: point the row at a dangling Session id (as a
   * manual Session deletion leaves it) without changing status, so the next injection observes a real failure.
   */
  invalidateSessionForTest(id, danglingSessionId) {
    const row = this.#require(id)
    return this.#write({ ...row, sessionId: danglingSessionId, updatedAt: this.now() })
  }

  #require(id) {
    const row = this.#read(id)
    if (!row) throw new RegistryError('unknown owner "' + id + '"')
    return row
  }
}
