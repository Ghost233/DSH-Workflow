import test from 'node:test'
import assert from 'node:assert/strict'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

test('the maintained Matt panel replaces upstream host and tools without changing unrelated configuration', () => {
  const entries = [
    { id: 'presets', name: '@deepseek-ai/dsh-agent-preset-registry' },
    { id: 'upstream-panel', name: 'dsh-mattpocock-skills-deck', config: { retainedSetting: true } },
    { id: 'upstream-tools', name: 'dsh-mattpocock-skills-deck/tools', config: { retainedToolSetting: true } },
    { id: 'unrelated', name: 'unrelated', config: { value: 1 } },
  ]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot: '/project', catalogRoot: '/global',
     })
  assert.deepEqual(entries, before)
  assert.ok(patches.some(row => row.id === 'upstream-panel' && row.disabled))
  assert.ok(patches.some(row => row.id === 'upstream-tools' && row.disabled))
  assert.equal(patches.some(row => row.id === 'unrelated'), false)
  const inserts = patches.flatMap(row => row.insert ?? [])
  const panel = inserts.find(row => row.id === 'matt-skills-board')
  const tools = inserts.find(row => row.id === 'matt-panel-tools')
  assert.equal(panel.name, '/project/matt-skills-panel-plugin/package/lib/index.js')
  assert.equal(tools.name, 'dsh-workflow-matt-panel/tools')
  assert.deepEqual(panel.config, { retainedSetting: true })
  assert.deepEqual(tools.config, { retainedToolSetting: true })
  assert.equal(inserts.find(row => row.id === 'mattpocock-skills-zh').config.includeDefaultRoots, false)
})
