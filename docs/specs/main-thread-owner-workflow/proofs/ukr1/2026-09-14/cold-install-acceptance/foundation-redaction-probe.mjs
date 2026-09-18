import test from 'node:test'
import assert from 'node:assert/strict'
import { redactEvidence, produceScenarioEvidence } from '/Volumes/LargeStorage/code/DSH-Workflow/.dsh-workflow/artifacts/act-e9052e9f6cc7f76020619d4d021aab4a7a5fa90e/tree/tests/foundation/evidence.mjs'

for (const [name, secret] of [['string', 'synthetic alpha bravo'], ['nested object', { nested: 'synthetic-secret', second: 'another-secret' }], ['array', ['synthetic-secret', { nested: 'another-secret' }]]]) {
  test(`structured ${name} evidence remains parseable and keeps public fields`, () => {
    const input = { scenario: 'probe', events: [{ type: 'ok' }], details: { payload: secret, publicCount: 2 } }
    const before = JSON.stringify(input)
    const output = produceScenarioEvidence(input)
    const parsed = JSON.parse(output)
    assert.equal(parsed.scenario, 'probe')
    assert.deepEqual(parsed.events, [{ type: 'ok' }])
    assert.equal(parsed.details.publicCount, 2)
    assert.equal(JSON.stringify(input), before)
    assert.equal(output.includes('synthetic'), false)
    assert.equal(output.includes('another-secret'), false)
  })
}
test('JSON text redaction keeps valid syntax and sibling metadata', () => {
  const output = redactEvidence(' { "public": true, "nested": { "ToKeN": "synthetic secret", "keep": 7 } } ')
  const parsed = JSON.parse(output)
  assert.equal(parsed.public, true)
  assert.equal(parsed.nested.keep, 7)
  assert.equal(output.includes('synthetic'), false)
})
test('freeform log still removes whitespace secrets and retains field boundaries', () => {
  const output = redactEvidence('payload = synthetic alpha bravo; public=ok|txHash:synthetic tx hash')
  assert.equal(output.includes('synthetic'), false)
  assert.ok(output.includes('public=ok'))
})
