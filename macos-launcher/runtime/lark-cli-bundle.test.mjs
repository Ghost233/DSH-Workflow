import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleLarkCli } from '../bundle-lark-cli.mjs'

const digest = data => createHash('sha256').update(data).digest('hex')

test('bundles only the exact pinned official CLI bytes and refuses tampering', async t => {
  const root = await mkdtemp(join(tmpdir(), 'lark-bundle-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), resources = join(root, 'resources'), archive = join(root, 'fixture.tar.gz')
  await mkdir(source); await mkdir(join(resources, 'workflow/vendor'), { recursive: true }); await mkdir(join(resources, 'bin'))
  await writeFile(join(source, 'lark-cli'), 'fixture executable\n')
  await writeFile(join(source, 'LICENSE'), 'fixture license\n')
  execFileSync('/usr/bin/tar', ['-czf', archive, '-C', source, 'lark-cli', 'LICENSE'])
  const pin = { repository: 'https://github.com/larksuite/cli', version: '1.0.90', archive: 'lark-cli-1.0.90-darwin-arm64.tar.gz',
    archiveSha256: digest(await readFile(archive)), binarySha256: digest(await readFile(join(source, 'lark-cli'))) }
  await writeFile(join(resources, 'workflow/vendor/lark-cli.upstream.json'), JSON.stringify(pin))
  await bundleLarkCli({ resourcesRoot: resources, download: async (_url, path) => copyFile(archive, path) })
  assert.equal(await readFile(join(resources, 'bin/lark-cli'), 'utf8'), 'fixture executable\n')
  assert.equal(await readFile(join(resources, 'licenses/lark-cli-LICENSE.txt'), 'utf8'), 'fixture license\n')
  await rm(join(resources, 'bin/lark-cli'))
  pin.archiveSha256 = '0'.repeat(64)
  await writeFile(join(resources, 'workflow/vendor/lark-cli.upstream.json'), JSON.stringify(pin))
  await assert.rejects(bundleLarkCli({ resourcesRoot: resources, download: async (_url, path) => copyFile(archive, path) }), /SHA256/)
  await assert.rejects(readFile(join(resources, 'bin/lark-cli')), { code: 'ENOENT' })
})
