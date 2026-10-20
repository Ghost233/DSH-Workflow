import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { SERVICE_PROTOCOL, connectServiceSocket, redact } from './service-control.mjs'

const { WebSocket, WebSocketServer } = createRequire(new URL('../package.json', import.meta.url))('ws')
const subprotocol = 'dsh-control-v1'

/** WebSocket commands and pushed state share the existing owner-only Unix socket. */
export function attachManagerWebSocket(server, command, updates) {
  const http = createServer({ maxHeaderSize: 16 * 1024 }, (_request, response) => { response.writeHead(404); response.end() })
  const web = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false })
  let closed = false
  const dispatch = async (input, socket, webSocket) => {
    if (closed) throw new Error('DSH 管理通道正在退出')
    if (input?.protocol !== SERVICE_PROTOCOL) throw new Error('DSH 服务协议不兼容，请使用配套应用。')
    if (input.type === 'watch-status') { updates.subscribe(socket, { webSocket }); return { protocol: SERVICE_PROTOCOL } }
    return command(input)
  }
  http.on('upgrade', (request, socket, head) => {
    if (closed || request.url !== '/control' || request.headers.origin !== undefined
      || request.headers['sec-websocket-protocol'] !== subprotocol) { socket.destroy(); return }
    socket.setTimeout(0)
    web.handleUpgrade(request, socket, head, client => web.emit('connection', client))
  })
  web.on('connection', socket => {
    socket.on('error', () => {})
    socket.on('message', bytes => {
      let input
      try {
        input = JSON.parse(bytes.toString())
        if (!Number.isSafeInteger(input.requestId) || input.requestId < 1) throw new Error('Invalid DSH request id')
      } catch (error) { socket.close(1008, 'Invalid DSH command'); return }
      const reply = value => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...value, requestId: input.requestId })) }
      void dispatch(input, socket, true).then(value => reply({ ok: true, value }),
        error => reply({ ok: false, error: redact(error.message), code: error.code }))
    })
  })
  server.on('connection', socket => {
    socket.setTimeout(45_000, () => socket.destroy())
    socket.on('error', () => {})
    socket.once('data', first => {
      socket.pause()
      socket.unshift(first)
      if (first[0] !== 123) http.emit('connection', socket)
      else {
        // Keep one-shot commands compatible with already installed launchers.
        let buffer = '', handled = false
        socket.setEncoding('utf8')
        socket.on('data', chunk => {
          buffer += chunk
          if (buffer.length > 16 * 1024) { socket.destroy(); return }
          if (handled || !buffer.includes('\n')) return
          handled = true
          void (async () => {
            try {
              const input = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
              const value = await dispatch(input, socket, false)
              if (input.type !== 'watch-status') socket.end(JSON.stringify({ ok: true, value }) + '\n')
            } catch (error) { socket.end(JSON.stringify({ ok: false, error: redact(error.message), code: error.code }) + '\n') }
          })()
        })
      }
      socket.resume()
    })
  })
  return () => {
    closed = true
    for (const socket of web.clients) socket.terminate()
    web.close()
    http.closeAllConnections()
  }
}

/** No idle timer, heartbeat or polling fallback; only outstanding commands have deadlines. */
export async function connectManagerChannel(socketPath, { onStatus = () => {}, onFailure = () => {} } = {}) {
  const stream = await connectServiceSocket(socketPath)
  const socket = new WebSocket('ws://localhost/control', subprotocol, {
    createConnection: () => stream, handshakeTimeout: 5000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false,
  })
  const pending = new Map()
  let closed = false, sequence = 0
  const connectionError = error => error.code?.startsWith('HPE_')
    ? new Error('当前管理进程不支持 WebSocket 状态通知，请在任务结束后更新并重启服务。') : error
  const fail = error => {
    if (closed) return
    closed = true
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear(); socket.terminate(); onFailure(error)
  }
  socket.on('error', error => fail(connectionError(error)))
  socket.on('close', () => fail(new Error('DSH WebSocket 管理连接已断开。')))
  socket.on('message', bytes => {
    try {
      const reply = JSON.parse(bytes.toString())
      if (reply.requestId !== undefined) {
        const request = pending.get(reply.requestId)
        if (!request) return
        pending.delete(reply.requestId); clearTimeout(request.timer)
        if (reply.ok !== true) request.reject(Object.assign(new Error(reply.error || 'DSH command failed'), { code: reply.code }))
        else if (reply.value?.protocol !== SERVICE_PROTOCOL) request.reject(new Error('DSH 服务协议不兼容，请使用配套应用。'))
        else request.resolve(reply.value)
      } else {
        if (reply.ok !== true || reply.value?.protocol !== SERVICE_PROTOCOL) throw new Error('DSH 状态通知协议不兼容。')
        onStatus(reply.value)
      }
    } catch (error) { fail(error) }
  })
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', error => reject(connectionError(error)))
    socket.once('close', () => reject(new Error('DSH WebSocket 握手未完成。')))
  })
  return {
    request(input, timeout = 45_000) {
      if (closed) return Promise.reject(new Error('DSH WebSocket 管理连接已断开。'))
      const requestId = ++sequence
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('DSH service control timed out')) }, timeout)
        pending.set(requestId, { resolve, reject, timer })
        socket.send(JSON.stringify({ ...input, protocol: SERVICE_PROTOCOL, requestId }), error => {
          if (error) fail(error)
        })
      })
    },
    close() { if (!closed) { closed = true; for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('DSH 管理连接已关闭。')) } pending.clear(); socket.terminate() } },
  }
}
