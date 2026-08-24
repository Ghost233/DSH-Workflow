import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { resolve as resolvePath } from 'node:path'

const execFileAsync = promisify(execFile)
const FULL_COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu
const DISABLED_HOOKS_PATH = process.platform === 'win32' ? 'NUL' : '/dev/null'

export class GitError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'GitError'
    Object.assign(this, details)
  }
}

function removeTrailingLineBreaks(value) {
  return String(value ?? '').replace(/(?:\r\n|\n|\r)+$/u, '')
}

function outputPaths(output) {
  return String(output ?? '').split('\0').filter(path => path !== '')
}

function isRenameOrCopy(code) {
  return code.includes('R') || code.includes('C')
}

function exitCode(error) {
  const code = error?.cause?.code
  return typeof code === 'number' ? code : Number.parseInt(String(code), 10)
}

function worktreePathSet(output, cwd) {
  return new Set(
    String(output ?? '')
      .split(/\r?\n/u)
      .filter(line => line.startsWith('worktree '))
      .map(line => resolvePath(cwd, line.slice('worktree '.length))),
  )
}

export function parseStatusRecords(output) {
  const fields = String(output ?? '').split('\0')
  if (fields.at(-1) === '') fields.pop()
  const records = []
  for (let index = 0; index < fields.length; index += 1) {
    const raw = fields[index]
    if (raw.length < 3 || raw[2] !== ' ') {
      throw new Error(`无法解析 Git 状态记录：${JSON.stringify(raw)}`)
    }
    const code = raw.slice(0, 2)
    const path = raw.slice(3)
    if (path === '') throw new Error(`Git 状态记录缺少文件路径：${JSON.stringify(raw)}`)
    const record = { code, path }
    if (isRenameOrCopy(code)) {
      const originalPath = fields[index + 1]
      if (originalPath === undefined || originalPath === '') {
        throw new Error(`Git ${code.includes('R') ? '重命名' : '复制'}记录缺少原始路径：${JSON.stringify(raw)}`)
      }
      record.originalPath = originalPath
      index += 1
    }
    records.push(record)
  }
  return records
}

export async function git(cwd, args, signal) {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      signal,
      windowsHide: true,
    })
    return removeTrailingLineBreaks(result.stdout ?? '')
  } catch (error) {
    const stdout = String(error?.stdout ?? '').trim()
    const stderr = String(error?.stderr ?? '').trim()
    const detail = stderr || stdout || error?.message || String(error)
    throw new GitError(`git ${args.join(' ')} 失败：${detail}`, {
      cause: error,
      stdout,
      stderr,
      args,
      cwd,
    })
  }
}

export async function repositoryRoot(cwd, signal) {
  return git(cwd, ['rev-parse', '--show-toplevel'], signal)
}

export async function head(cwd, signal) {
  return git(cwd, ['rev-parse', 'HEAD'], signal)
}

export async function currentBranch(cwd, signal) {
  const branch = await git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal).catch(() => '')
  return branch || undefined
}

export async function statusRecords(cwd, signal, { includeIgnored = false, untracked = 'all' } = {}) {
  if (!['all', 'normal', 'no'].includes(untracked)) {
    throw new Error(`Git status 未跟踪文件模式不受支持：${String(untracked)}`)
  }
  const output = await git(cwd, [
    'status',
    '--porcelain=v1',
    `--untracked-files=${untracked}`,
    ...(includeIgnored ? ['--ignored'] : []),
    '-z',
  ], signal)
  return parseStatusRecords(output)
}

export async function changedFiles(cwd, base, target, signal) {
  const output = await git(cwd, ['diff', '--name-only', '--no-renames', '-z', `${base}...${target}`], signal)
  return outputPaths(output)
}

export async function aheadCount(cwd, base, target, signal) {
  const output = await git(cwd, ['rev-list', '--count', `${base}..${target}`], signal)
  const value = Number.parseInt(output, 10)
  if (!Number.isSafeInteger(value)) throw new Error(`无法解析 ${base}..${target} 的提交数量：${output}`)
  return value
}

export function isFullCommitSha(value) {
  return FULL_COMMIT_SHA.test(String(value ?? ''))
}

