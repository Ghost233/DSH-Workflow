/**
 * The bundle patch, read with the same entry-list dialect DSH reads bundle patches with (the cordis include plugin's
 * js-yaml schema resolves `!!js` scalars, then applyEntryPatches applies the inserts to an entry list), asserting the
 * two owner presets keep their read-only, 5-second-backgrounding contract.
 *
 * The parser is resolved from the installed DSH runtime so the test runs with zero installed dependencies; set
 * DSH_RUNTIME_ROOT to a different DSH installation when the default Station path does not apply.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME_ROOT = process.env.DSH_RUNTIME_ROOT ?? '/Applications/Ghost DSH Station.app/Contents/Resources'
const here = dirname(fileURLToPath(import.meta.url))

/** Parses cordis.patch.yml exactly as the DSH loader parses a bundle patch, and applies it to an empty entry list. */
async function patched() {
  const dshRequire = createRequire(join(RUNTIME_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  const cordisRequire = createRequire(dshRequire.resolve('@deepseek-ai/cordis/package.json'))
  const includePath = cordisRequire.resolve('@deepseek-ai/cordis-plugin-include')
  const include = await import(includePath)
  const jsYamlRequire = createRequire(includePath)
  const yaml = await import(jsYamlRequire.resolve('js-yaml'))
  const patches = yaml.load(readFileSync(join(here, '..', 'cordis.patch.yml'), 'utf8'), { schema: include.entryListSchema })
  const warnings = []
  const rows = include.applyEntryPatches([], patches, message => { throw new Error(`patch warning: ${message}`) })
  return { rows, warnings }
}

/** Every plugin row of a preset, including rows nested inside cordis groups. */
const flat = rows => rows.flatMap(row => [row, ...Array.isArray(row.config) ? flat(row.config) : []])
const presetOf = (rows, id) => rows.map(row => row.config).find(config => config?.id === id)
const named = (rows, name) => flat(rows).filter(row => row.name === name).map(row => row.config)

test('inserts the plugin entry and exactly the two owner presets', async () => {
  const { rows } = await patched()
  assert.deepEqual(rows.map(row => row.id), ['hub-bot', 'hub-bot-router-preset', 'hub-bot-owner-preset'])
  const plugin = rows.find(row => row.id === 'hub-bot')
  assert.equal(plugin.name, 'dsh-hub-bot')
  assert.equal(plugin.config, undefined, 'the bundle layer carries no configuration; the profile supplies stateDir')
})

for (const preset of ['hub-bot-router', 'hub-bot-owner']) {
  test(`preset ${preset}: read-only, 5s shell backgrounding, 5s job waits, no person-facing tools`, async () => {
    const { rows } = await patched()
    const config = presetOf(rows, preset)
    assert.ok(config, `preset ${preset} missing`)
    assert.match(config.name, /负责人/)
    assert.match(config.description, /负责人专用，不供手动选择/)
    assert.equal(typeof config.order, 'number')
    const plugins = config.plugins
    // The file tools only read; a foreground shell command moves to a background job after 5 s; a job wait ends after 5 s.
    assert.deepEqual(named(plugins, '@deepseek-ai/dsh-tool-fs'), [{ write: false, edit: false }])
    assert.deepEqual(named(plugins, '@deepseek-ai/dsh-bash-sandbox'), [{ timeoutMs: 5000, maxTimeoutMs: 5000 }])
    assert.deepEqual(named(plugins, '@deepseek-ai/dsh-pwsh-sandbox'), [{ timeoutMs: 5000, maxTimeoutMs: 5000 }])
    assert.deepEqual(named(plugins, '@deepseek-ai/dsh-tool-jobs'), [{ waitTimeoutMs: 5000, maxWaitTimeoutMs: 5000 }])
    // What an owner needs: instructions, time context, a shell, read-only files, jobs, skills, compaction.
    for (const name of ['@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-time-context', '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-jobs', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-compaction-basic',
      '@deepseek-ai/dsh-compaction-tool-result-pruner']) {
      assert.ok(named(plugins, name).length > 0, `preset ${preset} keeps ${name}`)
    }
    // And none of what asks or shows a person something, changes the profile, schedules, plans, sets goals, runs
    // workflows, spawns subagents, fetches the web, searches files, or writes todos.
    const names = flat(plugins).map(row => row.name)
    for (const name of ['@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-present', '@deepseek-ai/dsh-plan-mode',
      '@deepseek-ai/dsh-plugin-manager/tools', '@deepseek-ai/dsh-plugin-market/tools', '@deepseek-ai/dsh-tool-schedule',
      '@deepseek-ai/dsh-tool-goal', '@deepseek-ai/dsh-command-goal', '@deepseek-ai/dsh-tool-workflow',
      '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control', '@deepseek-ai/dsh-tool-web',
      '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-todo']) {
      assert.ok(!names.includes(name), `preset ${preset} must not include ${name}`)
    }
  })
}
