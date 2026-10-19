import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { serviceSocket, redact } from './service-control.mjs'
import { webSocket } from './web-control.mjs'
import { watchServiceStatus } from './status-notifications.mjs'

/** One idle local subscriber; only manager-record events or an explicit refresh reconnect it. */
export async function watchLauncherStatus(dataRoot, publish) {
  let closed = false
  const sources = [
    { name: 'service', record: 'global/.dsh-workflow/service/manager.json', socket: serviceSocket(dataRoot) },
    { name: 'web', record: 'global/.dsh-workflow/web/manager.json', socket: webSocket(dataRoot) },
  ]
  const notify = (source, event) => { if (!closed) publish({ source: source.name, ...event }) }
  const reconnect = source => {
    source.pending = true
    if (source.running || closed) return source.running
    source.running = (async () => {
      while (source.pending && !closed) {
        source.pending = false
        let record
        try { record = await readFile(join(dataRoot, source.record), 'utf8') }
        catch (error) { if (error.code !== 'ENOENT') throw error; record = null }
        if (closed || record === source.identity && source.connection) continue
        source.connection?.close(); source.connection = undefined
        source.identity = record
        const generation = source.generation = (source.generation || 0) + 1
        if (record === null) { notify(source, { missing: true, error: '服务管理进程尚未运行。' }); continue }
        try {
          const connection = await watchServiceStatus(source.socket,
            value => { if (source.generation === generation) notify(source, { value }) },
            error => {
              if (source.generation !== generation) return
              source.connection = undefined
              notify(source, { error: redact(error.message) })
            })
          if (closed || source.generation !== generation) connection.close()
          else source.connection = connection
        } catch (error) { notify(source, { error: redact(error.message) }) }
      }
    })().catch(error => notify(source, { error: redact(error.message) }))
      .finally(() => { source.running = undefined })
    return source.running
  }
  const watcher = watch(dataRoot, { recursive: true }, (_event, filename) => {
    const name = filename?.toString()
    for (const source of sources) if (name === source.record || name === undefined) void reconnect(source)
  })
  watcher.on('error', error => { for (const source of sources) notify(source, { error: redact(error.message) }) })
  await Promise.all(sources.map(reconnect))
  return {
    refresh() { for (const source of sources) void reconnect(source) },
    close() {
      if (closed) return
      closed = true; watcher.close()
      for (const source of sources) { source.generation = (source.generation || 0) + 1; source.connection?.close() }
    },
  }
}

if (import.meta.main) {
  const [dataRoot] = process.argv.slice(2)
  try {
    if (!dataRoot) throw new Error('Pass the launcher data directory')
    const subscription = await watchLauncherStatus(dataRoot, event => process.stdout.write(JSON.stringify(event) + '\n'))
    const input = createInterface({ input: process.stdin })
    input.on('line', line => { if (line === 'refresh') subscription.refresh() })
    input.once('close', () => subscription.close())
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { input.close(); subscription.close() })
  } catch (error) { process.stderr.write(redact(error.message) + '\n'); process.exitCode = 1 }
}
