import z from '@deepseek-ai/schemastery'
import { resolveConfig } from './config.mjs'

const defaults = resolveConfig({})
const fields = Object.fromEntries(Object.entries(defaults.evidenceReducer).map(([key, value]) => [
  key, (typeof value === 'boolean' ? z.boolean() : typeof value === 'number' ? z.number() : z.string()).default(value),
]))

// Advanced deployment limits remain supported, but the DSH card only needs two checkboxes.
export const SettingsSchema = z.object({
  actionFusion: z.object({ enabled: z.boolean().default(false) }),
  evidenceReducer: z.object(fields),
})
