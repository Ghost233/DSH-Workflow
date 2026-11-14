/**
 * Message discipline (spec「消息纪律」+ issue #66): an outward reply is hard-limited to 100 words; anything
 * longer is truncated BY CODE and the truncation is announced. Counting is deterministic and language-neutral:
 * one CJK character counts as one word; one latin/digit run counts as one word.
 */

/** The hard limit for an outward reply (spec: 默认一句话，硬限 100 词）. */
export const REPLY_WORD_LIMIT = 100

/** The announcement appended to a truncated reply (spec: 超限时必须提示）. */
export const TRUNCATION_NOTICE = '…（超过 100 词已截断）'

const TOKEN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[A-Za-z0-9_'-]+/gu

/** The deterministic word count of a text (CJK char = 1 word, latin run = 1 word). */
export function wordCount(text) {
  return String(text).match(TOKEN)?.length ?? 0
}

/**
 * Truncates text to the word limit. Returns { text, truncated } — truncated text ends with TRUNCATION_NOTICE
 * and keeps exactly REPLY_WORD_LIMIT words before the notice.
 */
export function truncateWords(text, limit = REPLY_WORD_LIMIT) {
  const tokens = [...String(text).matchAll(TOKEN)]
  if (tokens.length <= limit) return { text: String(text), truncated: false }
  const cut = tokens[limit - 1].index + tokens[limit - 1][0].length
  return { text: String(text).slice(0, cut) + TRUNCATION_NOTICE, truncated: true }
}
