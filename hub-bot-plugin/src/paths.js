/**
 * Path guards (双轴审查 P2: extracted from tasks.js — a path utility is not lifecycle domain).
 */

/** True when candidate equals root or lies inside it (path-segment aware: /a/b does not contain /a/bc). */
export function isWithinCwd(root, candidate) {
  if (typeof root !== 'string' || typeof candidate !== 'string' || !root || !candidate) return false
  const base = root.endsWith('/') ? root.slice(0, -1) : root
  return candidate === base || candidate.startsWith(base + '/')
}
