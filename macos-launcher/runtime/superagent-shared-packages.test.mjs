import test from 'node:test'
import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncSuperagentPackages } from './superagent-shared-packages.mjs'

test('shares daily plugin packages without replacing an existing foreign Superagent package', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-packages-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const daily = join(root, 'daily'), target = join(root, 'superagent'), resources = join(root, 'resources')
  for (const path of [daily, target]) await mkdir(join(path, 'node_modules'), { recursive: true })
  await mkdir(join(daily, 'node_modules/plugin-a'))
  await writeFile(join(daily, 'node_modules/plugin-a/package.json'), JSON.stringify({ name: 'plugin-a', version: '1.0.0' }))
  await mkdir(join(daily, 'node_modules/plugin-b'))
  await writeFile(join(daily, 'node_modules/plugin-b/package.json'), JSON.stringify({ name: 'plugin-b', version: '1.0.0' }))
  await mkdir(join(target, 'node_modules/plugin-b'))
  await writeFile(join(target, 'node_modules/plugin-b/user-data'), 'preserve')
  const original = JSON.stringify({ dependencies: { 'plugin-a': '1.0.0', 'plugin-b': '1.0.0' } })
  await writeFile(join(daily, 'package.json'), original)
  await writeFile(join(target, 'package.json'), JSON.stringify({ dependencies: { 'dsh-superagent': 'link:owned' } }))
  const result = await syncSuperagentPackages({ daily, profile: target, resources, packages: ['plugin-a', 'plugin-b'] })
  assert.equal(await readlink(join(target, 'node_modules/plugin-a')), join(daily, 'node_modules/plugin-a'))
  assert.equal(await readFile(join(target, 'node_modules/plugin-b/user-data'), 'utf8'), 'preserve')
  assert.deepEqual(result.skipped.map(row => row.package), ['plugin-b'])
  assert.equal(await readFile(join(daily, 'package.json'), 'utf8'), original)
})

test('does not follow an existing scoped-package link into another directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-package-link-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const daily = join(root, 'daily'), profile = join(root, 'superagent'), foreign = join(root, 'foreign')
  await mkdir(join(daily, 'node_modules/@scope/plugin'), { recursive: true })
  await writeFile(join(daily, 'node_modules/@scope/plugin/package.json'), JSON.stringify({ name: '@scope/plugin', version: '1.0.0' }))
  await mkdir(join(profile, 'node_modules'), { recursive: true }); await mkdir(foreign)
  await symlink(foreign, join(profile, 'node_modules/@scope'))
  await writeFile(join(daily, 'package.json'), JSON.stringify({ dependencies: { '@scope/plugin': '1.0.0' } }))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: {} }))
  const result = await syncSuperagentPackages({ daily, profile, packages: ['@scope/plugin'] })
  assert.equal(result.skipped[0].package, '@scope/plugin')
  await assert.rejects(lstat(join(foreign, 'plugin')), { code: 'ENOENT' })
})


test('a stale daily package link is reported without installing it or changing the daily profile', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-stale-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const daily = join(root, 'daily'), profile = join(root, 'profile')
  for (const directory of [daily, profile]) await mkdir(join(directory, 'node_modules'), { recursive: true })
  const manifest = JSON.stringify({ dependencies: { 'old-plugin': '1.0.0' } })
  await writeFile(join(daily, 'package.json'), manifest)
  await writeFile(join(profile, 'package.json'), '{}')
  await symlink(join(root, 'old-app/node_modules/old-plugin'), join(daily, 'node_modules/old-plugin'))
  const result = await syncSuperagentPackages({ daily, profile, packages: ['old-plugin'] })
  assert.deepEqual(result.skipped, [{ package: 'old-plugin', reason: '日常配置仍引用此插件，但包文件缺失或链接已失效' }])
  assert.equal(await readFile(join(daily, 'package.json'), 'utf8'), manifest)
  await assert.rejects(lstat(join(profile, 'node_modules/old-plugin')), { code: 'ENOENT' })
})
