import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const target = await readJson(new URL('../dsh-runtime.json', import.meta.url))
const platform = () => ({ node: process.versions.node, platform: process.platform, arch: process.arch })

export async function sourceIdentity(root, expected = target) {
  if (expected.source === 'npm') throw new Error('The DSH runtime is pinned to npm; a source checkout is not a release input')
  const [head, status, cli, lock] = await Promise.all([
    exec('git', ['-C', root, 'rev-parse', 'HEAD']),
    exec('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']),
    readJson(join(root, 'apps/cli/package.json')), readFile(join(root, 'pnpm-lock.yaml')),
  ])
  const commit = head.stdout.trim()
  if (status.stdout.trim()) throw new Error(`Harness contains tracked changes; no build or launch performed:\n${status.stdout}`)
  if (commit !== expected.commit || cli.name !== expected.package || cli.version !== expected.version) {
    throw new Error(`Unsupported Harness: ${cli.name}@${cli.version} ${commit}; expected ${expected.package}@${expected.version} ${expected.commit}`)
  }
  return { commit, version: cli.version, lockSha256: hash(lock), ...platform() }
}
