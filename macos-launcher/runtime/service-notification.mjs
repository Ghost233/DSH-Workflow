import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { redact } from './service-control.mjs'

const execute = promisify(execFile)

/** The helper reports authorization, submission and its own delivered-ID observation separately. */
export async function serviceNotification(resources, command, faultId) {
  if (!['status', 'authorize', 'notify', 'delivered'].includes(command)) throw new Error('Invalid notification command')
  if (['notify', 'delivered'].includes(command) && !/^[a-zA-Z0-9-]{1,100}$/.test(faultId ?? '')) {
    throw new Error('Invalid notification fault identifier')
  }
  const app = join(resources, 'DSH Service Notifications.app')
  const executable = join(app, 'Contents/MacOS/DSH Service Notifications')
  let directory, launchError
  try {
    await access(executable, constants.X_OK)
    directory = await mkdtemp(join(tmpdir(), 'dsh-service-notification-'))
    const output = join(directory, 'result.json'), diagnostics = join(directory, 'stderr')
    await writeFile(output, '', { mode: 0o600, flag: 'wx' })
    await writeFile(diagnostics, '', { mode: 0o600, flag: 'wx' })
    try {
      await execute('/usr/bin/open', ['-n', '-W', ...(command === 'authorize' ? [] : ['-g']), '-a', app,
        '--stdout', output, '--stderr', diagnostics, '--args', command, ...(faultId ? [faultId] : [])], {
        timeout: command === 'authorize' ? 120_000 : 10_000, maxBuffer: 64 * 1024,
      })
    } catch (error) { launchError = error }
    const stdout = await readFile(output, 'utf8')
    if (!stdout && launchError) throw launchError
    const result = JSON.parse(stdout)
    if (typeof result?.available !== 'boolean' || result.command !== command || result.faultId !== (faultId ?? null)
      || !['not-attempted', 'submitted', 'failed', 'unknown'].includes(result.submission?.state)
      || !['not-queried', 'not-observed', 'observed', 'unknown'].includes(result.delivery?.state)) {
      throw new Error('Invalid notification helper response')
    }
    if (launchError) result.launcherError = { code: launchError.code ?? null, message: redact(launchError.message).slice(0, 1024) }
    return result
  } catch (error) {
    return { available: false, command, faultId: faultId ?? null,
      submission: { state: command === 'notify' && !['ENOENT', 'EACCES'].includes(error.code) ? 'unknown' : 'not-attempted' },
      delivery: { state: 'unknown' },
      error: { code: error.code ?? null, message: redact(error.message).slice(0, 1024) },
      ...(launchError && launchError !== error ? { launcherError: { code: launchError.code ?? null,
        message: redact(launchError.message).slice(0, 1024) } } : {}),
      message: 'macOS 通知助手不可用，请查看服务日志。', observedAt: new Date().toISOString() }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
