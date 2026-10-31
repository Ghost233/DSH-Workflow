import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, cp, mkdir, mkdtemp, readFile, readlink, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sealSuperagentPayload } from './superagent-payload.mjs'
import { prepareSuperagentProfile } from './superagent-service.mjs'

test('Superagent profile keeps user settings when the sealed application moves', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dataRoot = join(root, 'data'), resources = join(root, 'first')
  await mkdir(dataRoot, { mode: 0o700 })
  await mkdir(join(resources, 'workflow/vendor'), { recursive: true })
  await copyFile(fileURLToPath(new URL('../../vendor/dsh-superagent.upstream.json', import.meta.url)),
    join(resources, 'workflow/vendor/dsh-superagent.upstream.json'))
  const pkg = join(resources, 'superagent/node_modules/dsh-superagent')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-superagent', version: '0.1.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  for (const name of ['cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/github-watch.js']) await writeFile(join(pkg, name), name)
  await sealSuperagentPayload(resources)
  const modules = join(resources, 'node_modules/@deepseek-ai')
  await mkdir(join(modules, 'dsh'), { recursive: true })
  await writeFile(join(modules, 'dsh/package.json'), '{}')
  await mkdir(join(modules, 'dsh-app-boot'))
  await writeFile(join(modules, 'dsh-app-boot/package.json'), JSON.stringify({ main: 'index.cjs' }))
  await writeFile(join(modules, 'dsh-app-boot/index.cjs'), `const fs = require('node:fs'), path = require('node:path');
exports.PROFILE_TEMPLATES = { web: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } };
exports.initProfile = (dir, bundles) => {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: {}, dsh: { profile: { bundles } } }));
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '[]');
};\n`)
  const first = await prepareSuperagentProfile({ dataRoot, resources })
  const patch = join(first.profile, 'cordis.patch.yml'), settings = '[{"id":"custom-user-setting"}]\n'
  await writeFile(patch, settings)
  await prepareSuperagentProfile({ dataRoot, resources })
  assert.equal(await readFile(patch, 'utf8'), settings)
  const moved = join(root, 'moved')
  await cp(resources, moved, { recursive: true })
  await prepareSuperagentProfile({ dataRoot, resources: moved })
  assert.equal(await readFile(patch, 'utf8'), settings)
  assert.equal(await readlink(join(first.directory, 'package')), join(moved, 'superagent/node_modules/dsh-superagent'))
  assert.equal((await readdir(join(first.directory, 'package-backups'))).length, 1)
  await writeFile(join(moved, 'superagent/node_modules/dsh-superagent/lib/client.js'), 'tampered')
  await assert.rejects(prepareSuperagentProfile({ dataRoot, resources: moved }), /sealed contents/)
  assert.equal(await readFile(patch, 'utf8'), settings)
})
