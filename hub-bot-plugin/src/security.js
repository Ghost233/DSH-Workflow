/**
 * 危险命令黑名单 (spec「Policy」注入会话无审批的安全兜底 + #73 设置页): 经插件注入链路的会话无人值守
 * 执行命令、不弹审批, 兜底 = 白名单 + 授权记录可追溯 + 本黑名单。命中即不直接注入 —— 票转 person/confirm
 * (先存后做: 原文与命中模式落票面), 用户确认后才注入 (复用 #69 确认链), 拒绝则票转 blocked 永不注入。
 *
 * 匹配规则刻意简单: 大小写不敏感的子串匹配。清单配置可扩展 (config.security.dangerousPatterns),
 * 面板设置页可编辑。宁缺毋滥 —— 清单只列灾难级别模式, 误报代价是一次确认, 漏报代价是不可逆破坏。
 */

/** The pendingConfirm.action.type marking a held dangerous injection (#73 补足). */
export const DANGEROUS_INJECT_ACTION = 'dangerous-inject'

/**
 * 默认清单: spec 点名 rm -rf / mkfs / 磁盘写类, 加提权与强推。子串匹配, 大小写不敏感。
 * 'sudo ' 带尾空格避免误伤 "sudoers" 等词; 'chmod -r 777' 经小写化同时覆盖 -R。
 */
export const DEFAULT_DANGEROUS_PATTERNS = [
  'rm -rf',
  'rm -fr',
  'sudo ',
  'git push --force',
  'git push -f',
  'mkfs',
  'dd of=/dev',
  'chmod -r 777',
  '> /dev/sd',
  ':(){',
]

/**
 * Returns the first blacklist pattern found in text (case-insensitive substring), or null.
 * @param {unknown} text
 * @param {readonly string[] | null | undefined} patterns - resolved config list; empty/null disables the net.
 */
export function findDangerousPattern(text, patterns = DEFAULT_DANGEROUS_PATTERNS) {
  if (typeof text !== 'string' || !text || !Array.isArray(patterns)) return null
  const lower = text.toLowerCase()
  for (const pattern of patterns) {
    if (typeof pattern === 'string' && pattern && lower.includes(pattern.toLowerCase())) return pattern
  }
  return null
}

/** 确认文本由代码构建 — 指明命中模式与原文去向, 不让模型自由发挥 (同 fork.js 纪律). */
export function dangerousConfirmText(pattern, excerpt) {
  const shown = typeof excerpt === 'string' && excerpt.length > 200 ? excerpt.slice(0, 200) + '…' : (excerpt ?? '')
  return '命中危险命令黑名单（模式 "' + pattern + '"）：「' + shown + '」——注入会话无人值守执行命令,'
    + ' 确认后才注入；拒绝则任务转被卡住。'
}

/** Validates a dangerousPatterns value (config 与面板补丁共用): an array of non-empty strings, trimmed. */
export function validateDangerousPatterns(value, label, ErrorClass = Error) {
  const bad = () => new ErrorClass(label + '.dangerousPatterns must be an array of non-empty strings')
  if (!Array.isArray(value)) throw bad()
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) throw bad()
  }
  return value.map(item => item.trim())
}