export async function resolveCommitSha(cwd, revision, signal) {
  if (typeof revision !== 'string' || revision === '') throw new Error('提交引用不能为空')
  const resolved = await git(cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${revision}^{commit}`,
  ], signal)
  if (!isFullCommitSha(resolved)) throw new Error(`Git 返回了无效的提交哈希：${resolved}`)
  return resolved.toLowerCase()
}

export async function verifyCommitSha(cwd, commitSha, signal) {
  if (!isFullCommitSha(commitSha)) {
    throw new Error(`必须使用完整提交哈希，收到：${commitSha}`)
  }
  const resolved = await resolveCommitSha(cwd, commitSha, signal)
  if (resolved !== String(commitSha).toLowerCase()) {
    throw new Error(`提交哈希校验失败：期望 ${commitSha}，实际 ${resolved}`)
  }
  return resolved
}

export async function assertHead(cwd, expectedSha, signal) {
  const expected = await verifyCommitSha(cwd, expectedSha, signal)
  const actual = await head(cwd, signal)
  if (actual !== expected) throw new Error(`Git HEAD 已变化：期望 ${expected}，实际 ${actual}`)
  return actual
}

export async function commitChangedFiles(cwd, commitSha, signal) {
  const fixedSha = await verifyCommitSha(cwd, commitSha, signal)
  const output = await git(cwd, [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '--no-renames',
    '-r',
    '-z',
    fixedSha,
  ], signal)
  return outputPaths(output)
}

export async function changedFilesAtCommit(cwd, base, commitSha, signal) {
  const fixedSha = await verifyCommitSha(cwd, commitSha, signal)
  return changedFiles(cwd, base, fixedSha, signal)
}

/** 返回基线到固定 HEAD 之间每个提交曾经触及的全部路径，而不只比较最终净差异。 */
export async function changedFilesInCommitRange(cwd, base, commitSha, signal) {
  const fixedBase = await verifyCommitSha(cwd, base, signal)
  const fixedSha = await verifyCommitSha(cwd, commitSha, signal)
  const revisions = (await git(cwd, ['rev-list', '--reverse', `${fixedBase}..${fixedSha}`], signal))
    .split(/\r?\n/u)
    .map(value => value.trim())
    .filter(Boolean)
  const files = new Set()
  for (const revision of revisions) {
    for (const file of await commitChangedFiles(cwd, revision, signal)) files.add(file)
  }
  return [...files].sort()
}

export async function commitFiles(cwd, files, message, signal) {
  if (!Array.isArray(files) || files.length === 0) return false
  await git(cwd, ['reset', '--mixed', 'HEAD'], signal)
  await git(cwd, ['add', '--', ...files], signal)
  await git(cwd, [
    '-c',
    `core.hooksPath=${DISABLED_HOOKS_PATH}`,
    'commit',
    '--no-gpg-sign',
    '-m',
    message,
  ], signal)
  const commitSha = await verifyCommitSha(cwd, await head(cwd, signal), signal)
  const committedFiles = await commitChangedFiles(cwd, commitSha, signal)
  return {
    committed: true,
    head: commitSha,
    commitSha,
    files: committedFiles,
    committedFiles,
  }
}

export async function isAncestor(cwd, ancestor, descendant, signal) {
  try {
    await git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant], signal)
    return true
  } catch {
    return false
  }
}

export async function isCommitAncestor(cwd, ancestorSha, descendantSha, signal) {
  const ancestor = await verifyCommitSha(cwd, ancestorSha, signal)
  const descendant = await verifyCommitSha(cwd, descendantSha, signal)
  return isAncestor(cwd, ancestor, descendant, signal)
}

export async function addWorktree(cwd, branch, worktree, base, signal) {
  await git(cwd, ['worktree', 'add', '-b', branch, worktree, base], signal)
}

export async function preflightMerge(cwd, branch, worktree, base, commitSha, message, signal) {
  const baseHead = await resolveCommitSha(cwd, base, signal)
  const fixedSha = await verifyCommitSha(cwd, commitSha, signal)
  await addWorktree(cwd, branch, worktree, baseHead, signal)
  await mergeCommit(worktree, fixedSha, message, signal)
  const preflightHead = await verifyCommitSha(worktree, await head(worktree, signal), signal)
  return {
    branch,
    worktree,
    baseHead,
    commitSha: fixedSha,
    head: preflightHead,
  }
}

async function inProgressOperation(cwd, signal) {
  const operations = [
    { name: 'rebase', markers: ['rebase-merge', 'rebase-apply'] },
    { name: 'merge', markers: ['MERGE_HEAD'] },
    { name: 'cherry-pick', markers: ['CHERRY_PICK_HEAD'] },
  ]
  for (const operation of operations) {
    for (const marker of operation.markers) {
      const path = await git(cwd, ['rev-parse', '--git-path', marker], signal)
      if (existsSync(resolvePath(cwd, path))) return operation.name
    }
  }
  return undefined
}

export async function syncOwnerBranchToWorkflow(root, ownerWorktree, ownerBranch, workflowBranch, signal) {
  const operation = await inProgressOperation(ownerWorktree, signal)
  if (operation !== undefined) {
    throw new Error(`Owner worktree 存在未完成的 ${operation} 操作，拒绝同步 workflow`)
  }
  // 构建缓存、APK 等忽略产物不会进入 Owner 提交，也不改变分支历史。
  // 同步只拒绝真实 Git 改动，避免纯验证生成的忽略文件阻塞下一任务复用 worktree。
  const dirty = await statusRecords(ownerWorktree, signal)
  if (dirty.length > 0) throw new Error('Owner worktree 不干净，拒绝同步覆盖')
  const attachedBranch = await currentBranch(ownerWorktree, signal)
  if (attachedBranch !== ownerBranch) {
    throw new Error(`Owner worktree 未绑定正确分支：期望 ${ownerBranch}，实际 ${attachedBranch ?? 'detached HEAD'}`)
  }
  const workflowHead = await resolveCommitSha(root, workflowBranch, signal)
  try {
    await git(ownerWorktree, ['merge', '--ff-only', workflowHead], signal)
  } catch (error) {
    throw new Error('无法以快进方式同步 workflow 分支', { cause: error })
  }
  if (await currentBranch(ownerWorktree, signal) !== ownerBranch) {
    throw new Error(`Owner worktree 未绑定正确分支：期望 ${ownerBranch}`)
  }
  return head(ownerWorktree, signal)
}

export async function removeWorktree(cwd, worktree, signal, { missingOk = false, force = false } = {}) {
  try {
    await git(cwd, ['worktree', 'remove', ...(force ? ['--force'] : []), worktree], signal)
    return { removed: true, missing: false }
  } catch (error) {
    if (!missingOk) throw error
    const output = await git(cwd, ['worktree', 'list', '--porcelain'], signal)
    const registered = worktreePathSet(output, cwd).has(resolvePath(cwd, worktree))
    if (registered) throw error
    return { removed: false, missing: true }
  }
}

export async function mergeCommit(worktree, commitSha, message, signal) {
  const fixedSha = await verifyCommitSha(worktree, commitSha, signal)
  await git(worktree, [
    '-c',
    `core.hooksPath=${DISABLED_HOOKS_PATH}`,
    'merge',
    '--no-ff',
    '--no-edit',
    '-m',
    message,
    fixedSha,
  ], signal)
  return { mergedCommit: fixedSha, head: await head(worktree, signal) }
}

export async function mergeBranch(worktree, branch, message, signal) {
  const fixedSha = await resolveCommitSha(worktree, branch, signal)
  return mergeCommit(worktree, fixedSha, message, signal)
}

export async function listBranches(cwd, pattern, signal) {
  const output = await git(cwd, ['branch', '--format=%(refname:short)', '--list', pattern], signal)
  return output === '' ? [] : output.split('\n').map(item => item.trim()).filter(Boolean)
}

async function branchExists(cwd, branch, signal) {
  try {
    await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], signal)
    return true
  } catch (error) {
    if (exitCode(error) === 1) return false
    throw error
  }
}

export async function deleteBranch(cwd, branch, signal, { force = false, missingOk = false } = {}) {
  if (missingOk && !await branchExists(cwd, branch, signal)) {
    return { deleted: false, missing: true }
  }
  await git(cwd, ['branch', force ? '-D' : '-d', branch], signal)
  return { deleted: true, missing: false }
}

export async function abortMerge(worktree, signal) {
  await git(worktree, ['merge', '--abort'], signal).catch(() => undefined)
}
