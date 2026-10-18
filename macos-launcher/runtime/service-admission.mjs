import { createServer, request } from 'node:http'

// Match ws's default frame bound; paused client sockets provide backpressure after one delivered frame.
const MAX_QUEUED_INPUT = 100 * 1024 * 1024

/** One loopback transport for the same Host. It adds no authentication or business protocol. */
export async function createServiceAdmission({ url, WebSocket, WebSocketServer }) {
  const target = new URL(url), pairs = new Set(), pending = new Set(), protocols = new WeakMap()
  let locked = false, closed = false, failure = '', origin, closing
  const headers = incoming => {
    const value = { ...incoming, host: target.host }
    if (value.origin === origin) value.origin = target.origin
    return value
  }
  const server = createServer((incoming, response) => {
    if (locked || closed) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      response.end('DSH 服务正在等待停止确认，暂不接收新工作。')
      incoming.resume()
      return
    }
    const settled = Promise.withResolvers()
    pending.add(settled.promise)
    const finish = () => { pending.delete(settled.promise); settled.resolve() }
    const outgoing = request({ hostname: target.hostname, port: target.port, path: incoming.url,
      method: incoming.method, headers: headers(incoming.headers) }, upstream => {
      response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response)
    })
    outgoing.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('DSH 服务暂不可用。'); finish() })
    incoming.once('aborted', () => { outgoing.destroy(); finish() })
    response.once('close', () => { outgoing.destroy(); finish() })
    response.once('finish', finish)
    incoming.pipe(outgoing)
  })
  const websocketServer = new WebSocketServer({ noServer: true,
    handleProtocols: (_offered, incoming) => protocols.get(incoming) || false })
  const closeOther = (other, code, reason) => {
    if (other.readyState === WebSocket.CLOSED) return
    if ([1006, 1015].includes(code)) other.terminate()
    else if (code === 1005) other.close()
    else other.close(code, reason)
  }
  const send = (pair, source, destination, data, binary) => {
    source.pause()
    destination.send(data, { binary }, error => {
      if (error) { failure = 'DSH 客户端输入连接失败，请检查连接后重试。'; source.terminate(); destination.terminate(); return }
      if (!closed && (source !== pair.client || !locked && !pair.held)) source.resume()
    })
  }
  server.on('upgrade', (incoming, socket, head) => {
    if (closed || locked) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return }
    let upstream
    try {
      const offered = incoming.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()) ?? []
      const forwarded = headers(incoming.headers)
      for (const name of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions', 'connection', 'upgrade']) delete forwarded[name]
      const path = new URL(incoming.url, 'http://127.0.0.1')
      const address = new URL(target.origin)
      address.protocol = 'ws:'; address.pathname = path.pathname; address.search = path.search
      upstream = new WebSocket(address, offered, { headers: forwarded, perMessageDeflate: false })
    } catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return }
    const disconnected = () => { if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate() }
    socket.once('close', disconnected)
    upstream.once('unexpected-response', (_request, response) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${response.rawHeaders.reduce((rows, value, index, all) => index % 2 ? rows : [...rows, `${value}: ${all[index + 1]}`], []).join('\r\n')}\r\n\r\n`)
      response.pipe(socket)
    })
    upstream.on('error', () => { if (!socket.destroyed) socket.destroy() })
    upstream.once('open', () => {
      socket.removeListener('close', disconnected)
      if (closed || socket.destroyed) { upstream.close(); return }
      protocols.set(incoming, upstream.protocol)
      websocketServer.handleUpgrade(incoming, socket, head, client => {
        const pair = { client, upstream, queued: [], bytes: 0, held: locked }
        pairs.add(pair)
        if (locked) client.pause()
        client.on('message', (data, binary) => {
          if (closed) return
          if (locked || pair.held) {
            pair.bytes += data.length
            if (pair.bytes > MAX_QUEUED_INPUT) {
              failure = '等待确认期间的客户端输入超出缓冲限制，原连接未能保留，请重连后重试。'
              client.close(1013, 'Service admission input limit'); upstream.close(1013, 'Service admission input limit')
              return
            }
            pair.queued.push({ data, binary }); client.pause()
          } else send(pair, client, upstream, data, binary)
        })
        upstream.on('message', (data, binary) => { if (client.readyState === WebSocket.OPEN) send(pair, upstream, client, data, binary) })
        client.on('error', () => upstream.terminate())
        let timeout
        const ending = (other, code, reason) => {
          pair.queued = []; pair.bytes = 0
          closeOther(other, code, reason)
          if (client.readyState === WebSocket.CLOSED && upstream.readyState === WebSocket.CLOSED) {
            clearTimeout(timeout); pairs.delete(pair)
          } else {
            timeout ??= setTimeout(() => { client.terminate(); upstream.terminate(); pairs.delete(pair) }, 1000).unref()
          }
        }
        client.once('close', (code, reason) => ending(upstream, code, reason))
        upstream.once('close', (code, reason) => ending(client, code, reason))
      })
    })
  })
  server.on('clientError', (_error, socket) => socket.destroy())
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); accept() })
  })
  server.on('error', () => { failure = 'DSH 客户端接入服务异常，请检查日志。' })
  origin = `http://127.0.0.1:${server.address().port}`
  const address = new URL(target); address.port = String(server.address().port)
  return {
    url: address.href,
    get locked() { return locked },
    async lock() {
      locked = true
      for (const pair of pairs) { pair.held = true; pair.client.pause() }
      let timeout
      try {
        await Promise.race([Promise.all([...pending]), new Promise((_accept, reject) => {
          timeout = setTimeout(() => reject(new Error('DSH 已接纳的请求尚未排空，当前工作状态未知。')), 10_000)
        })])
      } finally { clearTimeout(timeout) }
      if (failure) throw new Error(failure)
    },
    async unlock() {
      if (closed) throw new Error('原 DSH 服务接入已关闭，无法恢复原连接。')
      locked = false
      for (const pair of pairs) {
        if (pair.upstream.readyState !== WebSocket.OPEN || pair.client.readyState !== WebSocket.OPEN) continue
        while (pair.queued.length) {
          const queued = pair.queued; pair.queued = []; pair.bytes = 0
          await Promise.all(queued.map(({ data, binary }) => new Promise((accept, reject) => {
            pair.upstream.send(data, { binary }, error => error ? reject(error) : accept())
          })))
        }
        pair.held = false
        if (!locked && !closed) pair.client.resume()
      }
      if (failure) throw new Error(failure)
    },
    close() {
      return closing ??= (async () => {
        closed = true; locked = true
        for (const pair of pairs) { pair.client.resume(); pair.upstream.resume(); pair.client.close(1001, 'DSH service stopped'); pair.upstream.close(1001, 'DSH service stopped') }
        const timeout = setTimeout(() => { for (const pair of pairs) { pair.client.terminate(); pair.upstream.terminate() } }, 1000)
        try {
          await Promise.all([new Promise(accept => { server.close(accept); server.closeAllConnections() }), new Promise(accept => websocketServer.close(accept))])
        } finally { clearTimeout(timeout) }
      })()
    },
  }
}
