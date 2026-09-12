import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'
import * as gitHelpers from '../src/git.mjs'
import {
  addWorktree,
  changedFilesAtCommit,
  commitFiles,
  deleteBranch,
  head,
  isCommitAncestor,
  mergeCommit,
  parseStatusRecords,
  removeWorktree,
  statusRecords,
  verifyCommitSha,
} from '../src/git.mjs'

const execFileAsync = promisify(execFile)

async function runGit(cwd, args) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return String(result.stdout ?? '')
}

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-test-'))
  await runGit(root, ['init', '-q', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await runGit(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'tracked.txt'), '初始内容\n')
  await writeFile(join(root, 'other.txt'), '其他内容\n')
  await runGit(root, ['add', 'tracked.txt', 'other.txt'])
  await runGit(root, ['commit', '-qm', '初始化测试仓库'])
  return root
}

async function removeRepository(root) {
  await rm(root, { recursive: true, force: true })
}

async function createOwnerSyncFixture(branch = 'dsh/owner/wf-sync/api') {
  const root = await createRepository()
  const worktreeParent = await mkdtemp(join(tmpdir(), 'dsh-owner-sync-test-'))
  const worktree = join(worktreeParent, 'owner')
  await addWorktree(root, branch, worktree, 'main')
  return { root, branch, worktree, worktreeParent }
}

async function removeOwnerSyncFixture(fixture) {
  await removeWorktree(fixture.root, fixture.worktree, undefined, { missingOk: true }).catch(() => undefined)
  await deleteBranch(fixture.root, fixture.branch, undefined, { force: true, missingOk: true }).catch(() => undefined)
  await removeRepository(fixture.root)
  await rm(fixture.worktreeParent, { recursive: true, force: true })
}

test('Owner 分支以 ff-only 同步到最新 workflow HEAD', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    const workflowCommit = await commitFiles(fixture.root, ['workflow.txt'], '推进 workflow')
    assert.equal(typeof gitHelpers.syncOwnerBranchToWorkflow, 'function')

    const syncedHead = await gitHelpers.syncOwnerBranchToWorkflow(
      fixture.root,
      fixture.worktree,
      fixture.branch,
      'main',
    )

    assert.equal(syncedHead, workflowCommit.commitSha)
    assert.equal(await head(fixture.worktree), workflowCommit.commitSha)
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('Owner worktree 脏时拒绝同步 workflow', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    await commitFiles(fixture.root, ['workflow.txt'], '推进 workflow')
    await writeFile(join(fixture.worktree, 'tracked.txt'), 'Owner 未提交修改\n')
    await writeFile(join(fixture.worktree, 'untracked.txt'), 'Owner 未跟踪文件\n')
    const before = await head(fixture.worktree)
    assert.equal(typeof gitHelpers.syncOwnerBranchToWorkflow, 'function')

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        fixture.branch,
        'main',
      ),
      /Owner worktree 不干净，拒绝同步覆盖/u,
    )
    assert.equal(await head(fixture.worktree), before)
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('只有显式 force 才能删除包含未提交修改的 worktree', async () => {
  const fixture = await createOwnerSyncFixture('dsh/owner/wf-discard/api')
  try {
    await writeFile(join(fixture.worktree, 'tracked.txt'), '准备放弃的修改\n')
    await writeFile(join(fixture.worktree, 'untracked.txt'), '准备放弃的未跟踪文件\n')

    await assert.rejects(
      removeWorktree(fixture.root, fixture.worktree),
      /worktree remove/u,
    )
    assert.equal(existsSync(fixture.worktree), true)

    const removed = await removeWorktree(fixture.root, fixture.worktree, undefined, { force: true })
    assert.deepEqual(removed, { removed: true, missing: false })
    assert.equal(existsSync(fixture.worktree), false)
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('Owner worktree 只有忽略的验证产物时允许同步 workflow', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    const workflowCommit = await commitFiles(fixture.root, ['workflow.txt'], '推进 workflow')
    await writeFile(join(fixture.root, '.git', 'info', 'exclude'), 'build/\n')
    await mkdir(join(fixture.worktree, 'build'), { recursive: true })
    await writeFile(join(fixture.worktree, 'build', 'app-debug.apk'), '仅用于验证的忽略产物\n')

    const syncedHead = await gitHelpers.syncOwnerBranchToWorkflow(
      fixture.root,
      fixture.worktree,
      fixture.branch,
      'main',
    )

    assert.equal(syncedHead, workflowCommit.commitSha)
    assert.equal(await head(fixture.worktree), workflowCommit.commitSha)
    assert.equal(await readFile(join(fixture.worktree, 'build', 'app-debug.apk'), 'utf8'), '仅用于验证的忽略产物\n')
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('Owner worktree 绑定错误分支时拒绝同步且不移动 HEAD', async () => {
  const fixture = await createOwnerSyncFixture('dsh/owner/wf-sync/unexpected')
  try {
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    await commitFiles(fixture.root, ['workflow.txt'], '推进 workflow')
    const before = await head(fixture.worktree)
    assert.equal(typeof gitHelpers.syncOwnerBranchToWorkflow, 'function')

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        'dsh/owner/wf-sync/api',
        'main',
      ),
      /Owner worktree 未绑定正确分支/u,
    )
    assert.equal(await head(fixture.worktree), before)
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('Owner 分支与 workflow 分叉时拒绝非 ff 同步且不移动 HEAD', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.worktree, 'owner.txt'), 'owner 新提交\n')
    await commitFiles(fixture.worktree, ['owner.txt'], 'Owner 分支独有提交')
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    await commitFiles(fixture.root, ['workflow.txt'], 'workflow 分支独有提交')
    const before = await head(fixture.worktree)
    assert.equal(typeof gitHelpers.syncOwnerBranchToWorkflow, 'function')

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        fixture.branch,
        'main',
      ),
      /无法以快进方式同步 workflow 分支/u,
    )
    assert.equal(await head(fixture.worktree), before)
  } finally {
    await removeOwnerSyncFixture(fixture)
  }
})

