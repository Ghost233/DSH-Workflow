import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { access, readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const resources = process.env.DSH_SERVICE_TEST_RESOURCES

async function dshZodRequirements() {
  const lock = JSON.parse(await readFile(join(root, 'macos-launcher/package-lock.json'), 'utf8'))
  const rows = Object.entries(lock.packages).filter(([path, pkg]) =>
    /^node_modules\/@deepseek-ai\/[^/]+$/.test(path) && /^\d+\.\d+\.\d+$/.test(pkg.dependencies?.zod ?? ''))
  const versions = new Map()
  for (const [, pkg] of rows) versions.set(pkg.dependencies.zod, (versions.get(pkg.dependencies.zod) ?? 0) + 1)
  const preferred = [...versions].sort((a, b) => b[1] - a[1])[0]?.[0]
  assert.ok(preferred, 'the DSH dependency graph must expose its exact zod version')
  return { lock, rows: rows.filter(([, pkg]) => pkg.dependencies.zod === preferred), preferred }
}

test('the locked DSH packages share one root copy of their exact zod dependency', async () => {
  const { lock, rows, preferred } = await dshZodRequirements()
  assert.ok(rows.length > 1)
  assert.equal(lock.packages['node_modules/zod']?.version, preferred)
  const copies = Object.entries(lock.packages).filter(([path, pkg]) =>
    (path === 'node_modules/zod' || path.endsWith('/node_modules/zod')) && pkg.version === preferred)
  assert.deepEqual(copies.map(([path]) => path), ['node_modules/zod'])
})

test('packaged DSH packages resolve and execute the shared zod dependency', { skip: resources ? false : 'Requires the packaged Station resources' }, async () => {
  const { rows, preferred } = await dshZodRequirements()
  const expected = await realpath(join(resources, 'node_modules/zod/package.json'))
  for (const [path] of rows) {
    const require = createRequire(join(resources, path, 'package.json'))
    const resolved = await realpath(require.resolve('zod/package.json'))
    assert.equal(resolved, expected, `${path} must use the shared package`)
    assert.equal(require('zod/package.json').version, preferred)
    assert.equal(require('zod').object({ value: require('zod').string() }).parse({ value: 'ok' }).value, 'ok')
  }
})

test('packaged Web Station does not contain a Desktop application', { skip: resources ? false : 'Requires the packaged Station resources' }, async () => {
  await assert.rejects(access(join(resources, 'desktop')), { code: 'ENOENT' })
})

test('packaged Station omits the retired autonomous project runtime', { skip: resources ? false : 'Requires the packaged Station resources' }, async () => {
  for (const path of ['superagent', 'superagent-payload.json', 'bin/lark-cli', 'workflow/vendor/dsh-superagent.upstream.json',
    'workflow/macos-launcher/runtime/superagent-service.mjs']) await assert.rejects(access(join(resources, path)), { code: 'ENOENT' })
})

test('packaged macOS terminal runs without Windows prebuilt binaries', { skip: resources ? false : 'Requires the packaged Station resources', timeout: 10000 }, async () => {
  const prebuilds = join(resources, 'node_modules/node-pty/prebuilds')
  await access(join(prebuilds, 'darwin-arm64'))
  for (const name of ['win32-arm64', 'win32-x64']) await assert.rejects(access(join(prebuilds, name)), { code: 'ENOENT' })
  await assert.rejects(access(join(resources, 'node_modules/node-pty/third_party/conpty')), { code: 'ENOENT' })
  const require = createRequire(join(resources, 'package.json'))
  const pty = require('node-pty')
  const child = pty.spawn('/usr/bin/printf', ['STATION_PTY_OK'], {
    name: 'xterm-256color', cols: 80, rows: 24, cwd: '/private/tmp', env: { PATH: '/usr/bin:/bin' },
  })
  let output = ''
  child.onData(data => { output += data })
  const result = await new Promise(resolve => child.onExit(resolve))
  assert.equal(result.exitCode, 0)
  assert.match(output, /STATION_PTY_OK/)
})

test('audited test files are absent while packaged zod and HTML parsing remain usable', { skip: resources ? false : 'Requires the packaged Station resources' }, async () => {
  const zod = join(resources, 'node_modules/zod')
  await access(join(zod, 'src/index.ts'))
  await assert.rejects(access(join(zod, 'src/v3/tests')), { code: 'ENOENT' })
  await assert.rejects(access(join(zod, 'src/v3/benchmarks')), { code: 'ENOENT' })
  await assert.rejects(access(join(zod, 'src/v4/classic/tests')), { code: 'ENOENT' })
  const domino = join(resources, 'node_modules/@mixmark-io/domino')
  await assert.rejects(access(join(domino, 'test')), { code: 'ENOENT' })
  const require = createRequire(join(resources, 'package.json'))
  assert.equal(require('zod').string().parse('ok'), 'ok')
  assert.equal(require('@mixmark-io/domino').createWindow('<title>ok</title>').document.title, 'ok')
  await assert.rejects(access(join(resources, 'node_modules/fast-uri/test')), { code: 'ENOENT' })
})

test('the packaged default checklist carries names without the profile plugin binaries', { skip: resources ? false : 'Requires the packaged Station resources' }, async () => {
  const path = 'default-startup-plugins.json'
  const defaults = await readFile(join(resources, 'workflow', path), 'utf8')
  assert.deepEqual(JSON.parse(defaults), JSON.parse(await readFile(join(root, path), 'utf8')))
  for (const name of JSON.parse(defaults)) {
    await assert.rejects(access(join(resources, 'plugins/node_modules', name)), { code: 'ENOENT' })
  }
})
