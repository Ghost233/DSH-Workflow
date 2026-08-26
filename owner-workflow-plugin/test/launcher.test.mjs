import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const executeFile = promisify(execFile)
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const START_SCRIPT = join(PROJECT_ROOT, 'start-owner-workflow.sh')
const NPM_START_SCRIPT = join(PROJECT_ROOT, 'start-owner-workflow-npm.sh')
const SUBMODULE_START_SCRIPT = join(PROJECT_ROOT, 'start-owner-workflow-submodule.sh')

async function prepareSourceRuntime(runtimeDirectory) {
  await mkdir(join(runtimeDirectory, 'apps', 'cli', 'lib'), { recursive: true })
  await mkdir(join(runtimeDirectory, 'apps', 'web', 'dist'), { recursive: true })
  await writeFile(join(runtimeDirectory, 'apps', 'web', 'dist', 'index.html'), '<!doctype html>\n', 'utf8')
  await writeFile(
    join(runtimeDirectory, 'apps', 'cli', 'lib', 'bin.js'),
    'process.stdout.write(process.argv.slice(2).join("\\n"))\n',
    'utf8',
  )
}

async function prepareSubmoduleRuntime(harnessDirectory) {
  await prepareSourceRuntime(harnessDirectory)
  await executeFile('git', ['init', '--quiet'], { cwd: harnessDirectory })
  await executeFile('git', ['config', 'user.email', 'test@example.com'], { cwd: harnessDirectory })
  await executeFile('git', ['config', 'user.name', 'Test User'], { cwd: harnessDirectory })
  await executeFile('git', ['commit', '--allow-empty', '--quiet', '-m', 'test'], { cwd: harnessDirectory })
  const { stdout: revision } = await executeFile('git', ['rev-parse', 'HEAD'], { cwd: harnessDirectory })
  await mkdir(join(harnessDirectory, '.dsh-build'), { recursive: true })
  await writeFile(join(harnessDirectory, '.dsh-build', 'owner-workflow-source-revision'), revision, 'utf8')
}

test('本地启动强制刷新过期 preset，忽略缺失的 profile bin 并注入当前源码', async () => {
  const harnessHome = await mkdtemp(join(tmpdir(), 'dsh-owner-launcher-'))
  const profileDirectory = join(harnessHome, 'profiles', 'web')
  const modulesDirectory = join(profileDirectory, 'node_modules')
  try {
    await mkdir(modulesDirectory, { recursive: true })
    await symlink(PLUGIN_ROOT, join(modulesDirectory, 'dsh-owner-workflow'), 'dir')
    await writeFile(join(profileDirectory, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      private: true,
      dependencies: {
        'dsh-owner-workflow': `link:${PLUGIN_ROOT}`,
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dsh-owner-workflow',
          ],
        },
      },
    }, null, 2), 'utf8')
    const stalePreset = join(harnessHome, '.agent-presets', 'owner-workflow')
    await mkdir(stalePreset, { recursive: true })
    await writeFile(join(stalePreset, 'plugin.mjs'), 'export default {}\n', 'utf8')

    const { stdout, stderr } = await executeFile('bash', [START_SCRIPT, '--dump-config'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        DSH_LAUNCHER: 'source',
        DSH_OWNER_WORKFLOW_MODE: 'local',
        DSH_OWNER_WORKFLOW_RUNNER: '0',
        DSH_WEB_OPEN: '1',
      },
      maxBuffer: 2 * 1024 * 1024,
    })

    assert.match(stderr, /使用本地 patch 注入 preset 与 Owner 工作流插件/u)
    assert.equal(typeof stdout, 'string')
    const proxy = await readFile(join(harnessHome, '.agent-presets/owner-workflow/plugin.mjs'), 'utf8')
    assert.match(proxy, new RegExp(PLUGIN_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally {
    await rm(harnessHome, { recursive: true, force: true })
  }
})

