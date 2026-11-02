import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { superagentSandboxArguments } from './superagent-sandbox.mjs'

/** Pause persisted work through the upstream API before allowing any configured CLI to run. */
export async function pauseSuperagentBeforeStartup({ directory, node, cli, webPort, environment, protectedPaths, writableRoots, credential, patches }) {
  const patch = join(directory, `station-bootstrap-${randomUUID()}.json`)
  const disabled = patches.flatMap(row => row.insert ?? []).filter(row => row.id && row.id !== 'workflow-superagent-mcp')
    .map(row => ({ id: row.id, disabled: true }))
  await writeFile(patch, JSON.stringify([{ id: 'webserver', config: { host: '127.0.0.1', port: webPort } },
    { id: 'dsh-superagent-feishu', disabled: true }, ...disabled]) + '\n', { flag: 'wx', mode: 0o600 })
  let child, exited
  try {
    const sandbox = superagentSandboxArguments(protectedPaths, writableRoots, { credential, onlyExecutable: node })
    child = spawn('/usr/bin/sandbox-exec', [...sandbox, '--', node, cli, '--profile', 'superagent', '--patch', patch, '--no-open'],
      { cwd: directory, env: environment, detached: true, stdio: ['ignore', 'pipe', 'ignore', 'ipc'] })
    let ended = false, listening = false
    createInterface({ input: child.stdout }).on('line', line => {
      const match = /^dsh web:\s*(https?:\/\/\S+)/.exec(line)
      if (!match) return
      try { const url = new URL(match[1]); listening = url.hostname === '127.0.0.1' && url.port === String(webPort) } catch {}
    })
    exited = new Promise(resolve => {
      child.once('error', () => { ended = true; resolve() })
      child.once('close', () => { ended = true; resolve() })
    })
    const base = `http://127.0.0.1:${webPort}/orchestrator/api/`
    for (let attempt = 0; attempt < 120 && !ended; attempt++) {
      try {
        if (!listening) { await delay(250); continue }
        const response = await fetch(new URL('executor/pause', base), { method: 'POST',
          headers: { 'x-orchestrator-request': '1', 'content-type': 'application/json' },
          body: JSON.stringify({ paused: true }), signal: AbortSignal.timeout(1000) })
        if (response.ok && (await response.json()).paused === true) {
          const lists = await Promise.all(['open', 'ended'].map(async state => {
            const result = await fetch(new URL(`tickets?state=${state}&limit=1`, base), {
              headers: { 'x-orchestrator-request': '1' }, signal: AbortSignal.timeout(1000) })
            if (!result.ok) throw new Error('无法读取任务历史。')
            const page = await result.json()
            if (!Array.isArray(page.items)) throw new Error('无法读取任务历史。')
            return page.items.length > 0
          }))
          return { hasTickets: lists.some(Boolean) }
        }
      } catch { /* The isolated Host is still starting. */ }
      await delay(250)
    }
    throw new Error('无法安全暂停已有 Superagent 任务，未启动项目。')
  } finally {
    if (child) {
      child.kill('SIGINT')
      let timer
      const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000) })])
      clearTimeout(timer)
      if (!stopped) { child.kill('SIGKILL'); await exited }
      if (child.pid) try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    await unlink(patch).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
