import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { composeApprovalPatches } from '../compose-patch.mjs'

const permission = () => ({ id: 'custom-permission', name: '@deepseek-ai/dsh-permission-presets', config: {
  defaultPreset: 'review-only', presets: {
    'review-only': { sandbox: 'read-only', approval: 'ask', name: 'Custom review' },
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
  },
} })
const compose = entries => applyEntryPatches(entries, composeApprovalPatches(entries), message => { throw new Error(message) })

test('native patch composition preserves custom presets, default and legacy settings without double-loading', () => {
  const entries = [permission(), { id: 'old-approval', name: 'dsh-approve-for-me', config: { mode: 'rules-only' } }]
  const before = structuredClone(entries)
  const result = compose(entries)
  assert.deepEqual(entries, before)
  assert.equal(result[0].config.defaultPreset, 'review-only')
  assert.deepEqual(result[0].config.presets['review-only'], before[0].config.presets['review-only'])
  assert.deepEqual(Object.keys(result[0].config.presets), ['review-only', 'workspace-write', 'approve-for-me'])
  assert.equal(result[1].disabled, true)
  assert.equal(result[2].name, 'dsh-approve-for-me-workflow')
  assert.deepEqual(result[2].config, { mode: 'rules-only' })
})

test('adapted nested profiles are idempotent and an explicitly disabled plugin stays disabled', () => {
  const entries = [{ id: 'group', group: true, config: [permission(),
    { id: 'existing-approval', name: 'dsh-approve-for-me-workflow', disabled: true }] }]
  const first = compose(entries)
  assert.deepEqual(compose(first), first)
  assert.equal(first[0].config[1].disabled, true)
})

test('conflicting policy, duplicate plugins and computed config require review instead of silent replacement', () => {
  const conflicting = permission()
  conflicting.config.presets['approve-for-me'] = { sandbox: 'danger-full-access', approval: 'never' }
  assert.throws(() => compose([conflicting]), /different policy/)
  assert.throws(() => compose([permission(), { id: 'a', name: 'dsh-approve-for-me' }, { id: 'b', name: 'dsh-approve-for-me-workflow' }]), /duplicate/)
  assert.throws(() => compose([{ ...permission(), config: { __jsExpr: 'computed' } }]), /explicit/)
})
