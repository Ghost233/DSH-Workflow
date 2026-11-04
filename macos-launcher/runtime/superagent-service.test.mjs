import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readlink, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { sealSuperagentPayload } from './superagent-payload.mjs'
import { prepareSuperagentProfile, superagentSocket } from './superagent-service.mjs'
import { createSuperagentProject } from './superagent-projects.mjs'
import { webProfileBundles } from './profile-templates.mjs'

test('Web profile templates use the installed DSH public export', () => {
  const old = { PROFILE_TEMPLATES: { web: { bundles: ['old'] } } }
  assert.deepEqual(webProfileBundles(() => assert.fail('old DSH needs no separate package'), old), ['old'])
  assert.deepEqual(webProfileBundles(name => {
    assert.equal(name, '@deepseek-ai/dsh-official-bundles')
    return { PROFILE_TEMPLATES: { web: { bundles: ['new'] } } }
  }, {}), ['new'])
})

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
exports.initProfile = (dir, bundles) => {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: {}, dsh: { profile: { bundles } } }));
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '[]');
};\n`)
  await mkdir(join(modules, 'dsh-official-bundles'))
  await writeFile(join(modules, 'dsh-official-bundles/package.json'), JSON.stringify({ main: 'index.cjs' }))
  await writeFile(join(modules, 'dsh-official-bundles/index.cjs'),
    `exports.PROFILE_TEMPLATES = { web: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } };\n`)
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
  const projectA = await createSuperagentProject(dataRoot, { name: 'A' })
  const projectB = await createSuperagentProject(dataRoot, { name: 'B' })
  const a = await prepareSuperagentProfile({ dataRoot, resources: moved, projectId: projectA.id, port: 31821 })
  const b = await prepareSuperagentProfile({ dataRoot, resources: moved, projectId: projectB.id, port: 31822 })
  assert.notEqual(a.directory, b.directory)
  assert.notEqual(superagentSocket(dataRoot, projectA.id), superagentSocket(dataRoot, projectB.id))
  assert.equal(JSON.parse(await readFile(join(a.profile, 'cordis.patch.yml'), 'utf8'))[0].config.port, 31821)
  assert.equal(JSON.parse(await readFile(join(b.profile, 'cordis.patch.yml'), 'utf8'))[0].config.port, 31822)
  assert.equal(await readFile(patch, 'utf8'), settings)
  await writeFile(join(moved, 'superagent/node_modules/dsh-superagent/lib/client.js'), 'tampered')
  await assert.rejects(prepareSuperagentProfile({ dataRoot, resources: moved }), /sealed contents/)
  assert.equal(await readFile(patch, 'utf8'), settings)
})

test('does not silently start an old manager without model sharing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-old-manager-'))
  const dataRoot = join(root, 'data'); await mkdir(dataRoot, { mode: 0o700 })
  const socket = superagentSocket(dataRoot), socketDirectory = dirname(socket)
  await mkdir(socketDirectory, { mode: 0o700 })
  const server = createServer(connection => {
    connection.once('data', () => connection.end(JSON.stringify({ ok: true, value: {
      protocol: 1, service: { state: 'stopped', ready: false }, logs: [],
    } }) + '\n'))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve) })
  await chmod(socket, 0o600)
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(socketDirectory, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)), 'start', dataRoot, root, join(root, 'home')])
  let out = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { out += chunk })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  assert.equal(code, 1)
  const result = JSON.parse(out); assert.equal(result.ok, false); assert.match(result.error, /旧版 Superagent/)
})

test('does not start a project with writable directories through an older manager', async t => {
  const root = await mkdtemp('/private/tmp/superagent-old-sandbox-manager-')
  const dataRoot = join(root, 'data'), cache = join(root, 'cache')
  await mkdir(dataRoot, { mode: 0o700 }); await mkdir(cache)
  const project = await createSuperagentProject(dataRoot, { name: 'A', extraWritableRoots: [cache] })
  const socket = superagentSocket(dataRoot, project.id), socketDirectory = dirname(socket)
  await mkdir(socketDirectory, { mode: 0o700 })
  const requests = []
  let version = 2
  const server = createServer(connection => connection.once('data', bytes => {
    requests.push(JSON.parse(bytes.toString()).type)
    connection.end(JSON.stringify({ ok: true, value: { protocol: 1, superagentVersion: version,
      projectId: project.id, service: { state: 'stopped', pid: null } } }) + '\n')
  }))
  await new Promise(resolve => server.listen(socket, resolve)); await chmod(socket, 0o600)
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(socketDirectory, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  for (const oldVersion of [2, 3]) {
    version = oldVersion
    const child = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)), 'start', dataRoot, root, join(root, 'home'), project.id])
    let output = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    assert.equal(code, 1)
    assert.match(JSON.parse(output).error, /管理器|重新打开/)
  }
  assert.deepEqual(requests, ['status', 'status'])
})

test('start rediscovers a live manager after its old connection deadline closes the reply', async t => {
  const root = await mkdtemp('/private/tmp/superagent-start-recovery-')
  const dataRoot = join(root, 'data')
  await mkdir(dataRoot, { mode: 0o700 })
  const socket = superagentSocket(dataRoot, 'legacy'), requests = []
  await mkdir(dirname(socket), { recursive: true, mode: 0o700 })
  const server = createServer(connection => {
    let buffer = ''
    connection.on('data', bytes => {
      buffer += bytes
      if (!buffer.includes('\n')) return
      const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
      requests.push(request.type)
      if (request.type === 'start') { connection.end(); return }
      connection.end(JSON.stringify({ ok: true, value: { protocol: 1, superagentVersion: 4,
        projectId: 'legacy', service: { state: requests.includes('start') ? 'starting' : 'stopped', ready: false } } }) + '\n')
    })
  })
  await new Promise(resolve => server.listen(socket, resolve)); await chmod(socket, 0o600)
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(dirname(socket), { recursive: true, force: true }); await rm(root, { recursive: true, force: true })
  })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)),
    'start', dataRoot, root, join(root, 'home')])
  let output = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  assert.equal(code, 0, output)
  const reply = JSON.parse(output)
  assert.equal(reply.value.service.state, 'starting')
  assert.match(reply.value.service.message, /仍在启动/)
  assert.deepEqual(requests, ['status', 'start', 'status'], 'recovery queries state without starting or stopping twice')
})
