import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGhAccount } from '../src/host/ghAccount.js'
import { createRepoKeys } from '../src/host/git-process.js'
import { createPlatformChannel } from '../src/host/platformChannel.js'
import { createGhAccountWiring } from '../src/host/ghAccountWiring.js'

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

async function accountDir(home, login) {
  const dir = join(home, '.config', 'gh-profiles', login)
  await mkdir(dir, { recursive: true })
  return dir
}

function account(home, extra) {
  return createGhAccount(Object.assign({ processEnv: {}, homeDir: home }, extra || {}))
}

// 同一张非法登录名表同时喂给 JS 解析与真实 bash shim，防止两套实现分叉。
const INVALID_LOGINS = ['not a login', '-Ghost233', 'Ghost233-', 'Ghost_233', 'a'.repeat(40)]

test('最近声明决定账号目录，尾斜杠 cwd 也能解析', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  await declare(repo, 'Ghost233\n')
  const expected = await accountDir(home, 'Ghost233')
  const cwd = join(repo, 'packages', 'deep')
  await mkdir(cwd, { recursive: true })
  assert.equal(await account(home).resolveGhConfigDir(cwd), expected)
  assert.equal(await account(home).resolveGhConfigDir(repo + '/'), expected)
  assert.deepEqual(await account(home).accountEnvFor(cwd), { GH_CONFIG_DIR: expected })
}))

test('更深一层的声明优先；最近声明非法时不回退到外层声明', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(join(repo, '.git'), { recursive: true })
  await declare(repo, 'Ghost233\n')
  await accountDir(home, 'Ghost233')
  const nested = join(repo, 'nested')
  const expected = await accountDir(home, 'OtherUser')
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
  await accountDir(home, 'Ghost233')

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
  await accountDir(home, 'Ghost233')
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

  for (const bad of INVALID_LOGINS) {
    await declare(repo, bad + '\n')
    assert.equal(await account(home).resolveGhConfigDir(repo), undefined, bad)
  }

  await declare(repo, 'Ghost233\n')
  assert.equal(await account(home).resolveGhConfigDir(repo), undefined)
  assert.equal(await account(home).accountEnvFor(repo), null)
}))

test('XDG_CONFIG_HOME 为绝对路径时决定账号目录；相对路径回退 HOME/.config', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  await declare(repo, 'Ghost233\n')
  const xdg = join(root, 'xdg')
  const expected = join(xdg, 'gh-profiles', 'Ghost233')
  await mkdir(expected, { recursive: true })
  const absolute = account(home, { processEnv: { XDG_CONFIG_HOME: xdg } })
  assert.equal(await absolute.resolveGhConfigDir(repo), expected)
  assert.deepEqual(await absolute.accountEnvFor(repo), { GH_CONFIG_DIR: expected })

  const fallback = await accountDir(home, 'Ghost233')
  const relative = account(home, { processEnv: { XDG_CONFIG_HOME: 'relative/xdg' } })
  assert.equal(await relative.resolveGhConfigDir(repo), fallback)
  assert.deepEqual(await relative.accountEnvFor(repo), { GH_CONFIG_DIR: fallback })
}))

test('accountEnvFor 自身 fail-safe：声明非法、账号目录缺失、解析异常都返回 null 不抛', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })

  await declare(repo, 'not a login\n')
  assert.equal(await account(home).accountEnvFor(repo), null)

  await declare(repo, 'Ghost233\n')
  assert.equal(await account(home).accountEnvFor(repo), null)

  const throwingFs = {
    lstat: async () => { throw new Error('boom') },
    readFile: async () => { throw new Error('boom') },
    stat: async () => { throw new Error('boom') },
  }
  assert.equal(await account(home, { fs: throwingFs }).accountEnvFor(repo), null)

  // 注入坏依赖（HOME 不是路径）时也不许把异常漏给出站调用点。
  assert.equal(await createGhAccount({ processEnv: {}, homeDir: 42 }).accountEnvFor(repo), null)
}))

test('ghAccount:false 只跳过 BASH_ENV shim；wiring 的出站 accountEnvFor 仍按声明解析', async () => withWorld(async ({ root }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  await declare(repo, 'Ghost233\n')
  const xdg = join(root, 'xdg')
  const expected = join(xdg, 'gh-profiles', 'Ghost233')
  await mkdir(expected, { recursive: true })

  const effects = []
  const previousXdg = process.env.XDG_CONFIG_HOME
  const previousBashEnv = process.env.BASH_ENV
  process.env.XDG_CONFIG_HOME = xdg
  process.env.BASH_ENV = '/test/keep-bash-env'
  try {
    const wiring = createGhAccountWiring({
      ctx: { effect(fn) { effects.push(fn) } },
      config: { ghAccount: false },
    })
    assert.deepEqual(await wiring.accountEnvFor(repo), { GH_CONFIG_DIR: expected })
    assert.equal(effects.length, 0, 'ghAccount:false 不注册 shim effect')
    assert.equal(process.env.BASH_ENV, '/test/keep-bash-env')
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    if (previousBashEnv === undefined) delete process.env.BASH_ENV
    else process.env.BASH_ENV = previousBashEnv
  }
}))

