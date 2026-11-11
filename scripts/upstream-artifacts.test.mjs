import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readArtifactSet } from './upstream-artifacts.mjs'

test('source artifact sets require the exact source revision and reject changed tarballs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-artifacts-')), output = join(root, 'output'), pkg = join(root, 'package')
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(output); await mkdir(pkg)
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@fixture/product', version: '1.0.0-local.1', dsh: { bundle: { patch: './cordis.yml' } } }))
  await promisify(execFile)('tar', ['-czf', join(output, 'product.tgz'), '-C', root, 'package'])
  const bytes = await readFile(join(output, 'product.tgz')), commit = 'a'.repeat(40)
  await writeFile(join(output, 'artifacts.json'), JSON.stringify({ productVersion: '1.0.0-local.1', dsh: '0.2.2-rc.1', artifacts: [
    { name: '@fixture/product', version: '1.0.0-local.1', filename: 'product.tgz', integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` },
  ] }))
  await writeFile(join(output, 'release-plan.json'), JSON.stringify({ sourceSha: commit, sourceDirty: false }))
  const item = { package: '@fixture/product', version: '1.0.0-local.1', commit, artifactSet: 'output/artifacts.json' }
  const set = await readArtifactSet(root, item)
  assert.equal(set.entries[0].manifest.name, '@fixture/product')
  await assert.rejects(readArtifactSet(root, { ...item, commit: 'b'.repeat(40) }), /source/)
  await writeFile(join(output, 'product.tgz'), 'changed')
  await assert.rejects(readArtifactSet(root, item), /integrity/)
})
