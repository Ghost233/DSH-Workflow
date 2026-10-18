import { createRequire } from 'node:module'
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const name = 'dsh-service-task-model-fixture'
export const inject = ['llm']

/** Only the external model is scripted; real Host agents, inboxes and persistence execute normally. */
export function apply(ctx, { anchor, directory }) {
  const { LlmAdapter } = createRequire(anchor)('@deepseek-ai/dsh-llm')
  let calls = 0
  // Observe the public catalog after its durable delivery commit; this is evidence, never task substitution.
  ctx.inject(['schedule'], scheduleCtx => {
    scheduleCtx.on('schedule/changed', () => {
      void scheduleCtx.schedule.catalog().then(rows => Promise.all(rows.filter(row => row.lastDelivery).map(row =>
        writeFile(join(directory, `reminder-delivery-${row.id}.json`), JSON.stringify(row) + '\n'))))
        .catch(error => writeFile(join(directory, 'reminder-observer-error'), String(error)))
    })
  })
  class HeldModel extends LlmAdapter {
    listModels(provider) { return Promise.resolve([{ provider, id: 'held-task', name: 'Held external task fixture' }]) }
    async *stream(options) {
      const call = ++calls
      await writeFile(join(directory, `model-request-${call}.json`), JSON.stringify({ call, model: options.model }) + '\n')
      try {
        while (true) {
          options.signal?.throwIfAborted()
          try { await access(join(directory, `release-model-${call}`)); break }
          catch (error) { if (error.code !== 'ENOENT') throw error }
          await delay(25, undefined, { signal: options.signal })
        }
        let script
        try { script = JSON.parse(await readFile(join(directory, `model-response-${call}.json`), 'utf8')) }
        catch (error) { if (error.code !== 'ENOENT') throw error }
        if (script) { for (const chunk of script) { options.signal?.throwIfAborted(); yield chunk }; return }
        const text = `S04 persisted task result ${call}`
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 8 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } catch (error) {
        await writeFile(join(directory, `model-canceled-${call}`), String(error))
        throw error
      }
    }
  }
  ctx.llm.registerAdapter(['service-task-fixture'], new HeldModel())
}
