/**
 * L1 router tools (#74 P1-B): reply_source's execute returns router.replySource's full shape —
 * { outboxId, state, truncated } (router.js) — but the tool output schema declared only { outboxId, state }
 * with additionalProperties:false, so every call failed runtime output validation model-side ("value.truncated
 * is not a declared property") even though the reply WAS recorded. The model then misreported the reply as
 * undelivered (live: chief seq1559-1576). The schema must declare everything execute can return. RED first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/router-tools.js'

function fixture() {
  const registered = new Map()
  const hub = {
    config: { homeRepo: '/tmp/home-repo' },
    registry: {
      list: () => [],
      create: o => ({ id: 'scr-stub', kind: o.kind, status: 'created', cwd: o.cwd ?? '/tmp/scratch-stub' }),
    },
    router: {
      routeToOwner: async () => ({ ownerId: 'chief' }),
      queryTasks: () => [],
      // router.js replySource shape: outboxId + state + truncated (truncation flag is ALWAYS present).
      replySource: async ({ text }) => ({ outboxId: 'out-stub', state: 'recorded', truncated: text.length > 100 }),
    },
  }
  const ctx = {
    reflect: { get: () => hub },
    tools: { register: tool => registered.set(tool.name, tool) },
    systemPrompt: { section() {} },
  }
  apply(ctx)
  return { registered }
}

test('#74 P1-B: reply_source output schema declares every property execute returns (truncated included)', async () => {
  const { registered } = fixture()
  const tool = registered.get('reply_source')
  assert.ok(tool, 'reply_source is registered')
  const declared = new Set(Object.keys(tool.output.schema.properties))
  assert.ok(declared.has('truncated'), 'router.replySource returns truncated — the output schema must declare it')

  for (const text of ['短答复', '长'.repeat(200)]) {
    const value = await tool.execute({ text })
    for (const key of Object.keys(value)) {
      assert.ok(declared.has(key),
        'execute returns "' + key + '" but the output schema does not declare it (additionalProperties:false → every call errors model-side)')
    }
    for (const req of tool.output.schema.required ?? []) {
      assert.ok(req in value, 'required output property ' + req + ' present')
    }
  }
})
