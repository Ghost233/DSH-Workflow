import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'
import {
  applyApprovedRegistryChange,
  ensureRegistry,
  loadRegistry,
  proposeRegistryChange,
} from '../src/registry.mjs'

const execFileAsync = promisify(execFile)

async function git(root, args) {
  const result = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' })
  return String(result.stdout ?? '').trim()
}

async function gitBytes(root, args) {
  const result = await execFileAsync('git', args, { cwd: root, encoding: 'buffer' })
  return Buffer.from(result.stdout ?? [])
}

async function gitIndexBytes(root) {
  const path = await git(root, ['rev-parse', '--git-path', 'index'])
  return readFile(join(root, path))
}

async function repositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-registry-test-'))
  await git(root, ['init', '-q', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-registry@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Registry Test'])
  return root
}

function owner(id, scope, description = `${id} 的职责`) {
  return {
    id,
    name: `${id} 负责人`,
    description,
    scope,
    exclude: [],
  }
}

test('Owner Registry 只有匹配 digest 的已批准提案才能写入并进入 Git 暂存区', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add',
      owner: owner('network-user', ['src/network/user/**'], '拆分用户接口'),
      reason: '拆分用户接口',
    })

    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'network-user', 'owner.md')), false)
    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: '0'.repeat(64) }),
      /digest/u,
    )
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    assert.match(
      await readFile(join(root, '.owner-workflow', 'owners', 'network-user', 'owner.md'), 'utf8'),
      /拆分用户接口/u,
    )
    assert.equal(await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/config.json']), '.owner-workflow/config.json')
    assert.equal(await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/network-user/owner.md']), '.owner-workflow/owners/network-user/owner.md')
    assert.equal(existsSync(join(root, '.dsh-workflow', 'owners')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 在提案阶段拒绝超出受管根和重叠的 scope', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const limited = {
      ...proposeRegistryChange(registry, {
        type: 'add',
        owner: owner('network', ['src/network/**'], '网络模块'),
        reason: '建立网络职责',
      }).after,
      config: { ...registry.config, managedRoots: ['src/network/**'] },
    }

    assert.throws(() => proposeRegistryChange(limited, {
      type: 'add',
      owner: owner('outside', ['src/web/**'], '越界模块'),
      reason: '错误范围',
    }), /受管根/u)
    assert.throws(() => proposeRegistryChange(limited, {
      type: 'add',
      owner: owner('network-user', ['src/network/user/**'], '用户接口'),
      reason: '错误重叠',
    }), /重叠/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 拒绝把单层 managedRoots glob 解释为递归受管根', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const limited = {
      ...registry,
      config: { ...registry.config, managedRoots: ['src/*'] },
    }

    assert.throws(() => proposeRegistryChange(limited, {
      type: 'add',
      owner: owner('private', ['src/private/**'], '私有模块'),
      reason: '验证受管根 glob 不得扩权',
    }), /managedRoots|受管根/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('批准后的 Owner 完整 round-trip declaredExclude、managedExclude 和 status', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const approvedOwner = {
      ...owner('application', ['src/**'], '应用模块'),
      declaredExclude: ['src/generated/**'],
      managedExclude: ['src/private/**'],
      status: 'active',
    }
    delete approvedOwner.exclude
    const proposal = proposeRegistryChange(registry, {
      type: 'add',
      owner: approvedOwner,
      reason: '持久化完整 Owner 授权边界',
    })

    const applied = await applyApprovedRegistryChange(root, {
      ...proposal,
      approvedDigest: proposal.digest,
    })
    const loaded = await loadRegistry(root)
    assert.deepEqual(applied, proposal.after)
    assert.deepEqual(loaded, proposal.after)
    assert.deepEqual(loaded.owners[0], {
      id: 'application',
      name: 'application 负责人',
      description: '应用模块',
      scope: ['src/**'],
      exclude: ['src/generated/**', 'src/private/**'],
      declaredExclude: ['src/generated/**'],
      managedExclude: ['src/private/**'],
      status: 'active',
    })
    assert.doesNotThrow(() => proposeRegistryChange(loaded, {
      type: 'add',
      owner: owner('private', ['src/private/**'], '私有模块'),
      reason: '已排除路径交由独立 Owner',
    }))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 的 split、merge、transfer 和 remove 都只生成内存提案', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    let proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**'], '网络模块'), reason: '建立网络职责',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('web', ['src/web/**'], '网页模块'), reason: '建立网页职责',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    proposal = proposeRegistryChange(registry, {
      type: 'transfer', fromOwnerId: 'network', toOwnerId: 'web', scope: ['src/network/user/**'], reason: '转交用户界面',
    })
    assert.deepEqual(proposal.affectedOwnerIds, ['network', 'web'])
    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'web', 'owner.md')), true)
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    proposal = proposeRegistryChange(registry, {
      type: 'split', ownerId: 'web', owners: [
        owner('web-shell', ['src/web/**'], '网页外壳'),
        owner('network-user', ['src/network/user/**'], '用户界面'),
      ], reason: '拆分网页与用户界面',
    })
    assert.deepEqual(proposal.affectedOwnerIds, ['web', 'web-shell', 'network-user'])
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    proposal = proposeRegistryChange(registry, {
      type: 'merge', ownerIds: ['web-shell', 'network-user'], owner: owner('frontend', ['src/web/**', 'src/network/user/**'], '前端模块'), reason: '合并前端职责',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    proposal = proposeRegistryChange(registry, {
      type: 'remove', ownerId: 'frontend', reason: '撤销前端职责',
    })
    assert.deepEqual(proposal.after.owners.map(item => item.id), ['network'])
    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'frontend', 'owner.md')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 将同一轮全部变更合并为一个可原子批准的 batch 提案', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const operation = {
      type: 'batch',
      reason: '一次性建立网络与界面长期职责域',
      operations: [
        {
          type: 'add',
          owner: owner('network', ['src/network/**'], '网络模块'),
          reason: 'src/network 是独立网络模块',
        },
        {
          type: 'add',
          owner: owner('web', ['src/web/**'], '网页模块'),
          reason: 'src/web 是独立界面模块',
        },
      ],
    }
    const proposal = proposeRegistryChange(registry, operation)

    assert.equal(proposal.operation, 'batch')
    assert.equal(proposal.operations.length, 2)
    assert.deepEqual(proposal.affectedOwnerIds, ['network', 'web'])
    assert.deepEqual(proposal.after.owners.map(item => item.id), ['network', 'web'])
    assert.deepEqual((await loadRegistry(root)).owners, [])

    await assert.rejects(
      applyApprovedRegistryChange(root, {
        ...proposal,
        operations: proposal.operations.slice(0, 1),
        approvedDigest: proposal.digest,
      }),
      /提案已被篡改/u,
    )
    const applied = await applyApprovedRegistryChange(root, {
      ...proposal,
      approvedDigest: proposal.digest,
    })
    assert.deepEqual(applied.owners.map(item => item.id), ['network', 'web'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry batch 拒绝空批次、嵌套批次和中途无效变更', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    assert.throws(
      () => proposeRegistryChange(registry, { type: 'batch', operations: [], reason: '空批次' }),
      /batch\.operations 不能为空/u,
    )
    assert.throws(
      () => proposeRegistryChange(registry, {
        type: 'batch',
        operations: [{ type: 'batch', operations: [], reason: '嵌套' }],
        reason: '非法嵌套',
      }),
      /不能嵌套 batch/u,
    )
    assert.throws(
      () => proposeRegistryChange(registry, {
        type: 'batch',
        operations: [
          { type: 'add', owner: owner('network', ['src/network/**'], '网络模块'), reason: '首次新增' },
          { type: 'add', owner: owner('network', ['src/network-v2/**'], '网络模块二'), reason: '重复新增' },
        ],
        reason: '包含无效变更',
      }),
      /Owner 已存在/u,
    )
    assert.deepEqual((await loadRegistry(root)).owners, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 拒绝被篡改或基于旧快照的批准提案', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**'], '网络模块'), reason: '建立网络职责',
    })
    await assert.rejects(
      applyApprovedRegistryChange(root, {
        ...proposal,
        after: { ...proposal.after, config: { ...proposal.after.config, parallel: 99 } },
        approvedDigest: proposal.digest,
      }),
      /digest|提案/u,
    )
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest }),
      /快照|已变化/u,
    )
    assert.deepEqual((await loadRegistry(root)).owners.map(item => item.id), ['network'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 拒绝 Registry 目录或 owners 目录符号链接', async () => {
  const root = await repositoryFixture()
  const external = await mkdtemp(join(tmpdir(), 'dsh-owner-registry-external-'))
  try {
    await symlink(external, join(root, '.owner-workflow'), 'dir')
    await assert.rejects(ensureRegistry(root), /符号链接/u)
    assert.equal(existsSync(join(external, 'config.json')), false)

    await rm(join(root, '.owner-workflow'))
    await ensureRegistry(root)
    await rm(join(root, '.owner-workflow', 'owners'), { recursive: true })
    await symlink(external, join(root, '.owner-workflow', 'owners'), 'dir')
    await assert.rejects(loadRegistry(root), /符号链接/u)
    assert.deepEqual(await readdir(external), [])
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
})

test('Owner Registry 拒绝 config 和 Owner Markdown 文件符号链接', async () => {
  const root = await repositoryFixture()
  const external = await mkdtemp(join(tmpdir(), 'dsh-owner-registry-external-'))
  try {
    let registry = await ensureRegistry(root)
    const configPath = join(root, '.owner-workflow', 'config.json')
    const externalConfig = join(external, 'config.json')
    await writeFile(externalConfig, await readFile(configPath, 'utf8'))
    await rm(configPath)
    await symlink(externalConfig, configPath)
    await assert.rejects(loadRegistry(root), /符号链接/u)

    await rm(configPath)
    await writeFile(configPath, await readFile(externalConfig, 'utf8'))
    registry = await loadRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '建立网络职责',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const ownerPath = join(root, '.owner-workflow', 'owners', 'network', 'owner.md')
    const externalOwner = join(external, 'network.md')
    await writeFile(externalOwner, await readFile(ownerPath, 'utf8'))
    await rm(ownerPath)
    await symlink(externalOwner, ownerPath)
    await assert.rejects(loadRegistry(root), /符号链接/u)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
})

test('Owner Registry 暂存失败时回滚整个 Registry 和 Git 索引', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const beforeConfig = await readFile(join(root, '.owner-workflow', 'config.json'), 'utf8')
    const beforeIndex = await git(root, ['ls-files', '--stage', '.owner-workflow'])
    await writeFile(join(root, '.gitignore'), '.owner-workflow/owners/blocked/owner.md\n')
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('blocked', ['src/blocked/**']), reason: '模拟暂存失败',
    })

    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest }),
    )
    assert.equal(await readFile(join(root, '.owner-workflow', 'config.json'), 'utf8'), beforeConfig)
    assert.deepEqual((await loadRegistry(root)).owners, registry.owners)
    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'blocked', 'owner.md')), false)
    assert.equal(await git(root, ['ls-files', '--stage', '.owner-workflow']), beforeIndex)
    assert.deepEqual(
      (await readdir(root)).filter(name => /^\.owner-workflow(?:-(?:backup|transaction))|^\.owner-workflow\.lock$/u.test(name)),
      [],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 写入失败时保持原 Registry 不变', async () => {
  const root = await repositoryFixture()
  let permissionsRestricted = false
  try {
    const registry = await ensureRegistry(root)
    const beforeConfig = await readFile(join(root, '.owner-workflow', 'config.json'), 'utf8')
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '模拟写入失败',
    })
    await chmod(root, 0o500)
    permissionsRestricted = true
    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest }),
    )
    await chmod(root, 0o700)
    permissionsRestricted = false
    assert.equal(await readFile(join(root, '.owner-workflow', 'config.json'), 'utf8'), beforeConfig)
    assert.deepEqual((await loadRegistry(root)).owners, [])
  } finally {
    if (permissionsRestricted) await chmod(root, 0o700)
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 并发批准最多应用一个相同 before 的提案', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposals = ['network', 'web'].map(id => proposeRegistryChange(registry, {
      type: 'add', owner: owner(id, [`src/${id}/**`]), reason: `建立 ${id}`,
    }))
    const results = await Promise.allSettled(proposals.map(proposal => (
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    )))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter(result => result.status === 'rejected').length, 1)
    assert.equal((await loadRegistry(root)).owners.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureRegistry 跟踪全部正式文件且不暂存非 Markdown 文件', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '建立网络职责',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    await writeFile(join(root, '.owner-workflow', 'owners', 'note.txt'), '不属于 Registry 数据模型\n')
    await rm(join(root, '.git', 'index'))

    await ensureRegistry(root)
    assert.equal(await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/config.json']), '.owner-workflow/config.json')
    assert.equal(await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/network/owner.md']), '.owner-workflow/owners/network/owner.md')
    await assert.rejects(git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/note.txt']))
    assert.equal((await loadRegistry(root)).owners[0].id, registry.owners[0].id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Markdown 对标题、链接和 HTML 文本做安全编码', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const malicious = {
      ...owner('unsafe', ['src/unsafe/**'], '正文\n# 注入\n[点击](javascript:alert(1))\n<script>alert(1)</script>'),
      name: '标题\n## 注入',
    }
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: malicious, reason: '验证 Markdown 编码',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const markdown = await readFile(join(root, '.owner-workflow', 'owners', 'unsafe', 'owner.md'), 'utf8')
    const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/u.exec(markdown)?.[1] ?? ''
    assert.doesNotMatch(body, /^#{1,6}\s+注入$/mu)
    assert.doesNotMatch(body, /\[点击\]\(javascript:/u)
    assert.doesNotMatch(body, /<script>/u)
    assert.match(body, /正文/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry digest 不受对象键顺序和 Owner 输入顺序影响且批准摘要不可缺失', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const first = owner('first', ['src/first/**'])
    const second = owner('second', ['src/second/**'])
    const operation = {
      reason: '加入第三个 Owner',
      owner: owner('third', ['src/third/**']),
      type: 'add',
    }
    const left = proposeRegistryChange({
      config: registry.config,
      owners: [first, second],
    }, operation)
    const right = proposeRegistryChange({
      owners: [second, first],
      config: {
        profiles: registry.config.profiles,
        parallel: registry.config.parallel,
        managedRoots: registry.config.managedRoots,
        version: registry.config.version,
        contract: registry.config.contract,
      },
    }, { type: 'add', owner: { scope: ['src/third/**'], description: 'third 的职责', name: 'third 负责人', id: 'third', exclude: [] }, reason: '加入第三个 Owner' })
    assert.equal(left.digest, right.digest)
    assert.equal(left.digest, proposeRegistryChange(left.before, operation).digest)
    await assert.rejects(applyApprovedRegistryChange(root, left), /digest/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Registry 严格校验父 Owner 引用、删除子引用和父级环', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'add', owner: { ...owner('child', ['src/child/**']), parentOwnerId: 'missing' }, reason: '悬空父引用',
    }), /父 Owner|不存在|引用/u)

    let proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('parent', ['src/parent/**']), reason: '建立父 Owner',
    })
    registry = proposal.after
    proposal = proposeRegistryChange(registry, {
      type: 'add', owner: { ...owner('child', ['src/child/**']), parentOwnerId: 'parent' }, reason: '建立子 Owner',
    })
    registry = proposal.after
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'remove', ownerId: 'parent', reason: '错误删除父 Owner',
    }), /子 Owner|引用/u)
    assert.throws(() => proposeRegistryChange({
      config: registry.config,
      owners: [
        { ...owner('cycle-a', ['src/a/**']), parentOwnerId: 'cycle-b' },
        { ...owner('cycle-b', ['src/b/**']), parentOwnerId: 'cycle-a' },
      ],
    }, { type: 'remove', ownerId: 'cycle-a', reason: '触发父级环校验' }), /环/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('split 必须保持来源有效范围且拒绝重复结果 Owner', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    const registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('source', ['src/source/**']), reason: '建立来源',
    }).after
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'split', ownerId: 'source', owners: [
        owner('left', ['src/left/**']), owner('right', ['src/right/**']),
      ], reason: '错误拆分',
    }), /范围|守恒/u)
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'split', ownerId: 'source', owners: [
        owner('same', ['src/source/**']), owner('same', ['src/source/**']),
      ], reason: '重复结果',
    }), /重复/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('merge 必须拒绝重复来源并保持全部来源有效范围', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('left', ['src/left/**']), reason: '建立左侧',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add', owner: owner('right', ['src/right/**']), reason: '建立右侧',
    }).after
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'merge', ownerIds: ['left', 'left'], owner: owner('merged', ['src/left/**']), reason: '重复来源',
    }), /重复/u)
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'merge', ownerIds: ['left', 'right'], owner: owner('merged', ['src/other/**']), reason: '丢失来源范围',
    }), /范围|守恒/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('所有 Registry operation 对缺失、重复、同源和越界输入 fail-closed', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add', owner: { ...owner('source', ['src/source/**']), exclude: ['src/source/private/**'] }, reason: '建立来源',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add', owner: owner('target', ['src/target/**']), reason: '建立目标',
    }).after
    const invalidOperations = [
      { type: 'add', owner: owner('source', ['src/duplicate/**']), reason: '重复 add' },
      { type: 'remove', ownerId: 'missing', reason: '缺失 remove' },
      { type: 'split', ownerId: 'missing', owners: [owner('a', ['src/a/**']), owner('b', ['src/b/**'])], reason: '缺失 split' },
      { type: 'merge', ownerIds: ['source', 'missing'], owner: owner('merged', ['src/source/**']), reason: '缺失 merge' },
      { type: 'transfer', fromOwnerId: 'missing', toOwnerId: 'target', scope: ['src/source/**'], reason: '缺失源' },
      { type: 'transfer', fromOwnerId: 'source', toOwnerId: 'missing', scope: ['src/source/**'], reason: '缺失目标' },
      { type: 'transfer', fromOwnerId: 'source', toOwnerId: 'source', scope: ['src/source/**'], reason: '同源目标' },
      { type: 'transfer', fromOwnerId: 'source', toOwnerId: 'target', scope: ['src/outside/**'], reason: '越界范围' },
      { type: 'transfer', fromOwnerId: 'source', toOwnerId: 'target', scope: ['src/source/private/**'], reason: '已排除范围' },
      { type: 'transfer', fromOwnerId: 'source', toOwnerId: 'target', scope: ['src/source/public/**', 'src/source/public/**'], reason: '重复范围' },
    ]
    for (const operation of invalidOperations) {
      assert.throws(() => proposeRegistryChange(registry, operation), /Owner|scope|范围|重复|存在|相同|排除/u)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner 删除会从 Git 索引移除失效 Markdown', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    let proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('obsolete', ['src/obsolete/**']), reason: '建立临时职责',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    assert.equal(
      await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/obsolete/owner.md']),
      '.owner-workflow/owners/obsolete/owner.md',
    )

    proposal = proposeRegistryChange(registry, {
      type: 'remove', ownerId: 'obsolete', reason: '删除临时职责',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })

    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'obsolete', 'owner.md')), false)
    await assert.rejects(git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/obsolete/owner.md']))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureRegistry 拒绝 Registry 白名单外的已跟踪文件并保持索引不变', async () => {
  const root = await repositoryFixture()
  try {
    await ensureRegistry(root)
    const notePath = join(root, '.owner-workflow', 'owners', 'note.txt')
    await writeFile(notePath, '不属于 Registry 数据模型\n')
    await git(root, ['add', '-f', '--', '.owner-workflow/owners/note.txt'])
    const beforeIndex = await git(root, ['ls-files', '--stage', '-z', '.owner-workflow'])

    await assert.rejects(ensureRegistry(root), /白名单|索引/u)

    assert.equal(existsSync(notePath), true)
    assert.equal(await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/note.txt']), '.owner-workflow/owners/note.txt')
    assert.equal(await git(root, ['ls-files', '--stage', '-z', '.owner-workflow']), beforeIndex)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('应用失败会精确恢复调用前已暂存版本而不以工作区版本覆盖', async () => {
  const root = await repositoryFixture()
  try {
    await ensureRegistry(root)
    const path = join(root, '.owner-workflow', 'config.json')
    const staged = Buffer.from([0, 255, 127, 10, 65])
    const worktree = `${JSON.stringify({
      contract: 'DSH_OWNER_REGISTRY_V1', version: 1, managedRoots: ['**'], parallel: 3, profiles: {},
    }, null, 2)}\n`
    await writeFile(path, staged)
    await git(root, ['add', '--', '.owner-workflow/config.json'])
    await writeFile(path, worktree)
    const registry = await loadRegistry(root)
    await writeFile(join(root, '.gitignore'), '.owner-workflow/owners/blocked/owner.md\n')
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('blocked', ['src/blocked/**']), reason: '触发暂存失败',
    })

    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest }),
    )

    assert.equal(await readFile(path, 'utf8'), worktree)
    assert.deepEqual(await gitBytes(root, ['show', ':.owner-workflow/config.json']), staged)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('transfer 不得重新授予源 Owner 已排除的范围', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add',
      owner: { ...owner('source', ['src/source/**']), exclude: ['src/source/private/**'] },
      reason: '建立来源',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add', owner: owner('target', ['src/target/**']), reason: '建立目标',
    }).after

    assert.throws(() => proposeRegistryChange(registry, {
      type: 'transfer',
      fromOwnerId: 'source',
      toOwnerId: 'target',
      scope: ['src/source/**'],
      reason: '错误地重新授予私有范围',
    }), /有效范围|守恒|排除/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('transfer 不得把范围转入目标 Owner 的 exclude', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('source', ['src/source/**']), reason: '建立来源',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add',
      owner: { ...owner('target', ['src/**']), exclude: ['src/source/**'] },
      reason: '建立目标',
    }).after

    assert.throws(() => proposeRegistryChange(registry, {
      type: 'transfer',
      fromOwnerId: 'source',
      toOwnerId: 'target',
      scope: ['src/source/**'],
      reason: '错误地转入目标排除范围',
    }), /有效范围|守恒|排除/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('split 和 merge 必须保持 scope 减 exclude 的有效范围', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    const splitSource = proposeRegistryChange(empty, {
      type: 'add',
      owner: { ...owner('source', ['src/source/**']), exclude: ['src/source/private/**'] },
      reason: '建立拆分来源',
    }).after
    assert.throws(() => proposeRegistryChange(splitSource, {
      type: 'split',
      ownerId: 'source',
      owners: [
        { ...owner('left', ['src/source/**']), exclude: ['src/source/right/**'] },
        owner('right', ['src/source/right/**']),
      ],
      reason: '错误拆分并重新授予私有范围',
    }), /有效范围|守恒/u)

    let mergeSources = proposeRegistryChange(empty, {
      type: 'add',
      owner: { ...owner('left', ['src/left/**']), exclude: ['src/left/private/**'] },
      reason: '建立左侧',
    }).after
    mergeSources = proposeRegistryChange(mergeSources, {
      type: 'add', owner: owner('right', ['src/right/**']), reason: '建立右侧',
    }).after
    assert.throws(() => proposeRegistryChange(mergeSources, {
      type: 'merge',
      ownerIds: ['left', 'right'],
      owner: owner('merged', ['src/left/**', 'src/right/**']),
      reason: '错误合并并重新授予私有范围',
    }), /有效范围|守恒/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureRegistry 与批准应用共同遵守同一把 Registry 锁', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '建立网络职责',
    })
    const lock = join(root, '.owner-workflow.lock')
    await mkdir(lock)
    let ensureSettled = false
    let applySettled = false
    const ensuring = ensureRegistry(root).finally(() => { ensureSettled = true })
    const applying = applyApprovedRegistryChange(root, {
      ...proposal, approvedDigest: proposal.digest,
    }).finally(() => { applySettled = true })
    let blockedError
    try {
      await new Promise(resolve => setTimeout(resolve, 60))
      assert.equal(ensureSettled, false)
      assert.equal(applySettled, false)
    } catch (error) {
      blockedError = error
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
    const results = await Promise.allSettled([ensuring, applying])
    if (blockedError !== undefined) throw blockedError
    assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled'])
    assert.deepEqual((await loadRegistry(root)).owners.map(item => item.id), ['network'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Markdown 编码代码围栏、列表、分隔线、表格和强调控制结构', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add',
      owner: owner(
        'unsafe-controls',
        ['src/unsafe/**'],
        '正文\n```js\nalert(1)\n```\n- 列表\n1. 编号\n---\n| 表头 |\n| --- |\n**强调**\n> 引用',
      ),
      reason: '验证 Markdown 控制结构编码',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const markdown = await readFile(join(root, '.owner-workflow', 'owners', 'unsafe-controls', 'owner.md'), 'utf8')
    const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/u.exec(markdown)?.[1] ?? ''

    assert.doesNotMatch(body, /^(?:```|~~~|[-+*]\s|\d+[.)]\s|>\s|(?:-{3,}|_{3,}|\*{3,})\s*$|\|.*\|$)/mu)
    assert.doesNotMatch(body, /(?:\*\*|__|~~)强调/u)
    assert.match(body, /正文/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureRegistry 拒绝不符合规范生成结果的 Owner Markdown 正文', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '建立网络职责',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const path = join(root, '.owner-workflow', 'owners', 'network', 'owner.md')
    await writeFile(path, `${await readFile(path, 'utf8')}\n- 手工注入\n`)

    await assert.rejects(ensureRegistry(root), /Markdown|正文|规范/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 回滚无法恢复原目录时保留可人工恢复的备份', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    await writeFile(
      join(root, '.gitattributes'),
      '.owner-workflow/owners/blocked/owner.md filter=registry-rollback-failure\n',
    )
    await git(root, [
      'config',
      'filter.registry-rollback-failure.clean',
      'chmod 500 .owner-workflow/owners && exit 1',
    ])
    await git(root, ['config', 'filter.registry-rollback-failure.required', 'true'])
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('blocked', ['src/blocked/**']), reason: '触发回滚失败',
    })

    await assert.rejects(
      applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest }),
    )
    const backups = (await readdir(root)).filter(name => name.startsWith('.owner-workflow-backup-'))
    assert.equal(backups.length, 1)
    assert.deepEqual(await readdir(join(root, backups[0], 'owners')), [])
  } finally {
    await chmod(join(root, '.owner-workflow', 'owners'), 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureRegistry 初始化暂存失败时不留下正式目录或索引变化', async () => {
  const root = await repositoryFixture()
  try {
    await writeFile(join(root, '.gitignore'), '.owner-workflow/\n')
    const beforeIndexExists = existsSync(join(root, '.git', 'index'))

    await assert.rejects(ensureRegistry(root), /Git|Registry|暂存/u)

    assert.equal(existsSync(join(root, '.owner-workflow')), false)
    assert.equal(existsSync(join(root, '.git', 'index')), beforeIndexExists)
    assert.deepEqual(
      (await readdir(root)).filter(name => name.startsWith('.owner-workflow')),
      [],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('失败回滚完整保留 assume-unchanged、skip-worktree 和 intent-to-add 索引状态', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    for (const id of ['skip', 'intent']) {
      const proposal = proposeRegistryChange(registry, {
        type: 'add', owner: owner(id, [`src/${id}/**`]), reason: `建立 ${id}`,
      })
      registry = await applyApprovedRegistryChange(root, {
        ...proposal, approvedDigest: proposal.digest,
      })
    }
    await git(root, ['update-index', '--assume-unchanged', '.owner-workflow/config.json'])
    await git(root, ['update-index', '--skip-worktree', '.owner-workflow/owners/skip/owner.md'])
    await git(root, ['update-index', '--force-remove', '.owner-workflow/owners/intent/owner.md'])
    await git(root, ['add', '-N', '--', '.owner-workflow/owners/intent/owner.md'])
    const beforeIndex = await gitIndexBytes(root)
    const beforeFlags = await gitBytes(root, ['ls-files', '-v', '-z', '--', '.owner-workflow'])
    const beforeDebug = await gitBytes(root, ['ls-files', '--debug', '-z', '--', '.owner-workflow'])
    await writeFile(join(root, '.gitignore'), '.owner-workflow/owners/blocked/owner.md\n')
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('blocked', ['src/blocked/**']), reason: '触发完整索引回滚',
    })

    await assert.rejects(applyApprovedRegistryChange(root, {
      ...proposal, approvedDigest: proposal.digest,
    }))

    assert.deepEqual(await gitIndexBytes(root), beforeIndex)
    assert.deepEqual(
      await gitBytes(root, ['ls-files', '-v', '-z', '--', '.owner-workflow']),
      beforeFlags,
    )
    assert.deepEqual(
      await gitBytes(root, ['ls-files', '--debug', '-z', '--', '.owner-workflow']),
      beforeDebug,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('split 可对含星号和问号的 scope 做精确有效范围守恒', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    const registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('combined', ['src/*.mjs', 'test/registry?.mjs']), reason: '建立组合范围',
    }).after

    const proposal = proposeRegistryChange(registry, {
      type: 'split',
      ownerId: 'combined',
      owners: [
        owner('source-files', ['src/*.mjs']),
        owner('registry-tests', ['test/registry?.mjs']),
      ],
      reason: '拆分非字面 glob',
    })

    assert.deepEqual(proposal.after.owners.map(item => item.id), ['registry-tests', 'source-files'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('merge 可原样合并非字面 glob 且不会扩大授权', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('source-files', ['src/*.mjs']), reason: '建立源码范围',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add', owner: owner('registry-tests', ['test/registry?.mjs']), reason: '建立测试范围',
    }).after

    const proposal = proposeRegistryChange(registry, {
      type: 'merge',
      ownerIds: ['source-files', 'registry-tests'],
      owner: owner('combined', ['src/*.mjs', 'test/registry?.mjs']),
      reason: '合并非字面 glob',
    })

    assert.deepEqual(proposal.after.owners.map(item => item.id), ['combined'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('transfer 可安全转交非字面 glob 并在来源建立等值排除', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    let registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('source', ['src/*']), reason: '建立来源范围',
    }).after
    registry = proposeRegistryChange(registry, {
      type: 'add', owner: owner('target', ['test/**']), reason: '建立目标范围',
    }).after

    const proposal = proposeRegistryChange(registry, {
      type: 'transfer',
      fromOwnerId: 'source',
      toOwnerId: 'target',
      scope: ['src/*.mjs'],
      reason: '转交非字面 glob',
    })

    assert.deepEqual(proposal.after.owners.find(item => item.id === 'source').exclude, ['src/*.mjs'])
    assert.deepEqual(proposal.after.owners.find(item => item.id === 'target').scope, ['test/**', 'src/*.mjs'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner Markdown 编码四空格和制表符缩进代码结构', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add',
      owner: owner('indented', ['src/indented/**'], '正文\n\n    四空格代码\n\t制表符代码'),
      reason: '验证缩进代码结构编码',
    })
    await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const markdown = await readFile(join(root, '.owner-workflow', 'owners', 'indented', 'owner.md'), 'utf8')
    const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/u.exec(markdown)?.[1] ?? ''

    assert.doesNotMatch(body, /^(?: {4}|\t)/mu)
    assert.match(body, /四空格代码/u)
    assert.match(body, /制表符代码/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('loadRegistry 与写操作共享 Registry 锁并且只读取完整目录状态', async () => {
  const root = await repositoryFixture()
  try {
    await ensureRegistry(root)
    const lock = join(root, '.owner-workflow.lock')
    await mkdir(lock)
    let settled = false
    const loading = loadRegistry(root).finally(() => { settled = true })
    let assertionError
    try {
      await new Promise(resolve => setTimeout(resolve, 60))
      assert.equal(settled, false)
    } catch (error) {
      assertionError = error
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
    const registry = await loading
    if (assertionError !== undefined) throw assertionError
    assert.deepEqual(registry.owners, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('死亡写者留下的锁和目录切换中间态会在下次读取前恢复', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    const backup = join(root, '.owner-workflow-backup-crashed')
    const transaction = join(root, '.owner-workflow-transaction-crashed')
    await rename(join(root, '.owner-workflow'), backup)
    await mkdir(join(transaction, 'owners'), { recursive: true })
    await writeFile(join(transaction, 'config.json'), '{"未完成":true}\n')
    const lock = join(root, '.owner-workflow.lock')
    await mkdir(lock)
    await writeFile(join(lock, 'owner.json'), `${JSON.stringify({
      contract: 'DSH_OWNER_REGISTRY_LOCK_V1',
      token: 'crashed',
      pid: 2147483647,
      createdAt: '2000-01-01T00:00:00.000Z',
    })}\n`)

    const loaded = await loadRegistry(root)

    assert.deepEqual(loaded, registry)
    assert.equal(existsSync(backup), false)
    assert.equal(existsSync(transaction), false)
    assert.equal(existsSync(lock), false)
    assert.deepEqual(
      (await readdir(root)).filter(name => name.startsWith('.owner-workflow.lock-stale-')),
      [],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('缺少 status 的旧 Owner 文档按 active 安全迁移并重新暂存', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('legacy', ['src/legacy/**']), reason: '建立旧格式样本',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const path = join(root, '.owner-workflow', 'owners', 'legacy', 'owner.md')
    const legacy = (await readFile(path, 'utf8')).replace(',"status":"active"', '')
    await writeFile(path, legacy)

    assert.equal((await loadRegistry(root)).owners[0].status, 'active')
    const migrated = await ensureRegistry(root)

    assert.deepEqual(migrated, registry)
    assert.match(await readFile(path, 'utf8'), /"status":"active"/u)
    assert.equal(await git(root, ['diff', '--cached', '--name-only', '--', '.owner-workflow/owners/legacy/owner.md']), '.owner-workflow/owners/legacy/owner.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 更新保留各 Owner 文件夹内的长期记忆', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    let proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '登记网络 Owner',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const memoryPath = join(root, '.owner-workflow', 'owners', 'network', 'memory', 'api.md')
    await mkdir(join(root, '.owner-workflow', 'owners', 'network', 'memory'), { recursive: true })
    await writeFile(memoryPath, '# 网络长期知识\n', 'utf8')
    await git(root, ['add', '--', '.owner-workflow/owners/network/memory/api.md'])

    proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('web', ['src/web/**']), reason: '登记 Web Owner',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    assert.match(await readFile(memoryPath, 'utf8'), /网络长期知识/u)
    assert.equal(
      await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/network/memory/api.md']),
      '.owner-workflow/owners/network/memory/api.md',
    )

    proposal = proposeRegistryChange(registry, {
      type: 'remove', ownerId: 'network', reason: '停用网络 Owner 但保留知识',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    assert.deepEqual(registry.owners.map(item => item.id), ['web'])
    assert.equal(existsSync(join(root, '.owner-workflow', 'owners', 'network', 'owner.md')), false)
    assert.match(await readFile(memoryPath, 'utf8'), /网络长期知识/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('旧版 owners/<id>.md 自动迁移为 owners/<id>/owner.md', async () => {
  const root = await repositoryFixture()
  try {
    let registry = await ensureRegistry(root)
    const proposal = proposeRegistryChange(registry, {
      type: 'add', owner: owner('network', ['src/network/**']), reason: '登记网络 Owner',
    })
    registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    const current = join(root, '.owner-workflow', 'owners', 'network', 'owner.md')
    const legacy = join(root, '.owner-workflow', 'owners', 'network.md')
    await rename(current, legacy)
    await rm(join(root, '.owner-workflow', 'owners', 'network'), { recursive: true, force: true })
    await git(root, ['add', '-A', '--', '.owner-workflow'])

    const loaded = await ensureRegistry(root)
    assert.deepEqual(loaded, registry)
    assert.equal(existsSync(legacy), false)
    assert.equal(existsSync(current), true)
    assert.equal(
      await git(root, ['ls-files', '--error-unmatch', '.owner-workflow/owners/network/owner.md']),
      '.owner-workflow/owners/network/owner.md',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 对未知 Owner status fail-closed', async () => {
  const root = await repositoryFixture()
  try {
    const registry = await ensureRegistry(root)
    assert.throws(() => proposeRegistryChange(registry, {
      type: 'add',
      owner: { ...owner('unknown-status', ['src/unknown/**']), status: 'suspended' },
      reason: '拒绝未知状态',
    }), /status|状态/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 配置 JSON 错误转换为带 cause 的中文边界错误', async () => {
  const root = await repositoryFixture()
  try {
    await ensureRegistry(root)
    await writeFile(join(root, '.owner-workflow', 'config.json'), '{')

    await assert.rejects(loadRegistry(root), error => {
      assert.match(error.message, /配置|读取|JSON/u)
      assert.doesNotMatch(error.message, /Unexpected|position|property/u)
      assert.ok(error.cause instanceof SyntaxError)
      return true
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('split 缺少 owners 时返回中文契约错误而不是 TypeError', async () => {
  const root = await repositoryFixture()
  try {
    const empty = await ensureRegistry(root)
    const registry = proposeRegistryChange(empty, {
      type: 'add', owner: owner('source', ['src/source/**']), reason: '建立来源',
    }).after

    assert.throws(() => proposeRegistryChange(registry, {
      type: 'split', ownerId: 'source', reason: '缺少拆分结果',
    }), error => {
      assert.match(error.message, /split\.owners|拆分|数组/u)
      assert.equal(error instanceof TypeError, false)
      return true
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('读取缺失 Registry 时返回保留 cause 的中文文件错误', async () => {
  const root = await repositoryFixture()
  try {
    await assert.rejects(loadRegistry(root), error => {
      assert.match(error.message, /读取|Registry|不存在/u)
      assert.doesNotMatch(error.message, /ENOENT|no such file/u)
      assert.equal(error.cause?.code, 'ENOENT')
      return true
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
