import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGhAccount } from '../src/host/ghAccount.js'
import { createRepoKeys } from '../src/host/repoKeys.js'
import { createPlatformChannel } from '../src/host/platformChannel.js'

async function withWorld(fn) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gh-account-'))
  try {
    const home = join(root, 'home')
    await mkdir(home, { recursive: true })
    return await fn({ root, home })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function declare(dir, content) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.ghswitch'), content)
}

async function profile(home, login) {
  const dir = join(home, '.config', 'gh-profiles', login)
  await mkdir(dir, { recursive: true })
  return dir
}

function account(home, extra) {
  return createGhAccount(Object.assign({ processEnv: {}, homeDir: home }, extra || {}))
}

test('最近声明决定账号目录，尾斜杠 cwd 也能解析', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  await declare(repo, 'Ghost233\n')
  const expected = await profile(home, 'Ghost233')
  const cwd = join(repo, 'packages', 'deep')
  await mkdir(cwd, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd), expected)
  assert.equal(await account(home).resolveGhConfigDir(repo + '/'), expected)
  assert.deepEqual(await account(home).envFor(cwd), { GH_CONFIG_DIR: expected })
}))

test('更深一层的声明优先；最近声明非法时不回退到外层声明', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  await declare(repo, 'Ghost233\n')
  await profile(home, 'Ghost233')
  const nested = join(repo, 'nested')
  const expected = await profile(home, 'OtherUser')
  await declare(nested, 'OtherUser')
  const cwd = join(nested, 'deep')
  await mkdir(cwd, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd), expected)

  await declare(nested, 'not a login')
  assert.equal(await account(home).resolveGhConfigDir(cwd), undefined)
}))

test('遇到 .git（目录或文件）停止上溯', async () => withWorld(async ({ root, home }) => {
  const outer = join(root, 'outer')
  await mkdir(outer, { recursive: true })
  await declare(outer, 'Ghost233')
  await profile(home, 'Ghost233')

  const repo = join(outer, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  const cwd = join(repo, 'src')
  await mkdir(cwd, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd), undefined)

  const worktree = join(outer, 'worktree')
  await mkdir(worktree, { recursive: true })
  await writeFile(join(worktree, '.git'), 'gitdir: /elsewhere\n')
  const cwd2 = join(worktree, 'src')
  await mkdir(cwd2, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd2), undefined)
}))

test('到 HOME 即停止，不读取 HOME 之上的声明', async () => withWorld(async ({ root, home }) => {
  await declare(root, 'Ghost233')
  await profile(home, 'Ghost233')
  const cwd = join(home, 'work')
  await mkdir(cwd, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd), undefined)
}))

test('无声明、空声明、非法声明、账号目录不存在都静默回落', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })

  assert.equal(await account(home).resolveGhConfigDir(repo), undefined)

  await declare(repo, '  \n\t\n')
  assert.equal(await account(home).resolveGhConfigDir(repo), undefined)

  for (const bad of ['not a login', '-Ghost233', 'Ghost233-', 'Ghost_233', 'a'.repeat(40)]) {
    await declare(repo, bad + '\n')
    assert.equal(await account(home).resolveGhConfigDir(repo), undefined, bad)
  }

  await declare(repo, 'Ghost233\n')
  assert.equal(await account(home).resolveGhConfigDir(repo), undefined)
  assert.equal(await account(home).envFor(repo), null)
}))

function runBash(cwd, script, env) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const child = spawn('/bin/bash', ['-c', script], {
      cwd,
      env: Object.assign({ PATH: process.env.PATH }, env),
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', function (chunk) { stdout += chunk })
    child.stderr.on('data', function (chunk) { stderr += chunk })
    child.on('error', rejectPromise)
    child.on('close', function (code) { resolvePromise({ code, stdout, stderr }) })
  })
}

test('BASH_ENV shim 让真实 bash 读到声明账号；四种回落都不导出 GH_CONFIG_DIR', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  const processEnv = {}
  const gh = account(home, { processEnv })
  const dispose = await gh.installBashEnvShim()
  assert.equal(processEnv.BASH_ENV, join(home, '.dsh', 'mattskillsdeck', 'gh-account-env.sh'))
  const env = { HOME: home, BASH_ENV: processEnv.BASH_ENV, SHLVL: processEnv.SHLVL }
  const read = async function (cwd, extra) {
    const r = await runBash(cwd, 'printf "%s" "${GH_CONFIG_DIR:-}"', Object.assign({}, env, extra || {}))
    assert.equal(r.code, 0, r.stderr)
    return r.stdout
  }

  assert.equal(await read(repo), '')
  await declare(repo, '   \n')
  assert.equal(await read(repo), '')
  await declare(repo, 'bad login\n')
  assert.equal(await read(repo), '', 'invalid declaration')
  await declare(repo, 'Ghost233\n')
  assert.equal(await read(repo), '', 'account dir missing')
  const expected = await profile(home, 'Ghost233')
  const src = join(repo, 'src')
  await mkdir(src, { recursive: true })
  assert.equal(await read(src), expected)
  assert.equal(await read(repo, { GH_CONFIG_DIR: '/already/global' }), expected)
  dispose()
}))

