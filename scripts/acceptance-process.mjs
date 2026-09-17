import { spawn } from 'node:child_process'

/** Keep the acceptance runtime on one built package graph. */
export function acceptanceEnvironment(source = process.env) {
  const environment = { ...source }
  delete environment.TSX_TSCONFIG_PATH
  delete environment.NODE_TEST_CONTEXT
  return environment
}

/** An acceptance deadline owns the entire spawned process group on POSIX,
 * including a Node test worker that still holds the parent's output pipes.
 */
export function runAcceptanceProcess({ argv, cwd, timeoutMs, signal, graceMs = 2_000 }) {
  if (signal?.aborted) return Promise.resolve({ exitCode: 1, timedOut: false, aborted: true, stdout: '', stderr: '' })
  return new Promise(resolve => {
    const grouped = process.platform !== 'win32'
    const child = spawn(argv[0], argv.slice(1), {
      cwd, env: acceptanceEnvironment(), detached: grouped, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = [], stderr = []
    let timedOut = false, aborted = false, settled = false, escalation
    const kill = name => {
      if (!child.pid) return
      try {
        if (grouped) process.kill(-child.pid, name)
        else child.kill(name)
      } catch (error) { if (error.code !== 'ESRCH') stderr.push(Buffer.from(error.message)) }
    }
    const stop = reason => {
      if (settled) return
      if (reason === 'timeout') timedOut = true
      if (reason === 'abort') aborted = true
      kill('SIGTERM')
      escalation ??= setTimeout(() => { if (!settled) kill('SIGKILL') }, graceMs)
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    const abort = () => stop('abort')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.once('error', error => stderr.push(Buffer.from(error.stack ?? error.message)))
    child.once('close', exitCode => {
      settled = true
      clearTimeout(timer)
      clearTimeout(escalation)
      signal?.removeEventListener('abort', abort)
      resolve({ exitCode: Number.isInteger(exitCode) ? exitCode : 1, timedOut, aborted,
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') })
    })
  })
}
