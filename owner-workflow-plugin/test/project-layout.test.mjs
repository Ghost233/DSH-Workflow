import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import {
  OWNER_COLLECTION_DIRECTORY,
  OWNER_CONFIGURATION_DIRECTORY,
  OWNER_MEMORY_DIRECTORY,
  OWNER_RUNTIME_DIRECTORY,
  RUNTIME_GITIGNORE_CONTENT,
  ensureRuntimeGitignore,
} from '../src/project-layout.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

const execFileAsync = promisify(execFile)

async function git(root, args) {
  const result = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' })
  return String(result.stdout ?? '').trim()
}

test('项目存储目录把配置和长期资料归入各自 Owner 文件夹', () => {
  assert.equal(OWNER_CONFIGURATION_DIRECTORY, '.owner-workflow')
  assert.equal(OWNER_RUNTIME_DIRECTORY, '.dsh-workflow')
  assert.equal(OWNER_COLLECTION_DIRECTORY, 'owners')
  assert.equal(OWNER_MEMORY_DIRECTORY, 'memory')
  assert.match(RUNTIME_GITIGNORE_CONTENT, /\.owner-workflow\/owners\/<owner-id>\//u)
  assert.doesNotMatch(RUNTIME_GITIGNORE_CONTENT, /\.owner-memory/u)
})

test('Runtime 初始化创建目录内 .gitignore 并只暴露该文件给 Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-layout-'))
  try {
    await git(root, ['init', '-q', '-b', 'main'])
    const gitDirectory = await git(root, ['rev-parse', '--git-dir'])
    const legacyExclude = join(root, gitDirectory, 'info', 'exclude')
    await writeFile(legacyExclude, '# DSH Owner 工作流运行目录\n.dsh-workflow/\n', 'utf8')

    const runtime = createOwnerWorkflowRuntime({}, {})
    await runtime.prepareRoot(root)
    await writeFile(join(root, OWNER_RUNTIME_DIRECTORY, 'logs', 'runtime.jsonl'), '{}\n', 'utf8')

    assert.equal(
      await readFile(join(root, OWNER_RUNTIME_DIRECTORY, '.gitignore'), 'utf8'),
      RUNTIME_GITIGNORE_CONTENT,
    )
    assert.equal(await readFile(legacyExclude, 'utf8'), '')
    assert.equal(
      await git(root, ['status', '--short', '--untracked-files=all']),
      '?? .dsh-workflow/.gitignore',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Runtime 初始化不覆盖项目已有的自定义 .gitignore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-layout-custom-'))
  try {
    const directory = join(root, OWNER_RUNTIME_DIRECTORY)
    const first = await ensureRuntimeGitignore(directory)
    assert.equal(first.created, true)
    await writeFile(first.path, '# 项目自定义规则\n*\n!.gitignore\n', 'utf8')

    const second = await ensureRuntimeGitignore(directory)
    assert.equal(second.created, false)
    assert.equal(await readFile(first.path, 'utf8'), '# 项目自定义规则\n*\n!.gitignore\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('旧 autoAddGitExclude=false 配置继续关闭自动 .gitignore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-layout-disabled-'))
  try {
    await git(root, ['init', '-q', '-b', 'main'])
    const runtime = createOwnerWorkflowRuntime({}, { autoAddGitExclude: false })
    await runtime.prepareRoot(root)
    assert.equal(existsSync(join(root, OWNER_RUNTIME_DIRECTORY, '.gitignore')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
