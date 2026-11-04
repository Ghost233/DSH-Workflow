import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { homedir, userInfo } from 'node:os'

const excluded = new Set(['PWD', 'OLDPWD', 'SHLVL', '_', 'DISABLE_AUTO_UPDATE', 'ZSH_TMUX_AUTOSTARTED', 'ZSH_TMUX_AUTOSTART'])

/** Read the login environment without exposing its values in logs or changing the parent process. */
export async function readLoginShellEnvironment(base, { shells, timeoutMs = 10_000, signal } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid login-shell timeout')
  if (!shells) {
    let account
    try { account = userInfo().shell } catch { /* Fixed system fallbacks remain available. */ }
    shells = [...new Set([account, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean))]
  }
  const failures = []
  for (const shell of shells) {
    const result = await readOne(shell, base, timeoutMs, signal)
    if (typeof result !== 'string') {
      const environment = { ...base }
      for (const [key, value] of Object.entries(result)) {
        if (!excluded.has(key) && !key.startsWith('DSH_') && !key.startsWith('ELECTRON_')) environment[key] = value
      }
      return { environment, failures }
    }
    failures.push({ shell, reason: result })
    if (result === 'aborted') break
  }
  return { environment: { ...base }, failures }
}

async function readOne(shell, base, timeoutMs, signal) {
  if (signal?.aborted) return 'aborted'
  const marker = `STATION_ENV_${randomBytes(16).toString('hex')}`
  const command = `printf '\\0%s\\0' '${marker}'; command env -0; printf '\\0%s\\0' '${marker}'`
  return new Promise(accept => {
    const child = spawn(shell, ['-ilc', command], { cwd: base.HOME || homedir(), detached: true,
      env: { ...base, DISABLE_AUTO_UPDATE: 'true', ZSH_TMUX_AUTOSTARTED: 'true', ZSH_TMUX_AUTOSTART: 'false' },
      stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks = []
    let size = 0, done = false
    const token = Buffer.from(`\0${marker}\0`)
    const stop = reason => {
      if (done) return
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch { /* The owned shell already exited. */ } }
      finish(reason)
    }
    const onAbort = () => stop('aborted')
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    function finish(result) {
      if (done) return
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort)
      child.stdout.removeAllListeners('data'); child.stdout.resume()
      accept(result)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > 4 * 1024 * 1024) return stop('output exceeded limit')
      chunks.push(chunk)
      const data = Buffer.concat(chunks), first = data.indexOf(token), last = data.lastIndexOf(token)
      if (first < 0 || first === last) return
      const variables = {}
      for (const entry of data.subarray(first + token.length, last).toString('utf8').split('\0')) {
        const index = entry.indexOf('=')
        if (index > 0) variables[entry.slice(0, index)] = entry.slice(index + 1)
      }
      finish(variables)
    })
    child.once('error', () => finish('spawn failed'))
    child.once('close', (code, childSignal) => finish(childSignal || (code === 0 ? 'unparsed' : `exit ${code}`)))
  })
}
