import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  MEMORY_CURATOR_CONTRACT,
  MEMORY_REVIEW_CONTRACT,
  appendOwnerWorklogNote,
  createOwnerWorklog,
  loadMemorySnapshot,
  normalizeCuratorResult,
  normalizeMemoryReview,
  normalizeMemoryUpdates,
  repairMemoryCatalogSelfReferences,
  refreshMemoryCatalogVerification,
  writeSealedOwnerWorklog,
  writeMemoryBundle,
} from '../src/memory.mjs'
import { commitFiles, head } from '../src/git.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

const execFileAsync = promisify(execFile)

async function git(cwd, args) {
  await execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-memory-'))
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-memory@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Memory Test'])
  await writeFile(join(root, 'api.ts'), 'export const version = 1\n', 'utf8')
  await git(root, ['add', 'api.ts'])
  await git(root, ['commit', '-m', '初始化记忆测试仓库'])
  return root
}

const plan = {
  owners: [{ id: 'network', name: '网络', description: '网络模块', scope: ['**'], exclude: [] }],
}

test('Owner 记忆契约拒绝越界页面、运行目录来源和未知状态', () => {
  assert.deepEqual(normalizeMemoryUpdates([{
    type: 'interface',
    title: '登录接口',
    summary: '登录接口返回稳定会话结果',
    files: ['api.ts'],
    ownerIds: ['network'],
    supersedes: [],
  }])[0].ownerIds, ['network'])
  assert.throws(() => normalizeMemoryUpdates([{
    type: 'interface',
    title: '非法来源',
    summary: '不能引用运行时目录',
    files: ['.dsh-workflow/state.json'],
  }]), /不能引用运行时或记忆管理路径/u)
  assert.throws(() => normalizeCuratorResult({
    contract: MEMORY_CURATOR_CONTRACT,
    summary: '越界页面',
    pages: [{
      path: '../outside.md',
      type: 'concept',
      title: '越界',
      summary: '越界',
      content: '越界',
      ownerIds: ['network'],
      tags: [],
      files: ['api.ts'],
      supersedes: [],
    }],
  }, plan), /仓库相对路径/u)
  assert.throws(() => normalizeMemoryReview({
    contract: MEMORY_REVIEW_CONTRACT,
    status: 'unknown',
    summary: '未知状态',
    issues: [],
  }), /状态不受支持/u)
  assert.throws(() => normalizeCuratorResult({
    contract: MEMORY_CURATOR_CONTRACT,
    summary: '敏感内容',
    pages: [{
      path: 'owners/network/secret.md',
      type: 'procedure',
      title: '错误凭据页面',
      summary: 'password=abcdefghijklmnop',
      content: '不应进入 Git。',
      ownerIds: ['network'],
      tags: [],
      files: ['api.ts'],
      supersedes: [],
    }],
  }, plan), /疑似包含密钥、令牌、密码或私钥/u)
  assert.throws(() => normalizeCuratorResult({
    contract: MEMORY_CURATOR_CONTRACT,
    summary: '自引用页面',
    pages: [{
      path: 'owners/network/api.md', type: 'interface', title: '网络接口', summary: '接口当前行为', content: '接口当前行为。',
      ownerIds: ['network'], tags: [], files: ['api.ts'],
      supersedes: ['memory.owners.network.api'], derivedFrom: ['memory.owners.network.api'],
    }],
  }, plan), /不能在 supersedes 或 derivedFrom 中引用自身/u)
})

