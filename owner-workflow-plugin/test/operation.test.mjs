import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  OPERATION_CONTRACT,
  appendOperationEvent,
  createOperationState,
  listOperationStates,
  normalizeOperationReport,
  normalizeOperationSpec,
  normalizeOperationApprovalPrefix,
  operationArgvIsPublicWebRead,
  operationCommandIsCompound,
  operationCommandIsPublicWebRead,
  operationCommandMatchesPrefix,
  operationCommandNeedsApproval,
  operationInitialPrompt,
  operationPublicSnapshot,
  readOperationState,
  writeOperationState,
} from '../src/operation.mjs'

function spec() {
  return {
    goal: '检查 Android VPN 当前状态',
    context: ['当前只分析 Android'],
    constraints: ['只读', '不停止 VPN'],
    successCriteria: ['返回 VPN 与网络状态证据'],
    capabilities: ['project-read', 'shell'],
  }
}

test('Operation 执行契约要求目标、边界、完成标准和最小能力', () => {
  const normalized = normalizeOperationSpec(spec())
  assert.deepEqual(normalized.capabilities, ['project-read', 'shell'])
  assert.throws(() => normalizeOperationSpec({ ...spec(), constraints: [] }), /constraints/u)
  assert.throws(() => normalizeOperationSpec({ ...spec(), capabilities: ['任意权限'] }), /未知能力/u)
})

test('Operation 状态独立持久化并只公开受限投影', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-operation-model-'))
  try {
    const state = createOperationState({
      root,
      parentSessionId: 'parent-session',
      childId: 'child-session',
      operationId: 'op-test',
      spec: spec(),
      time: '2026-08-21T00:00:00.000Z',
    })
    state.status = 'running'
    appendOperationEvent(state, { type: 'operation.started', summary: '后台执行已开始' }, '2026-08-21T00:00:01.000Z')
    await writeOperationState(root, state)

    const loaded = await readOperationState(root, 'op-test')
    assert.equal(loaded.contract, OPERATION_CONTRACT)
    assert.equal((await listOperationStates(root))[0].id, 'op-test')
    const snapshot = operationPublicSnapshot(loaded)
    assert.equal(snapshot.operationId, 'op-test')
    assert.equal(Object.hasOwn(snapshot, 'root'), false)
    assert.equal(Object.hasOwn(snapshot, 'childId'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Operation 报告区分普通进展、用户输入和精确命令授权', () => {
  assert.deepEqual(normalizeOperationReport({
    type: 'need_input',
    summary: '没有发现已授权设备',
    question: '请确认手机已经允许 USB 调试。',
  }), {
    type: 'need_input',
    summary: '没有发现已授权设备',
    question: '请确认手机已经允许 USB 调试。',
  })
  const approval = normalizeOperationReport({
    type: 'need_approval',
    summary: '需要切换网络验证恢复路径',
    question: '是否允许短暂关闭 Wi-Fi？',
    action: '关闭 Wi-Fi 后重新检查 VPN',
    risk: '手机网络会短暂中断',
    proposedCommand: 'adb shell svc wifi disable',
    proposedPrefix: 'adb shell svc',
  })
  assert.equal(approval.proposedCommand, 'adb shell svc wifi disable')
  assert.equal(approval.proposedPrefix, 'adb shell svc')
  assert.throws(() => normalizeOperationReport({ type: 'completed', summary: '完成' }), /result/u)
})

test('通用命令门禁允许典型只读诊断并拦截外部副作用', () => {
  assert.equal(operationCommandIsCompound('adb devices -l && adb shell dumpsys vpn'), true)
  assert.equal(operationCommandIsCompound('lsof -p $(pgrep dsh)'), true)
  assert.equal(operationCommandIsCompound('adb shell dumpsys vpn'), false)
  for (const command of [
    'adb devices -l',
    'adb shell dumpsys vpn',
    'adb shell getprop ro.product.model',
    'adb logcat -d -v threadtime',
    'git status --short',
    'lsof -nP "$TMPDIR/dsh.pid" 2>/dev/null',
  ]) {
    assert.equal(operationCommandNeedsApproval(command), false, command)
  }
  for (const command of [
    'adb install app.apk',
    'adb shell svc wifi disable',
    'adb shell am force-stop com.example.app',
    'adb shell monkey -p com.example.app 1',
    'pm clear com.example.app',
    'git status && rm -rf build',
    'curl -L https://example.com/docs',
  ]) {
    assert.equal(operationCommandNeedsApproval(command), true, command)
  }
  assert.equal(operationArgvIsPublicWebRead(['curl', '-L', '--max-time', '20', 'https://example.com/docs']), true)
  assert.equal(operationArgvIsPublicWebRead(['curl', '-X', 'POST', 'https://example.com/api']), false)
  assert.equal(operationCommandIsPublicWebRead('curl -L https://example.com/docs'), true)
  assert.equal(operationCommandIsPublicWebRead('curl -X POST https://example.com/api'), false)
})

test('会话级命令授权只匹配完整字面参数前缀', () => {
  const command = 'adb -s 10AFAU29QR003JA shell input tap 720 596'
  assert.equal(normalizeOperationApprovalPrefix('adb -s 10AFAU29QR003JA shell input', command), 'adb -s 10AFAU29QR003JA shell input')
  assert.equal(operationCommandMatchesPrefix(command, 'adb -s 10AFAU29QR003JA shell input'), true)
  assert.equal(operationCommandMatchesPrefix('adb -s 10AFAU29QR003JAX shell input tap 1 1', 'adb -s 10AFAU29QR003JA'), false)
  assert.throws(() => normalizeOperationApprovalPrefix('adb -s other', command), /完整字面参数前缀/u)
  assert.throws(() => normalizeOperationApprovalPrefix('adb -s 10AFAU29QR003JA shell input &', command), /后台符号/u)
  assert.equal(operationCommandIsCompound('adb shell input tap 1 1 &'), true)
})

test('Operator 提示要求只与主代理结构化通信', () => {
  const state = createOperationState({
    root: '/workspace',
    parentSessionId: 'parent',
    childId: 'child',
    operationId: 'op-prompt',
    spec: spec(),
  })
  const prompt = operationInitialPrompt(state)
  assert.match(prompt, /用户只与主代理沟通/u)
  assert.match(prompt, /operation_exec/u)
  assert.match(prompt, /need_approval/u)
  assert.match(prompt, /检查 Android VPN 当前状态/u)
})
