import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { git, head } from '../src/git.mjs'
import { commitOwnerChanges, inspectOwnerChanges, isProtectedRelativePath } from '../src/owner-boundary.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-boundary-'))
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-boundary@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Boundary Test'])
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  await writeFile(join(root, 'src', 'owned', 'value.txt'), '旧值\n', 'utf8')
  await writeFile(join(root, '.gitignore'), 'build/\n', 'utf8')
  await git(root, ['add', '.gitignore', 'src/owned/value.txt'])
  await git(root, ['commit', '-m', '初始化边界测试'])
  return {
    root,
    entry: {
      owner: { id: 'owned', scope: ['src/owned/**'], exclude: [] },
      worktree: root,
      branch: 'main',
      baseCommit: await head(root),
    },
  }
}

test('Harness、Synapse 与审批策略上游子模块始终属于受保护路径', () => {
  for (const path of [
    'deepseek-harness',
    'deepseek-harness/package.json',
    'dsh-synapse',
    'dsh-synapse/index.js',
    'owner-workflow-plugin/vendor/dsh-approve-for-me',
    'owner-workflow-plugin/vendor/dsh-approve-for-me/src/core/index.ts',
    'DSH-SYNAPSE/client.js',
  ]) {
    assert.equal(isProtectedRelativePath(path), true, path)
  }
})

test('Owner 可以自由修改 worktree，但提交关卡拒绝 scope 外和受保护路径', async () => {
  const { root, entry } = await fixture()
  try {
    await writeFile(join(root, 'outside.txt'), '越界\n', 'utf8')
    await mkdir(join(root, '.owner-workflow'), { recursive: true })
    await writeFile(join(root, '.owner-workflow', 'config.json'), '{}\n', 'utf8')
    const inspection = await inspectOwnerChanges({ entry })
    assert.deepEqual(inspection.outside.sort(), ['.owner-workflow/config.json', 'outside.txt'])
    assert.deepEqual(inspection.protectedFiles, ['.owner-workflow/config.json'])
    assert.equal(inspection.violations.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('提交关卡忽略构建产物，自动提交 scope 内真实 diff 并再次校验', async () => {
  const { root, entry } = await fixture()
  try {
    await writeFile(join(root, 'src', 'owned', 'value.txt'), '新值\n', 'utf8')
    await mkdir(join(root, 'build'), { recursive: true })
    await writeFile(join(root, 'build', 'cache.bin'), '缓存\n', 'utf8')
    const inspection = await inspectOwnerChanges({ entry })
    assert.deepEqual(inspection.files, ['src/owned/value.txt'])
    let verified = false
    const committed = await commitOwnerChanges({
      entry,
      taskName: '更新值',
      inspection,
      verify: async () => { verified = true },
    })
    assert.equal(verified, true)
    assert.deepEqual(committed.changed, ['src/owned/value.txt'])
    assert.match(committed.commitSha, /^[0-9a-f]{40}$/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('提交关卡检查全部提交历史，不能用后续删除隐藏中间越界提交', async () => {
  const { root, entry } = await fixture()
  try {
    await writeFile(join(root, 'outside.txt'), '中间越界\n', 'utf8')
    await git(root, ['add', 'outside.txt'])
    await git(root, ['commit', '-m', '中间越界提交'])
    await rm(join(root, 'outside.txt'))
    await git(root, ['add', '-u', 'outside.txt'])
    await git(root, ['commit', '-m', '删除中间越界文件'])
    const inspection = await inspectOwnerChanges({ entry })
    assert.deepEqual(inspection.outside, ['outside.txt'])
    assert.match(inspection.violations.join('；'), /越过 Owner scope/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('review 或 verify task 不能借用 Owner scope 提交业务改动', async () => {
  const { root, entry } = await fixture()
  try {
    entry.task = { id: 'T-review', role: 'review', write: [] }
    await writeFile(join(root, 'src', 'owned', 'value.txt'), 'review 越界写入\n', 'utf8')
    const inspection = await inspectOwnerChanges({ entry })
    assert.deepEqual(inspection.outside, [])
    assert.deepEqual(inspection.outsideTask, ['src/owned/value.txt'])
    assert.match(inspection.violations.join('；'), /越过当前 task.write/u)
    await assert.rejects(
      commitOwnerChanges({ entry, taskName: '只读审查', inspection, verify: async () => undefined }),
      /越过当前 task.write/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
