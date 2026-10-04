import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBootstrap } from '../vendor/dsh-mattpocock-skills-deck/package/lib/bootstrap.js'

test('local Matt board keeps its panel package without registering bundled skills', async () => {
  const packageRoot = fileURLToPath(new URL('../vendor/dsh-mattpocock-skills-deck/package/', import.meta.url))
  const require = createRequire(join(packageRoot, 'package.json'))
  assert.match(require.resolve('dsh-mattpocock-skills-deck'), /vendor\/dsh-mattpocock-skills-deck\/package\/lib\/index\.js$/)
  assert.match(require.resolve('dsh-mattpocock-skills-deck/client'), /vendor\/dsh-mattpocock-skills-deck\/package\/lib\/client\.js$/)
  assert.equal(existsSync(join(packageRoot, 'bundled-skills')), false)
  let registered = 0
  const boot = createBootstrap({ ctx: { get: () => ({ registerProvider() { registered++ } }) } })
  assert.equal((await boot.getMattSkillProbeNames()).length, 26)
  assert.ok((await boot.getMattSkillProbeNames()).includes('implement-spec'))
  assert.equal(registered, 0)
})