test('用户原有 BASH_ENV 被链式 source，含单引号的路径也安全', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  await profile(home, 'Ghost233')
  await declare(repo, 'Ghost233\n')
  const original = join(root, "orig'inal.sh")
  await writeFile(original, 'export DSH_ORIGINAL_ENV=kept\n')
  const processEnv = { BASH_ENV: original }
  const gh = account(home, { processEnv })
  const dispose = await gh.installBashEnvShim()
  assert.notEqual(processEnv.BASH_ENV, original)
  const r = await runBash(repo, 'printf "%s|%s" "${DSH_ORIGINAL_ENV:-}" "${GH_CONFIG_DIR:-}"', Object.assign({}, processEnv, { HOME: home }))
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, 'kept|' + join(home, '.config', 'gh-profiles', 'Ghost233'))
  dispose()
  assert.equal(processEnv.BASH_ENV, original)
}))

test('无声明时不覆盖继承的 GH_CONFIG_DIR；dispose 后还原或删除 BASH_ENV', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  const processEnv = {}
  const gh = account(home, { processEnv })
  const dispose = await gh.installBashEnvShim()
  const r = await runBash(repo, 'printf "%s" "${GH_CONFIG_DIR:-}"', Object.assign({}, processEnv, {
    HOME: home,
    GH_CONFIG_DIR: '/inherited/global',
  }))
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, '/inherited/global')
  dispose()
  assert.equal('BASH_ENV' in processEnv, false)
  assert.equal('SHLVL' in processEnv, false)
}))

function fakeHandle() {
  const reader = { readFrom: () => ({ text: '', truncated: false }) }
  return {
    done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate: function () {},
    collected: { stdout: reader, stderr: reader },
  }
}

function captureSpawn() {
  const specs = []
  return {
    specs,
    subprocess: {
      spawn: function (spec) {
        specs.push(spec)
        return fakeHandle()
      },
    },
  }
}

function repoKeysWith(subprocess, envForCwd) {
  return createRepoKeys({
    subprocess,
    timer: { timeout: () => new Promise(function () {}) },
    fs: {},
    DEFAULT_CWD: '/default',
    TIMEOUT_MS: 1000,
    repoKeys: {},
    repoRoots: {},
    getGhPath: () => '/usr/local/bin/gh',
    setGhPath() {},
    getGhLastError: () => null,
    setGhLastError() {},
    getPlatform: async () => ({}),
    getWorkspaceStore: async () => ({ clear() {} }),
    setCache() {},
    clearWorkspaceStore() {},
    namingSweepSoon() {},
    getChainBackoff: () => 0,
    parseGithubRepo: () => null,
    logCtx: null,
    getGate: () => null,
    ghAccountEnvFor: async (cwd) => envForCwd[cwd] || null,
  })
}

test('runGh 与 execProc 的 spawn spec 带上按 cwd 解析出的 GH_CONFIG_DIR', async () => {
  const capture = captureSpawn()
  const keys = repoKeysWith(capture.subprocess, { '/repo': { GH_CONFIG_DIR: '/profiles/Ghost233' } })

  await keys.runGh(['api', 'user'], '/repo')
  assert.deepEqual(capture.specs[0].env, { GH_CONFIG_DIR: '/profiles/Ghost233' })

  await keys.execProc(['gh', 'api', 'user'], '/repo', 'test')
  assert.deepEqual(capture.specs[1].env, { GH_CONFIG_DIR: '/profiles/Ghost233' })

  await keys.runGh(['api', 'user'], '/elsewhere')
  assert.equal(capture.specs[2].env, undefined)
  await keys.execProc(['gh', 'api', 'user'], '/elsewhere', 'test')
  assert.equal(capture.specs[3].env, undefined)
})

test('detectionExec 的 spawn spec 带上按 opts.cwd 解析出的 GH_CONFIG_DIR', async () => {
  const capture = captureSpawn()
  const channel = createPlatformChannel({
    ctx: { get: () => undefined },
    subprocess: capture.subprocess,
    timer: { timeout: () => new Promise(function () {}) },
    fs: {},
    DEFAULT_CWD: '/default',
    TIMEOUT_MS: 1000,
    getMattSkillProbeNames: async () => [],
    getChainSkillNames: async () => [],
    probeSkill: async () => null,
    getChoiceStore: async () => null,
    logCtx: null,
    getGate: () => null,
    ghAccountEnvFor: async (cwd) => cwd === '/repo' ? { GH_CONFIG_DIR: '/profiles/Ghost233' } : null,
  })

  const r = await channel.detectionExec('gh', ['api', 'user'], { cwd: '/repo' }, 'test')
  assert.equal(r.code, 0)
  assert.deepEqual(capture.specs[0].env, { GH_CONFIG_DIR: '/profiles/Ghost233' })

  await channel.detectionExec('gh', ['api', 'user'], { cwd: '/elsewhere' }, 'test')
  assert.equal(capture.specs[1].env, undefined)
})
