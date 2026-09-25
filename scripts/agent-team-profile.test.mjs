import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureAgentTeamProfile } from './agent-team-profile.mjs'

const host = '@deepseek-ai/dsh-experimental-agent-team-profile'
const web = '@deepseek-ai/dsh-experimental-agent-team-web-profile'
const version = '0.1.7-rc.2'
const writeJson = (path, value) => writeFile(path, JSON.stringify(value))

test('daily activation replaces the retired Web layer with the combined official bundle once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-team-profile-'))
  const harness = join(root, 'harness'), home = join(root, 'home')
  const profile = join(home, 'profiles/web'), manifestPath = join(profile, 'package.json')
  const original = { name: 'dsh-profile-web', private: true, dependencies: { 'another-plugin': '1.0.0', [web]: '0.1.6-alpha.1' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'another-plugin', web] } } }
  try {
    await mkdir(join(harness, 'apps/cli'), { recursive: true })
    await mkdir(join(harness, 'packages/experimental/agent-team-profile'), { recursive: true })
    await writeJson(join(harness, 'packages/experimental/agent-team-profile/package.json'), { version })
    await mkdir(profile, { recursive: true })
    await writeJson(join(harness, 'apps/cli/package.json'), { version })
    await writeJson(manifestPath, original)
    const added = [], removed = []
    const remove = async ({ name }) => {
      removed.push(name)
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      delete manifest.dependencies[name]
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(item => item !== name)
      await writeJson(manifestPath, manifest)
    }
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
    await ensureAgentTeamProfile({ harness, home, add, remove })
    await ensureAgentTeamProfile({ harness, home, add, remove })
    assert.deepEqual(removed, [web])
    assert.deepEqual(added, [host])
    const result = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.deepEqual(result.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'another-plugin', host])
    assert.equal(result.dependencies['another-plugin'], '1.0.0')
  } finally { await rm(root, { recursive: true, force: true }) }
})
