import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { GitHubError } from './github.mjs'

/** Each repository chooses its own gh directory; no process-wide account switching. */
export function githubTokenProvider({ environment = process.env, executable = 'gh', run = promisify(execFile), signal } = {}) {
  const verified = new Set()
  return async repository => {
    if (!repository.ghConfigDir) return environment[repository.tokenEnv]
    const env = { ...environment, GH_CONFIG_DIR: repository.ghConfigDir, GH_PROMPT_DISABLED: '1' }
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_DEBUG', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) delete env[name]
    const options = { env, signal, timeout: 15000, maxBuffer: 128 * 1024, encoding: 'utf8' }
    let token
    try {
      token = (await run(executable, ['auth', 'token', '--hostname=github.com', `--user=${repository.githubActor}`], options)).stdout.trim()
    } catch { throw new GitHubError('The configured gh account credentials are unavailable', 'credentials') }
    if (!token) throw new GitHubError('The configured gh account has no credentials', 'credentials')
    const key = JSON.stringify([repository.ghConfigDir, repository.githubActor.toLowerCase(), createHash('sha256').update(token).digest('hex')])
    if (!verified.has(key)) {
      let login
      try {
        login = (await run(executable, ['api', '--hostname=github.com', 'user', '--jq', '.login'],
          { ...options, env: { ...env, GH_TOKEN: token } })).stdout.trim()
      } catch (error) {
        throw new GitHubError('GitHub identity verification through gh is unavailable', /HTTP (401|403)/.test(error.stderr ?? '') ? 'credentials' : 'network')
      }
      if (login.toLowerCase() !== repository.githubActor.toLowerCase()) throw new GitHubError('The configured gh identity does not match the repository account', 'credentials')
      verified.add(key)
    }
    return token
  }
}
