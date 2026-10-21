// Resolve details through the same registry as the external Chinese skill provider.
declare const Buffer: { byteLength(value: string, encoding: string): number }
export function createSkillDoc({ ctx }: { ctx: { get(name: string): any } }) {
  const MAX_BYTES = 200000
  const missing = () => ({ ok: false, missing: true })
  const usable = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && Buffer.byteLength(value, 'utf8') <= MAX_BYTES
  const stripFrontmatter = (raw: string) => raw.replace(/^\uFEFF/, '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '')
  async function readDoc(args: any) {
    const name = args && args.name
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) return missing()
    try {
      const skills = ctx.get('skills')
      if (!skills || typeof skills.get !== 'function') return { ok: false, missing: false }
      const cwd = typeof args.cwd === 'string' && args.cwd ? args.cwd : undefined
      const skill = await skills.get(name, cwd ? { cwd } : undefined)
      if (!skill || skill.name !== name || !usable(skill.content)) return missing()
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
      return { ok: true, md, path: file, mdZh, pathZh }
    } catch { return { ok: false, missing: false } }
  }
  return { readDoc }
}
