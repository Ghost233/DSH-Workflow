import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/config.mjs'
import { RECEIPT_SCHEMA, sha256, validateReceipt, hasLikelySecret, DIAGNOSTIC_COMMAND } from '../src/receipt.mjs'

const body = '准备构建\ncompiling\nerror: missing symbol\nFAILED suite\n'
const receipt = overrides => JSON.stringify({ schema: RECEIPT_SCHEMA, source_sha256: sha256(body),
  status: 'failure', uncertain: false, evidence: [{ kind: 'failure', quote: 'error: missing symbol' }], ...overrides })

test('receipt preserves exact Unicode quotes, source hash, line and quote hash', () => {
  const result = validateReceipt(receipt(), body, true)
  assert.equal(result.evidence[0].line, 3)
  assert.equal(result.evidence[0].quote_sha256, sha256('error: missing symbol'))
})

test('wrong source, status, invented quotes, empty evidence and disguised failure are rejected', () => {
  for (const raw of ['not json', receipt({ source_sha256: 'wrong' }), receipt({ status: 'success' }),
    receipt({ evidence: [{ kind: 'failure', quote: 'invented' }] }), receipt({ evidence: [] }),
    receipt({ evidence: [{ kind: 'failure', quote: 'compiling' }] }),
    receipt({ evidence: [{ kind: 'summary', quote: 'error: missing symbol' }] }),
    receipt({ evidence: Array.from({ length: 13 }, () => ({ kind: 'failure', quote: 'FAILED suite' })) }),
  ]) assert.equal(validateReceipt(raw, body, true), undefined)
})

test('diagnostic command routing includes common DSH workflows and excludes plain reads', () => {
  for (const cmd of ['npm test', 'pnpm run build', './gradlew test', 'xcodebuild -scheme Demo', 'cargo check', 'go test ./...']) {
    assert.equal(DIAGNOSTIC_COMMAND.test(cmd), true, cmd)
  }
  for (const cmd of ['git status', 'cat output.log', 'ls -la']) assert.equal(DIAGNOSTIC_COMMAND.test(cmd), false, cmd)
})

test('secret heuristic rejects common credentials without claiming completeness', () => {
  for (const text of ['api_key=abc', 'Authorization: Bearer abcdefghijklmnop', '-----BEGIN RSA PRIVATE KEY-----', 'sk-abcdefghijklmnopqrstuvw']) {
    assert.equal(hasLikelySecret(text), true)
  }
  assert.equal(hasLikelySecret(body), false)
})

test('config is default-off, permits session routes and rejects partial routes, invalid limits and misspellings', () => {
  assert.equal(resolveConfig({}).actionFusion.enabled, false)
  assert.equal(resolveConfig({}).evidenceReducer.enabled, false)
  assert.equal(resolveConfig({}).evidenceReducer.reasoningEffort, 'auto')
  assert.equal(resolveConfig({ evidenceReducer: { enabled: true } }).evidenceReducer.provider, '')
  for (const config of [{ actionFusion: { enabled: 'false' } }, { evidenceReducer: { provider: 'partial' } },
    { evidenceReducer: { minBytes: 0 } }, { evidenceReducer: { maxBytes: 1 } }, { enabled: true },
    { evidenceReducer: { timeout: 500 } }]) assert.throws(() => resolveConfig(config))
})
