import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeBundlePatches } from './native-bundle.mjs'

const manifest = { dsh: { bundle: { patch: './bundle.yml' } } }
const original = [{ insert: [{ id: 'core', name: '@example/core' }, { id: 'ui', name: '@example/ui' }] },
  { insert: [{ id: 'preset-example', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'example', plugins: [] } }] }]
const boot = { bundlePatchPaths: () => ['bundle.yml'], loadOverlayPatches: () => structuredClone(original) }

test('a partially configured native bundle gains missing entries without enabling a disabled component', () => {
  const existing = [{ id: 'core', name: '@example/core', disabled: true, config: { custom: true } }]
  const patches = nativeBundlePatches(boot, '/bundle', manifest, existing)
  assert.deepEqual(patches.flatMap(row => row.insert).map(row => row.id), ['ui', 'preset-example'])
  assert.equal(existing[0].disabled, true)
  assert.deepEqual(nativeBundlePatches(boot, '/bundle', manifest, original.flatMap(row => row.insert)), [])
  assert.throws(() => nativeBundlePatches(boot, '/bundle', manifest, [{ id: 'core', name: 'different' }]), /conflict/)
  assert.throws(() => nativeBundlePatches(boot, '/bundle', manifest, [{ id: 'custom-core', name: '@example/core' }]), /another identity/)
})
