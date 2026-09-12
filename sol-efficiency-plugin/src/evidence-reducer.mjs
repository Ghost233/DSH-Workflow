import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { DIAGNOSTIC_COMMAND, hasLikelySecret, reducerInput, reducerInstructions, validateReceipt, receiptText } from './receipt.mjs'

async function fullStream(ctx, stream, signal, maxBytes) {
  if (!stream.truncated) return stream.text
  if (!stream.spillPath) return undefined
  const target = await ctx.fs.resolve(stream.spillPath, { signal })
  const info = await ctx.fs.stat(target, signal)
  if (!info || (info.size !== undefined && info.size > maxBytes)) return undefined
  let text = ''
  let bytes = 0
  for await (const part of await ctx.fs.streamText(target, signal)) {
    signal.throwIfAborted()
    bytes += Buffer.byteLength(part)
    if (bytes > maxBytes) return undefined
    text += part
  }
  return text
}

/** Read complete stdout/stderr through the mounted filesystem, never through host path shortcuts. */
export async function candidateBody(ctx, value, signal, maxBytes) {
  const stdout = await fullStream(ctx, value.stdout, signal, maxBytes)
  if (stdout === undefined) return undefined
  const remaining = maxBytes - Buffer.byteLength(stdout) - Buffer.byteLength('[stdout]\n\n[stderr]\n')
  if (remaining < 0) return undefined
  const stderr = await fullStream(ctx, value.stderr, signal, remaining)
  if (stderr === undefined) return undefined
  const body = `[stdout]\n${stdout}\n[stderr]\n${stderr}`
  return Buffer.byteLength(body) <= maxBytes ? body : undefined
}

async function callReducer(ctx, options, config) {
  const assembler = new BlockAssembler()
  let bytes = 0
  for await (const chunk of ctx.llm.stream(options)) {
    options.signal.throwIfAborted()
    // Bound all returned chunk data, including reasoning and assembled blocks.
    bytes += Buffer.byteLength(JSON.stringify(chunk))
    if (bytes > config.maxResponseBytes) throw new Error('reducer response exceeds maxResponseBytes')
    assembler.push(chunk)
  }
  if (assembler.finish?.kind !== 'stop') throw new Error('reducer did not finish normally')
  const blocks = assembler.blocks()
  if (blocks.some(block => !['text', 'reasoning'].includes(block.type))) throw new Error('reducer returned unsupported content')
  return { raw: blocks.filter(block => block.type === 'text').map(block => block.text).join(''), usage: assembler.usage }
}

/** Replace only successful bash result content; command failure is derived from the canonical exit status. */
export function installEvidenceReducer(ctx, config, fusionCalls, lifetime) {
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value') || decision.content !== undefined
      || result.isError || exec.name !== 'bash' || (exec.parent !== undefined && !fusionCalls.has(exec.parent))
      || !exec.agent || exec.signal.aborted || result.value?.kind !== 'foreground'
      || result.value.timedOut || result.value.aborted || result.value.exitCode === null
      || !DIAGNOSTIC_COMMAND.test(exec.arguments.command) || hasLikelySecret(exec.arguments.command)
      || result.content.some(block => block.type !== 'text')) return decision

    return lifetime.run(exec.signal, async parentSignal => {
      // One deadline covers archive reads, provider work and receipt storage.
      const controller = new AbortController()
      const relay = () => controller.abort(parentSignal.reason)
      if (parentSignal.aborted) relay()
      else parentSignal.addEventListener('abort', relay, { once: true })
      const timer = setTimeout(() => controller.abort(new Error('EPR deadline exceeded')), config.timeoutMs)
      const signal = controller.signal
      try {
        // No second connection setup: the optional reducer follows the active session by default.
        const selection = exec.agent.session.requestHeader?.()?.config ?? exec.agent.options
        const provider = config.provider || selection?.provider
        const model = config.model || selection?.model
        if (!provider || !model) return decision
        const body = await candidateBody(ctx, result.value, signal, config.maxBytes)
        if (body === undefined || Buffer.byteLength(body) < config.minBytes || hasLikelySecret(body)) return decision
        const inlineBytes = Buffer.byteLength(result.content.map(block => block.text).join(''))
        if (inlineBytes < config.minBytes) return decision
        const failed = result.value.exitCode !== 0
        const save = (label, content) => ctx.spillStore.saveText({
          owner: { sessionId: exec.agent.session.header.id },
          source: { toolName: exec.name, callId: exec.callId, label },
          suggestedName: `sol-${label}.txt`, content,
        })
        const source = await save('source', body)
        signal.throwIfAborted()
        const request = {
          provider, model, reasoningEffort: config.reasoningEffort,
          maxTokens: config.maxOutputTokens, purpose: 'compaction', sessionId: exec.agent.session.header.id,
          system: reducerInstructions(),
          messages: [createUserMessage({ content: [{ type: 'text', text: reducerInput(exec.arguments.command, body, failed) }],
            source: { kind: 'plugin', plugin: 'sol-efficiency' } })],
        }
        const response = await callReducer(ctx, { ...request, signal }, config)
        const validated = validateReceipt(response.raw, body, failed)
        const audit = await save('audit', JSON.stringify({ request, source, response, validationPassed: Boolean(validated) }))
        signal.throwIfAborted()
        if (!validated) return decision
        const text = receiptText({ command: exec.arguments.command, body, validated, source, audit,
          provider, model, usage: response.usage, exitCode: result.value.exitCode })
        const bytes = Buffer.byteLength(text)
        if (bytes >= inlineBytes || bytes > config.maxReceiptBytes) return decision
        return { ...decision, content: [{ type: 'text', text }] }
      } catch {
        // Storage, cancellation and provider failures are optional-reduction failures, never tool failures.
        ctx.logger.warn('sol-efficiency: EPR unavailable or rejected; retaining the original tool result')
        return decision
      } finally {
        clearTimeout(timer)
        parentSignal.removeEventListener('abort', relay)
        controller.abort()
      }
    })
  })
}
