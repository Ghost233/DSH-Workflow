const OWNER_ADVICE_CONTRACT = 'DSH_OWNER_PLANNING_ADVICE_V1'
const OWNER_ADVICE_FIELDS = [
  'contract', 'ownerId', 'scopeFit', 'facts', 'constraints', 'suggestedNodes',
  'dependencies', 'handoffs', 'risks', 'verificationSuggestions',
]

const stringListSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
}

// Shared by the public structured tool and the Runtime session-receipt path.
// Runtime keeps accepting omitted lists from old durable artifacts, then emits
// the canonical empty arrays below; new tool submissions require every field.
export const OWNER_ADVICE_SUBMISSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contract: { type: 'string', enum: [OWNER_ADVICE_CONTRACT] },
    ownerId: { type: 'string', minLength: 1 },
    scopeFit: { type: 'string', enum: ['full', 'partial', 'none'] },
    facts: stringListSchema,
    constraints: stringListSchema,
    suggestedNodes: stringListSchema,
    dependencies: stringListSchema,
    handoffs: stringListSchema,
    risks: stringListSchema,
    verificationSuggestions: stringListSchema,
  },
  required: OWNER_ADVICE_FIELDS,
}

function stringList(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  return [...new Set(value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') throw new Error(`${field}[${index}] 必须是非空字符串`)
    return item.trim()
  }))]
}

export function normalizeOwnerPlanningAdvice(raw, ownerId) {
  if (raw?.contract !== OWNER_ADVICE_CONTRACT) {
    throw new Error(`Owner ${ownerId} 的规划会诊契约不受支持：${String(raw?.contract)}`)
  }
  if (raw.ownerId !== ownerId) throw new Error(`Owner 规划会诊身份不匹配，期望 ${ownerId}`)
  if (!['full', 'partial', 'none'].includes(raw.scopeFit)) {
    throw new Error(`Owner ${ownerId} 的 scopeFit 不受支持：${String(raw.scopeFit)}`)
  }
  return {
    contract: OWNER_ADVICE_CONTRACT,
    ownerId,
    scopeFit: raw.scopeFit,
    facts: stringList(raw.facts, `Owner ${ownerId}.facts`),
    constraints: stringList(raw.constraints, `Owner ${ownerId}.constraints`),
    suggestedNodes: stringList(raw.suggestedNodes, `Owner ${ownerId}.suggestedNodes`),
    dependencies: stringList(raw.dependencies, `Owner ${ownerId}.dependencies`),
    handoffs: stringList(raw.handoffs, `Owner ${ownerId}.handoffs`),
    risks: stringList(raw.risks, `Owner ${ownerId}.risks`),
    verificationSuggestions: stringList(raw.verificationSuggestions, `Owner ${ownerId}.verificationSuggestions`),
  }
}
