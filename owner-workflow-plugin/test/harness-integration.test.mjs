import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { configureChildSandbox } from '../src/agent-policy.mjs'

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const HARNESS_ROOT = join(PROJECT_ROOT, 'deepseek-harness')
const HARNESS_APP = join(HARNESS_ROOT, 'apps/cli/package.json')
const HARNESS_BASE = join(HARNESS_ROOT, 'packages/bundle/base/package.json')
const SYSTEM_PRESET_ROOT = join(HARNESS_ROOT, 'apps/cli/config/agent-presets')
const BASE_PATCH = join(HARNESS_ROOT, 'packages/bundle/base/cordis.patch.yml')
const PLUGIN_PATCH = join(PLUGIN_ROOT, 'cordis.patch.yml')
const LOCAL_PLUGIN_PATCH = join(PLUGIN_ROOT, 'cordis.local.patch.yml')
const INSTALL_ANCHOR = HARNESS_APP
const PLUGIN_ENTRY = join(PLUGIN_ROOT, 'index.js')
const OWNER_PRESET_SOURCE = join(PLUGIN_ROOT, 'agent-presets/owner-workflow')

const appRequire = createRequire(HARNESS_APP)
const execFileAsync = promisify(execFile)

const { boot, healProfilesModuleFallback, loadOverlayPatches } = appRequire('@deepseek-ai/dsh-app-boot')
const { provideCmdline } = appRequire('@deepseek-ai/dsh-cmdline')
const { SessionId } = appRequire('@deepseek-ai/dsh-session')
const { CallId } = appRequire('@deepseek-ai/dsh-llm')
const { assembleContextFor } = appRequire('@deepseek-ai/dsh-agent')

const HOME_ENV_NAMES = ['DSH_HOME', 'DSH_PERMISSION_MODE']
const savedEnvironment = new Map(HOME_ENV_NAMES.map(name => [name, process.env[name]]))

let harnessContext
let harnessHome

function toolNames(ctx, agent) {
  return ctx.tools.schemas(agent).map(schema => schema.name).sort()
}

function countTool(names, name) {
  return names.filter(item => item === name).length
}