test('clean paused rebase 时拒绝同步且不移动 HEAD 或 Owner ref', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.worktree, 'owner.txt'), 'owner 新提交\n')
    await commitFiles(fixture.worktree, ['owner.txt'], 'Owner 分支独有提交')
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    await commitFiles(fixture.root, ['workflow.txt'], 'workflow 分支独有提交')
    await assert.rejects(runGit(fixture.worktree, ['rebase', '--exec', 'false', 'main']))
    assert.deepEqual(await statusRecords(fixture.worktree, undefined, { includeIgnored: true }), [])
    const beforeHead = await head(fixture.worktree)
    const beforeRef = (await runGit(fixture.root, ['rev-parse', fixture.branch])).trim()

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        fixture.branch,
        'main',
      ),
      /Owner worktree 存在未完成的 rebase 操作/u,
    )
    assert.equal(await head(fixture.worktree), beforeHead)
    assert.equal((await runGit(fixture.root, ['rev-parse', fixture.branch])).trim(), beforeRef)
  } finally {
    await runGit(fixture.worktree, ['rebase', '--abort']).catch(() => undefined)
    await removeOwnerSyncFixture(fixture)
  }
})

test('clean paused merge 时拒绝同步且不移动 HEAD 或 Owner ref', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.worktree, 'owner.txt'), 'owner 新提交\n')
    await commitFiles(fixture.worktree, ['owner.txt'], 'Owner 分支独有提交')
    await writeFile(join(fixture.root, 'workflow.txt'), 'workflow 新提交\n')
    await commitFiles(fixture.root, ['workflow.txt'], 'workflow 分支独有提交')
    await runGit(fixture.worktree, ['merge', '--no-commit', 'main'])
    await runGit(fixture.worktree, ['restore', '--source=HEAD', '--staged', '--worktree', '--', '.'])
    assert.deepEqual(await statusRecords(fixture.worktree, undefined, { includeIgnored: true }), [])
    const beforeHead = await head(fixture.worktree)
    const beforeRef = (await runGit(fixture.root, ['rev-parse', fixture.branch])).trim()

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        fixture.branch,
        'main',
      ),
      /Owner worktree 存在未完成的 merge 操作/u,
    )
    assert.equal(await head(fixture.worktree), beforeHead)
    assert.equal((await runGit(fixture.root, ['rev-parse', fixture.branch])).trim(), beforeRef)
  } finally {
    await runGit(fixture.worktree, ['merge', '--abort']).catch(() => undefined)
    await removeOwnerSyncFixture(fixture)
  }
})

