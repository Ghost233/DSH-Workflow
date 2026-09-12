import { createInterface } from 'node:readline'

import { reopenRecoverySessionFixture } from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const [root, workflowId] = process.argv.slice(2)
const MAX_RUNTIME_MS = 12_000

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function nextCommand() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      return JSON.parse(line)
    }
    throw new Error('T16 parent closed the second Runtime command channel')
  } finally {
    lines.close()
  }
}

async function main() {
  if (typeof root !== 'string' || typeof workflowId !== 'string') {
    throw new Error('T16 second Runtime requires fixture root and workflow id')
  }
  const fixture = await reopenRecoverySessionFixture({ root, workflowId })
  try {
    const sameOwnerAttempt = await fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      workflowId,
      'T1',
      'api',
    ).then(
      value => ({ state: 'fulfilled', value }),
      error => ({ state: 'rejected', error: errorText(error) }),
    )
    emit({ type: 'same-owner-attempt', processId: process.pid, sameOwnerAttempt })

    const command = await nextCommand()
    if (command?.command !== 'acquire-after-termination') {
      throw new Error('T16 second Runtime received an unsupported command')
    }
    const newLease = await fixture.runtime.withOwnerLease(
      root,
      'api',
      workflowId,
      'T1',
      undefined,
      async lease => ({ token: lease.token }),
    )
    emit({ type: 'new-lease', processId: process.pid, token: newLease.token })
  } finally {
    await fixture.dispose()
  }
}

const hardTimeout = setTimeout(() => {
  emit({ type: 'fatal', processId: process.pid, error: `T16 second Runtime exceeded ${MAX_RUNTIME_MS}ms` })
  process.exitCode = 1
}, MAX_RUNTIME_MS)

try {
  await main()
} catch (error) {
  emit({ type: 'fatal', processId: process.pid, error: errorText(error) })
  process.exitCode = 1
} finally {
  clearTimeout(hardTimeout)
}
