import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath, mkdir, access } from 'node:fs/promises'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const exec = promisify(execFile)
const exists = path => access(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
const git = async (cwd, args) => (await exec('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 30000 })).stdout.trim()
const inside = (root, path) => { const value = relative(root, path); return value && !value.startsWith('..') && !isAbsolute(value) }

export class Workspaces {
  constructor({ store } = {}) { this.store = store; this.roots = new Map() }
  async rootsFor(repository) {
    if (!isAbsolute(repository.checkout ?? '') || !isAbsolute(repository.executionRoot ?? '')) throw new Error('Repository and execution root must be absolute preauthorized paths')
    const checkout = await realpath(repository.checkout)
    if (await git(checkout, ['rev-parse', '--show-toplevel']) !== checkout) throw new Error('Checkout must be a repository root')
    await mkdir(repository.executionRoot, { recursive: true, mode: 0o700 })
    const root = await realpath(repository.executionRoot)
    const key = `${checkout}:${repository.executionRoot}`
    const previous = this.store?.get('workspace-root', key)?.path ?? this.roots.get(key)
    if (previous && previous !== root) throw new Error('Execution root changed; new authorization is required')
    this.roots.set(key, root)
    this.store?.put('workspace-root', key, { path: root })
    return { checkout, root }
  }
  async prepare(repository, attempt) {
    if (![attempt.id, attempt.taskId].every(value => /^[A-Za-z0-9_-]{1,80}$/.test(value))) throw new Error('Invalid execution reservation')
    const { checkout, root } = await this.rootsFor(repository)
    const path = join(root, `${attempt.taskId}-${attempt.id}`)
    const branch = `${repository.branchPrefix ?? 'codex/'}project-${attempt.id}`
    const blocks = (await git(checkout, ['worktree', 'list', '--porcelain', '-z'])).split('\0\0')
    const record = blocks.map(block => Object.fromEntries(block.split('\0').filter(Boolean).map(line => {
      const split = line.indexOf(' '); return split < 0 ? [line, true] : [line.slice(0, split), line.slice(split + 1)]
    }))).find(row => row.worktree === path)
    if (record && record.branch !== `refs/heads/${branch}`) throw new Error('Existing worktree belongs to another execution')
    if (!record) {
      if (attempt.sessionId) throw new Error('The bound execution worktree is missing')
      if (await exists(path)) throw new Error('Execution directory already exists without its worktree registration')
      await git(checkout, ['check-ref-format', '--branch', branch])
      await git(checkout, ['worktree', 'add', '-b', branch, path, repository.baseRef ?? 'HEAD'])
    }
    const actual = await realpath(path)
    if (!inside(root, actual)) throw new Error('Worktree escapes the preauthorized execution root')
    const common = await realpath(resolve(checkout, await git(checkout, ['rev-parse', '--git-common-dir'])))
    if (await realpath(resolve(actual, await git(actual, ['rev-parse', '--git-common-dir']))) !== common) throw new Error('Worktree belongs to another repository')
    return { path: actual, branch, base: await git(actual, ['rev-parse', 'HEAD']) }
  }
  async verify(repository, prepared, signal) {
    const { root } = await this.rootsFor(repository)
    const cwd = await realpath(prepared.path)
    if (!inside(root, cwd)) throw new Error('Verification path is outside the authorized root')
    const configured = repository.verificationCommands
    if (!configured?.length || configured.some(argv => !Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== 'string'))) throw new Error('The project must supply its verification commands')
    await git(cwd, ['diff', '--quiet'])
    if (await git(cwd, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Untracked files need an explicit project decision before verification')
    const tree = await git(cwd, ['write-tree'])
    const commands = []
    for (const argv of configured) {
      signal?.throwIfAborted()
      let result
      try { result = await this.run(argv, cwd, repository.verificationTimeoutMs ?? 300000, signal) }
      catch (error) {
        throw Object.assign(error, { tree, commands: [...commands, { command: argv.join(' '), exitCode: null,
          error: error.code ?? 'interrupted-or-unavailable' }] })
      }
      commands.push({ command: argv.join(' '), ...result })
      if (result.exitCode !== 0) throw Object.assign(new Error(`Verification command failed with exit ${result.exitCode}`), { commands, tree })
    }
    await git(cwd, ['diff', '--quiet'])
    if (await git(cwd, ['write-tree']) !== tree) throw new Error('Verification changed its own source input')
    if (await git(cwd, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Verification created untracked files; inspect the project output before retrying')
    return { id: randomUUID(), tree, commands, at: Date.now() }
  }
  run(argv, cwd, timeout, signal) {
    return new Promise((accept, reject) => {
      const hash = createHash('sha256')
      const child = spawn(argv[0], argv.slice(1), { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let interrupted = false, ended = false, escalation
      const terminate = () => {
        interrupted = true
        if (!child.pid || escalation) return
        try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') reject(error) }
        escalation = setTimeout(() => {
          try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') reject(error) }
        }, 1000)
      }
      const timer = setTimeout(terminate, timeout)
      signal?.addEventListener('abort', terminate, { once: true })
      const cleanup = () => { clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', terminate) }
      child.stdout.on('data', bytes => hash.update(bytes))
      child.stderr.on('data', bytes => hash.update(bytes))
      child.once('error', error => { ended = true; cleanup(); reject(error) })
      child.once('close', (code, exitSignal) => {
        cleanup()
        if (ended) return
        ended = true
        if (interrupted || exitSignal) reject(new Error('Verification was interrupted; it did not pass'))
        else accept({ exitCode: code, outputSha256: hash.digest('hex') })
      })
    })
  }
  async head(prepared) {
    try {
      await git(prepared.path, ['diff', '--quiet'])
      await git(prepared.path, ['diff', '--cached', '--quiet'])
    } catch (error) {
      if (error.code === 1) throw new Error('Delivery requires a clean committed worktree', { cause: error })
      throw error
    }
    if (await git(prepared.path, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Delivery requires a clean worktree; untracked files remain')
    return { head: await git(prepared.path, ['rev-parse', 'HEAD']), tree: await git(prepared.path, ['rev-parse', 'HEAD^{tree}']) }
  }
  async unchanged(prepared) {
    const result = await this.head(prepared)
    if (result.tree !== await git(prepared.path, ['rev-parse', `${prepared.base}^{tree}`])) throw new Error('Code changes require a PR; this execution is not a no-change result')
    return { ...result, base: prepared.base, unchanged: true }
  }
}
