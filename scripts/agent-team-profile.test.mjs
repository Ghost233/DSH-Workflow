import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureAgentTeamProfile } from './agent-team-profile.mjs'

const host = '@deepseek-ai/dsh-experimental-agent-team-profile'
const web = '@deepseek-ai/dsh-experimental-agent-team-web-profile'
const version = '0.1.6-alpha.1'
const writeJson = (path, value) => writeFile(path, JSON.stringify(value))

test('daily activation adds the two official layers once, in order, without changing other Web-profile choices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-team-profile-'))
  const harness = join(root, 'harness'), home = join(root, 'home')
  const profile = join(home, 'profiles/web'), manifestPath = join(profile, 'package.json')
  const original = { name: 'dsh-profile-web', private: true, dependencies: { 'another-plugin': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'another-plugin'] } } }
  try {
    await mkdir(join(harness, 'apps/cli'), { recursive: true })
    for (const directory of ['agent-team-profile', 'agent-team-web-profile']) {
      await mkdir(join(harness, 'packages/experimental', directory), { recursive: true })
      await writeJson(join(harness, 'packages/experimental', directory, 'package.json'), { version })
    }
    await mkdir(profile, { recursive: true })
    await writeJson(join(harness, 'apps/cli/package.json'), { version })
    await writeJson(manifestPath, original)
    const added = []
    const add = async ({ name, version: requested }) => {
      added.push(name)
      assert.equal(requested, version)
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      manifest.dependencies[name] = requested
      manifest.dsh.profile.bundles.push(name)
      await writeJson(manifestPath, manifest)
      const directory = join(profile, 'node_modules', name)
      await mkdir(directory, { recursive: true })
      await writeJson(join(directory, 'package.json'), { name, version: requested })
    }
    await ensureAgentTeamProfile({ harness, home, add })
    await ensureAgentTeamProfile({ harness, home, add })
    assert.deepEqual(added, [host, web])
    const result = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.deepEqual(result.dsh.profile.bundles, [...original.dsh.profile.bundles, host, web])
    assert.equal(result.dependencies['another-plugin'], '1.0.0')
  } finally { await rm(root, { recursive: true, force: true }) }
})
