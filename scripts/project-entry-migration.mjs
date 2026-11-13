import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Migrate owned declarations and their name guards; `name` is not a rename patch. */
export async function migrateProjectEntryNames({ profile, anchor, projectRoot = fileURLToPath(new URL('../', import.meta.url)), previousProjectRoot }) {
  const require = createRequire(anchor), boot = require('@deepseek-ai/dsh-app-boot')
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const base = boot.resolveBundleDir('dsh', '@deepseek-ai/dsh-base', anchor, profile.dir)
  const yaml = createRequire(createRequire(join(base, 'package.json')).resolve('@deepseek-ai/dsh-config-editor/package.json'))('yaml')
  const names = new Map([
    ['matt-skills-board', pathToFileURL(join(projectRoot, 'matt-skills-panel-plugin/package/lib/index.js')).href],
    ['matt-panel-tools', pathToFileURL(join(projectRoot, 'matt-skills-panel-plugin/package/deck/registration/agent-row.js')).href],
    ['mattpocock-skills-zh', '@deepseek-ai/dsh-skill-filesystem'],
    ['workflow-browser-harness', pathToFileURL(join(projectRoot, 'browser-harness-plugin/index.mjs')).href],
  ])
  const packagedSkillDirectories = new Map([
    ['mattpocock-skills-zh', 'vendor/mattpocock-skills-zh/skills'],
    ['workflow-browser-harness-skills', 'browser-harness-plugin/skills'],
    ['dsh-workflow-gh-account', 'skills'],
    ['dsh-workflow-skills', 'vendor/dsh-skills/skills'],
  ])
  return withFileLock(join(profile.dir, 'package.json'), async () => {
    let changed = false
    for (const path of [join(profile.dir, 'cordis.yml'), profile.patchPath]) {
      const before = await readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
      if (before === undefined) continue
      const document = yaml.parseDocument(before, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
      if (document.errors[0]) throw document.errors[0]
      if (!yaml.isSeq(document.contents)) throw new Error('Profile entries and patches must be YAML sequences')
      let edited = false
      const visit = sequence => {
        if (!yaml.isSeq(sequence)) return
        for (const row of sequence.items) {
          if (!yaml.isMap(row)) continue
          const id = row.get('id')
          const name = names.get(id)
          if (name && row.has('name') && row.get('name') !== name) {
            if (row.get('group') === true) throw new Error(`Project entry conflicts with group: ${row.get('id')}`)
            row.set('name', name); edited = true
          }
          const skillDirectory = packagedSkillDirectories.get(id)
          if (skillDirectory && previousProjectRoot && previousProjectRoot !== projectRoot) {
            const config = row.get('config', true)
            const directories = yaml.isMap(config) && config.get('customSkillDirs', true)
            if (yaml.isSeq(directories)) directories.items.forEach((item, index) => {
              if (yaml.isScalar(item) && item.value === join(previousProjectRoot, skillDirectory)) {
                directories.set(index, join(projectRoot, skillDirectory)); edited = true
              }
            })
          }
          visit(row.get('insert', true))
          if (row.get('group') === true) visit(row.get('config', true))
        }
      }
      visit(document.contents)
      if (edited) { await writeFileAtomic(path, String(document), { mode: 0o600 }); changed = true }
    }
    return changed
  })
}
