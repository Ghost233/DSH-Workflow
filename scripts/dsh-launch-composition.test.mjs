import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

const projectRoot = mkdtempSync(join(tmpdir(), 'dsh-launch-composition-'))
after(() => rmSync(projectRoot, { recursive: true, force: true }))
writeFileSync(join(projectRoot, 'project-mcp.json'), JSON.stringify([
  { id: 'workflow-mcp-codegraph', name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: 'codegraph', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'] } },
]))

test('DSH launch loads the project CodeGraph server while preserving unrelated profile values', () => {
  const entries = [{ id: 'user-setting', name: 'unrelated', config: { keep: true } }]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
  assert.deepEqual(entries, before)
  const rows = patches.flatMap(row => row.insert ?? [])
  assert.equal(rows.filter(row => row.id === 'workflow-mcp-codegraph').length, 1)
  assert.deepEqual(rows.find(row => row.id === 'workflow-mcp-codegraph').config, {
    serverName: 'codegraph', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'],
  })
  assert.equal(patches.some(row => row.id === 'user-setting'), false)
})

test('project MCP configuration preserves an existing user server including its disabled state', () => {
  for (const disabled of [false, true]) {
    const userServer = { id: 'user-codegraph', name: '@deepseek-ai/dsh-mcp-client', disabled,
      config: { serverName: 'codegraph', transport: 'stdio', command: '/user/codegraph', args: ['serve', '--mcp', '--no-watch'] } }
    const entries = [{ id: 'user-group', group: true, config: [userServer] }]
    const before = structuredClone(entries)
    const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
    assert.deepEqual(entries, before)
    assert.equal(patches.flatMap(row => row.insert ?? []).some(row => row.config?.serverName === 'codegraph'), false)
    assert.equal(patches.some(row => row.id === 'user-codegraph'), false)
  }
})
