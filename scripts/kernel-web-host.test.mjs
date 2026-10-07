import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { launchCatalogRoot } from './kernel-web-launch.mjs'

const project = resolve('.')
const exec = promisify(execFile)

test('source launcher chooses its catalog from the checkout, independent of the caller cwd', () => {
  assert.equal(launchCatalogRoot(project), resolve(project, '..'))
  assert.equal(launchCatalogRoot(join(project, 'fixtures', 'checkout')), join(project, 'fixtures'))
})

test('actual Web composition monitors Owner requests and persists native observation settings', { timeout: 30_000 }, async () => {
  // Exercise the normal Node host; the suite's tsx hooks must not split native ESM service instances.
  await exec(process.execPath, [join(project, 'scripts/fixtures/jev-web-host.mjs')], {
    cwd: project, timeout: 25_000, maxBuffer: 2 * 1024 * 1024,
  })
})
