import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sealSuperagentPayload, verifySuperagentPayload } from './superagent-payload.mjs'

test('Superagent delivery preserves the pinned source and detects altered runtime files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-payload-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'workflow/vendor'), { recursive: true })
  await copyFile(fileURLToPath(new URL('../../vendor/dsh-superagent.upstream.json', import.meta.url)),
    join(root, 'workflow/vendor/dsh-superagent.upstream.json'))
  const pkg = join(root, 'superagent/node_modules/dsh-superagent')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-superagent', version: '0.1.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  for (const item of ['cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/github-watch.js']) await writeFile(join(pkg, item), item)
  const sealed = await sealSuperagentPayload(root)
  assert.equal(sealed.source.commit, '6337fc823ce20251c8de8085948165c81aaa701e')
  await writeFile(join(pkg, 'lib/client.js'), 'changed')
  await assert.rejects(verifySuperagentPayload(root), /sealed contents/)
})
