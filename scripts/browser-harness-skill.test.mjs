import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkBrowserHarnessUpstream, readPinnedBrowserHarness, stageBrowserHarnessSkills, verifyBrowserHarnessSkills } from '../browser-harness-plugin/build.mjs'
import { copyProjectIntegration, verifyProjectIntegration } from '../macos-launcher/project-resources.mjs'

test('the built-in skill carries the pinned original documents and rejects changed packaged bytes', async t => {
  const destination = await mkdtemp(join(tmpdir(), 'workflow-browser-skill-'))
  t.after(() => rm(destination, { recursive: true, force: true }))
  const root = resolve('.')
  const metadata = await stageBrowserHarnessSkills(root, destination)
  assert.equal(metadata.commit, 'c7bb3da435477494450aeb4b19a501fd04bb897d')
  assert.equal(metadata.version, '0.1.13')
  const skill = join(destination, 'browser-harness-plugin/skills/browser-harness/references/SKILL.md')
  assert.deepEqual(await readFile(skill), await readFile(join(root, 'browser-harness-plugin/pinned/vendor/browser-harness/SKILL.md')))
  assert.ok(metadata.files['interaction-skills/uploads.md'])
  await verifyBrowserHarnessSkills(destination)
  await writeFile(skill, 'different instructions')
  await assert.rejects(verifyBrowserHarnessSkills(destination), /SKILL.md/)
})

test('the normal project packager seals the Browser Harness skill and its source commit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const destination = join(root, 'workflow')
  const manifest = await copyProjectIntegration(resolve('.'), destination)
  assert.equal(manifest.input.browserHarness.commit, 'c7bb3da435477494450aeb4b19a501fd04bb897d')
  const metadata = await verifyBrowserHarnessSkills(destination)
  assert.ok(metadata.files['interaction-skills/iframes.md'])
  await verifyProjectIntegration(resolve('.'), destination)
})

test('fixed skill inputs reject a missing snapshot, a modified snapshot and a broken record', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-pin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const pinned = join(root, 'browser-harness-plugin/pinned')
  await mkdir(pinned, { recursive: true })
  await assert.rejects(readPinnedBrowserHarness(root), /baseline record/)
  await cp(join(resolve('.'), 'browser-harness-plugin/pinned'), pinned, { recursive: true })
  assert.equal((await readPinnedBrowserHarness(root)).commit, 'c7bb3da435477494450aeb4b19a501fd04bb897d')
  await rm(join(pinned, 'vendor/browser-harness/interaction-skills/uploads.md'))
  await assert.rejects(readPinnedBrowserHarness(root), /missing/)
  await writeFile(join(pinned, 'vendor/browser-harness/SKILL.md'), 'edited skill')
  await assert.rejects(readPinnedBrowserHarness(root), /differs/)
})

test('upstream checking reports changes and network failures without changing the pinned snapshot', async () => {
  const snapshotSkill = join(resolve('.'), 'browser-harness-plugin/pinned/vendor/browser-harness/SKILL.md')
  const before = await readFile(snapshotSkill)
  const requests = []
  const changed = await checkBrowserHarnessUpstream(resolve('.'), { fetch: async url => {
    requests.push(url)
    return Response.json(url.endsWith('commits/main')
      ? { sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } }
      : { truncated: false, tree: [{ type: 'blob', path: 'SKILL.md', sha: 'c'.repeat(40) }] })
  } })
  assert.equal(changed.state, 'update-available')
  assert.ok(changed.changed.includes('SKILL.md'))
  assert.equal(requests.length, 2)
  const failed = await checkBrowserHarnessUpstream(resolve('.'), { fetch: async () => { throw new Error('offline') } })
  assert.equal(failed.state, 'check-failed')
  assert.equal(failed.latest, null)
  assert.deepEqual(await readFile(snapshotSkill), before)
})
