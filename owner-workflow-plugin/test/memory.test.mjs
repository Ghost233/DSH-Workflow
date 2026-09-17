import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
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
  resolveOwnerWorklogBlockers,
  worklogPromptSnapshot,
  writeSealedOwnerWorklog,
  writeMemoryBundle,
} from '../src/memory.mjs'
import { commitFiles, head } from '../src/git.mjs'

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
const NETWORK_MEMORY = '.owner-workflow/owners/network/memory'

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
    title: '跨 Owner 页面',
    summary: '每页必须有唯一归属',
    files: ['api.ts'],
    ownerIds: ['network', 'web'],
  }]), /最多包含一个 Owner/u)
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

test('记忆目录修复只移除 Owner 记忆 catalog 的自引用元数据', async () => {
  const root = await repository()
  try {
    const directory = join(root, NETWORK_MEMORY)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, '.catalog.json'), `${JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CATALOG_V1',
      pages: {
        'api.md': {
          id: 'memory.owners.network.api',
          supersedes: ['memory.owners.network.api'],
          derivedFrom: ['memory.owners.network.api', 'memory.other'],
        },
      },
    }, null, 2)}\n`, 'utf8')
    const files = await repairMemoryCatalogSelfReferences(root)
    assert.deepEqual(files, [`${NETWORK_MEMORY}/.catalog.json`])
    const catalog = JSON.parse(await readFile(join(directory, '.catalog.json'), 'utf8'))
    assert.deepEqual(catalog.pages['api.md'].supersedes, [])
    assert.deepEqual(catalog.pages['api.md'].derivedFrom, ['memory.other'])
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
    assert.equal(before.documents.find(document => document.path === `${NETWORK_MEMORY}/api.md`).computedStatus, 'verified')
    const log = await readFile(join(root, NETWORK_MEMORY, 'log.md'), 'utf8')
    assert.equal((log.match(/owner-memory-stage:wf-memory:stage-1:start/gu) ?? []).length, 1)
    assert.match(await readFile(join(root, NETWORK_MEMORY, 'index.md'), 'utf8'), /网络接口版本/u)

    await writeFile(join(root, 'api.ts'), 'export const version = 2\n', 'utf8')
    await commitFiles(root, ['api.ts'], '修改接口版本')
    const after = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(after.documents.find(document => document.path === `${NETWORK_MEMORY}/api.md`).computedStatus, 'stale')
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
    assert.equal(replacementSnapshot.documents.find(document => document.path === `${NETWORK_MEMORY}/api.md`).computedStatus, 'superseded')
    const oldPage = await readFile(join(root, NETWORK_MEMORY, 'api.md'), 'utf8')
    assert.doesNotMatch(oldPage, /^---/u)
    assert.match(await readFile(join(root, NETWORK_MEMORY, '.catalog.json'), 'utf8'), /supersededBy/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('多个 Owner 的长期知识分别写入各自文件夹', async () => {
  const root = await repository()
  try {
    const multiOwnerPlan = {
      owners: [
        plan.owners[0],
        { id: 'web', name: 'Web', description: '网页模块', scope: ['**'], exclude: [] },
      ],
    }
    const curator = normalizeCuratorResult({
      contract: MEMORY_CURATOR_CONTRACT,
      summary: '按 Owner 分类长期知识',
      pages: [
        {
          path: 'owners/network/api.md', type: 'interface', title: '网络接口', summary: '网络知识', content: '网络知识正文。',
          ownerIds: ['network'], tags: [], files: ['api.ts'], supersedes: [], derivedFrom: [],
        },
        {
          path: 'owners/web/page.md', type: 'concept', title: '网页结构', summary: '网页知识', content: '网页知识正文。',
          ownerIds: ['web'], tags: [], files: ['api.ts'], supersedes: [], derivedFrom: [],
        },
      ],
    }, multiOwnerPlan)
    await writeMemoryBundle(root, curator, {
      workflowId: 'wf-owner-folders',
      stage: { id: 'T1', name: '分类长期知识' },
      entries: [
        { owner: { id: 'network' }, report: { summary: '网络任务完成' } },
        { owner: { id: 'web' }, report: { summary: '网页任务完成' } },
      ],
      verifiedAtCommit: await head(root),
    })

    assert.match(await readFile(join(root, NETWORK_MEMORY, 'api.md'), 'utf8'), /网络知识正文/u)
    assert.match(await readFile(join(root, '.owner-workflow', 'owners', 'web', 'memory', 'page.md'), 'utf8'), /网页知识正文/u)
    assert.equal(existsSync(join(root, '.owner-memory')), false)
    const networkSnapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(networkSnapshot.documents.some(document => document.ownerId === 'web'), false)
    const allSnapshot = await loadMemorySnapshot(root)
    assert.deepEqual([...new Set(allSnapshot.documents.map(document => document.ownerId))].sort(), ['network', 'web'])
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
      .find(document => document.path === `${NETWORK_MEMORY}/api.md`)
    assert.equal(staleDocument?.computedStatus, 'stale')

    const files = await refreshMemoryCatalogVerification(root, {
      verifiedAtCommit: changedHead,
      refreshSources: ['api.ts'],
    })
    assert.deepEqual(files, [`${NETWORK_MEMORY}/.catalog.json`])
    await commitFiles(root, files, '刷新记忆验证基线')
    const snapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(snapshot.documents.find(document => document.path === `${NETWORK_MEMORY}/api.md`)?.computedStatus, 'verified')
    const catalog = JSON.parse(await readFile(join(root, NETWORK_MEMORY, '.catalog.json'), 'utf8'))
    assert.equal(catalog.pages['api.md'].verifiedAtCommit, changedHead)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('旧 .owner-memory 在下一次编译时迁入对应 Owner 文件夹并删除独立目录', async () => {
  const root = await repository()
  try {
    const legacy = join(root, '.owner-memory')
    await mkdir(join(legacy, 'owners', 'network'), { recursive: true })
    await mkdir(join(legacy, '.sources', 'wf-legacy'), { recursive: true })
    await writeFile(join(legacy, 'owners', 'network', 'api.md'), '# 旧网络接口\n\n旧版长期知识。\n', 'utf8')
    await writeFile(join(legacy, '.sources', 'wf-legacy', 'T1.md'), '# 旧任务来源\n', 'utf8')
    await writeFile(join(legacy, '.catalog.json'), `${JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CATALOG_V1',
      pages: {
        'owners/network/api.md': {
          id: 'memory.owners.network.api',
          owners: ['network'],
          status: 'verified',
          sources: ['api.ts'],
          verifiedAtCommit: await head(root),
          supersedes: [],
          derivedFrom: [],
        },
      },
    }, null, 2)}\n`, 'utf8')
    await commitFiles(root, [
      '.owner-memory/owners/network/api.md',
      '.owner-memory/.sources/wf-legacy/T1.md',
      '.owner-memory/.catalog.json',
    ], '提交旧版 Owner 记忆')

    const curator = normalizeCuratorResult({
      contract: MEMORY_CURATOR_CONTRACT,
      summary: '迁移旧版记忆布局',
      pages: [],
    }, plan)
    const files = await writeMemoryBundle(root, curator, {
      workflowId: 'wf-migrate-memory',
      stage: { id: 'T2', name: '迁移长期记忆' },
      entries: [{ owner: { id: 'network' }, report: { summary: '迁移旧版记忆' } }],
      verifiedAtCommit: await head(root),
    })
    assert.equal(existsSync(join(root, '.owner-memory')), false)
    assert.match(await readFile(join(root, NETWORK_MEMORY, 'api.md'), 'utf8'), /旧版长期知识/u)
    assert.match(await readFile(join(root, NETWORK_MEMORY, '.sources', 'wf-legacy', 'T1.md'), 'utf8'), /旧任务来源/u)
    assert.equal(files.includes('.owner-memory/owners/network/api.md'), true)
    await commitFiles(root, files, '迁移到 Owner 分类目录')
    const snapshot = await loadMemorySnapshot(root, { ownerId: 'network' })
    assert.equal(snapshot.documents.some(document => document.path === `${NETWORK_MEMORY}/api.md`), true)
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

test('Owner 最终摘要过长时截断记忆来源而不阻塞任务结算', async () => {
  const root = await repository()
  try {
    const sourceFile = await writeSealedOwnerWorklog(root, {
      workflowId: 'wf-long-summary',
      task: { id: 'T1', title: '完成任务' },
      owner: { id: 'network' },
      worklog: createOwnerWorklog({ taskId: 'T1', title: '完成任务', ownerId: 'network' }),
      report: { summary: '很长的任务摘要'.repeat(80), changes: [] },
    })
    const content = await readFile(join(root, sourceFile), 'utf8')
    assert.match(content, /- 交付：很长的任务摘要/u)
    assert.match(content, /…/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('旧阻塞在新执行开始后标记为已解决，不再作为当前提示注入', () => {
  let worklog = createOwnerWorklog({ taskId: 'T1', title: '恢复任务', ownerId: 'network' })
  worklog = appendOwnerWorklogNote(worklog, { type: '阻塞', text: '旧工具 Schema 无法写文件。' })
  worklog = appendOwnerWorklogNote(worklog, { type: '下一步', text: '重新加载工具后继续。' })
  worklog = resolveOwnerWorklogBlockers(worklog, {
    at: '2026-08-20T08:00:00.000Z',
    text: '工具 Schema 已更新并开始新的 Owner 执行',
  })

  assert.equal(worklog.notes[0].resolvedAt, '2026-08-20T08:00:00.000Z')
  const prompt = worklogPromptSnapshot(worklog)
  assert.equal(prompt.resolvedBlockerCount, 1)
  assert.deepEqual(prompt.notes, [{ type: '下一步', text: '重新加载工具后继续。' }])
})
