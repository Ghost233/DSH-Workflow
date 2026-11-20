import { spawnSync } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import SandboxBashExecutor from '@deepseek-ai/dsh-bash-sandbox'

const declaration = '.ghswitch'
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, '-c', 'core.fsmonitor=false', ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: homedir(), XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME },
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1000,
    killSignal: 'SIGKILL',
    maxBuffer: 128 * 1024,
  })
  return result.status === 0 ? result.stdout : undefined
}

// undefined means absent, so a linked worktree can consult its main checkout.
// null means a declaration is present but unusable.
function readLogin(root) {
  let file
  try {
    file = openSync(join(root, declaration), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    if (!fstatSync(file).isFile()) return null
    const buffer = Buffer.alloc(128)
    const length = readSync(file, buffer, 0, buffer.length, 0)
    if (length === buffer.length) return null
    const login = buffer.toString('utf8', 0, length).replace(/\r?\n$/, '')
    if (/[\r\n]/.test(login) || !loginPattern.test(login)) return null
    return git(root, 'check-ignore', '--quiet', '--', declaration) === undefined ? null : login
  } catch (error) {
    return error.code === 'ENOENT' ? undefined : null
  } finally {
    if (file !== undefined) closeSync(file)
  }
}

function findProfile(directory) {
  if (!directory || !isAbsolute(directory)) return undefined
  const root = git(directory, 'rev-parse', '--show-toplevel')?.replace(/\n$/, '')
  if (!root || !isAbsolute(root)) return undefined
  let login = readLogin(root)
  if (login === undefined && lstatSync(join(root, '.git'), { throwIfNoEntry: false })?.isFile()) {
    const first = git(root, 'worktree', 'list', '--porcelain', '-z')?.split('\0\0', 1)[0]
    const [entry, ...attributes] = first?.split('\0') ?? []
    const mainRoot = entry?.startsWith('worktree ') ? entry.slice('worktree '.length) : undefined
    if (mainRoot && mainRoot !== root && !attributes.includes('bare')) login = readLogin(mainRoot)
  }
  if (!login) return undefined

  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  const profile = resolve(configHome, 'gh-profiles', login)
  return statSync(profile, { throwIfNoEntry: false })?.isDirectory() ? profile : undefined
}

/** Select the session repository's gh profile for the built-in Bash tool. */
export default class StationGhBashExecutor extends SandboxBashExecutor {
  static inject = [...SandboxBashExecutor.inject, 'agents']

  resolve(request) {
    const sessionId = request.dshEnv?.DSH_SESSION_ID
    if (request.dshEnv?.DSH_SHELL !== '1' || !sessionId) return super.resolve(request)
    const directory = this.ctx.agents.get(sessionId)?.session.header.cwd
    let profile
    try {
      profile = findProfile(directory)
    } catch (error) {
      if (error.syscall !== 'stat' && error.syscall !== 'lstat') throw error
    }
    if (!profile) return super.resolve(request)
    return super.resolve({ ...request, env: { ...request.env, GH_CONFIG_DIR: profile } })
  }
}
