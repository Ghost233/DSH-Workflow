import { applyKernel } from './kernel-plugin.mjs'

export const name = 'dsh-owner-workflow'
export const inject = ['tools', 'systemPrompt', 'agents', 'sessions', 'sessionPersistence', 'skills', 'subagents',
  'agentPresets', 'fs', 'shell', 'subprocess', 'sandbox', 'sandboxPolicy', 'approval', 'userQuestions']
// Cordis collects apply's return value as a disposer, never as a service value.
// Runtime ownership/disposal is registered by applyKernel on the mounting scope.
export async function apply(ctx, config) { await applyKernel(ctx, config) }
export default { name, inject, apply }
