import { SERVICE_PROTOCOL, redact, connectServiceSocket } from './service-control.mjs'

/** Read-only control connections receive snapshots only when their contents change. */
export function statusNotifications(snapshot) {
  const clients = new Map()
  let queued = false, closed = false
  const publish = () => {
    if (closed || queued || !clients.size) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (closed) return
      const value = snapshot()
      const fingerprint = JSON.stringify({ ...value,
        ...(value.service ? { service: { ...value.service, observedAt: undefined } } : {}),
        ...(value.web ? { web: { ...value.web, observedAt: undefined } } : {}),
      })
      const line = JSON.stringify({ ok: true, value }) + '\n'
      for (const [socket, previous] of clients) {
        if (fingerprint === previous) continue
        if (socket.writableLength > 4 * 1024 * 1024) { socket.destroy(); continue }
        clients.set(socket, fingerprint)
        socket.write(line)
      }
    })
  }
  return {
    publish,
    subscribe(socket) {
      socket.setTimeout(0)
      clients.set(socket, null)
      socket.once('close', () => clients.delete(socket))
      publish()
    },
    close() { closed = true; for (const socket of clients.keys()) socket.destroy(); clients.clear() },
  }
}

/** Consume the same private local socket without request timers or heartbeats. */
export async function watchServiceStatus(socketPath, onValue, onFailure) {
  const socket = await connectServiceSocket(socketPath)
  let buffer = '', closed = false
  const fail = error => {
    if (closed) return
    closed = true
    socket.destroy()
    onFailure(new Error(redact(error.message)))
  }
  socket.setEncoding('utf8')
  socket.on('error', fail)
  socket.once('close', () => fail(new Error('状态通知连接已断开。')))
  socket.once('connect', () => socket.write(JSON.stringify({ protocol: SERVICE_PROTOCOL, type: 'watch-status' }) + '\n'))
  socket.on('data', chunk => {
    buffer += chunk
    if (buffer.length > 4 * 1024 * 1024) { fail(new Error('状态通知超过大小限制。')); return }
    let end
    while (!closed && (end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
      try {
        const reply = JSON.parse(line)
        if (reply.ok !== true) {
          const message = /^Unsupported (DSH|Web) service command$/.test(reply.error || '')
            ? '当前管理进程不支持状态通知，请在任务结束后更新并重启服务。'
            : reply.error || '状态通知不可用。'
          throw new Error(message)
        }
        if (reply.value?.protocol !== SERVICE_PROTOCOL) throw new Error('状态通知协议不兼容。')
        onValue(reply.value)
      } catch (error) { fail(error) }
    }
  })
  return { close() { closed = true; socket.destroy() } }
}
