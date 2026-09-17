import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import net from 'node:net'
import { performance } from 'node:perf_hooks'

export async function assertWebPortAvailable(port) {
  const server = net.createServer()
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve) })
  } catch (error) { throw new Error(`Web port ${port} is already in use or unavailable; the existing listener was preserved`, { cause: error }) }
  finally { if (server.listening) await new Promise(resolve => server.close(resolve)) }
}

/** Own only the child we create. An HTTP response from another instance is never readiness. */
export async function launchWebHost({ argv, cwd, logRoot, port = 3080, signal, startupTimeoutMs = 30_000, pollMs = 250,
  requiredComponents = ['owner', 'sol', 'approval'], onReady = () => {}, environment = process.env }) {
  if (!Array.isArray(argv) || !argv.length || argv.some(item => typeof item !== 'string')
    || !Number.isSafeInteger(port) || port < 1 || port > 65535 || !Number.isFinite(startupTimeoutMs) || startupTimeoutMs <= 0) throw new Error('Invalid Web host launch contract')
  signal?.throwIfAborted()
  await assertWebPortAvailable(port)
  signal?.throwIfAborted()
  await mkdir(logRoot, { recursive: true, mode: 0o700 })
  const instanceId = randomUUID(), logPath = join(logRoot, `${Date.now()}-${instanceId}.log`)
  const log = await open(logPath, 'wx', 0o600)
  let child, exit, settled = false, stopping = false, escalation, lastProbe = 'not_started'
  const grouped = process.platform !== 'win32'
  const kill = name => {
    if (!child?.pid || settled) return
    try { grouped ? process.kill(-child.pid, name) : child.kill(name) }
    catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  const stop = () => {
    if (settled || stopping) return
    stopping = true; kill('SIGTERM')
    escalation = setTimeout(() => kill('SIGKILL'), 2_000)
  }
  try {
    child = spawn(argv[0], argv.slice(1), { cwd, env: { ...environment, DSH_OWNER_WORKFLOW_HOST_INSTANCE: instanceId },
      detached: grouped, stdio: ['inherit', log.fd, log.fd] })
    const closed = new Promise(resolve => {
      child.once('error', error => { lastProbe = `spawn_failed:${error.code ?? error.message}` })
      child.once('close', (code, terminatedBy) => {
        // The direct host may exit while descendants keep its process group
        // alive. Close that group immediately, before releasing ownership;
        // never schedule a later kill against a potentially reused group ID.
        if (grouped) kill('SIGKILL')
        settled = true; exit = { code, signal: terminatedBy }; clearTimeout(escalation); resolve(exit)
      })
    })
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    const until = performance.now() + startupTimeoutMs
    let ready = false
    while (!settled && !stopping && performance.now() < until) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/owner-workflow/api/health`, {
          redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(Math.min(800, Math.max(1, Math.floor(until - performance.now()))))])
            : AbortSignal.timeout(Math.min(800, Math.max(1, Math.floor(until - performance.now())))),
        })
        const value = response.ok ? await response.json() : null
        if (value?.contract === 'DSH_WEB_HOST_READY_V1' && value.instanceId === instanceId
          && requiredComponents.every(name => value.components?.[name] === 'ready')) { ready = true; break }
        lastProbe = response.ok ? 'instance_or_components_not_ready' : `http_${response.status}`
      } catch (error) { lastProbe = `probe:${error.code ?? error.name}` }
      if (!settled && !stopping) await Promise.race([closed, new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(1, until - performance.now()))))])
    }
    if (!ready || settled || stopping) {
      stop(); await closed
      throw Object.assign(new Error(`This Web host did not become ready (${lastProbe}); log: ${logPath}`), { logPath, instanceId, exit })
    }
    await onReady({ pid: child.pid, instanceId, port, logPath })
    return { ...await closed, instanceId, logPath, ready: true, stopped: stopping }
  } finally {
    stop()
    signal?.removeEventListener('abort', stop)
    // If a callback throws after spawn, drain our child before releasing its log.
    if (child && !settled) await new Promise(resolve => child.once('close', resolve))
    clearTimeout(escalation)
    await log.close()
  }
}
