import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createOperationApprovalPlugin,
  readApproveForMeSettings,
} from '../src/operation-approval.mjs'

function settings(mode = 'rules-and-llm') {
  return {
    version: 1,
    mode,
    rules: {
      commandPrefixes: [{ tool: process.platform === 'win32' ? 'pwsh' : 'shell', prefix: 'git status' }],
      reviewerInstructions: '只允许只读仓库检查。',
    },
    reviewer: { timeoutMs: 1_000 },
    limits: {
      trustedTranscriptChars: 1_024,
      untrustedToolDataChars: 1_024,
      reviewerOutputChars: 1_024,
    },
  }
}

test('Operation 审批插件只读取 approve-for-me 设置，不注册或监听主代理 Approval', async () => {
  let eventRegistrations = 0
  const ctx = {
    settings: { get: namespace => namespace === 'approve-for-me' ? settings('rules-only') : undefined },
    on() { eventRegistrations += 1 },
  }
  const parsed = readApproveForMeSettings(ctx)
  assert.equal(parsed.ok, true)
  const plugin = createOperationApprovalPlugin(ctx)
  assert.equal(eventRegistrations, 0)
  await plugin.dispose()
})

test('会话前缀使用最长字面边界匹配，并在主会话清理时全部失效', async () => {
  const plugin = createOperationApprovalPlugin({})
  try {
    plugin.grantPrefix('main', 'adb shell', 'approval-1', 'op-1')
    const narrow = plugin.grantPrefix('main', 'adb shell input', 'approval-2', 'op-1')
    assert.equal(plugin.matchPrefix('main', 'adb shell input tap 1 2'), narrow)
    assert.equal(plugin.matchPrefix('main', 'adb shell inputx tap 1 2').prefix, 'adb shell')
    plugin.clearSession('main')
    assert.equal(plugin.matchPrefix('main', 'adb shell input tap 1 2'), undefined)
  } finally {
    await plugin.dispose()
  }
})

test('模型即使返回 allow，复核子代理无法回收时也必须回退人工', async () => {
  const ctx = {
    settings: { get: () => settings('rules-and-llm') },
    subagents: {
      async start() {
        return {
          result: Promise.resolve({ stopReason: 'completed', structured: { decision: 'allow' } }),
          async dispose() { throw new Error('回收失败') },
        }
      },
    },
  }
  const plugin = createOperationApprovalPlugin(ctx)
  try {
    const decision = await plugin.evaluateAutomatic({
      operatorAgent: { options: { provider: 'test', model: 'low-cost' }, session: {} },
      parentAgent: { options: { provider: 'test', model: 'main' }, session: {} },
      command: 'git status --short',
      description: '检查仓库状态',
      signal: new AbortController().signal,
    })
    assert.equal(decision.outcome, 'manual')
    assert.equal(decision.reason, 'reviewer-dispose-failed')
  } finally {
    await plugin.dispose()
  }
})

test('上游设置不存在或格式不兼容时关闭自动审批', async () => {
  const unavailable = readApproveForMeSettings({ settings: { get: () => undefined } })
  assert.deepEqual(unavailable, { ok: false, reason: 'settings-unavailable' })

  const invalid = readApproveForMeSettings({ settings: { get: () => ({ version: 99 }) } })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.reason, 'settings-invalid')
})
