import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { verifyNpmRuntimePin } from './npm-runtime-pin.mjs'

test('runtime provenance requires the exact registry artifact in both package locks', async () => {
  const target = JSON.parse(await readFile('dsh-runtime.json', 'utf8'))
  const app = JSON.parse(await readFile('macos-launcher/package.json', 'utf8'))
  const lock = JSON.parse(await readFile('macos-launcher/package-lock.json', 'utf8'))
  assert.doesNotThrow(() => verifyNpmRuntimePin({ target, app, lock }))
  for (const mutate of [
    value => { value.target.integrity = 'sha512-invalid' },
    value => { value.lock.packages['node_modules/@deepseek-ai/dsh'].integrity = 'sha512-wrong' },
    value => { value.lock.packages['node_modules/@deepseek-ai/dsh'].resolved = 'https://example.invalid/dsh.tgz' },
    value => { value.lock.packages[''].dependencies['@deepseek-ai/dsh'] = '0.2.2-alpha.3' },
    value => { value.app.dependencies['@deepseek-ai/dsh'] = '0.2.2-alpha.3' },
    value => { value.lock.version = '0.0.0' },
  ]) {
    const value = structuredClone({ target, app, lock }); mutate(value)
    assert.throws(() => verifyNpmRuntimePin(value), /DSH npm runtime/)
  }
})
