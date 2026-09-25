import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

/** Keep SoL in the editable Web profile instead of a command-line overlay. */
export async function ensureSolProfileEntry({ anchor, home }) {
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const { entryListSchema } = require('@deepseek-ai/cordis-plugin-include')
  const yaml = require('js-yaml')
  const profile = boot.loadProfile('dsh', 'web', anchor, home)
  const patchPath = profile.patchPath
  await withFileLock(join(profile.dir, 'package.json'), async () => {
    const current = boot.loadProfile('dsh', 'web', anchor, home)
    const layers = current.layers.map(layer => layer.patches)
    const rows = flatten(boot.composeEntries([...layers, current.patches]))
    const active = rows.filter(row => row.name === 'dsh-sol-efficiency' && row.disabled !== true)
    if (active.length > 1) throw new Error('Web profile contains duplicate active SoL entries')
    if (active.length === 1) return
    if (rows.some(row => row.id === 'sol-efficiency')) throw new Error('Web profile already uses the sol-efficiency entry ID')
    const before = await readFile(patchPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '[]\n'
      throw error
    })
    const insert = '- insert:\n    - id: sol-efficiency\n      name: dsh-sol-efficiency\n'
    const next = current.patches.length === 0 && /^\[\][ \t]*$/m.test(before)
      ? before.replace(/^\[\][ \t]*$/m, insert.trimEnd())
      : `${before}${before.endsWith('\n') ? '' : '\n'}${insert}`
    const patches = yaml.load(next, { schema: entryListSchema })
    if (!Array.isArray(patches)) throw new Error('Web profile patch must remain a sequence')
    const configured = flatten(boot.composeEntries([...layers, patches]))
    if (configured.filter(row => row.id === 'sol-efficiency' && row.name === 'dsh-sol-efficiency' && row.disabled !== true).length !== 1) {
      throw new Error('Web profile cannot activate its SoL entry')
    }
    await writeFileAtomic(patchPath, next, { mode: 0o600 })
  })
}
