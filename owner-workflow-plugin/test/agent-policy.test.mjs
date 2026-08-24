import test from 'node:test'
import assert from 'node:assert/strict'
import { configureChildSandbox, toolExecutionDenial } from '../src/agent-policy.mjs'

test('子代理继承完整工具集，角色只决定文件沙箱模式', () => {
  const events = []
  const childCtx = {
    agent: {
      session: {
        append: (type, data) => events.push({ type, data }),
      },
    },
  }
  assert.equal(configureChildSandbox(childCtx, 'owner'), 'workspace-write')
  assert.equal(configureChildSandbox(childCtx, 'planner'), 'read-only')
  assert.deepEqual(events, [
    { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
    { type: 'approval/policy', data: { policy: 'never', source: 'delegation' } },
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
