import { createOwnerWorkflowRuntime } from '../../src/runtime.mjs'

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    code: error?.code,
  }
}

async function reserve(input) {
  const runtime = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  const agent = {
    id: input.agentId ?? 'recovery-admission-child',
    session: {
      id: input.sessionId ?? 'recovery-admission-child-session',
      header: { cwd: input.root },
    },
  }
  const deadline = Date.now() + (input.timeoutMs ?? 2_500)
  let lastError
  do {
    try {
      return { ok: true, response: await runtime.reserveRecoveryAdmission(agent, input.workflowId, input.request) }
    } catch (error) {
      lastError = error
      // Independent Harness processes may meet the state CAS/lease boundary.
      // Retrying the same immutable request proves the persisted idempotency rule.
      if (!/状态正在由另一个 Harness 临界区更新|状态已被其他 Harness 更新/u.test(String(error?.message ?? ''))) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  } while (Date.now() < deadline)
  return { ok: false, error: serializeError(lastError) }
}

process.on('message', async input => {
  try {
    const result = await reserve(input)
    process.send?.(result)
  } catch (error) {
    process.send?.({ ok: false, error: serializeError(error) })
  } finally {
    process.disconnect?.()
  }
})
