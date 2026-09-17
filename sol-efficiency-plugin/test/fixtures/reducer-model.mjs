import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { RECEIPT_SCHEMA } from '../../src/receipt.mjs'

export const name = 'sol-test-model'
export const inject = ['llm']
export const requests = []
export let responseMode = 'valid'
export function setResponseMode(mode) { responseMode = mode }

export class Adapter extends LlmAdapter {
  async resolveModel(provider, model) {
    if (model === 'no-reasoning') return { provider, id: model, name: model }
    if (model === 'default-medium') return { provider, id: model, name: model,
      reasoning: { efforts: [{ id: 'medium', name: 'Medium' }], defaultEffort: 'medium' } }
    return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'off', name: 'Off' }], defaultEffort: 'off' } }
  }
  async *stream(options) {
    requests.push(options)
    if (options.purpose !== 'compaction') {
      const result = options.messages.flatMap(message => message.content).find(block => block.type === 'tool-result')
      if (result) {
        const text = JSON.stringify(result)
        yield { type: 'text-delta', index: 0, text: text.includes('dsh_sol_evidence_receipt_v1')
          ? 'File written and verification passed. Exact evidence is archived.'
          : 'Verification result did not contain an evidence receipt.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } else {
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('demo-fusion'), name: 'write_then_run',
          arguments: JSON.stringify({ file_path: 'demo.txt', content: 'demo content\n', then_run: {
            command: `node -e 'process.stdout.write("compiling module\\n".repeat(700) + "PASS verification\\n")' # npm test`,
            description: 'Verify the demo file with test output',
          } }),
        } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      }
      return
    }
    if (responseMode === 'timeout') {
      await new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason)
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    }
    if (responseMode === 'error') throw new Error('Fixture reducer unavailable')
    const text = options.messages.at(-1).content[0].text
    const hash = text.match(/source_sha256=([a-f0-9]+)/)[1]
    const failed = text.includes('is_error=true')
    const raw = JSON.stringify({ schema: RECEIPT_SCHEMA, source_sha256: hash,
      status: failed ? 'failure' : 'success', uncertain: false,
      evidence: [{ kind: failed ? 'failure' : 'summary', quote: responseMode === 'invalid' ? 'fabricated evidence' : failed ? 'error: test failed' : 'PASS verification' }],
    })
    yield { type: 'text-delta', index: 0, text: raw }
    yield { type: 'usage', usage: { inputTokens: 1500, outputTokens: 80, totalTokens: 1580 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  ctx.llm.registerAdapter(['sol-test'], new Adapter())
}
