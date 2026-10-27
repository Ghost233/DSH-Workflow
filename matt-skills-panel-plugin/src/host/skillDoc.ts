// Resolve details through the same registry as the external Chinese skill provider.
declare const Buffer: { byteLength(value: string, encoding: string): number }
export function createSkillDoc({ ctx }: { ctx: { get(name: string): any } }) {
  const MAX_BYTES = 200000
  const missing = () => ({ ok: false, missing: true })
  const usable = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && Buffer.byteLength(value, 'utf8') <= MAX_BYTES
  const stripFrontmatter = (raw: string) => raw.replace(/^\uFEFF/, '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '')
  const formats: Record<string, string> = { 'GLOSSARY.md': 'GLOSSARY-FORMAT.md', 'GLOSSARY-MAP.md': 'GLOSSARY-FORMAT.md', 'MISSION.md': 'MISSION-FORMAT.md', 'RESOURCES.md': 'RESOURCES-FORMAT.md', '0001-event-sourced-orders.md': 'ADR-FORMAT.md', '0002-postgres-for-write-model.md': 'ADR-FORMAT.md' }
  const projectFiles = ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'CODING_STANDARDS.md', 'NOTES.md']
  type Ref = { skill: string; file: string; path: string }
  async function refsOf(skill: { name: string; path?: string }): Promise<Ref[]> {
    if (typeof skill.path !== 'string' || !skill.path.endsWith('/SKILL.md')) return []
    // @ts-expect-error Node runtime module; host typecheck omits Node types.
    const fs = await import('node:fs/promises')
    const directory = skill.path.slice(0, -8), refs: Ref[] = []
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      entries.sort((a: { name: string }, b: { name: string }) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const path = dir + entry.name
        if (entry.isDirectory()) await walk(path + '/')
        else if (entry.isFile() && /\.md$/i.test(entry.name) && !/\.zh\.md$/i.test(entry.name)) refs.push({ skill: skill.name, file: entry.name, path })
      }
    }
    try { await walk(directory) } catch { return [] }
    return refs
  }
  async function catalogRefs(skills: any, current: any, options: any): Promise<Ref[]> {
    const catalog = typeof skills.list === 'function' ? await skills.list(options) : [current]
    const rows = Array.isArray(catalog) ? catalog.filter((row: any) => row && typeof row.name === 'string') : []
    return (await Promise.all(rows.map((row: any) => refsOf(row.name === current.name ? current : row)))).flat()
  }
  async function readReference(args: any, skills: any, current: any, options: any) {
    if (typeof args.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(args.file)) return missing()
    const file = args.file
    if (projectFiles.includes(file)) return { ok: true, kind: 'project', name: file }
    const entries = await catalogRefs(skills, current, options)
    const refs = [...new Set([...projectFiles, ...Object.keys(formats), 'issue-tracker.md', ...entries.map(row => row.file)])]
    if (file === 'issue-tracker.md') {
      const names = ['issue-tracker-github.md', 'issue-tracker-gitlab.md', 'issue-tracker-local.md']
      const choices = entries.filter(row => names.includes(row.file))
      return choices.length ? { ok: true, kind: 'choose', name: file, options: choices.map(row => ({ skill: row.skill, file: row.file })), refs } : missing()
    }
    const target = formats[file] || file
    const hits = entries.filter((row, index) => row.file === target && entries.findIndex(other => other.file === target && other.skill === row.skill) === index)
    const local = hits.filter(row => row.skill === current.name), candidates = local.length ? local : hits
    if (!candidates.length) return missing()
    if (candidates.length > 1) return { ok: true, kind: 'choose', name: file, options: candidates.map(row => ({ skill: row.skill, file: row.file })), format: Boolean(formats[file]), refs }
    const selected = candidates[0]
    // @ts-expect-error Node runtime module; host typecheck omits Node types.
    const fs = await import('node:fs/promises')
    const raw = await fs.readFile(selected.path, 'utf8')
    const md = stripFrontmatter(raw)
    if (!usable(raw) || !usable(md)) return missing()
    let mdZh: string | null = null, pathZh: string | null = null
    if (selected.path.endsWith('/SKILL.md')) {
      try {
        const zhFile = selected.path.slice(0, -8) + 'SKILL.zh.md'
        const translated = await fs.readFile(zhFile, 'utf8')
        if (usable(translated) && usable(stripFrontmatter(translated))) { mdZh = stripFrontmatter(translated); pathZh = zhFile }
      } catch {}
    }
    return { ok: true, kind: formats[file] ? 'format' : 'file', name: file, file: target, skill: selected.skill, md, path: selected.path, mdZh, pathZh, refs }
  }
  async function readDoc(args: any) {
    const name = args && args.name
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) return missing()
    try {
      const skills = ctx.get('skills')
      if (!skills || typeof skills.get !== 'function') return { ok: false, missing: false }
      const cwd = typeof args.cwd === 'string' && args.cwd ? args.cwd : undefined
      const options = cwd ? { cwd } : undefined
      const skill = await skills.get(name, options)
      if (!skill || skill.name !== name || !usable(skill.content)) return missing()
      if (args.file !== undefined && args.file !== null) return await readReference(args, skills, skill, options)
      const md = stripFrontmatter(skill.content)
      if (!usable(md)) return missing()
      const file = typeof skill.path === 'string' ? skill.path : ''
      let mdZh: string | null = null, pathZh: string | null = null
      if (file.endsWith('/SKILL.md')) {
        try {
          const zhFile = file.slice(0, -8) + 'SKILL.zh.md'
          // @ts-expect-error Node runtime module; host typecheck omits Node types.
          const { readFile } = await import('node:fs/promises')
          const raw = await readFile(zhFile, 'utf8')
          if (usable(raw)) {
            const zh = stripFrontmatter(raw)
            if (usable(zh)) { mdZh = zh; pathZh = zhFile }
          }
        } catch {}
      }
      const refs = [...new Set([...projectFiles, ...Object.keys(formats), 'issue-tracker.md', ...(await catalogRefs(skills, skill, options)).map(row => row.file)])]
      return { ok: true, md, path: file, mdZh, pathZh, refs }
    } catch { return { ok: false, missing: false } }
  }
  return { readDoc }
}
