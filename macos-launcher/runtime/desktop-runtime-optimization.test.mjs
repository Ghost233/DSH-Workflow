import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureDesktopZod, verifyDesktopZod } from '../desktop-runtime-optimization.mjs'

const semver = {
  valid: value => /^\d+\.\d+\.\d+$/.test(value) ? value : null,
  satisfies: (version, range) => version === '4.4.3' && ['4.4.3', '^4.4.3'].includes(range),
}

test('desktop build adds one exact override without discarding upstream overrides', async t => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-zod-workspace-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'pnpm-workspace.yaml')
  await writeFile(file, 'packages:\n  - .\n\noverrides:\n  "@deepseek-ai/dsh": "file:core.tgz"\nnodeLinker: hoisted\n')
  await configureDesktopZod(file, '4.4.3', semver)
  const text = await readFile(file, 'utf8')
  assert.match(text, /"zod": "4\.4\.3"/)
  assert.match(text, /"@deepseek-ai\/dsh": "file:core\.tgz"/)
  await assert.rejects(configureDesktopZod(file, '4.4.3', semver), /changed/)
  await assert.rejects(configureDesktopZod(file, '^4.4.3', semver), /exact/)
})

test('desktop build rejects duplicate or incompatible zod before sealing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-zod-audit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const modules = join(root, 'node_modules')
  const add = async (dir, manifest) => {
    await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'package.json'), JSON.stringify(manifest))
  }
  await add(join(modules, 'zod'), { name: 'zod', version: '4.4.3' })
  await add(join(modules, 'a'), { name: 'a', dependencies: { zod: '4.4.3' } })
  await add(join(modules, 'b'), { name: 'b', peerDependencies: { zod: '^4.4.3' } })
  await add(join(modules, 'b/node_modules/zod'), { name: 'zod', version: '4.6.7' })
  await assert.rejects(verifyDesktopZod(modules, '4.4.3', semver), /shared zod/)
  await rm(join(modules, 'b'), { recursive: true })
  await add(join(modules, 'c'), { name: 'c', peerDependencies: { zod: '^4.4.3' } })
  assert.equal(await verifyDesktopZod(modules, '4.4.3', semver), 2)
  await add(join(modules, 'd'), { name: 'd', dependencies: { zod: '^3.0.0' } })
  await assert.rejects(verifyDesktopZod(modules, '4.4.3', semver), /incompatible zod/)
})
