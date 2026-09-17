import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, resolve, relative, join, sep } from 'node:path'
import { ownerAllows, scopeMatches } from './model.mjs'
import { isProtectedRelativePath } from './owner-boundary.mjs'

/** Resolve all ancestors before a native write; retain native observation/CAS afterwards. */
export async function assertOwnerWrite(binding, requested, assertAuthority) {
  await assertAuthority(binding.authority, { writes: true })
  return assertOwnerPath(binding, requested)
}

/** Validate an existing Owner-owned path without reopening a stopped attempt's write authority. */
export async function assertOwnerPath(binding, requested) {
  if (typeof requested !== 'string' || requested.includes('\0') || requested.includes('\\')
    || requested.split('/').includes('..')) throw new Error('Owner write path is invalid')
  const root = await realpath(binding.worktree)
  const lexicalRoot = resolve(binding.worktree)
  const absolute = resolve(lexicalRoot, requested)
  const rel = relative(absolute.startsWith(root + sep) ? root : lexicalRoot, absolute)
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Owner write escapes worktree')
  const file = rel.split(sep).join('/')
  if (isProtectedRelativePath(file) || !ownerAllows(binding.owner, file)
    || !binding.task.write.some(pattern => scopeMatches(pattern, file))) throw new Error(`Owner write exceeds task scope: ${file}`)
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error('Owner write uses a linked path')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return current
}

/** Arbitrary commands are read-only; writes use scoped native file tools and fixed verification. */
export async function runOwnerReadOnlyCommand(ctx, binding, args, exec, assertAuthority) {
  await assertAuthority(binding.authority, { writes: false })
  if (args.sandbox_permissions !== undefined || args.run_in_background) throw new Error('Owner commands cannot widen permissions or leave background writers')
  const root = await realpath(binding.worktree)
  const workdir = await realpath(resolve(root, args.workdir ?? '.'))
  const rel = relative(root, workdir)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Owner command cwd escapes worktree')
  const shell = ctx.shell ?? ctx.get?.('shell')
  if (typeof shell?.resolve !== 'function' || typeof shell?.run !== 'function') throw new Error('DSH shell capability is unavailable')
  const result = await shell.run(shell.resolve({ command: args.command, workdir, signal: exec.signal,
    ...(args.timeout_ms ? { timeoutMs: args.timeout_ms } : {}),
    sandboxPolicy: { mode: 'read-only', workspaceRoot: root, sessionId: exec.agent.id } }))
  if (result.sandbox?.enforcement !== 'full' || result.sandbox?.mode !== 'read-only') throw new Error('Owner command did not receive full read-only enforcement')
  return result
}
