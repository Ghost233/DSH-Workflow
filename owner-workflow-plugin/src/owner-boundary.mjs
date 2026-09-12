import {
  aheadCount,
  assertHead,
  changedFilesInCommitRange,
  commitChangedFiles,
  commitFiles,
  resolveCommitSha,
  statusRecords,
  verifyCommitSha,
} from './git.mjs'
import { MEMORY_DIRECTORY } from './memory.mjs'
import { ownerAllows, scopeMatches } from './model.mjs'
import { OWNER_CONFIGURATION_DIRECTORY, OWNER_RUNTIME_DIRECTORY } from './project-layout.mjs'

function asciiCaseFold(value) {
  return value.replace(/[A-Z]/gu, character => character.toLowerCase())
}

/** 无论 Owner scope 如何配置，这些运行时和治理目录都不能由业务任务提交。 */
export function isProtectedRelativePath(file) {
  const normalized = asciiCaseFold(file.replaceAll('\\', '/').replace(/^\.\//u, ''))
  return normalized === '.git'
    || normalized.startsWith('.git/')
    || normalized === OWNER_RUNTIME_DIRECTORY
    || normalized.startsWith(`${OWNER_RUNTIME_DIRECTORY}/`)
    || normalized === MEMORY_DIRECTORY
    || normalized.startsWith(`${MEMORY_DIRECTORY}/`)
    || normalized === OWNER_CONFIGURATION_DIRECTORY
    || normalized.startsWith(`${OWNER_CONFIGURATION_DIRECTORY}/`)
    || normalized === 'deepseek-harness'
    || normalized.startsWith('deepseek-harness/')
    || normalized === 'dsh-synapse'
    || normalized.startsWith('dsh-synapse/')
    || normalized === 'owner-workflow-plugin/vendor/dsh-approve-for-me'
    || normalized.startsWith('owner-workflow-plugin/vendor/dsh-approve-for-me/')
}

function recordFiles(record) {
  return [record.path, ...(record.originalPath === undefined ? [] : [record.originalPath])]
}

/** task.write 是 Owner 在本次 DAG 节点中的最终提交边界；缺失时兼容旧夹具。 */
function taskAllows(entry, file) {
  if (!Array.isArray(entry.task?.write)) return true
  return entry.task.write.some(pattern => scopeMatches(pattern, file))
}

/**
 * Owner 可以在隔离 worktree 中自由尝试；这里只检查最终可见改动是否越过责任边界。
 * Git 忽略文件不会进入提交，因此不作为失败条件。
 */
export async function inspectOwnerChanges({ entry, signal }) {
  const records = await statusRecords(entry.worktree, signal, { includeIgnored: false })
  const dirtyFiles = [...new Set(records.flatMap(recordFiles))]
  const commitSha = await resolveCommitSha(entry.worktree, entry.branch, signal)
  const committedFiles = await changedFilesInCommitRange(entry.worktree, entry.baseCommit, commitSha, signal)
  const files = [...new Set([...committedFiles, ...dirtyFiles])]
  const outside = files.filter(file => !ownerAllows(entry.owner, file))
  const outsideTask = files.filter(file => !taskAllows(entry, file))
  const protectedFiles = files.filter(isProtectedRelativePath)
  const ahead = await aheadCount(entry.worktree, entry.baseCommit, commitSha, signal)
  const violations = []
  if (outside.length > 0) violations.push(`实际改动越过 Owner scope：${outside.join(', ')}`)
  if (outsideTask.length > 0) violations.push(`实际改动越过当前 task.write：${outsideTask.join(', ')}`)
  if (protectedFiles.length > 0) violations.push(`实际改动触及受保护路径：${protectedFiles.join(', ')}`)
  return {
    records,
    dirtyFiles,
    committedFiles,
    files,
    outside,
    outsideTask,
    protectedFiles,
    commitSha,
    ahead,
    violations,
  }
}

/** 在唯一提交关卡中运行验证、提交并对固定提交再次校验 Owner scope。 */
export async function commitOwnerChanges({ entry, taskName, inspection, signal, verify }) {
  await verify()
  let commitResult = false
  if (inspection.files.length > 0 && (inspection.ahead === 0 || inspection.dirtyFiles.length > 0)) {
    commitResult = await commitFiles(
      entry.worktree,
      inspection.files,
      `Owner ${entry.owner.id}：${taskName}`,
      signal,
    )
    if (commitResult === false) throw new Error(`Owner ${entry.owner.id} 的提交关卡没有生成提交`)
    const returnedFiles = commitResult.files ?? commitResult.committedFiles ?? []
    const returnedSha = await verifyCommitSha(entry.worktree, commitResult.commitSha ?? commitResult.head, signal)
    await assertHead(entry.worktree, returnedSha, signal)
    const actualCommitFiles = await commitChangedFiles(entry.worktree, returnedSha, signal)
    const outside = actualCommitFiles.filter(file => !ownerAllows(entry.owner, file))
    const outsideTask = actualCommitFiles.filter(file => !taskAllows(entry, file))
    const protectedFiles = actualCommitFiles.filter(isProtectedRelativePath)
    if (outside.length > 0 || outsideTask.length > 0 || protectedFiles.length > 0) {
      const violations = []
      if (outside.length > 0) violations.push(`越过 Owner scope：${outside.join(', ')}`)
      if (outsideTask.length > 0) violations.push(`越过当前 task.write：${outsideTask.join(', ')}`)
      if (protectedFiles.length > 0) violations.push(`触及受保护路径：${protectedFiles.join(', ')}`)
      throw new Error(`Owner ${entry.owner.id} 的提交越过边界：${violations.join('；')}`)
    }
    if (returnedFiles.some(file => !actualCommitFiles.includes(file))) {
      throw new Error(`Owner ${entry.owner.id} 的提交返回文件与实际提交不一致`)
    }
  }

  const remaining = await statusRecords(entry.worktree, signal, { includeIgnored: false })
  const remainingDirty = [...new Set(remaining.flatMap(recordFiles))]
  if (remainingDirty.length > 0) {
    throw new Error(`Owner ${entry.owner.id} 提交后仍有未提交改动：${remainingDirty.join(', ')}`)
  }
  const commitSha = await resolveCommitSha(entry.worktree, entry.branch, signal)
  const changed = await changedFilesInCommitRange(entry.worktree, entry.baseCommit, commitSha, signal)
  const ahead = await aheadCount(entry.worktree, entry.baseCommit, commitSha, signal)
  if (changed.length > 0 && ahead === 0) throw new Error(`Owner ${entry.owner.id} 有文件改动但没有 Git 提交`)
  const outside = changed.filter(file => !ownerAllows(entry.owner, file))
  const outsideTask = changed.filter(file => !taskAllows(entry, file))
  const protectedFiles = changed.filter(isProtectedRelativePath)
  if (outside.length > 0 || outsideTask.length > 0 || protectedFiles.length > 0) {
    const violations = []
    if (outside.length > 0) violations.push(`越过 Owner scope：${outside.join(', ')}`)
    if (outsideTask.length > 0) violations.push(`越过当前 task.write：${outsideTask.join(', ')}`)
    if (protectedFiles.length > 0) violations.push(`触及受保护路径：${protectedFiles.join(', ')}`)
    throw new Error(`Owner ${entry.owner.id} 提交后二次边界校验失败：${violations.join('；')}`)
  }
  return { changed, ahead, commitSha, commitResult }
}