test('npm 启动脚本把显式版本固定为 @deepseek-ai/dsh 包规格', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-npm-launcher-'))
  const harnessHome = join(root, 'home')
  const binDirectory = join(root, 'bin')
  const capturePath = join(root, 'npx-arguments.txt')
  try {
    await mkdir(binDirectory, { recursive: true })
    const fakeNpx = join(binDirectory, 'npx')
    await writeFile(fakeNpx, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$CAPTURE_PATH"\n', 'utf8')
    await chmod(fakeNpx, 0o755)

    await executeFile('bash', [NPM_START_SCRIPT, '--version', '0.1.2-test'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        CAPTURE_PATH: capturePath,
        PATH: `${binDirectory}:${process.env.PATH}`,
        DSH_HOME: harnessHome,
        DSH_OWNER_WORKFLOW_MODE: 'local',
        DSH_OWNER_WORKFLOW_RUNNER: '0',
      },
      maxBuffer: 2 * 1024 * 1024,
    })

    const args = (await readFile(capturePath, 'utf8')).trim().split('\n')
    assert.ok(args.includes('--yes'))
    assert.ok(args.includes('@deepseek-ai/dsh@0.1.2-test'))
    assert.ok(args.includes('web'))
    assert.ok(args.includes('--no-open'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('子模块启动脚本直接从子模块执行构建后的 CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-submodule-launcher-'))
  const harnessHome = join(root, 'home')
  const harnessDirectory = join(root, 'harness')
  try {
    await prepareSubmoduleRuntime(harnessDirectory)

    const { stdout } = await executeFile('bash', [SUBMODULE_START_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        DSH_HARNESS_DIR: harnessDirectory,
        DSH_OWNER_WORKFLOW_MODE: 'local',
        DSH_OWNER_WORKFLOW_RUNNER: '0',
      },
      maxBuffer: 2 * 1024 * 1024,
    })

    const args = stdout.trim().split('\n')
    assert.equal(args[0], 'web')
    assert.ok(args.includes('--patch'))
    assert.ok(args.includes('--no-open'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('子模块启动脚本把 plugin 命令原样交给子模块 CLI 且不启动 Web', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-submodule-plugin-'))
  const harnessHome = join(root, 'home')
  const harnessDirectory = join(root, 'harness')
  try {
    await prepareSubmoduleRuntime(harnessDirectory)

    const { stdout, stderr } = await executeFile('bash', [
      SUBMODULE_START_SCRIPT,
      'plugin',
      '--profile',
      'web',
      'add',
      'dsh-approve-for-me@latest',
    ], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        DSH_HARNESS_DIR: harnessDirectory,
        DSH_OWNER_WORKFLOW_RUNNER: '1',
      },
      maxBuffer: 2 * 1024 * 1024,
    })

    assert.deepEqual(stdout.trim().split('\n'), [
      'plugin',
      '--profile',
      'web',
      'add',
      'dsh-approve-for-me@latest',
    ])
    assert.doesNotMatch(stdout, /--patch|--no-open/u)
    assert.doesNotMatch(stderr, /Runner daemon|Owner Workflow Dashboard|Synapse/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('启动脚本让 Runner daemon 随 Harness 启动并在 Harness 退出后停止', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-runner-lifecycle-'))
  const harnessHome = join(root, 'home')
  const runtimeDirectory = join(root, 'runtime')
  const workspace = join(root, 'workspace')
  try {
    await prepareSourceRuntime(runtimeDirectory)
    await mkdir(workspace, { recursive: true })
    await writeFile(
      join(runtimeDirectory, 'apps', 'cli', 'lib', 'bin.js'),
      'process.stdout.write("Harness 测试进程\\n"); setTimeout(() => {}, 500)\n',
      'utf8',
    )
    const { stderr } = await executeFile('bash', [START_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        DSH_HARNESS_DIR: runtimeDirectory,
        DSH_LAUNCHER: 'source-runtime',
        DSH_OWNER_WORKFLOW_MODE: 'local',
        DSH_OWNER_WORKFLOW_DASHBOARD_ROOT: workspace,
        DSH_OWNER_WORKFLOW_RUNNER: '1',
      },
      maxBuffer: 2 * 1024 * 1024,
    })
    assert.match(stderr, /Runner daemon 已启用/u)
    const daemon = JSON.parse(await readFile(join(workspace, '.dsh-workflow', 'runner', 'daemon.json'), 'utf8'))
    assert.equal(daemon.contract, 'DSH_WORKFLOW_RUNNER_DAEMON_V1')
    assert.equal(daemon.status, 'stopped')
    assert.equal(Array.isArray(daemon.activeWorkflows), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('本地 Web 启动把固定 Synapse 子模块注入同一个 Harness 进程', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-synapse-launcher-'))
  const harnessHome = join(root, 'home')
  const runtimeDirectory = join(root, 'runtime')
  try {
    await prepareSourceRuntime(runtimeDirectory)
    await writeFile(
      join(runtimeDirectory, 'apps', 'cli', 'lib', 'bin.js'),
      [
        'const { readFileSync } = require("node:fs")',
        'process.stdout.write(process.argv.slice(2).join("\\n") + "\\n")',
        'for (let index = 0; index < process.argv.length; index += 1) {',
        '  if (process.argv[index] !== "--patch") continue',
        '  process.stdout.write(readFileSync(process.argv[index + 1], "utf8"))',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

    const { stdout } = await executeFile('bash', [START_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        DSH_HARNESS_DIR: runtimeDirectory,
        DSH_LAUNCHER: 'source-runtime',
        DSH_OWNER_WORKFLOW_MODE: 'local',
        DSH_OWNER_WORKFLOW_RUNNER: '0',
      },
      maxBuffer: 2 * 1024 * 1024,
    })

    assert.match(stdout, /id: synapse/u)
    assert.match(stdout, /name: dsh-synapse/u)
    assert.match(stdout, /synapse\/workspaces\.json/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
