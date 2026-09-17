import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { acquireWorkflowHost } from '../src/workflow-host.mjs'

test('catalog admits one executor and releases only after its owned work closes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-host-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new WorkflowStore(root); await store.initialize()
  const first = await acquireWorkflowHost(store)
  await assert.rejects(acquireWorkflowHost(store), { code: 'CONTROL_LOCK_BUSY' })
  first.assertHeld()
  await first.close()
  assert.throws(first.assertHeld, /ended/)
  const second = await acquireWorkflowHost(store)
  assert.notEqual(second.hostId, first.hostId)
  await second.close()
})

test('actual executor death releases the OS fence without PID or age takeover', { timeout: 10_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-host-crash-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new WorkflowStore(root); await store.initialize()
  const source = `import { acquireWorkflowHost } from ${JSON.stringify(new URL('../src/workflow-host.mjs', import.meta.url).href)};
    await acquireWorkflowHost({ directory: ${JSON.stringify(store.directory)} });
    process.stdout.write('locked\\n'); setInterval(() => {}, 1000);`
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  await once(child.stdout, 'data')
  await assert.rejects(acquireWorkflowHost(store), { code: 'CONTROL_LOCK_BUSY' })
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited
  const recovered = await acquireWorkflowHost(store); await recovered.close()
})
