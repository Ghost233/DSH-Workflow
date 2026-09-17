import { realpath } from 'node:fs/promises'
import { join, relative, isAbsolute, sep, dirname, resolve } from 'node:path'

const contains = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) }
const overlaps = (a, b) => contains(a, b) || contains(b, a)

// A retired command's private files remain reserved even after its task moves
// on. Historical receipts remain readable even though new dependency-specific
// retirement can no longer be created.
export async function assertRetainedPathAvailable(state, path) {
  const requested = resolve(path)
  let ancestor = requested, suffix = []
  while (true) {
    try { ancestor = await realpath(ancestor); break }
    catch (error) {
      if (error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error
      suffix.unshift(ancestor.slice(dirname(ancestor).length + 1)); ancestor = dirname(ancestor)
    }
  }
  const canonical = join(ancestor, ...suffix)
  for (const workflow of Object.values(state.workflows)) for (const attempt of Object.values(workflow.attempts)) {
    if (!attempt.quarantined || !attempt.sourceAuthorityRetirement) continue
    for (const command of attempt.sourceAuthorityRetirement.commands) {
      if ([requested, canonical].some(root => overlaps(root, command.cwd))) {
        throw Object.assign(new Error('Path remains reserved by an isolated command with unconfirmed termination'), {
          code: 'EXECUTION_UNCONFIRMED', commandId: command.commandId,
        })
      }
    }
  }
}
