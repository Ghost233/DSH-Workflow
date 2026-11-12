import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sourceIdentity } from '../scripts/harness-runtime.mjs'

export const run = (command, args, options) => execFileSync(command, args, { stdio: 'inherit', ...options })
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
export const writeJson = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n')

function upstreamPnpm(stage) {
  const cwd = join(stage, 'source')
  const env = { ...process.env, PATH: `${join(stage, 'toolchain/bin')}:${process.env.PATH}`, CI: 'true' }
  const node = join(stage, 'toolchain/bin/node')
  const entry = join(stage, 'toolchain/node_modules/pnpm/bin/pnpm.mjs')
  return args => run(node, [entry, ...args], { cwd, env })
}

export async function deployGithubRuntime(stage) {
  const pnpm = upstreamPnpm(stage)
  const deployment = join(stage, 'runtime')
  const store = join(stage, 'store')
  pnpm(['--filter', '@deepseek-ai/dsh', 'run', 'prepack'])
  try {
    // The upstream runtime closure includes the workspace peers that the CLI deploy omits.
    pnpm(['--filter', 'dsh-python-runtime-closure', 'deploy', '--prod', '--store-dir', store,
      '--config.allow-unused-patches=true', '--config.node-linker=hoisted',
      `--config.pnpmfile=${join(stage, 'source/scripts/python-runtime-deploy.pnpmfile.mjs')}`,
      '--config.link-workspace-packages=true', '--config.hoist-workspace-packages=false', deployment])
  } finally {
    pnpm(['--filter', '@deepseek-ai/dsh', 'run', 'postpack'])
  }
  pnpm(['exec', 'tsx', '--eval', `
    import { materializeStagedLinks, deduplicateStagedWorkspacePackages } from './scripts/build-exe-for-python-sdk-staging.ts'
    import { verifyStagedDependencies } from './scripts/executable-packaging.ts'
    const deployment = process.argv[1]
    materializeStagedLinks(deployment)
      .then(() => deduplicateStagedWorkspacePackages(deployment, deployment))
      .then(() => verifyStagedDependencies(deployment))
      .catch(error => { console.error(error); process.exitCode = 1 })
  `, deployment])
}

export async function buildGithubRuntime(stage, target) {
  const source = join(stage, 'source')
  const toolchain = join(stage, 'toolchain')
  const bin = join(toolchain, 'bin')
  await mkdir(bin, { recursive: true })
  run('git', ['init', '--quiet', source])
  run('git', ['fetch', '--depth=1', `${target.repository}.git`, `refs/tags/${target.tag}`], { cwd: source })
  run('git', ['-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: source })
  await sourceIdentity(source, target)
  const { packageManager } = await readJson(join(source, 'package.json'))
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) throw new Error('GitHub release must pin an exact pnpm version')
  run('npm', ['install', '--prefix', toolchain, '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry', 'https://registry.npmjs.org/', packageManager])
  await cp(process.execPath, join(bin, 'node'))
  await chmod(join(bin, 'node'), 0o755)
  await writeFile(join(bin, 'pnpm'), '#!/bin/sh\nBIN="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$BIN/node" "$BIN/../node_modules/pnpm/bin/pnpm.mjs" "$@"\n', { mode: 0o755 })
  const base = `https://nodejs.org/dist/${process.version}`
  const name = `node-${process.version}-headers.tar.gz`
  const [headers, checksums] = await Promise.all([fetch(`${base}/${name}`), fetch(`${base}/SHASUMS256.txt`)])
  if (!headers.ok || !checksums.ok) throw new Error('Cannot download headers for the build Node version')
  const bytes = Buffer.from(await headers.arrayBuffer())
  const expected = (await checksums.text()).split('\n').find(line => line.endsWith(`  ${name}`))?.split(' ')[0]
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node header archive checksum mismatch')
  const archive = join(toolchain, name)
  await writeFile(archive, bytes)
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', toolchain])
  const pnpm = upstreamPnpm(stage)
  pnpm(['install', '--frozen-lockfile', '--store-dir', join(stage, 'store')])
  pnpm(['run', 'build:artifacts', '--profile', 'official'])
  await deployGithubRuntime(stage)
}