test('clean paused cherry-pick 时拒绝同步且不移动 HEAD 或 Owner ref', async () => {
  const fixture = await createOwnerSyncFixture()
  try {
    await writeFile(join(fixture.worktree, 'tracked.txt'), 'owner 内容\n')
    await commitFiles(fixture.worktree, ['tracked.txt'], 'Owner 修改 tracked')
    await writeFile(join(fixture.root, 'tracked.txt'), 'workflow 内容\n')
    const workflowCommit = await commitFiles(fixture.root, ['tracked.txt'], 'workflow 修改 tracked')
    await assert.rejects(runGit(fixture.worktree, ['cherry-pick', workflowCommit.commitSha]))
    await runGit(fixture.worktree, ['checkout', '--ours', '--', 'tracked.txt'])
    await runGit(fixture.worktree, ['add', 'tracked.txt'])
    assert.deepEqual(await statusRecords(fixture.worktree, undefined, { includeIgnored: true }), [])
    const beforeHead = await head(fixture.worktree)
    const beforeRef = (await runGit(fixture.root, ['rev-parse', fixture.branch])).trim()

    await assert.rejects(
      gitHelpers.syncOwnerBranchToWorkflow(
        fixture.root,
        fixture.worktree,
        fixture.branch,
        'main',
      ),
      /Owner worktree 存在未完成的 cherry-pick 操作/u,
    )
    assert.equal(await head(fixture.worktree), beforeHead)
    assert.equal((await runGit(fixture.root, ['rev-parse', fixture.branch])).trim(), beforeRef)
  } finally {
    await runGit(fixture.worktree, ['cherry-pick', '--abort']).catch(() => undefined)
    await removeOwnerSyncFixture(fixture)
  }
})

test('保留已跟踪文件修改状态中的前导空格', async () => {
  const root = await createRepository()
  try {
    await writeFile(join(root, 'tracked.txt'), '修改后的内容\n')
    const records = await statusRecords(root)
    assert.deepEqual(records, [{ code: ' M', path: 'tracked.txt' }])
  } finally {
    await removeRepository(root)
  }
})

test('Git 状态忽略 Runtime 自动生成但尚未跟踪的 .gitignore', async () => {
  const root = await createRepository()
  try {
    await mkdir(join(root, '.dsh-workflow'), { recursive: true })
    await writeFile(join(root, '.dsh-workflow', '.gitignore'), '!keep\n', 'utf8')
    await writeFile(join(root, 'visible.txt'), '业务改动\n', 'utf8')
    assert.deepEqual(await statusRecords(root), [{ code: '??', path: 'visible.txt' }])
  } finally {
    await removeRepository(root)
  }
})

test('正确解析真实重命名和双路径记录', async () => {
  const root = await createRepository()
  try {
    await runGit(root, ['mv', 'tracked.txt', 'renamed.txt'])
    const records = await statusRecords(root)
    assert.deepEqual(records, [{
      code: 'R ',
      path: 'renamed.txt',
      originalPath: 'tracked.txt',
    }])
  } finally {
    await removeRepository(root)
  }
})

test('正确解析复制记录的双路径', () => {
  assert.deepEqual(
    parseStatusRecords('C  复制后的文件.txt\0来源文件.txt\0'),
    [{ code: 'C ', path: '复制后的文件.txt', originalPath: '来源文件.txt' }],
  )
})

test('提交代理禁用仓库钩子并返回固定提交和实际文件', async () => {
  const root = await createRepository()
  try {
    const hooks = join(root, '.git', 'hooks')
    const marker = join(root, 'hook-ran.txt')
    await writeFile(
      join(hooks, 'pre-commit'),
      `#!/bin/sh\nprintf '钩子已执行' > '${marker}'\n`,
    )
    await chmod(join(hooks, 'pre-commit'), 0o755)
    await runGit(root, ['config', 'core.hooksPath', hooks])
    await writeFile(join(root, 'tracked.txt'), '提交内容\n')
    await writeFile(join(root, 'other.txt'), '未提交内容\n')

    const result = await commitFiles(root, ['tracked.txt'], '提交指定文件')

    assert.equal(result.committed, true)
    assert.match(result.head, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u)
    assert.equal(result.commitSha, result.head)
    assert.deepEqual(result.files, ['tracked.txt'])
    assert.deepEqual(result.committedFiles, ['tracked.txt'])
    assert.equal(existsSync(marker), false)
    assert.equal(await head(root), result.head)
    assert.deepEqual(await statusRecords(root), [{ code: ' M', path: 'other.txt' }])
    assert.equal((await readFile(join(root, 'tracked.txt'), 'utf8')), '提交内容\n')
  } finally {
    await removeRepository(root)
  }
})

