import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { connectModelRpc } from './model-rpc.mjs'

/** Relay the Host-owned OAuth attempt over a private JSON-line interaction. */
export async function runCodexAuthorization(call, { send, input, method = 'browser', name = 'Codex 账号' }) {
  let cancelled = false, answer, id, settled = false
  const onLine = line => {
    let message
    try { message = JSON.parse(line) } catch { return }
    if (message?.type === 'cancel') cancelled = true
    if (message?.type === 'answer' && typeof message.value === 'string' && message.value.length <= 8192) answer = message.value
  }
  const onClose = () => { cancelled = true }
  input.on('line', onLine)
  input.once('close', onClose)
  try {
    id = (await call('start', { method, name })).id
    if (typeof id !== 'string' || !id) throw new Error('Missing authorization attempt')
    while (true) {
      if (cancelled) { await call('cancel', { id }); cancelled = false }
      if (answer !== undefined) { const value = answer; answer = undefined; await call('answer', { id, value }) }
      const result = await call('poll', { id })
      if (!Array.isArray(result.events)) throw new Error('Invalid authorization response')
      for (const event of result.events) {
        if (!['open', 'device', 'prompt', 'prompt-withdrawn', 'authorized', 'cancelled', 'error'].includes(event?.type)) continue
        send(event)
      }
      if (result.done) { settled = true; return }
      await delay(300)
    }
  } finally {
    input.off('line', onLine)
    input.off('close', onClose)
    if (id && !settled) await call('cancel', { id }).catch(() => {})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, dataRoot, resources, method, name] = process.argv.slice(2)
  const send = value => process.stdout.write(JSON.stringify(value) + '\n')
  let input
  try {
    if (action !== 'login' || !resources || !dataRoot) throw new Error('Invalid authorization request')
    const rpc = await connectModelRpc(dataRoot, resources)
    input = createInterface({ input: process.stdin, terminal: false })
    await runCodexAuthorization((operation, args) => rpc.codex(operation, args), { send, input, method, name })
  } catch {
    send({ type: 'error', message: 'Codex 登录失败，请检查网络和授权后重试。' })
    process.exitCode = 1
  } finally { input?.close() }
}
