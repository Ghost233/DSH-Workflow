import { createRecoverySessionFixture, appendObservedPrompt, reserveRecoverySession } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'
import { inspectRecoverySession } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/recovery-session.mjs'

const disposers = []
const fixture = await createRecoverySessionFixture({ after: fn => disposers.push(fn) })
try {
  const content = 'recover the failed owner task'
  const receipt = await reserveRecoverySession(fixture)
  await appendObservedPrompt(fixture, receipt, content)
  const raw = await fixture.readRaw(receipt.executionIdentity.sessionId)
  const read = await fixture.readFrom(receipt.executionIdentity.sessionId)
  const result = await inspectRecoverySession({
    persistence: fixture.ctx.sessionPersistence,
    executionIdentity: receipt.executionIdentity,
    prompt: { id: receipt.executionIdentity.promptId, content },
  })
  const summarize = event => ({
    seq: event.seq,
    type: event.type,
    ...(event.type === 'user/message' || event.type === 'agent/inbox/spliced' ? { data: event.data } : {}),
  })
  process.stdout.write(`${JSON.stringify({
    result,
    rawEventTypes: raw.content.trim().split('\n').map(line => JSON.parse(line).type),
    readEvents: read.events.map(summarize),
  }, null, 2)}\n`)
} finally {
  await Promise.all(disposers.map(fn => fn()))
}
