import { randomUUID } from 'node:crypto'

export const INTENT_CONTRACT = 'DSH_WORKFLOW_INTENT_V1'
export const INTENT_STATUSES = Object.freeze(['pending', 'incorporated', 'rejected'])
const MAX_INTENT_LENGTH = 4_000

export function normalizeIntentContent(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Intent 内容不能为空')
  const content = value.trim()
  if (content.length > MAX_INTENT_LENGTH) throw new Error(`Intent 内容不能超过 ${MAX_INTENT_LENGTH} 字符`)
  return content
}

export function createWorkflowIntent({ workflowId, sourceSessionId, sourceAnchor, content, time }) {
  if (typeof workflowId !== 'string' || workflowId === '') throw new Error('Intent 缺少 workflowId')
  if (typeof sourceSessionId !== 'string' || sourceSessionId === '') throw new Error('Intent 缺少 sourceSessionId')
  return {
    contract: INTENT_CONTRACT,
    id: `intent-${randomUUID()}`,
    workflowId,
    sourceSessionId,
    sourceAnchor: {
      parentSessionId: sourceAnchor?.parentSessionId ?? null,
      seedLength: Number.isSafeInteger(sourceAnchor?.seedLength) ? sourceAnchor.seedLength : null,
    },
    content: normalizeIntentContent(content),
    status: 'pending',
    createdAt: time,
  }
}

export function pendingWorkflowIntents(state) {
  return (state?.intents ?? []).filter(intent => intent?.status === 'pending')
}

export function publicWorkflowIntent(intent) {
  return {
    id: intent.id,
    sourceSessionId: intent.sourceSessionId,
    sourceAnchor: intent.sourceAnchor,
    content: intent.content,
    status: intent.status,
    createdAt: intent.createdAt,
    ...(Number.isSafeInteger(intent.incorporatedRevision)
      ? { incorporatedRevision: intent.incorporatedRevision }
      : {}),
    ...(typeof intent.rejectedReason === 'string' ? { rejectedReason: intent.rejectedReason } : {}),
  }
}
