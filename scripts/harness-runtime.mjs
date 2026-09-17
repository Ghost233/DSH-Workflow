import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir, mkdir, rename, lstat, open, unlink } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
export const target = await readJson(new URL('../dsh-runtime.json', import.meta.url))
const stampPath = root => join(root, '.dsh-build', 'owner-workflow-runtime.json')
const missing = error => { if (error.code !== 'ENOENT') throw error }
const platform = () => ({ node: process.versions.node, platform: process.platform, arch: process.arch })

export async function sourceIdentity(root, expected = target) {
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

// Fingerprint build outputs, including client modules, rather than trusting a
// file containing HEAD while stale lib directories still exist on disk.
export async function artifactHashes(root) {
  const roots = ['apps/cli/lib', 'apps/web/dist', 'native/system/lib']
  for (const group of await readdir(join(root, 'packages'), { withFileTypes: true }).catch(error => { missing(error); return [] })) {
    if (!group.isDirectory()) continue
    for (const pkg of await readdir(join(root, 'packages', group.name), { withFileTypes: true })) {
      if (pkg.isDirectory()) roots.push(`packages/${group.name}/${pkg.name}/lib`)
    }
  }
  for (const pkg of await readdir(join(root, 'vendor'), { withFileTypes: true }).catch(error => { missing(error); return [] })) {
    if (pkg.isDirectory()) roots.push(`vendor/${pkg.name}/lib`)
  }
  for (const pkg of await readdir(join(root, 'native/system/packages'), { withFileTypes: true }).catch(error => { missing(error); return [] })) {
    if (pkg.isDirectory()) roots.push(`native/system/packages/${pkg.name}/bin`)
  }
  const files = {}
  const walk = async directory => {
    const stat = await lstat(directory).catch(missing)
    if (stat?.isSymbolicLink()) throw new Error(`Harness output root is a symbolic link: ${directory}`)
    for (const item of await readdir(directory, { withFileTypes: true }).catch(error => { missing(error); return [] })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) await walk(path)
      else if (item.isFile()) files[relative(root, path)] = hash(await readFile(path))
      else throw new Error(`Unexpected non-file build artifact: ${path}`)
    }
  }
  for (const path of roots) await walk(join(root, path))
  for (const required of ['apps/cli/lib/bin.js', 'apps/web/dist/index.html']) {
    if (!files[required]) throw new Error(`Missing Harness build output: ${required}`)
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
}

export async function checkBuild(root, expected = target) {
  const identity = await sourceIdentity(root, expected)
  const buildDirectory = await lstat(join(root, '.dsh-build')).catch(missing)
  if (buildDirectory?.isSymbolicLink()) throw new Error('Harness build directory is a symbolic link')
  const saved = await readJson(stampPath(root)).catch(error => { missing(error); return undefined })
  if (!saved || saved.schema !== 1 || JSON.stringify(saved.source) !== JSON.stringify(identity)) return false
  try { return JSON.stringify(saved.artifacts) === JSON.stringify(await artifactHashes(root)) } catch (error) {
    if (error.code === 'ENOENT' || /Missing Harness build output/.test(error.message)) return false
    throw error
  }
}

/** Daily launch readiness proves the pinned source and required entrypoints.
 * Full artifact hashing remains an explicit build/upgrade verification step. */
export async function checkLaunchReady(root, expected = target) {
  const identity = await sourceIdentity(root, expected)
  const saved = await readJson(stampPath(root)).catch(error => { missing(error); return undefined })
  if (!saved || saved.schema !== 1 || JSON.stringify(saved.source) !== JSON.stringify(identity)) return false
  for (const path of ['apps/cli/lib/bin.js', 'apps/web/dist/index.html']) {
    const stat = await lstat(join(root, path)).catch(missing)
    if (!stat?.isFile() || stat.isSymbolicLink()) return false
  }
  return true
}

async function buildCommand(root, args) {
  await new Promise((done, reject) => {
    const child = spawn('corepack', ['pnpm', ...args], { cwd: root, env: { ...process.env, CI: 'true' }, stdio: 'inherit' })
    const stop = () => child.kill('SIGTERM')
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    const finish = error => {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
      error ? reject(error) : done()
    }
    child.once('error', finish)
    child.once('close', (code, signal) => finish(code === 0 ? undefined : new Error(`Harness ${args.join(' ')} failed (${signal ?? code})`)))
  })
}

async function acquireBuildLock(root) {
  const directory = join(root, '.dsh-build')
  const path = join(directory, 'runtime-build.lock')
  await mkdir(directory, { recursive: true })
  const token = randomUUID()
  try {
    const handle = await open(path, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify({ owner: 'dsh-workflow-harness-build', pid: process.pid, token })) }
    finally { await handle.close() }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const lock = await readJson(path)
    if (lock.owner !== 'dsh-workflow-harness-build' || !Number.isSafeInteger(lock.pid) || lock.pid < 1) {
      throw new Error(`Unrecognized Harness build lock: ${path}`)
    }
    try { process.kill(lock.pid, 0) } catch (cause) {
      if (cause.code !== 'ESRCH') throw cause
      await unlink(path)
      return acquireBuildLock(root)
    }
    throw new Error(`Harness is being built by process ${lock.pid}; wait for that build to finish`)
  }
  return async () => {
    const lock = await readJson(path).catch(missing)
    if (lock?.token === token) await unlink(path)
  }
}

export async function ensureBuild(root, { expected = target, run = buildCommand } = {}) {
  if (await checkBuild(root, expected)) return { rebuilt: false, ...await sourceIdentity(root, expected) }
  const before = await sourceIdentity(root, expected)
  // Refuse a replaced output root instead of following it into user files.
  for (const path of ['.dsh-build', 'apps/cli/lib', 'apps/web/dist']) {
    const stat = await lstat(join(root, path)).catch(missing)
    if (stat?.isSymbolicLink()) throw new Error(`Harness output root is a symbolic link: ${path}`)
  }
  const release = await acquireBuildLock(root)
  try {
    if (await checkBuild(root, expected)) return { rebuilt: false, ...before }
    process.stderr.write(`[harness] Building ${before.version} ${before.commit}; only ignored outputs are writable.\n`)
    await run(root, ['install', '--frozen-lockfile'])
    await run(root, ['run', 'clean'])
    await run(root, ['run', 'build'])
    const after = await sourceIdentity(root, expected)
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Harness source changed while building; build stamp not published')
    const artifacts = await artifactHashes(root)
    await mkdir(join(root, '.dsh-build'), { recursive: true })
    const path = stampPath(root)
    await writeFile(`${path}.tmp`, JSON.stringify({ schema: 1, source: after, artifacts }, null, 2) + '\n')
    await rename(`${path}.tmp`, path)
    return { rebuilt: true, ...after }
  } finally { await release() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, directory] = process.argv.slice(2)
    if (!directory || !['ensure', 'check'].includes(action)) throw new Error('Usage: harness-runtime.mjs ensure|check <Harness directory>')
    const root = resolve(directory)
    if (action === 'check') {
      if (!await checkBuild(root)) throw new Error('Harness build does not match its validated source; run the submodule launcher to rebuild')
    } else {
      const result = await ensureBuild(root)
      process.stderr.write(`[harness] ${target.package}@${result.version} ${result.commit} (${result.rebuilt ? 'rebuilt' : 'verified build'})\n`)
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
