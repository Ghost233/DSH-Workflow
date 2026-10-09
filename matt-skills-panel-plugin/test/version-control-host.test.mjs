import test from 'node:test'
import assert from 'node:assert/strict'
import { createVersionControl } from '../src/host/versionControl.js'

test('git-directory marker reads preserve a literal trailing Mac backslash', async () => {
  const checked = [], gitDir = '/work/.git\\'
  const subprocess = { spawn({ argv }) {
    let stdout = ''
    if (argv.includes('--absolute-git-dir')) stdout = gitDir + '\ntrue\nfalse\n'
    else if (argv.includes('--show-toplevel')) stdout = '/work\n'
    else if (argv.includes('--version')) stdout = 'git version 2.49.0\n'
    else if (argv.includes('status')) stdout = '# branch.oid (initial)\0# branch.head main\0'
    else if (argv.includes('config')) stdout = 'false\n'
    return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { finalize: () => ({ text: stdout, truncated: false }) }, stderr: { finalize: () => ({ text: '', truncated: false }) } } }
  } }
  const host = createVersionControl({ subprocess, timer: { timeout: () => new Promise(() => {}) },
    fs: { exists: async path => { checked.push(path); return false } }, getPlatform: async () => ({ resolveExecutable: async () => '/usr/bin/git' }), DEFAULT_CWD: '/work' })
  const result = await host.handleGitStatus({ cwd: '/work' })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(checked.length > 0)
  assert.equal(checked[0], gitDir + '/MERGE_HEAD')
  assert.ok(checked.every(path => path.startsWith(gitDir + '/')))
})