function runBash(cwd, script, env) {
  return new Promise(function (resolvePromise, rejectPromise) {
    // stdin 用 /dev/null，与 deck 宿主 subprocess.spawn({ stdio: { stdin: 'ignore' } }) 一致。
    // macOS bash 3.2 在 -c 且 stdin 是 socket 时会走 sshd/rshd 分支去读 ~/.bashrc，
    // 并在 shell_level<2 时提前返回、跳过 BASH_ENV；Node 默认 pipe stdio 的 stdin 正是
    // socketpair，会误触该分支。deck 的真实启动面是 /dev/null，故这里显式对齐。
    const child = spawn('/bin/bash', ['-c', script], {
      cwd,
      env: Object.assign({ PATH: process.env.PATH }, env),
      stdio: ['ignore', 'pipe', 'pipe'],
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
  // (a) 安装不再写 SHLVL：实测 macOS 自带 bash 3.2 无需 SHLVL 兜底（显式无 SHLVL 的 env 见下）。
  assert.equal('SHLVL' in processEnv, false, 'install 不应写入 SHLVL')
  // (b) 显式 env 只给 HOME/PATH/BASH_ENV，不含 SHLVL；shim 仍被 source 并导出正确账号目录。
  const env = { HOME: home, BASH_ENV: processEnv.BASH_ENV }
  const read = async function (cwd, extra) {
    const r = await runBash(cwd, 'printf "%s" "${GH_CONFIG_DIR:-}"', Object.assign({}, env, extra || {}))
    assert.equal(r.code, 0, r.stderr)
    return r.stdout
  }

  assert.equal(await read(repo), '')
  await declare(repo, '   \n')
  assert.equal(await read(repo), '')
  for (const bad of INVALID_LOGINS) {
    await declare(repo, bad + '\n')
    assert.equal(await read(repo), '', 'invalid declaration: ' + bad)
  }
  await declare(repo, 'Ghost233\n')
  assert.equal(await read(repo), '', 'account dir missing')
  const expected = await accountDir(home, 'Ghost233')
  const src = join(repo, 'src')
  await mkdir(src, { recursive: true })
  assert.equal(await read(src), expected)
  assert.equal(await read(repo, { GH_CONFIG_DIR: '/already/global' }), expected)
  await dispose()
}))

test('用户原有 BASH_ENV 被链式 source，含单引号的路径也安全', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  await accountDir(home, 'Ghost233')
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
  await dispose()
  assert.equal(processEnv.BASH_ENV, original)
  // (c) dispose 同时清理本实例写的 shim 文件。
  await assert.rejects(stat(join(home, '.dsh', 'mattskillsdeck', 'gh-account-env.sh')))
}))

test('无声明时不覆盖继承的 GH_CONFIG_DIR；dispose 后还原或删除 BASH_ENV 并清理 shim', async () => withWorld(async ({ root, home }) => {
  const repo = join(root, 'repo')
  await mkdir(repo, { recursive: true })
  const processEnv = { SHLVL: '7' }
  const gh = account(home, { processEnv })
  const shimPath = join(home, '.dsh', 'mattskillsdeck', 'gh-account-env.sh')
  const dispose = await gh.installBashEnvShim()
  // (a) 已有 SHLVL 也不被改动。
  assert.equal(processEnv.SHLVL, '7', 'install 不应改写已有 SHLVL')
  const r = await runBash(repo, 'printf "%s" "${GH_CONFIG_DIR:-}"', Object.assign({}, processEnv, {
    HOME: home,
    GH_CONFIG_DIR: '/inherited/global',
  }))
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, '/inherited/global')
  await dispose()
  assert.equal('BASH_ENV' in processEnv, false)
  assert.equal(processEnv.SHLVL, '7', 'dispose 不应改写已有 SHLVL')
  // (c) shim 文件被删除，BASH_ENV 还原为未设置。
  await assert.rejects(stat(shimPath))
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

function repoKeysWith(subprocess, accountEnvByCwd) {
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
    accountEnvFor: async (cwd) => accountEnvByCwd[cwd] || null,
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
    accountEnvFor: async (cwd) => cwd === '/repo' ? { GH_CONFIG_DIR: '/profiles/Ghost233' } : null,
  })

  const r = await channel.detectionExec('gh', ['api', 'user'], { cwd: '/repo' }, 'test')
  assert.equal(r.code, 0)
  assert.deepEqual(capture.specs[0].env, { GH_CONFIG_DIR: '/profiles/Ghost233' })

  await channel.detectionExec('gh', ['api', 'user'], { cwd: '/elsewhere' }, 'test')
  assert.equal(capture.specs[1].env, undefined)
})


test('an unknown workspace never falls back to a process-directory account', async () => {
  const capture = captureSpawn()
  const keys = repoKeysWith(capture.subprocess, { '/default': { GH_CONFIG_DIR: '/profiles/unrelated' } })
  assert.equal((await keys.runGh(['api', 'user'], '   ')).kind, 'env')
  assert.equal(capture.specs.length, 0)
  await keys.execProc(['git', '--version'], '', 'test')
  assert.equal(capture.specs[0].env, undefined)
  let reads = 0
  const channel = createPlatformChannel({
    ctx: { get: () => undefined }, subprocess: capture.subprocess,
    timer: { timeout: () => new Promise(() => {}) }, DEFAULT_CWD: '', TIMEOUT_MS: 1000,
    accountEnvFor: async () => { reads++; return { GH_CONFIG_DIR: '/profiles/unrelated' } },
  })
  await channel.detectionExec('gh', ['--version'], {}, 'test')
  assert.equal(reads, 0)
  assert.equal(capture.specs[1].env, undefined)
})