test('Runtime 只移除 Owner 记忆 catalog 的自引用元数据', async () => {
  const root = await repository()
  try {
    const directory = join(root, '.owner-memory')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, '.catalog.json'), `${JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CATALOG_V1',
      pages: {
        'owners/network/api.md': {
          id: 'memory.owners.network.api',
          supersedes: ['memory.owners.network.api'],
          derivedFrom: ['memory.owners.network.api', 'memory.other'],
        },
      },
    }, null, 2)}\n`, 'utf8')
    const files = await repairMemoryCatalogSelfReferences(root)
    assert.deepEqual(files, ['.owner-memory/.catalog.json'])
    const catalog = JSON.parse(await readFile(join(directory, '.catalog.json'), 'utf8'))
    assert.deepEqual(catalog.pages['owners/network/api.md'].supersedes, [])
    assert.deepEqual(catalog.pages['owners/network/api.md'].derivedFrom, ['memory.other'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Markdown Owner Wiki 生成索引和幂等日志，并根据来源提交计算 stale', async () => {
  const root = await repository()
  try {
    const verifiedAtCommit = await head(root)
    const curator = normalizeCuratorResult({
      contract: MEMORY_CURATOR_CONTRACT,
      summary: '记录网络接口知识',
      pages: [{
        path: 'owners/network/api.md',
        type: 'interface',
        title: '网络接口版本',
        summary: '接口当前版本为一',
        content: '该版本由 api.ts 定义。',
        ownerIds: ['network'],
        tags: ['网络'],
        files: ['api.ts'],
        supersedes: [],
      }],
    }, plan)
    const context = {
      workflowId: 'wf-memory',
      stage: { id: 'stage-1', name: '接口阶段' },
      entries: [{ owner: { id: 'network' }, report: { summary: '完成接口实现' } }],
      verifiedAtCommit,
    }
    const firstFiles = await writeMemoryBundle(root, curator, context)
    const secondFiles = await writeMemoryBundle(root, curator, context)
    assert.deepEqual(secondFiles, firstFiles)
    await commitFiles(root, firstFiles, '提交 Owner 长期记忆')
    const before = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(before.documents.find(document => document.path === 'owners/network/api.md').computedStatus, 'verified')
    const log = await readFile(join(root, '.owner-memory', 'log.md'), 'utf8')
    assert.equal((log.match(/owner-memory-stage:wf-memory:stage-1:start/gu) ?? []).length, 1)
    assert.match(await readFile(join(root, '.owner-memory', 'index.md'), 'utf8'), /网络接口版本/u)

    await writeFile(join(root, 'api.ts'), 'export const version = 2\n', 'utf8')
    await commitFiles(root, ['api.ts'], '修改接口版本')
    const after = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(after.documents.find(document => document.path === 'owners/network/api.md').computedStatus, 'stale')
    assert.notEqual(after.digest, before.digest)

    const replacement = normalizeCuratorResult({
      contract: MEMORY_CURATOR_CONTRACT,
      summary: '用第二版页面替代旧知识',
      pages: [{
        path: 'owners/network/api-v2.md',
        type: 'interface',
        title: '网络接口版本二',
        summary: '接口当前版本为二',
        content: '该版本继续由 api.ts 定义。',
        ownerIds: ['network'],
        tags: ['网络'],
        files: ['api.ts'],
        supersedes: ['memory.owners.network.api'],
        derivedFrom: ['memory.owners.network.api'],
      }],
    }, plan)
    const replacementFiles = await writeMemoryBundle(root, replacement, {
      ...context,
      stage: { id: 'stage-2', name: '接口升级阶段' },
      verifiedAtCommit: await head(root),
    })
    await commitFiles(root, replacementFiles, '替代旧 Owner 记忆')
    const replacementSnapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(replacementSnapshot.documents.find(document => document.path === 'owners/network/api.md').computedStatus, 'superseded')
    const oldPage = await readFile(join(root, '.owner-memory', 'owners', 'network', 'api.md'), 'utf8')
    assert.doesNotMatch(oldPage, /^---/u)
    assert.match(await readFile(join(root, '.owner-memory', '.catalog.json'), 'utf8'), /supersededBy/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('没有新页面但重新核对来源后会刷新既有记忆的验证基线', async () => {
  const root = await repository()
  try {
    const firstHead = await head(root)
    const initial = normalizeCuratorResult({
      contract: MEMORY_CURATOR_CONTRACT,
      summary: '记录网络接口知识',
      pages: [{
        path: 'owners/network/api.md',
        type: 'interface',
        title: '网络接口版本',
        summary: '接口版本由 api.ts 定义',
        content: '当前版本读取 api.ts 中的 version 常量。',
        ownerIds: ['network'],
        tags: [],
        files: ['api.ts'],
        supersedes: [],
        derivedFrom: [],
      }],
    }, plan)
    const initialFiles = await writeMemoryBundle(root, initial, {
      workflowId: 'wf-refresh',
      stage: { id: 'T1', name: '初始化知识' },
      entries: [{ owner: { id: 'network' }, report: { summary: '记录接口知识' } }],
      verifiedAtCommit: firstHead,
    })
    await commitFiles(root, initialFiles, '提交初始记忆')
    await writeFile(join(root, 'api.ts'), 'export const version = 2\n', 'utf8')
    await commitFiles(root, ['api.ts'], '更新接口实现')
    const changedHead = await head(root)
    const staleDocument = (await loadMemorySnapshot(root, { ownerId: 'network' })).documents
      .find(document => document.path === 'owners/network/api.md')
    assert.equal(staleDocument?.computedStatus, 'stale')

    const files = await refreshMemoryCatalogVerification(root, {
      verifiedAtCommit: changedHead,
      refreshSources: ['api.ts'],
    })
    assert.deepEqual(files, ['.owner-memory/.catalog.json'])
    await commitFiles(root, files, '刷新记忆验证基线')
    const snapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(snapshot.documents.find(document => document.path === 'owners/network/api.md')?.computedStatus, 'verified')
    const catalog = JSON.parse(await readFile(join(root, '.owner-memory', '.catalog.json'), 'utf8'))
    assert.equal(catalog.pages['owners/network/api.md'].verifiedAtCommit, changedHead)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('临时 Owner 记忆保持简短，封存后作为编译来源但不注入当前长期记忆', async () => {
  const root = await repository()
  try {
    let worklog = createOwnerWorklog({ taskId: 'T1', title: '调整设置页提示', ownerId: 'network' })
    worklog = appendOwnerWorklogNote(worklog, { type: '完成', text: '已将网络错误提示调整为红色。' })
    worklog = appendOwnerWorklogNote(worklog, { type: '结论', text: '错误提示由设置页统一展示。' })
    const sourceFile = await writeSealedOwnerWorklog(root, {
      workflowId: 'wf-memory-source',
      task: { id: 'T1', title: '调整设置页提示' },
      owner: { id: 'network' },
      worklog,
      report: {
        summary: '设置页以红色显示网络错误。',
        changes: [{ summary: '统一错误提示颜色。' }],
      },
    })
    const content = await readFile(join(root, sourceFile), 'utf8')
    assert.match(content, /网络错误提示调整为红色/u)
    assert.doesNotMatch(content, /提交|SHA|行号|测试输出/u)
    const snapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(snapshot.documents.some(document => document.path.includes('.sources')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Memory Curator 被独立 Reviewer 驳回后只允许一次修订', async () => {
  const root = await repository()
  const runtime = createOwnerWorkflowRuntime({}, { maxMemoryRevisionTurns: 1 })
  try {
    const outputs = [
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '第一版记忆',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '第一版摘要',
          content: '第一版正文。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
        }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'needs_revision',
        summary: '缺少当前行为说明',
        issues: ['补充版本来源'],
      },
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '修订版记忆',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '接口版本由 api.ts 定义',
          content: '当前版本读取 api.ts 中的 version 常量。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
        }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'passed',
        summary: '记忆与代码一致',
        issues: [],
      },
    ]
    runtime.runChild = async () => JSON.stringify(outputs.shift())
    const state = {
      id: 'wf-curator',
      root,
      workflowWorktree: root,
      plan,
    }
    const stage = { id: 'stage-1', name: '接口阶段' }
    const entries = [{
      owner: plan.owners[0],
      commitSha: await head(root),
      changedFiles: ['api.ts'],
      report: { summary: '实现接口', changes: [], tests: [], memoryUpdates: [] },
    }]
    const agent = { ctx: { agents: { create() {} } } }
    const result = await runtime.curateStageMemory(agent, state, stage, entries, await head(root))
    assert.equal(result.review.status, 'passed')
    assert.equal(result.revisionCount, 1)
    assert.equal(result.curator.summary, '修订版记忆')
    assert.equal(outputs.length, 0)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Memory Curator 的无效引用在写入前会获得一次受限修订', async () => {
  const root = await repository()
  const runtime = createOwnerWorkflowRuntime({}, { maxMemoryRevisionTurns: 1 })
  try {
    const outputs = [
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '错误引用封存日志',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '接口版本由 api.ts 定义',
          content: '当前版本读取 api.ts 中的 version 常量。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
          derivedFrom: ['.owner-memory/.sources/wf-memory/T1.md'],
        }],
      },
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '修正后的记忆',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '接口版本由 api.ts 定义',
          content: '当前版本读取 api.ts 中的 version 常量。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
          derivedFrom: [],
        }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'passed',
        summary: '修正后的记忆与代码一致',
        issues: [],
      },
    ]
    runtime.runChild = async () => JSON.stringify(outputs.shift())
    const state = { id: 'wf-curator-invalid-reference', root, workflowWorktree: root, plan }
    const stage = { id: 'stage-1', name: '接口阶段' }
    const entries = [{
      owner: plan.owners[0],
      commitSha: await head(root),
      changedFiles: ['api.ts'],
      report: { summary: '实现接口', changes: [], tests: [], memoryUpdates: [] },
    }]
    const agent = { ctx: { agents: { create() {} } } }
    const result = await runtime.curateStageMemory(agent, state, stage, entries, await head(root))
    assert.equal(result.review.status, 'passed')
    assert.equal(result.revisionCount, 1)
    assert.deepEqual(result.curator.pages[0].derivedFrom, [])
    assert.equal(outputs.length, 0)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Memory Reviewer 的无效问题列表只重试审查结论', async () => {
  const root = await repository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    const outputs = [
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '网络接口当前知识',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '接口版本由 api.ts 定义',
          content: '当前版本读取 api.ts 中的 version 常量。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
          derivedFrom: [],
        }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'needs_revision',
        summary: '问题列表格式错误',
        issues: [{ title: '错误对象' }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'passed',
        summary: '记忆与代码一致',
        issues: [],
      },
    ]
    runtime.runChild = async () => JSON.stringify(outputs.shift())
    const state = { id: 'wf-reviewer-invalid-issues', root, workflowWorktree: root, plan }
    const stage = { id: 'stage-1', name: '接口阶段' }
    const entries = [{
      owner: plan.owners[0],
      commitSha: await head(root),
      changedFiles: ['api.ts'],
      report: { summary: '实现接口', changes: [], tests: [], memoryUpdates: [] },
    }]
    const agent = { ctx: { agents: { create() {} } } }
    const result = await runtime.curateStageMemory(agent, state, stage, entries, await head(root))
    assert.equal(result.review.status, 'passed')
    assert.equal(result.revisionCount, 0)
    assert.equal(outputs.length, 0)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Memory Reviewer 不能因新页面的空 derivedFrom 要求任务或提交追溯', async () => {
  const root = await repository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    const outputs = [
      {
        contract: MEMORY_CURATOR_CONTRACT,
        summary: '网络接口当前知识',
        pages: [{
          path: 'owners/network/api.md',
          type: 'interface',
          title: '网络接口',
          summary: '接口版本由 api.ts 定义',
          content: '当前版本读取 api.ts 中的 version 常量。',
          ownerIds: ['network'],
          tags: [],
          files: ['api.ts'],
          supersedes: [],
          derivedFrom: [],
        }],
      },
      {
        contract: MEMORY_REVIEW_CONTRACT,
        status: 'needs_revision',
        summary: '错误要求任务来源',
        issues: ['拟写入页面的 derivedFrom 为空，未标注来源阶段 T1 或固定提交，来源可追溯性不足。'],
      },
    ]
    const prompts = []
    runtime.runChild = async (_agent, _cwd, prompt) => {
      prompts.push(prompt)
      return JSON.stringify(outputs.shift())
    }
    const state = { id: 'wf-reviewer-derived-from', root, workflowWorktree: root, plan }
    const stage = { id: 'stage-1', name: '接口阶段' }
    const entries = [{
      owner: plan.owners[0],
      commitSha: await head(root),
      changedFiles: ['api.ts'],
      report: { summary: '实现接口', changes: [], tests: [], memoryUpdates: [] },
    }]
    const agent = { ctx: { agents: { create() {} } } }
    const result = await runtime.curateStageMemory(agent, state, stage, entries, await head(root))
    assert.equal(result.review.status, 'passed')
    assert.equal(result.review.issues.length, 0)
    assert.match(prompts[1], /derivedFrom: \[\] 是正确且完整的值/u)
    assert.equal(outputs.length, 0)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
