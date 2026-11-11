import test from 'node:test'
import assert from 'node:assert/strict'
import { githubTokenProvider } from '../src/github-credentials.mjs'

test('gh profiles isolate repository accounts and ignore inherited token overrides', async () => {
  const environment = { PATH: '/usr/bin', GH_TOKEN: 'wrong', GITHUB_TOKEN: 'wrong', GH_DEBUG: 'api' }
  const calls = []
  const token = githubTokenProvider({ environment, executable: '/opt/homebrew/bin/gh', run: async (file, args, options) => {
    calls.push({ file, args, environment: options.env })
    if (args[0] === 'auth') {
      assert.equal(options.env.GH_TOKEN, undefined)
      assert.equal(options.env.GITHUB_TOKEN, undefined)
      assert.equal(options.env.GH_DEBUG, undefined)
      return { stdout: options.env.GH_CONFIG_DIR.endsWith('/one') ? 'one-secret\n' : 'two-secret\n' }
    }
    assert.equal(options.env.GH_TOKEN, options.env.GH_CONFIG_DIR.endsWith('/one') ? 'one-secret' : 'two-secret')
    return { stdout: options.env.GH_CONFIG_DIR.endsWith('/one') ? 'OwnerOne\n' : 'OwnerTwo\n' }
  } })
  const one = { ghConfigDir: '/accounts/one', githubActor: 'OwnerOne' }
  assert.equal(await token(one), 'one-secret')
  assert.equal(await token({ ghConfigDir: '/accounts/two', githubActor: 'OwnerTwo' }), 'two-secret')
  assert.equal(await token(one), 'one-secret')
  assert.equal(calls.filter(row => row.args[0] === 'api').length, 2)
  assert.ok(calls.every(row => row.file === '/opt/homebrew/bin/gh'))
  assert.ok(calls[0].args.includes('--user=OwnerOne'))
  assert.deepEqual(environment, { PATH: '/usr/bin', GH_TOKEN: 'wrong', GITHUB_TOKEN: 'wrong', GH_DEBUG: 'api' })
})

test('a changed token is checked again and a mismatched identity is rejected', async () => {
  let changed = false
  const token = githubTokenProvider({ run: async (file, args) => ({ stdout: args[0] === 'auth'
    ? changed ? 'changed-secret' : 'initial-secret'
    : changed ? 'other-account' : 'expected' }) })
  const repository = { ghConfigDir: '/accounts/expected', githubActor: 'expected' }
  assert.equal(await token(repository), 'initial-secret')
  changed = true
  await assert.rejects(token(repository), error => error.dependency === 'credentials' && /identity/.test(error.message))
})

test('credential and network failures are classified without leaking command output', async () => {
  const repository = { ghConfigDir: '/accounts/one', githubActor: 'owner' }
  let api = false
  const token = githubTokenProvider({ run: async (file, args) => {
    if (api && args[0] === 'auth') return { stdout: 'private-value' }
    throw Object.assign(new Error('private-value'), { stderr: 'private-value' })
  } })
  await assert.rejects(token(repository), error => error.dependency === 'credentials' && !error.message.includes('private-value'))
  api = true
  await assert.rejects(token(repository), error => error.dependency === 'network' && !error.message.includes('private-value'))
})

test('explicit token environment configuration remains supported without invoking gh', async () => {
  const token = githubTokenProvider({ environment: { REPO_TOKEN: 'fixture' }, run: () => { throw Error('unexpected gh') } })
  assert.equal(await token({ tokenEnv: 'REPO_TOKEN' }), 'fixture')
})
