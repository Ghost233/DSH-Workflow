import { connectManagerChannel } from './manager-websocket.mjs'

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
      const fingerprint = JSON.stringify({ ...value, revision: undefined,
        ...(value.service ? { service: { ...value.service, observedAt: undefined } } : {}),
        ...(value.web ? { web: { ...value.web, observedAt: undefined } } : {}),
      })
      const line = JSON.stringify({ ok: true, value }) + '\n'
      for (const client of clients.values()) {
        if (fingerprint === client.previous) continue
        if (client.pending() > 4 * 1024 * 1024) { client.close(); continue }
        client.previous = fingerprint
        client.write(line)
      }
    })
  }
  return {
    publish,
    subscribe(socket, { webSocket = false } = {}) {
      socket.setTimeout?.(0)
      clients.set(socket, { previous: null,
        write: line => webSocket ? socket.send(line) : socket.write(line),
        pending: () => webSocket ? socket.bufferedAmount : socket.writableLength,
        close: () => webSocket ? socket.terminate() : socket.destroy() })
      socket.once('close', () => clients.delete(socket))
      publish()
    },
    close() { closed = true; for (const client of clients.values()) client.close(); clients.clear() },
  }
}

/** One duplex WebSocket; no idle requests, reconnect timers or heartbeats. */
export async function watchServiceStatus(socketPath, onValue, onFailure) {
  const channel = await connectManagerChannel(socketPath, { onStatus: onValue, onFailure })
  try { await channel.request({ type: 'watch-status' }); return channel }
  catch (error) { channel.close(); throw error }
}
