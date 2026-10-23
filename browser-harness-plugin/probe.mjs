import { isAbsolute } from 'node:path'

/** The same shell service used by DSH tasks supplies both lookup and execution evidence. */
export async function probeBrowserHarness(shell, { signal } = {}) {
  const result = { actualScope: 'dsh-shell', state: 'error', path: null, version: null }
  try {
    const spec = shell.resolve({ command: 'command -v browser-harness || exit 127\nbrowser-harness --version',
      timeoutMs: 5000, stdoutMaxBytes: 4096,
      env: { BH_TELEMETRY: '0', PYTHONDONTWRITEBYTECODE: '1' }, ...(signal ? { signal } : {}) })
    const execution = await shell.execute(spec)
    const value = await execution.result()
    const lines = value.stdout.text.trim().split(/\r?\n/)
    result.path = isAbsolute(lines[0] ?? '') ? lines[0] : null
    if (value.exitCode === 127 && !result.path) return { ...result, state: 'missing' }
    const version = lines.at(-1)
    if (value.exitCode !== 0 || !result.path || value.stdout.truncated || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
      return { ...result, message: `版本查询未成功（退出码 ${value.exitCode ?? '未知'}）` }
    }
    return { ...result, state: 'installed', version }
  } catch {
    return { ...result, message: 'DSH Shell 无法完成版本查询，未把其他环境的安装当作可用安装。' }
  }
}
