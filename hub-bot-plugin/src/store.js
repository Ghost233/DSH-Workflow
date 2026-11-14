/**
 * SQLite persistence for hub-bot: Triggers, Tasks, the owner registry, and the channel outbox.
 *
 * The schema is versioned by SQLite's own `PRAGMA user_version`: a fresh database is version 0, and opening runs every
 * migration between the stored version and SCHEMA_VERSION inside one transaction per step. A database newer than this
 * build is rejected rather than downgraded. Later tickets append migrations; they never edit shipped ones.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The schema version this build writes. Bump by appending one migration to `migrations`. */
export const SCHEMA_VERSION = 1

/**
 * Ordered migrations: `migrations[v]` upgrades a database from version v to v+1. Each runs inside a transaction with
 * user_version already claimed by the caller; a throw leaves the database at its previous version.
 * @type {Array<(db: import('node:sqlite').DatabaseSync) => void>}
 */
export const migrations = [
  // 0 → 1: the task-1 skeleton. Domain records are JSON documents keyed by id; the outbox carries the channel queue.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trigger (id TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticket (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);
    `)
  },
]

/** A state database whose schema cannot be opened by this build. */
export class StoreError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'StoreError'
  }
}

/**
 * The hub-bot SQLite store: one file under stateDir, opened with WAL journaling and full fsync semantics.
 * Records are JSON documents; domain accessors arrive with the tickets that need them (#64+).
 */
export class Store {
  /** @param {string} stateDir - absolute state directory from the plugin configuration. */
  constructor(stateDir) {
    this.stateDir = stateDir
    this.path = join(stateDir, 'hub-bot.sqlite')
    mkdirSync(dirname(this.path), { recursive: true })
    this.db = new DatabaseSync(this.path)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL')
    this.#migrate()
    this.db.exec(`PRAGMA busy_timeout=5000`)
  }

  /** Runs every pending migration in order, stamping user_version after each step. */
  #migrate() {
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
    if (version > SCHEMA_VERSION) {
      const message = `hub-bot database is at schema ${version}, newer than this build's schema ${SCHEMA_VERSION}; upgrade hub-bot`
      this.db.close()
      throw new StoreError(message)
    }
    for (let v = version; v < SCHEMA_VERSION; v++) {
      const migrate = migrations[v]
      if (!migrate) {
        const message = `hub-bot database is at schema ${version} but this build has no migration to ${v + 1}`
        this.db.close()
        throw new StoreError(message)
      }
      try {
        this.db.exec('BEGIN')
        migrate(this.db)
        this.db.exec(`PRAGMA user_version=${v + 1}`)
        this.db.exec('COMMIT')
      } catch (error) {
        try { this.db.exec('ROLLBACK') } catch { /* already rolled back */ }
        this.db.close()
        const reason = error instanceof Error ? error.message : String(error)
        throw new StoreError(`hub-bot database unchanged at schema ${v}: migration to ${v + 1} failed: ${reason}`, { cause: error })
      }
    }
  }

  /** The schema version the opened database now runs at. */
  get schemaVersion() {
    return Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
  }

  /** Sets one key-value row, replacing any previous value. */
  set(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }

  /** Reads one key-value row, or undefined when absent. */
  get(key) {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key)
    return row === undefined ? undefined : JSON.parse(String(row.value))
  }

  /** Closes the database; the store must not be used afterwards. */
  close() {
    this.db.close()
  }
}
