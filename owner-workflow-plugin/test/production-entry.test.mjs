import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import * as publicPlugin from '../index.js'
import * as kernelPlugin from '../src/kernel-entry.mjs'
import * as publicDashboard from '../dashboard-host.mjs'
import * as kernelDashboard from '../src/kernel-dashboard-host.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'

test('package and daily composition share one Owner implementation and no independent runner bin', async () => {
  assert.equal(publicPlugin.apply, kernelPlugin.apply)
  assert.equal(publicPlugin.default, kernelPlugin.default)
  assert.equal(publicDashboard.apply, kernelDashboard.apply)
  for (const path of ['../package.json', '../../package.json']) {
    const manifest = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
    assert.equal(manifest.bin, undefined, 'package installation must not expose the removed standalone runner')
  }
})

test('production workflow has no language-specific dependency preparation subsystem', async () => {
  for (const name of ['dependency-preparation.mjs', 'dependency-install-input.mjs', 'dependency-install-environment.mjs']) {
    await assert.rejects(access(new URL(`../src/${name}`, import.meta.url)), { code: 'ENOENT' })
  }
  const names = kernelToolDefinitions({}).map(tool => tool.name)
  assert.equal(names.includes('workflow_retire_isolated_attempt'), false)
})
