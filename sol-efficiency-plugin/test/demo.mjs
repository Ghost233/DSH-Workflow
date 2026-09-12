import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { boot } from './helpers.mjs'

/** Run a keyless real agent round with native mutation/bash and only the remote model replaced. */
export async function runDemo(t) {
  const { ctx, tree, cwd } = await boot(t)
  await ctx.loader.create({ name: '@deepseek-ai/dsh-agent' })
  await ctx.loader.create({ name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } })
  await ctx.loader.await()
  const agent = ctx.agentLoop.create(SessionId('sol-demo'), { provider: 'sol-test', model: 'fixture' }, { cwd })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Write a demo file and verify it.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const events = agent.session.events
  const calls = events.filter(event => event.type === 'tool/call').map(event => event.data.name)
  const nested = events.filter(event => event.type === 'tool/code-dispatch').map(event => event.data.name)
  const results = events.filter(event => event.type === 'tool/result')
  const resultText = JSON.stringify(results.map(event => event.data.message))
  const assistant = events.filter(event => event.type === 'assistant/message').at(-1)?.data.message.content
    .filter(block => block.type === 'text').map(block => block.text).join('')
  return { calls, nested, mutationApplied: resultText.includes('mutation=applied'),
    receiptPresent: resultText.includes('dsh_sol_evidence_receipt_v1'),
    verificationEvidencePresent: resultText.includes('PASS verification'), assistant }
}
