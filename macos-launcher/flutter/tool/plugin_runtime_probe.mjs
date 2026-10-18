// Supplemental runtime acceptance only. No package installation, native UI or loaded-Host claim.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { synchronizeProfilePlugins } from '../../runtime/plugin-update.mjs'

const exec = promisify(execFile)
const [input, extra] = process.argv.slice(2)
if (!input || extra || input.startsWith('--')) throw new Error('Pass existing packaged Resources; online package-replacement protocol acceptance has been retired.')
const source = resolve(input), root = await mkdtemp('/private/tmp/dsh-s07-readonly-runtime-')
const resources = join(root, 'resources'), home = join(root, 'home'), profile = join(home, 'profiles/desktop')
const name = 'dsh-s07-owned-readonly-probe'
await exec(process.execPath, [fileURLToPath(new URL('independent_service_resources.mjs', import.meta.url)), source, resources])
await mkdir(join(profile, 'node_modules', name), { recursive: true })
await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: { [name]: '1.0.0' } }))
const actual = join(profile, 'node_modules', name, 'package.json')
await writeFile(actual, JSON.stringify({ name, version: '1.0.0' }))
const historical = join(home, 'workflow/project-plugins.json')
await mkdir(join(home, 'workflow'), { recursive: true })
await writeFile(historical, 'historical bytes remain untouched\n')
const before = await Promise.all([join(profile, 'package.json'), actual, historical].map(path => readFile(path)))
const env = { ...process.env, DSH_HOME: home }
const runtime = join(resources, 'workflow/macos-launcher/runtime')
const checked = await exec(join(resources, 'node'), [join(runtime, 'plugin-versions.mjs'), resources], { env })
const report = JSON.parse(checked.stdout)
assert.equal(report.actualScope, 'installed-files')
assert.ok(report.rows.every(row => row.latest === null && row.updatable === false))
const row = report.rows.find(row => row.name === name)
assert.equal(row.current, '1.0.0')
assert.equal(row.expected, null)
assert.equal(row.status, 'untracked')
const refusals = []
for (const args of [
  [join(runtime, 'plugin-update.mjs'), resources],
  [join(runtime, 'plugin-update.mjs'), resources, '--sync'],
  [join(runtime, 'run-dsh.mjs'), resources, 'plugin', 'add', `${name}@1.0.0`, '--save-exact'],
  [join(runtime, 'run-dsh.mjs'), resources, 'plugin', 'remove', name],
]) {
  let refused = false
  try { await exec(join(resources, 'node'), args, { env }) }
  catch (error) {
    assert.equal(error.code, 1)
    assert.match(error.stderr, /DMG/)
    refusals.push({ entry: args[0].split('/').at(-1), exit: error.code })
    refused = true
  }
  assert.equal(refused, true, 'packaged runtime mutations must reject, including same-version reinstall')
}
await assert.rejects(synchronizeProfilePlugins({ resourcesRoot: resources, home }), /DMG/)
const after = await Promise.all([join(profile, 'package.json'), actual, historical].map(path => readFile(path)))
assert.deepEqual(after, before, 'package operations must not alter profile, actual package or historical configuration')
await writeFile(join(root, 'readonly-runtime-evidence.json'), JSON.stringify({ actualScope: report.actualScope, row, refusals, preserved: true }, null, 2) + '\n')
console.log(`S07_READONLY_RUNTIME=${JSON.stringify({ root, rows: report.rows.length, refusals, preserved: true })}`)
