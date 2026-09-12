import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createOwnerWorkflowRuntime } from '../../src/runtime.mjs'

const [mode, root, workflowId] = process.argv.slice(2)
if (!mode || !root || !workflowId) throw new Error('mode, root and workflowId are required')

const statePath = join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
const runtime = createOwnerWorkflowRuntime({}, {})

async function attemptLateReceipt(state, record) {
  try {
    await runtime.assertOwnerCompletionAdmission({
      workflowId,
      workflowRoot: root,
      stageId: 'task-b',
      owner: { id: 'b' },
      planDigest: record.planDigest,
      attempt: record.attempt,
      settlementGeneration: record.settlementGeneration,
      lease: { token: record.leaseToken },
      state,
    }, { agent: { id: record.sessionId } })
  } catch (error) {
    return { rejected: true, message: error?.message ?? String(error) }
  }
  throw new Error('late owner receipt was unexpectedly admitted')
}

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  const record = state.ownerRuns?.['task-b:b']
  if (record === undefined) throw new Error('controlled task-b:b owner run is missing')

  if (mode === 'late_receipt') {
    process.stdout.write(`${JSON.stringify(await attemptLateReceipt(state, record))}\n`)
    return
  }

  if (mode === 'late_receipt_wait') {
    if (typeof process.send !== 'function') throw new Error('late_receipt_wait requires an IPC parent')
    process.send({ type: 'ready', pid: process.pid })
    await new Promise(resolve => process.once('message', resolve))
    process.send({ type: 'late_receipt', pid: process.pid, ...await attemptLateReceipt(state, record) })
    return
  }

  if (mode === 'terminal_reconcile') {
    runtime.inspectOwnerSessionTerminal = async sessionId => {
      if (sessionId !== record.sessionId) throw new Error(`unexpected session ${String(sessionId)}`)
      return { revision: 19, reason: 'aborted' }
    }
    const result = await runtime.reconcileStoppingOwnerAttempts(state)
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({
      changed: result.changed,
      settled: result.settled.length,
      paused: result.paused.length,
    })}\n`)
    return
  }

  throw new Error(`unknown mode ${mode}`)
}

try {
  await main()
} finally {
  await runtime.dispose()
  process.disconnect?.()
}