test('固定提交哈希可以校验变更并安全合并', async () => {
  const root = await createRepository()
  const worktreeParent = await mkdtemp(join(tmpdir(), 'dsh-git-worktree-test-'))
  const worktree = join(worktreeParent, 'feature')
  try {
    await addWorktree(root, 'feature', worktree, 'main')
    await writeFile(join(worktree, 'tracked.txt'), '分支内容\n')
    const commit = await commitFiles(worktree, ['tracked.txt'], '提交分支内容')
    const fixedSha = await verifyCommitSha(root, commit.head)
    assert.equal(fixedSha, commit.head)
    assert.deepEqual(await changedFilesAtCommit(root, 'main', fixedSha), ['tracked.txt'])

    const merged = await mergeCommit(root, fixedSha, '合并固定提交')
    assert.equal(merged.mergedCommit, fixedSha)
    assert.equal(await isCommitAncestor(root, fixedSha, merged.head), true)
  } finally {
    await removeWorktree(root, worktree, undefined, { missingOk: true }).catch(() => undefined)
    await deleteBranch(root, 'feature', undefined, { force: true, missingOk: true }).catch(() => undefined)
    await removeRepository(root)
    await rm(worktreeParent, { recursive: true, force: true })
  }
})

test('分支和工作树清理支持明确的幂等 missing-ok', async () => {
  const root = await createRepository()
  const worktreeParent = await mkdtemp(join(tmpdir(), 'dsh-git-cleanup-test-'))
  const worktree = join(worktreeParent, 'feature')
  try {
    await addWorktree(root, 'feature', worktree, 'main')
    assert.deepEqual(await removeWorktree(root, worktree), { removed: true, missing: false })
    assert.deepEqual(await removeWorktree(root, worktree, undefined, { missingOk: true }), {
      removed: false,
      missing: true,
    })
    assert.deepEqual(await deleteBranch(root, 'feature', undefined, { force: true }), {
      deleted: true,
      missing: false,
    })
    assert.deepEqual(await deleteBranch(root, 'feature', undefined, { force: true, missingOk: true }), {
      deleted: false,
      missing: true,
    })
  } finally {
    await removeWorktree(root, worktree, undefined, { missingOk: true }).catch(() => undefined)
    await deleteBranch(root, 'feature', undefined, { force: true, missingOk: true }).catch(() => undefined)
    await removeRepository(root)
    await rm(worktreeParent, { recursive: true, force: true })
  }
})

test('工作树清理默认拒绝删除 dirty worktree 并保留现场', async () => {
  const root = await createRepository()
  const worktreeParent = await mkdtemp(join(tmpdir(), 'dsh-git-dirty-cleanup-test-'))
  const worktree = join(worktreeParent, 'feature')
  try {
    await addWorktree(root, 'feature', worktree, 'main')
    await writeFile(join(worktree, 'untracked.txt'), '必须保留的未跟踪内容\n')

    await assert.rejects(removeWorktree(root, worktree), /worktree remove/u)
    assert.equal(existsSync(worktree), true)
    assert.equal(await readFile(join(worktree, 'untracked.txt'), 'utf8'), '必须保留的未跟踪内容\n')
  } finally {
    await rm(join(worktree, 'untracked.txt'), { force: true })
    await removeWorktree(root, worktree, undefined, { missingOk: true }).catch(() => undefined)
    await deleteBranch(root, 'feature', undefined, { force: true, missingOk: true }).catch(() => undefined)
    await removeRepository(root)
    await rm(worktreeParent, { recursive: true, force: true })
  }
})
