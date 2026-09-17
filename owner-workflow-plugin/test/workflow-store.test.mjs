import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { WorkflowStore, withControlLock } from '../src/workflow-store.mjs'

async function fixture(t, options) {
  const directory = await mkdtemp(join(tmpdir(), 'ukr-store-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new WorkflowStore(directory, options)
  await store.initialize()
  return store
}
const create = (id, root) => ({ type: 'workflow.create', id, root, rootSessionId: 'root', request: id, baseCommit: 'base' })

test('source writes and action admission share one lock and validate the final mutable baseline', async t => {
  const store = await fixture(t)
  await store.transact(create('wf1', store.root))
  const file = join(store.root, 'source.md')
  await writeFile(file, 'R1')
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const writing = store.withLockedState(() => {}, async () => {
    entered.resolve(); await release.promise
    await writeFile(file, 'R2')
  })
  await entered.promise
  const admission = store.transact({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'R1', input: {} }, {
    validate: async () => { if (await readFile(file, 'utf8') !== 'R1') throw new Error('source changed') },
  })
  const rejected = assert.rejects(admission, /source changed/)
  release.resolve(); await writing; await rejected
  assert.equal(Object.values((await store.read()).actions).length, 0)
  await store.transact({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'R2', input: {} }, {
    validate: async () => assert.equal(await readFile(file, 'utf8'), 'R2'),
  })
  await assert.rejects(store.withLockedState(state => {
    if (Object.values(state.actions).some(action => action.kind === 'plan')) throw new Error('planning sources in use')
  }, () => writeFile(file, 'R3')), /sources in use/)
  assert.equal(await readFile(file, 'utf8'), 'R2')
})

test('store commits concurrent events against fresh state, without lost updates', async t => {
  const store = await fixture(t)
  const other = new WorkflowStore(store.root)
  await other.initialize()
  await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? store : other).transact(create(`wf${i}`, store.root))))
  assert.equal(Object.keys((await store.read()).workflows).length, 8)
  const bytes = await readFile(store.path, 'utf8')
  await store.transact({ type: 'drive' })
  assert.equal(await readFile(store.path, 'utf8'), bytes)
})

test('same-process writers queue before the OS lock acquisition timeout begins', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let hold = false
  const store = await fixture(t, { lock: { timeoutMs: 20 }, hooks: { beforeRename: async () => {
    if (!hold) return
    entered.resolve(); await release.promise
  } } })
  const other = new WorkflowStore(store.root, { lock: { timeoutMs: 20 } })
  await other.initialize()

  hold = true
  const first = store.transact(create('first', store.root))
  await entered.promise
  const second = other.transact(create('second', store.root))
  await new Promise(resolve => setTimeout(resolve, 50))
  release.resolve()

  await Promise.all([first, second])
  assert.deepEqual(Object.keys((await store.read()).workflows).sort(), ['first', 'second'])
})

test('readers retain a valid immutable snapshot when a writer replaces its opened inode', async t => {
  const store = await fixture(t)
  const opened = Promise.withResolvers(), resume = Promise.withResolvers()
  const reader = new WorkflowStore(store.root, { hooks: { afterReadOpen: async () => { opened.resolve(); await resume.promise } } })
  const reading = reader.read()
  await opened.promise
  await store.transact(create('replacement', store.root))
  resume.resolve()
  assert.equal((await reading).revision, 0)
  assert.equal((await store.read()).revision, 1)
})

test('a failing subscriber cannot turn an already committed event into a failed mutation', async t => {
  const failures = []
  const store = await fixture(t, { onListenerError: error => failures.push(error.message) })
  let notified = 0
  store.subscribe(() => { throw new Error('subscriber failure') })
  store.subscribe(() => { notified++ })
  assert.equal((await store.transact(create('committed', store.root))).result, 'committed')
  assert.equal(notified, 1); assert.deepEqual(failures, ['subscriber failure'])
  assert.ok((await store.read()).workflows.committed)
})

test('KAC-23: failure before rename preserves state and releases lock', async t => {
  let fail = false
  const store = await fixture(t, { hooks: { beforeRename: () => { if (fail) throw new Error('injected disk failure') } } })
  fail = true
  await assert.rejects(store.transact(create('wf1', store.root)), /injected/)
  assert.equal((await store.read()).revision, 0)
  fail = false
  await store.transact(create('wf1', store.root))
  assert.equal((await store.read()).revision, 1)
})

test('KAC-23: corrupt control state is never initialized as empty state', async t => {
  const store = await fixture(t)
  await writeFile(store.path, '{broken')
  await assert.rejects(store.initialize(), SyntaxError)
  assert.equal(await readFile(store.path, 'utf8'), '{broken')
})

test('KAC-04/23: OS lock is released when writer crashes, without deleting lock inode', async t => {
  const store = await fixture(t)
  const module = new URL('../src/workflow-store.mjs', import.meta.url).href
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import { withControlLock } from ${JSON.stringify(module)}; await withControlLock(process.argv[1], async()=>{setInterval(()=>{},1000); console.log('held'); await new Promise(()=>{})})`, store.lockPath],
  { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  t.after(() => child.kill('SIGKILL'))
  await once(child.stdout, 'data')
  child.kill('SIGKILL'); await exited
  await store.transact(create('after-crash', store.root))
  assert.ok((await store.read()).workflows['after-crash'])
})

test('abort does not release the OS lock before the transaction callback exits', async t => {
  const store = await fixture(t)
  const controller = new AbortController()
  let leave, enter
  const entered = new Promise(resolve => { enter = resolve })
  const first = withControlLock(store.lockPath, async () => {
    enter(); await new Promise(resolve => { leave = resolve })
  }, { signal: controller.signal })
  await entered; controller.abort()
  let secondEntered = false
  const second = withControlLock(store.lockPath, async () => { secondEntered = true })
  await new Promise(resolve => setTimeout(resolve, 75))
  assert.equal(secondEntered, false)
  leave(); await first; await second
  assert.equal(secondEntered, true)
})
