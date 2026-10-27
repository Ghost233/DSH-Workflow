import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillDoc } from '../src/host/skillDoc.js'

test('skill file previews use the workspace registry and keep references within its skill directories', async t => {
  const root = await mkdtemp(join(tmpdir(), 'matt-skill-refs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workspace = '/work/Project\\', calls = [], rows = []
  for (const name of ['research', 'code-review']) {
    const path = join(root, name, 'SKILL.md')
    await mkdir(join(root, name, 'references'), { recursive: true })
    await writeFile(path, '# ' + name)
    await writeFile(join(root, name, 'references', 'format.md'), name + ' local reference')
    rows.push({ name, path, content: '# ' + name })
  }
  await writeFile(join(root, 'outside.md'), 'outside skill directory')
  await writeFile(join(root, 'code-review', 'references', 'guide.md'), 'shared guide')
  await symlink(join(root, 'outside.md'), join(root, 'research', 'escape.md'))
  const registry = {
    get: async (name, options) => { calls.push(options.cwd); return rows.find(row => row.name === name) },
    list: async options => { calls.push(options.cwd); return rows },
  }
  const doc = createSkillDoc({ ctx: { get: () => registry } })
  const detail = await doc.readDoc({ name: 'research', cwd: workspace })
  assert.ok(detail.refs.includes('format.md'))
  assert.ok(detail.refs.includes('guide.md'))
  assert.ok(!detail.refs.includes('escape.md'))
  const result = await doc.readDoc({ name: 'research', file: 'format.md', cwd: workspace })
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'file')
  assert.equal(result.md, 'research local reference')
  assert.equal(result.path, join(root, 'research', 'references', 'format.md'))
  const shared = await doc.readDoc({ name: 'research', file: 'guide.md', cwd: workspace })
  assert.equal(shared.md, 'shared guide')
  assert.equal(shared.skill, 'code-review')
  for (const file of ['../outside.md', '/outside.md', 'escape.md', 'references/format.md']) {
    assert.deepEqual(await doc.readDoc({ name: 'research', file, cwd: workspace }), { ok: false, missing: true })
  }
  assert.ok(calls.every(value => value === workspace))
  assert.equal((await doc.readDoc({ name: 'research', file: 'AGENTS.md', cwd: workspace })).kind, 'project')
})

test('repeated reference basenames within one provider skill resolve without a chooser loop and retain its translation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'matt-skill-duplicate-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'SKILL.md'), skill = { name: 'research', path, content: '# Research' }
  await writeFile(path, skill.content)
  await writeFile(join(root, 'SKILL.zh.md'), '# 中文译文')
  for (const directory of ['a', 'b']) {
    await mkdir(join(root, directory))
    await writeFile(join(root, directory, 'format.md'), directory + ' reference')
  }
  const registry = { get: async () => skill, list: async () => [skill] }
  const doc = createSkillDoc({ ctx: { get: () => registry } })
  const reference = await doc.readDoc({ name: 'research', file: 'format.md' })
  const translated = await doc.readDoc({ name: 'research', file: 'SKILL.md' })
  assert.deepEqual({ kind: reference.kind, md: reference.md, mdZh: translated.mdZh, pathZh: translated.pathZh },
    { kind: 'file', md: 'a reference', mdZh: '# 中文译文', pathZh: join(root, 'SKILL.zh.md') })
})