function textFromResult(result) {
  return result.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

async function git(cwd, args) {
  await execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

async function initializeRepository(cwd) {
  await git(cwd, ['init', '-b', 'main'])
  await git(cwd, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(cwd, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(cwd, 'README.md'), 'Harness 输出边界测试\n', 'utf8')
  await git(cwd, ['add', 'README.md'])
  await git(cwd, ['commit', '-m', '初始化 Harness 输出边界测试'])
}

async function createAgent(id, preset, cwd) {
  return await harnessContext.agents.create({
    sessionId: SessionId(id),
    meta: { agentPreset: preset, cwd },
    setup: async agentCtx => {
      await harnessContext.agentPresets.mount(agentCtx, preset)
    },
  })
}

async function bootHarness() {
  harnessHome = await mkdtemp(join(tmpdir(), 'dsh-owner-workflow-harness-'))
  process.env.DSH_HOME = harnessHome
  process.env.DSH_OWNER_WORKFLOW_PLUGIN_ENTRY = PLUGIN_ENTRY
  process.env.DSH_PERMISSION_MODE = 'workspace-write'

  const userPresetRoot = join(harnessHome, '.agent-presets')
  await mkdir(userPresetRoot, { recursive: true })
  const ownerPresetDirectory = join(userPresetRoot, 'owner-workflow')
  await cp(OWNER_PRESET_SOURCE, ownerPresetDirectory, { recursive: true })
  await writeFile(
    join(ownerPresetDirectory, 'plugin.mjs'),
    [
      '// 由测试模拟安装入口生成，固定指向本次测试中的插件入口。',
      `export { name, inject, apply, default } from ${JSON.stringify(pathToFileURL(PLUGIN_ENTRY).href)}`,
      '',
    ].join('\n'),
    'utf8',
  )

  const profileRoot = join(harnessHome, 'profiles', 'integration')
  await mkdir(profileRoot, { recursive: true })
  // bundle patch 现在还包含 Web Dashboard host；在真实 profile 中它由已安装包解析。
  // 集成测试同样提供包链接，避免把 bundle 当作本地相对路径 patch 使用。
  await mkdir(join(profileRoot, 'node_modules'), { recursive: true })
  await symlink(PLUGIN_ROOT, join(profileRoot, 'node_modules', 'dsh-owner-workflow'), 'dir')
  const rootConfig = join(profileRoot, 'cordis.yml')
  await writeFile(rootConfig, [
    '- id: agent-presets',
    "  name: '@deepseek-ai/dsh-agent-presets'",
    '  config:',
    '    default: standard',
    '    roots:',
    `      - path: ${JSON.stringify(SYSTEM_PRESET_ROOT)}`,
    '        trust: system',
    '    includeUserRoot: true',
    '',
  ].join('\n'), 'utf8')

  healProfilesModuleFallback(INSTALL_ANCHOR, harnessHome)
  healProfilesModuleFallback(HARNESS_BASE, harnessHome)

  const patches = [
    ...loadOverlayPatches('dsh-owner-workflow-test', BASE_PATCH),
    { id: 'hmr', disabled: true },
    { id: 'typert', disabled: true },
    { id: 'typert-loader', disabled: true },
    { id: 'typert-gateway', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    ...[
      'tool-bash',
      'tool-pwsh',
      'tool-jobs',
      'tool-fs',
      'tool-fs-search',
      'agent-instructions',
      'skill-filesystem',
      'tool-skill',
      'tool-goal',
      'plan-mode',
      'compaction-basic',
      'command-compact',
      'tool-subagent-control',
      'tool-subagent-list-agents',
      'tool-subagent',
      'tool-subagent-fork',
      'tool-subagent-report',
      'workflow-worker-thread',
      'tool-workflow',
      'tool-ralph',
      'tool-result-pruner',
      'tool-todo',
      'tool-str-replace-editor',
      'tool-web',
    ].map(id => ({ id, disabled: true })),
    // 同时加载已安装 bundle 和本地开发 patch，覆盖重复注入的启动路径。
    ...loadOverlayPatches('dsh-owner-workflow-test', PLUGIN_PATCH),
    // 本集成夹具只装载 base profile，没有 WebServer；Dashboard 的真实 Web 路由
    // 由 dashboard-host.test.mjs 和启动级测试覆盖，这里明确关闭该 Web 专用 entry。
    { id: 'owner-workflow-dashboard', disabled: true },
    ...loadOverlayPatches('dsh-owner-workflow-test', LOCAL_PLUGIN_PATCH),
    { id: 'settings', config: { path: join(harnessHome, 'settings.yaml'), watch: false } },
    { id: 'storage-json', config: { root: join(harnessHome, 'storages') } },
    {
      id: 'agent-presets',
      config: {
        default: 'standard',
        roots: [{ path: SYSTEM_PRESET_ROOT, trust: 'system' }],
        includeUserRoot: true,
      },
    },
  ]

  harnessContext = await boot(
    'dsh-owner-workflow-test',
    rootConfig,
    patches,
    bootContext => provideCmdline(bootContext, { args: [], exit: () => {} }),
  )
  // The profile fallback can load another physical copy of Cordis, so an
  // instanceof check would reject a valid boot context solely because the two
  // constructors have different module identities. Check the services this
  // integration actually consumes instead.
  assert.equal(typeof harnessContext?.fiber?.dispose, 'function')
  assert.equal(typeof harnessContext?.agentPresets?.list, 'function')
  assert.equal(typeof harnessContext?.agents?.create, 'function')
}

before(async () => {
  await bootHarness()
}, { timeout: 120_000 })

after(async () => {
  await harnessContext?.fiber.dispose()
  if (harnessHome !== undefined) await rm(harnessHome, { recursive: true, force: true })
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}, { timeout: 30_000 })

test('真实加载器可以从 Harness 用户根目录发现所有者工作流预设', async () => {
  const listed = await harnessContext.agentPresets.list()
  const ownerPreset = listed.find(preset => preset.id === 'owner-workflow')

  assert.ok(ownerPreset)
  assert.equal(ownerPreset.trust, 'user')
  assert.equal(ownerPreset.path, join(harnessHome, '.agent-presets/owner-workflow/agent.cordis.yml'))
  assert.equal((await harnessContext.agentPresets.resolve('owner-workflow')).id, 'owner-workflow')
})

test('Owner 工作流的运行时 Skill 能被当前 Agent 正确加载', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-skill-load-'))
  let owner
  try {
    owner = await createAgent('owner-skill-load', 'owner-workflow', cwd)
    const skill = await harnessContext.skills.get('owner-planner', { cwd, scope: owner.agent })
    assert.equal(skill?.source, 'runtime')
    assert.match(skill?.content ?? '', /Owner Planner/u)
  } finally {
    await owner?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('插件只在所有者工作流预设中挂载，已安装 bundle 与本地 patch 不会重复注册', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-preset-scope-'))
  let owner
  let standard
  try {
    owner = await createAgent('owner-preset-scope', 'owner-workflow', cwd)
    standard = await createAgent('standard-preset-scope', 'standard', cwd)

    const ownerTools = toolNames(harnessContext, owner.agent)
    const standardTools = toolNames(harnessContext, standard.agent)
    const globalTools = toolNames(harnessContext)
    const pluginTools = [
      'owner_workflow',
      'workflow_plan_submit',
      'workflow_plan_review_submit',
      'workflow_preflight',
      'workflow_start',
      'workflow_plan_review',
      'workflow_plan_approve',
      'workflow_status',
      'workflow_supervisor_status',
      'workflow_implementation_review',
      'workflow_finalize',
      'workflow_cancel',
      'workflow_git_inspect',
      'operation_start',
      'operation_status',
      'operation_continue',
      'operation_approve',
      'operation_cancel',
      'operation_report',
      'operation_exec',
      'owner_submit',
      'owner_host_exec',
    ]

    assert.equal(harnessContext.agentPresets.composedPreset(owner.agent.ctx), 'owner-workflow')
    assert.ok(owner.agent.ctx.get('approval'))
    assert.equal(harnessContext.agentPresets.composedPreset(standard.agent.ctx), 'standard')
    assert.deepEqual(globalTools.filter(name => pluginTools.includes(name)), [])
    assert.deepEqual(standardTools.filter(name => pluginTools.includes(name)), [])
    for (const name of pluginTools) assert.equal(countTool(ownerTools, name), 1, name)
    assert.equal(
      harnessContext.subagents.list().filter(provider => provider.startsWith('owner-workflow-one-shot-')).length,
      1,
    )

    const ownerAssembly = await harnessContext.systemPrompt.assemble(assembleContextFor(owner.agent))
    const standardAssembly = await harnessContext.systemPrompt.assemble(assembleContextFor(standard.agent))
    assert.ok(ownerAssembly.sections.some(section => section.name === 'owner-workflow:orchestrator'))
    const ownerWorkflowSection = ownerAssembly.sections.find(section => section.name === 'owner-workflow:orchestrator')
    assert.match(ownerWorkflowSection.text, /operation_start/u)
    assert.match(ownerWorkflowSection.text, /不要让用户进入子线程/u)
    assert.equal(standardAssembly.sections.some(section => section.name === 'owner-workflow:orchestrator'), false)
  } finally {
    await standard?.dispose()
    await owner?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('规划器、审查器和记忆子代理继承完整工具，文件写入由 read-only 沙箱限制', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-child-composition-'))
  let parent
  const children = []
  try {
    parent = await createAgent('owner-composition-parent', 'owner-workflow', cwd)
    for (const role of ['Planner', 'Reviewer', 'Memory-Curator', 'Memory-Reviewer']) {
      const child = await harnessContext.agents.create({
        sessionId: SessionId(`owner-composition-${role.toLowerCase()}`),
        meta: { cwd },
        setup: childContext => {
          harnessContext.agentPresets.composeFrom(childContext, parent.agent.ctx)
          childContext.agent.session.append('sandbox/mode', { mode: 'read-only' })
        },
      })
      children.push(child)

      const names = toolNames(harnessContext, child.agent)
      assert.ok(names.length > 0)
      for (const required of ['read', 'write', 'bash', 'owner_submit', 'owner_host_exec']) {
        assert.ok(names.includes(required), `${role} 缺少继承工具：${required}`)
      }
    }
  } finally {
    for (const child of children.reverse()) await child.dispose()
    await parent?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('Owner 子线程在真实 Harness 继承作用域中保留正常开发工具和提交关卡', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-tool-filter-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  let parent
  let child
  try {
    parent = await createAgent('owner-tool-filter-parent', 'owner-workflow', cwd)
    child = await harnessContext.agents.create({
      sessionId: SessionId('owner-tool-filter-child'),
      meta: { cwd, parentSession: parent.agent.id, origin: 'subagent', delegationDepth: 1 },
      setup: childContext => {
        harnessContext.agentPresets.composeFrom(childContext, parent.agent.ctx)
        configureChildSandbox(childContext, 'owner')
      },
    })

    const names = toolNames(harnessContext, child.agent)
    for (const required of ['read', 'write', 'edit', 'bash', 'owner_submit', 'owner_host_exec']) {
      assert.ok(names.includes(required), `Owner 子线程缺少必需工具：${required}`)
    }
    for (const toolName of ['write', 'edit', 'bash']) {
      const schema = harnessContext.tools.schemas(child.agent).find(item => item.name === toolName)
      assert.ok(schema, `Owner 子线程缺少 ${toolName} Schema`)
      assert.equal(Object.hasOwn(schema.parameters.properties, 'sandbox_permissions'), false)
      assert.equal(Object.hasOwn(schema.parameters.properties, 'justification'), false)
    }
    const parentWrite = harnessContext.tools.schemas(parent.agent).find(item => item.name === 'write')
    assert.ok(parentWrite)
    assert.equal(Object.hasOwn(parentWrite.parameters.properties, 'sandbox_permissions'), true)
    assert.equal(runtime.childCapabilityPolicy('owner').inheritTools, true)
  } finally {
    await child?.dispose()
    await parent?.dispose()
    await runtime.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('主代理选择所有者工作流预设后无需调用 mode_enable 也会被工具守卫限制', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-mode-guard-'))
  let owner
  try {
    owner = await createAgent('owner-mode-guard', 'owner-workflow', cwd)
    assert.equal(harnessContext.agentPresets.composedPreset(owner.agent.ctx), 'owner-workflow')
    assert.equal(existsSync(join(cwd, '.dsh-workflow/mode.json')), false)

    const result = await harnessContext.tools.execute({
      callId: CallId('owner-mode-guard-write'),
      name: 'write',
      arguments: {},
      signal: new AbortController().signal,
      agent: owner.agent,
    })

    assert.equal(result.isError, true)
    assert.match(textFromResult(result), /Owner 工作模式已启用/u)
    assert.equal(existsSync(join(cwd, '.dsh-workflow/mode.json')), false)
  } finally {
    await owner?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('专用状态与预检工具通过真实 Harness 输出无损 JSON', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-owner-lossless-output-'))
  let owner
  try {
    await initializeRepository(cwd)
    owner = await createAgent('owner-lossless-output', 'owner-workflow', cwd)
    const signal = new AbortController().signal

    const statusResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-status'),
      name: 'workflow_status',
      arguments: {},
      signal,
      agent: owner.agent,
    })
    assert.equal(statusResult.isError, false, textFromResult(statusResult))
    const status = JSON.parse(textFromResult(statusResult))
    assert.equal(status.contract, 'DSH_WORKFLOW_STATUS_V1')
    assert.deepEqual(status.owners, [])
    assert.equal(Object.hasOwn(status, 'registryDigest'), false)

    const legacyStatusResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-legacy-status'),
      name: 'owner_workflow',
      arguments: { action: 'status' },
      signal,
      agent: owner.agent,
    })
    assert.equal(legacyStatusResult.isError, false, textFromResult(legacyStatusResult))
    assert.deepEqual(JSON.parse(textFromResult(legacyStatusResult)), status)

    const emptyWorkflowIdResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-empty-workflow-id'),
      name: 'workflow_status',
      arguments: { workflow_id: '' },
      signal,
      agent: owner.agent,
    })
    assert.equal(emptyWorkflowIdResult.isError, true)
    assert.match(textFromResult(emptyWorkflowIdResult), /workflow_status 动作必须提供 workflow_id/u)

    const preflightResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-preflight'),
      name: 'workflow_preflight',
      arguments: {},
      signal,
      agent: owner.agent,
    })
    assert.equal(preflightResult.isError, false, textFromResult(preflightResult))
    const preflight = JSON.parse(textFromResult(preflightResult))
    assert.equal(preflight.contract, 'DSH_WORKFLOW_BASE_PREFLIGHT_V1')
    assert.equal(preflight.canStart, true)
    assert.match(preflight.baseDigest, /^[0-9a-f]{64}$/u)

    await writeFile(join(cwd, 'draft.md'), '尚未提交的现场\n', 'utf8')
    const dirtyPreflightResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-dirty-preflight'),
      name: 'workflow_preflight',
      arguments: {},
      signal,
      agent: owner.agent,
    })
    assert.equal(dirtyPreflightResult.isError, false, textFromResult(dirtyPreflightResult))
    const dirtyPreflight = JSON.parse(textFromResult(dirtyPreflightResult))
    assert.equal(dirtyPreflight.canStart, false)
    assert.deepEqual(dirtyPreflight.changes, [{ code: '??', path: 'draft.md' }])

    const staleStartResult = await harnessContext.tools.execute({
      callId: CallId('owner-lossless-stale-start'),
      name: 'workflow_start',
      arguments: {
        request: '不能从已变化的基线创建工作流',
        base_digest: preflight.baseDigest,
      },
      signal,
      agent: owner.agent,
    })
    assert.equal(staleStartResult.isError, true)
    assert.match(textFromResult(staleStartResult), /base_digest 已过期/u)
    assert.equal(existsSync(join(cwd, '.dsh-workflow', 'workflows')), false)
  } finally {
    await owner?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('标准预设保持原有工具且不受所有者插件影响', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-standard-preset-'))
  let standard
  try {
    standard = await createAgent('standard-preset-unaffected', 'standard', cwd)
    const names = toolNames(harnessContext, standard.agent)

    assert.ok(names.includes('read'))
    assert.ok(names.includes('write'))
    assert.ok(names.includes('edit'))
    assert.ok(names.includes('bash'))
    for (const name of ['owner_workflow', 'owner_submit', 'owner_host_exec']) {
      assert.equal(names.includes(name), false, name)
    }
    const assembly = await harnessContext.systemPrompt.assemble(assembleContextFor(standard.agent))
    assert.equal(assembly.sections.some(section => section.name === 'owner-workflow:orchestrator'), false)
  } finally {
    await standard?.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
})
