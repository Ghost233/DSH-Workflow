import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('the Chinese source is pinned to Ghost233 and retro requires explicit invocation', () => {
  const source = JSON.parse(readFileSync(new URL('../vendor/mattpocock-skills-zh.upstream.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json', import.meta.url), 'utf8'))
  assert.equal(source.repository, 'https://github.com/Ghost233/ghost-agent-market')
  assert.equal(source.repository, manifest.repository)
  assert.match(source.commit, /^[a-f0-9]{40}$/)
  assert.equal(source.version, manifest.version)
  assert.doesNotMatch(readFileSync(new URL('../.gitmodules', import.meta.url), 'utf8'), /ghost-agent-market|upstream\/mattpocock-skills/)
  assert.match(readFileSync(new URL('../vendor/mattpocock-skills-zh/skills/retro/SKILL.md', import.meta.url), 'utf8'), /仅在用户明确调用时使用/)
  assert.match(readFileSync(new URL('../vendor/mattpocock-skills-zh/skills/retro/agents/openai.yaml', import.meta.url), 'utf8'), /allow_implicit_invocation: false/)
})
