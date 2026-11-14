/**
 * The bundle patch, read with the same entry-list dialect DSH reads bundle patches with (the cordis include plugin's
 * js-yaml schema resolves `!!js` scalars, then applyEntryPatches applies the inserts to an entry list), asserting
 * the two owner presets keep their FULLY read-only contract (issue #64: no write-file, no command-execution tools)
 * and that the router preset carries the hub-bot router-tools row.
 *
 * The parser comes from the shared test runtime (scripts/test-runtime.mjs): `DSH_TEST_RUNTIME_ROOT` points at a
 * lockfile-installed DSH runtime, and the in-repo deepseek-harness/ checkout is the fallback. When neither is
 * available (no usable cordis include plugin to resolve) these tests SKIP instead of failing — the bundle patch is
 * then validated by the live `--dump-config` / management-API evidence instead.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runtimeAnchor, runtimeRequire } from '../../scripts/test-runtime.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SKIP_REASON = 'no usable DSH test runtime (anchor ' + runtimeAnchor + '); set DSH_TEST_RUNTIME_ROOT or check out deepseek-harness/ with its dependencies'

/**
 * Parses cordis.patch.yml exactly as the DSH loader parses a bundle patch, and applies it to an empty entry list.
 * Returns null when the test runtime cannot resolve the cordis include plugin (uninstalled fallback source, …).
 */
async function patched() {
  if (!existsSync(runtimeAnchor)) return null
  // Only resolving the parser may fail softly (runtime absent or uninstalled) → skip. Once the parser is in hand,
  // errors from yaml.load/applyEntryPatches are errors in OUR cordis.patch.yml and must fail the test, not skip it.
  let include
  let yaml
  try {
    const cordisRequire = createRequire(runtimeRequire.resolve('@deepseek-ai/cordis/package.json'))
    const includePath = cordisRequire.resolve('@deepseek-ai/cordis-plugin-include')
    include = await import(includePath)
    const jsYamlRequire = createRequire(includePath)
    yaml = await import(jsYamlRequire.resolve('js-yaml'))
  } catch {
    return null
  }
  const patches = yaml.load(readFileSync(join(here, '..', 'cordis.patch.yml'), 'utf8'), { schema: include.entryListSchema })
  return include.applyEntryPatches([], patches, message => { throw new Error('patch warning: ' + message) })
}

/** Every plugin row of a preset, including rows nested inside cordis groups. */
const flat = rows => rows.flatMap(row => [row, ...Array.isArray(row.config) ? flat(row.config) : []])
const presetOf = (rows, id) => rows.map(row => row.config).find(config => config?.id === id)
const named = (rows, name) => flat(rows).filter(row => row.name === name).map(row => row.config)

test('inserts the plugin entry and exactly the two owner presets', async t => {
  const rows = await patched()
  if (!rows) { t.skip(SKIP_REASON); return }
  assert.deepEqual(rows.map(row => row.id), ['hub-bot', 'hub-bot-router-preset', 'hub-bot-owner-preset'])
  const plugin = rows.find(row => row.id === 'hub-bot')
  assert.equal(plugin.name, 'dsh-hub-bot')
  assert.equal(plugin.config, undefined, 'the bundle layer carries no configuration; the profile supplies stateDir/homeRepo')
})

for (const preset of ['hub-bot-router', 'hub-bot-owner']) {
  test('preset ' + preset + ': fully read-only (no write/command tools), no person-facing tools', async t => {
    const rows = await patched()
    if (!rows) { t.skip(SKIP_REASON); return }
    const config = presetOf(rows, preset)
    assert.ok(config, 'preset ' + preset + ' missing')
    assert.match(config.name, /负责人专用/, 'the preset name itself says it is owner-only (the preset picker has no hide setting)')
    assert.match(config.description, /负责人专用，不供手动选择/)
    assert.match(config.description, /完全只读：无写文件与命令执行工具/, 'issue #64 AC: owners are fully read-only — and with no shell row the claim is true')
    assert.equal(typeof config.order, 'number')
    const plugins = config.plugins
    // The file tools only read.
    assert.deepEqual(named(plugins, '@deepseek-ai/dsh-tool-fs'), [{ write: false, edit: false }])
    // What an owner needs: instructions, time context, read-only files, skills, compaction.
    for (const name of ['@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-time-context', '@deepseek-ai/dsh-tool-skill',
      '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-compaction-tool-result-pruner']) {
      assert.ok(named(plugins, name).length > 0, 'preset ' + preset + ' keeps ' + name)
    }
    const names = flat(plugins).map(row => row.name)
    // Fully read-only: no shell, no jobs, no file writes (issue #64 AC).
    for (const name of ['@deepseek-ai/dsh-tool-bash', '@deepseek-ai/dsh-tool-pwsh', '@deepseek-ai/dsh-bash-sandbox',
      '@deepseek-ai/dsh-pwsh-sandbox', '@deepseek-ai/dsh-tool-jobs']) {
      assert.ok(!names.includes(name), 'preset ' + preset + ' must not include ' + name)
    }
    // And none of what asks or shows a person something, changes the profile, schedules, plans, sets goals, runs
    // workflows, spawns subagents, fetches the web, searches files, or writes todos.
    for (const name of ['@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-present', '@deepseek-ai/dsh-plan-mode',
      '@deepseek-ai/dsh-plugin-manager/tools', '@deepseek-ai/dsh-plugin-market/tools', '@deepseek-ai/dsh-tool-schedule',
      '@deepseek-ai/dsh-tool-goal', '@deepseek-ai/dsh-command-goal', '@deepseek-ai/dsh-tool-workflow',
      '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control', '@deepseek-ai/dsh-tool-web',
      '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-todo']) {
      assert.ok(!names.includes(name), 'preset ' + preset + ' must not include ' + name)
    }
  })
}

test('only the router preset carries the hub-bot router-tools row (L2 tools land with task-3)', async t => {
  const rows = await patched()
  if (!rows) { t.skip(SKIP_REASON); return }
  const router = presetOf(rows, 'hub-bot-router')
  const owner = presetOf(rows, 'hub-bot-owner')
  assert.equal(named(router.plugins, 'dsh-hub-bot/router-tools').length, 1,
    'L1 tools must be a static row of the preset: runtime decoration cannot reach a mounted preset subtree')
  assert.equal(named(owner.plugins, 'dsh-hub-bot/router-tools').length, 0)
})
