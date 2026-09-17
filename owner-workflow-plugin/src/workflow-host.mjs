import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { withControlLock } from './workflow-store.mjs'

/** One live executor per catalog. Only kernel closure or OS process death releases it. */
export async function acquireWorkflowHost(store) {
  const acquired = Promise.withResolvers()
  const released = Promise.withResolvers()
  const hostId = randomUUID()
  const lifetime = withControlLock(join(store.directory, 'executor.lock'), async lease => {
    acquired.resolve({ hostId, assertHeld: () => lease.assertHeld() })
    await released.promise
  }, { timeoutMs: 0 })
  lifetime.catch(acquired.reject)
  const identity = await acquired.promise
  let closing
  return { ...identity, close() { return closing ??= (released.resolve(), lifetime) } }
}
