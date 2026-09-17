import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { boot } from './helpers.mjs'

/** Run a keyless real agent round with native mutation/bash and only the remote model replaced. */
export async function runDemo(t, { inspect } = {}) {
  const { ctx, tree, cwd } = await boot(t)
  const handle = await ctx.agents.create({ sessionId: SessionId('sol-demo'),
    agentOptions: { provider: 'sol-test', model: 'fixture' }, meta: { cwd } })
  t.after(async () => { await handle.dispose() })
  const agent = handle.agent
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Write a demo file and verify it.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const events = agent.session.snapshotEvents()
  const calls = events.filter(event => event.type === 'tool/call').map(event => event.data.name)
  const nested = events.filter(event => event.type === 'tool/ptc-dispatch').map(event => event.data.name)
  const results = events.filter(event => event.type === 'tool/result')
  const resultText = JSON.stringify(results.map(event => event.data.message))
  const assistant = events.filter(event => event.type === 'assistant/message').at(-1)?.data.message.content
    .filter(block => block.type === 'text').map(block => block.text).join('')
  await inspect?.({ ctx, handle, agent, events })
  return { calls, nested, mutationApplied: resultText.includes('mutation=applied'),
    receiptPresent: resultText.includes('dsh_sol_evidence_receipt_v1'),
    verificationEvidencePresent: resultText.includes('PASS verification'), assistant }
}
