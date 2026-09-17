function object(value, label, allowed) {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`sol-efficiency: ${label} must be an object`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`sol-efficiency: unknown ${label}.${key}`)
  }
  return value
}

/** Resolve and validate deployment configuration before registering effects. */
export function resolveConfig(input) {
  const root = object(input, 'config', ['actionFusion', 'evidenceReducer'])
  const actionFusion = { enabled: false, ...object(root.actionFusion, 'actionFusion', ['enabled']) }
  const defaults = {
    enabled: false, provider: '', model: '', reasoningEffort: 'auto',
    minBytes: 4096, maxBytes: 600000, maxOutputTokens: 2048,
    maxResponseBytes: 32768, maxReceiptBytes: 12000, timeoutMs: 90000,
  }
  const evidenceReducer = { ...defaults, ...object(root.evidenceReducer, 'evidenceReducer', Object.keys(defaults)) }
  for (const [name, value] of Object.entries({ actionFusion, evidenceReducer })) {
    if (typeof value.enabled !== 'boolean') throw new Error(`sol-efficiency: ${name}.enabled must be boolean`)
  }
  for (const key of ['provider', 'model', 'reasoningEffort']) {
    if (typeof evidenceReducer[key] !== 'string' || (key === 'reasoningEffort' && !evidenceReducer[key].trim())) {
      throw new Error(`sol-efficiency: evidenceReducer.${key} must be a string (reasoningEffort cannot be empty)`)
    }
  }
  if (Boolean(evidenceReducer.provider.trim()) !== Boolean(evidenceReducer.model.trim())) {
    throw new Error('sol-efficiency: set both provider and model, or leave both empty to follow the session model')
  }
  for (const key of ['minBytes', 'maxBytes', 'maxOutputTokens', 'maxResponseBytes', 'maxReceiptBytes', 'timeoutMs']) {
    if (!Number.isSafeInteger(evidenceReducer[key]) || evidenceReducer[key] <= 0) {
      throw new Error(`sol-efficiency: evidenceReducer.${key} must be a positive safe integer`)
    }
  }
  if (evidenceReducer.minBytes > evidenceReducer.maxBytes) throw new Error('sol-efficiency: minBytes exceeds maxBytes')
  if (evidenceReducer.timeoutMs > 2147483647) throw new Error('sol-efficiency: timeoutMs exceeds the Node timer limit')
  return { actionFusion, evidenceReducer }
}
