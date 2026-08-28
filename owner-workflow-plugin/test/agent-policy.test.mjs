import test from 'node:test'
import assert from 'node:assert/strict'
import { configureChildSandbox, toolExecutionDenial } from '../src/agent-policy.mjs'

test('子代理继承完整工具集，角色只决定文件沙箱模式', () => {
  const events = []
  const registered = []
  const inheritedWrite = {
    name: 'write',
    description: 'write file',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' },
        sandbox_permissions: { type: 'string' },
        justification: { type: 'string' },
      },
      required: ['file_path', 'content'],
    },
    output: { schema: { type: 'string' }, render: () => [] },
    execute: async () => 'written',
  }
  const childCtx = {
    agent: {
      session: {
        append: (type, data) => events.push({ type, data }),
      },
    },
    tools: {
      schemas: () => [inheritedWrite],
      get: name => name === 'write' ? inheritedWrite : undefined,
      register: definition => registered.push(definition),
    },
  }
  assert.equal(configureChildSandbox(childCtx, 'owner'), 'workspace-write')
  assert.equal(configureChildSandbox(childCtx, 'planner'), 'read-only')
  assert.equal(registered.length, 2)
  assert.equal(registered[0].execute, inheritedWrite.execute)
  assert.deepEqual(registered[0].parameters.properties, {
    file_path: { type: 'string' },
    content: { type: 'string' },
  })
  assert.deepEqual(registered[0].parameters.required, ['file_path', 'content'])
  assert.deepEqual(registered[1].parameters.properties, registered[0].parameters.properties)
  assert.ok(Object.hasOwn(inheritedWrite.parameters.properties, 'sandbox_permissions'))
  assert.deepEqual(events, [
    { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
    { type: 'approval/policy', data: { policy: 'ask', source: 'owner-workflow' } },
    { type: 'sandbox/mode', data: { mode: 'read-only' } },
    { type: 'approval/policy', data: { policy: 'never', source: 'delegation' } },
  ])

  const existingEvents = [{ type: 'approval/policy', data: { policy: 'never', source: 'delegation' } }]
  const resumed = {
    agent: {
      session: {
        events: existingEvents,
        append: (type, data) => existingEvents.push({ type, data }),
      },
    },
  }
  configureChildSandbox(resumed, 'operator')
  assert.equal(existingEvents.filter(event => event.type === 'approval/policy').length, 1)
})

test('Planner 与 Reviewer 隐藏无效升级字段，并对同一失败搜索执行有界熔断', async () => {
  let attempts = 0
  const definitions = {
    bash: {
      name: 'bash',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          sandbox_permissions: { type: 'string' },
          justification: { type: 'string' },
        },
      },
      execute: async () => 'ok',
    },
    web_search: {
      name: 'web_search',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
      execute: async args => {
        attempts += 1
        if (args.query === 'cached query') return { answer: 'cached' }
        throw new Error('provider unavailable')
      },
    },
  }
  const registered = new Map()
  const childCtx = {
    agent: { session: { append: () => undefined } },
    tools: {
      schemas: () => Object.values(definitions),
      get: name => registered.get(name) ?? definitions[name],
      register: definition => registered.set(definition.name, definition),
    },
  }
  configureChildSandbox(childCtx, 'plan-reviewer')
  assert.equal(Object.hasOwn(registered.get('bash').parameters.properties, 'sandbox_permissions'), false)
  assert.equal(Object.hasOwn(registered.get('bash').parameters.properties, 'justification'), false)

  const search = registered.get('web_search')
  await assert.rejects(search.execute({ query: 'same query' }), /provider unavailable/u)
  await assert.rejects(search.execute({ query: 'same query' }), /provider unavailable/u)
  await assert.rejects(search.execute({ query: 'same query' }), /已经连续失败两次/u)
  assert.equal(attempts, 2)
  assert.deepEqual(await search.execute({ query: 'cached query' }), { answer: 'cached' })
  assert.deepEqual(await search.execute({ query: 'cached query' }), { answer: 'cached' })
  assert.equal(attempts, 3)
})

test('Operator 的重复搜索同样使用成功缓存和两次失败熔断', async () => {
  let attempts = 0
  const search = {
    name: 'web_search',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async args => {
      attempts += 1
      if (args.query === 'cached') return { result: 'official docs' }
      throw new Error('search unavailable')
    },
  }
  let registered
  configureChildSandbox({
    agent: { session: { append: () => undefined } },
    tools: {
      schemas: () => [search],
      get: () => registered ?? search,
      register: definition => { registered = definition },
    },
  }, 'operator')

  assert.deepEqual(await registered.execute({ query: 'cached' }), { result: 'official docs' })
  assert.deepEqual(await registered.execute({ query: 'cached' }), { result: 'official docs' })
  await assert.rejects(registered.execute({ query: 'failing' }), /search unavailable/u)
  await assert.rejects(registered.execute({ query: 'failing' }), /search unavailable/u)
  await assert.rejects(registered.execute({ query: 'failing' }), /已经连续失败两次/u)
  assert.equal(attempts, 3)
})

test('主代理禁止直接开发，Owner 和 Operator 不使用工具白名单', () => {
  assert.match(toolExecutionDenial({ modeEnabled: true, toolName: 'write' }), /主会话不能直接调用/u)
  assert.match(toolExecutionDenial({ modeEnabled: true, toolName: 'mcp__filesystem__write_file' }), /主会话不能直接调用/u)
  assert.equal(toolExecutionDenial({ modeEnabled: true, toolName: 'read_render' }), undefined)
  assert.equal(toolExecutionDenial({ activeOwner: { owner: { id: 'code' } }, modeEnabled: true, toolName: 'write' }), undefined)
  assert.match(toolExecutionDenial({
    activeOwner: { owner: { id: 'code' } },
    modeEnabled: true,
    toolName: 'bash',
    toolArguments: { command: 'flutter test', sandbox_permissions: 'danger-full-access' },
  }), /owner_host_exec/u)
  assert.match(toolExecutionDenial({
    activeOwner: { owner: { id: 'code' } },
    modeEnabled: true,
    toolName: 'edit',
    toolArguments: { file_path: 'src/app.swift', sandbox_permissions: 'workspace-write', justification: '' },
  }), /立即原样重试.*省略 sandbox_permissions 和 justification/u)
  assert.equal(toolExecutionDenial({
    activeOwner: { owner: { id: 'code' } },
    modeEnabled: true,
    toolName: 'bash',
    toolArguments: { command: 'flutter test' },
  }), undefined)
  assert.match(toolExecutionDenial({ activeOwner: { owner: { id: 'code' } }, modeEnabled: true, toolName: 'subagent' }), /同时只能运行一个/u)
  assert.match(toolExecutionDenial({ activeOwner: { owner: { id: 'code' } }, modeEnabled: true, toolName: 'workflow_cancel' }), /不能控制 Workflow/u)
  assert.equal(toolExecutionDenial({ role: 'operator', modeEnabled: true, toolName: 'computer_use' }), undefined)
  assert.equal(toolExecutionDenial({ role: 'operator', modeEnabled: true, toolName: 'operation_report' }), undefined)
  assert.match(toolExecutionDenial({ role: 'operator', modeEnabled: true, toolName: 'workflow_start' }), /不能控制主 Workflow/u)
  assert.match(toolExecutionDenial({ modeEnabled: true, toolName: 'owner_host_exec' }), /主会话不能直接调用/u)
  assert.match(toolExecutionDenial({ modeEnabled: true, toolName: 'owner_memory_note' }), /主会话不能直接调用/u)
})
