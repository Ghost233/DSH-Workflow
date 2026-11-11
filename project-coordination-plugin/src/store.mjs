import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync, openSync, writeFileSync, readFileSync, unlinkSync, closeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

/** The project's own records; never opens Tobs operational storage. */
export class Store {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.lockPath = `${path}.host-lock`
    this.nonce = randomUUID()
    const acquire = () => {
      try { this.lockFd = openSync(this.lockPath, 'wx', 0o600) }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        const owner = JSON.parse(readFileSync(this.lockPath, 'utf8'))
        if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || !owner.nonce) throw new Error('Unknown coordination Host lock')
        try { process.kill(owner.pid, 0) }
        catch (cause) {
          if (cause.code !== 'ESRCH') throw cause
          unlinkSync(this.lockPath)
          return acquire()
        }
        throw new Error('Coordination storage is already owned by a running Host')
      }
      writeFileSync(this.lockFd, JSON.stringify({ pid: process.pid, nonce: this.nonce }))
    }
    acquire()
    try { this.db = new DatabaseSync(path) }
    catch (error) { this.close(); throw error }
    chmodSync(path, 0o600)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL,
        value TEXT NOT NULL, PRIMARY KEY(kind,id));`)
  }
  get(kind, id) {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id)
    return row ? JSON.parse(row.value) : undefined
  }
  list(kind) { return this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(row.value)) }
  put(kind, id, value) {
    this.db.prepare('INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
      .run(kind, id, JSON.stringify(value))
    return value
  }
  transaction(run) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = run(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() {
    if (this.db) { this.db.close(); this.db = undefined }
    if (this.lockFd !== undefined) {
      closeSync(this.lockFd); this.lockFd = undefined
      if (JSON.parse(readFileSync(this.lockPath, 'utf8')).nonce === this.nonce) unlinkSync(this.lockPath)
    }
  }
}
