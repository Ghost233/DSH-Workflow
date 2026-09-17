import { constants } from 'node:fs'
import fsExt from 'fs-ext'
import { setTimeout as delay } from 'node:timers/promises'
import { open, mkdir, readFile, rename, lstat, realpath, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { publishArtifact, readArtifact } from './effect-artifacts.mjs'
import { assertControlState, createControlState, transition, view } from './workflow-engine.mjs'
import { ensureRuntimeGitignore } from './project-layout.mjs'

async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  if ((await lstat(path)).isSymbolicLink()) throw new Error('Control directory must not be a symlink')
}
async function rejectLink(path) {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Unsafe control file: ${path}`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}

// flock is the cross-process authority. Queue callers that already share this
// process so their lock timeout measures external contention rather than time
// spent behind another callback from the same Runtime.
const processLockTails = new Map()
async function queueProcessLock(path, callback, signal) {
  const key = resolve(path)
  const prior = processLockTails.get(key) ?? Promise.resolve()
  const run = prior.then(() => { signal?.throwIfAborted(); return callback() })
  const tail = run.then(() => undefined, () => undefined)
  processLockTails.set(key, tail)
  try { return await run }
  finally { if (processLockTails.get(key) === tail) processLockTails.delete(key) }
}

/** The actual writer holds the OS lock. Process exit releases it; no lease stealing or helper process. */
export async function withControlLock(path, callback, { signal, timeoutMs = 10_000 } = {}) {
  signal?.throwIfAborted()
  await rejectLink(path)
  const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  let held = false
  const until = performance.now() + timeoutMs
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1) throw new Error('Unsafe OS lock file')
    while (!held) {
      signal?.throwIfAborted()
      try { fsExt.flockSync(file.fd, 'exnb'); held = true }
      catch (error) {
        if (!['EAGAIN', 'EWOULDBLOCK'].includes(error.code)) throw error
        if (performance.now() >= until) throw Object.assign(new Error('Control lock acquisition timed out'), { code: 'CONTROL_LOCK_BUSY' })
        await delay(Math.min(25, Math.max(1, until - performance.now())), undefined, { signal })
      }
    }
    const lease = {
      assertHeld() { if (!held) throw new Error('OS lock authority has ended') },
      async publishControl(value) {
        this.assertHeld()
        const target = join(dirname(path), 'control-state.json')
        await rejectLink(target)
        const temporary = join(dirname(path), `.control-${randomUUID()}.tmp`)
        try {
          const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
          try { await output.writeFile(`${JSON.stringify(value)}\n`); await output.sync() } finally { await output.close() }
          this.assertHeld()
          await rename(temporary, target)
          const dir = await open(dirname(path), 'r')
          try { await dir.sync() } finally { await dir.close() }
        } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
      },
    }
    // Cancellation cannot release the descriptor while a source write or state
    // publication is still unwinding. The caller's finally is part of the lock.
    signal?.throwIfAborted()
    return await callback(lease)
  } finally {
    held = false
    await file.close()
  }
}

async function withSerializedStoreLock(path, callback, options = {}) {
  return queueProcessLock(path, () => withControlLock(path, callback, options), options.signal)
}

async function atomicWrite(lease, value, hooks = {}) {
  await hooks.beforeRename?.()
  await lease.publishControl(value)
  await hooks.afterRename?.()
}

export class WorkflowStore {
  constructor(catalogRoot, { clock, parallel = 3, hooks = {}, lock = {}, onListenerError = error => console.error('[workflow-store subscriber]', error) } = {}) {
    this.root = resolve(catalogRoot)
    this.directory = join(this.root, '.dsh-workflow')
    this.path = join(this.directory, 'control-state.json')
    this.lockPath = join(this.directory, 'control-state.lock')
    this.listeners = new Set()
    this.onListenerError = onListenerError
    this.clockAnchor = { wall: Date.now(), monotonic: performance.now() }
    this.clock = clock ?? (() => Math.floor(Math.max(Date.now(), this.clockAnchor.wall + performance.now() - this.clockAnchor.monotonic)))
    this.customClock = Boolean(clock); this.parallel = parallel; this.hooks = hooks; this.lockOptions = lock
  }
  async initialize({ signal } = {}) {
    this.root = await realpath(this.root)
    this.directory = join(this.root, '.dsh-workflow')
    this.path = join(this.directory, 'control-state.json')
    this.lockPath = join(this.directory, 'control-state.lock')
    await directory(this.directory)
    await ensureRuntimeGitignore(this.directory)
    return withSerializedStoreLock(this.lockPath, async lease => {
      try {
        const state = await this.read()
        if (!this.customClock) this.clockAnchor = { wall: Math.max(Date.now(), state.lastObservedAt ?? 0), monotonic: performance.now() }
        return state
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        const state = createControlState({ catalogId: this.root, parallel: this.parallel })
        await atomicWrite(lease, state, this.hooks)
        return state
      }
    }, { ...this.lockOptions, signal })
  }
  async read() {
    const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let state
    try {
      await this.hooks.afterReadOpen?.()
      const info = await file.stat()
      // A concurrent atomic replacement can unlink this already-open immutable
      // version. nlink=0 is a valid snapshot; >1 would alias a mutable outside file.
      if (!info.isFile() || info.nlink > 1) throw new Error('Unsafe control file')
      state = JSON.parse(await file.readFile('utf8'))
    } finally { await file.close() }
    assertControlState(state)
    if (state.catalogId !== this.root) throw new Error('Workflow catalog identity mismatch')
    return state
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  /** Serialize an admitted source mutation with action admission. The callback must not transact. */
  async withLockedState(validate, callback, { signal } = {}) {
    return withSerializedStoreLock(this.lockPath, async lease => {
      const current = await this.read()
      await validate(current)
      signal?.throwIfAborted(); lease.assertHeld()
      return callback()
    }, { ...this.lockOptions, signal })
  }
  async bindProject(root, { signal } = {}) {
    const canonical = await realpath(root)
    const dir = join(canonical, '.dsh-workflow')
    await directory(dir)
    await ensureRuntimeGitignore(dir)
    await withControlLock(join(dir, 'catalog-binding.lock'), async () => {
      const path = join(dir, 'catalog-binding.json')
      const current = await readArtifact(path)
      const binding = { contract: 'DSH_WORKFLOW_CATALOG_BINDING_V1', root: canonical, catalogId: this.root }
      if (current && (current.contract !== binding.contract || current.root !== canonical || current.catalogId !== this.root)) throw new Error('Project belongs to another workflow catalog')
      if (!current) await publishArtifact(path, binding)
    }, { ...this.lockOptions, signal })
    return canonical
  }
  async transact(event, { signal, validate } = {}) {
    if (['workflow.create', 'registry.request'].includes(event.type)) {
      event = { ...event, root: await this.bindProject(event.root, { signal }) }
    }
    const applied = await withSerializedStoreLock(this.lockPath, async lease => {
      signal?.throwIfAborted()
      const current = await this.read()
      await validate?.(current)
      const applied = transition(current, event, this.clock())
      if (applied.changed) {
        signal?.throwIfAborted()
        await atomicWrite(lease, applied.state, this.hooks)
      }
      return applied
    }, { ...this.lockOptions, signal })
    if (applied.changed) for (const listener of this.listeners) {
      const report = error => { try { this.onListenerError(error) } catch { /* Observers cannot uncommit a transaction. */ } }
      try { Promise.resolve(listener(applied)).catch(report) }
      catch (error) { report(error) }
    }
    return applied
  }
  async readView(workflowId) { return view(await this.read(), workflowId) }
}
