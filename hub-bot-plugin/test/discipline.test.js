/**
 * Message discipline (#66, spec「消息纪律」): an outward reply longer than 100 words is truncated BY CODE and
 * the truncation is announced — the LLM never improvises the cut. Word counting is deterministic: one CJK
 * character is one word; one latin/digit run is one word. RED first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wordCount, truncateWords, REPLY_WORD_LIMIT, TRUNCATION_NOTICE } from '../src/discipline.js'

test('word counting: CJK chars count one each; latin runs count one each', () => {
  assert.equal(wordCount('hello world'), 2)
  assert.equal(wordCount('写完了'), 3)
  assert.equal(wordCount('任务 tsk-1 已 done'), 5) // 任 务 tsk-1 已 done
  assert.equal(wordCount(''), 0)
})

test('at or under the limit the text passes through untouched', () => {
  const exact = '字'.repeat(REPLY_WORD_LIMIT)
  const r = truncateWords(exact)
  assert.equal(r.truncated, false)
  assert.equal(r.text, exact)
})

test('over the limit the text is cut at the 100th word boundary and the cut is announced', () => {
  const over = Array.from({ length: REPLY_WORD_LIMIT + 20 }, (_, i) => 'w' + i).join(' ')
  const r = truncateWords(over)
  assert.equal(r.truncated, true)
  assert.ok(r.text.endsWith(TRUNCATION_NOTICE))
  assert.equal(wordCount(r.text.slice(0, -TRUNCATION_NOTICE.length)), REPLY_WORD_LIMIT)
  const mixed = '已完成修复，详见票据。' + 'and now many english words follow '.repeat(20)
  const r2 = truncateWords(mixed)
  assert.equal(r2.truncated, true)
  assert.ok(r2.text.startsWith('已完成修复，详见票据。'))
  assert.ok(r2.text.endsWith(TRUNCATION_NOTICE))
})
