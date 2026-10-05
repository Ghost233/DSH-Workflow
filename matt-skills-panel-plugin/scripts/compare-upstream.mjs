import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const defaultRoot = fileURLToPath(new URL('../', import.meta.url))
const git = async (root, args) => (await exec('git', ['-C', root, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout

/** Compare only imported sources; fetch and checkout are explicit upstream maintenance steps. */
export async function compareUpstream({ forkRoot = defaultRoot, upstreamRoot, target = 'origin/main' } = {}) {
  const baseline = JSON.parse(await readFile(join(forkRoot, 'upstream.json'), 'utf8'))
  upstreamRoot ??= resolve(forkRoot, '..', baseline.submodulePath)
  const commit = (await git(upstreamRoot, ['rev-parse', `${target}^{commit}`])).trim()
  const fields = (await git(upstreamRoot, ['diff', '--name-status', '--no-renames', '-z', baseline.commit, commit, '--', ...baseline.sourcePaths])).split('\0')
  const changes = []
  for (let i = 0; fields[i]; i += 2) changes.push({ status: fields[i], path: fields[i + 1] })
  const manifest = JSON.parse(await git(upstreamRoot, ['show', `${commit}:package/package.json`]))
  return { repository: baseline.repository, baseCommit: baseline.commit, baseVersion: baseline.version,
    targetCommit: commit, targetVersion: manifest.version, changes, forkRoot, upstreamRoot }
}

/** Three-way proposals stay in a review directory; local sources and baseline remain unchanged. */
export async function prepareUpgrade(options = {}) {
  const report = await compareUpstream(options)
  const reviewRoot = join(report.forkRoot, '.upstream-review', report.targetCommit.slice(0, 12))
  await mkdir(reviewRoot, { recursive: true })
  const proposals = []
  for (const change of report.changes) {
    const local = join(report.forkRoot, change.path)
    const proposal = join(reviewRoot, 'proposed', change.path)
    const current = await readFile(local, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
    if (change.status === 'D') { proposals.push({ ...change, resolution: 'review-deletion' }); continue }
    const next = await git(report.upstreamRoot, ['show', `${report.targetCommit}:${change.path}`])
    await mkdir(dirname(proposal), { recursive: true })
    if (current === undefined) {
      await writeFile(proposal, next)
      proposals.push({ ...change, resolution: change.status === 'A' ? 'new-file' : 'local-removal' })
      continue
    }
    if (change.status === 'A') {
      await writeFile(proposal, next)
      proposals.push({ ...change, resolution: 'review-existing-file' })
      continue
    }
    const base = await git(report.upstreamRoot, ['show', `${report.baseCommit}:${change.path}`])
    const work = await mkdtemp(join(reviewRoot, '.merge-'))
    let merged, conflict = false
    try {
      await Promise.all([writeFile(join(work, 'local'), current), writeFile(join(work, 'base'), base), writeFile(join(work, 'new'), next)])
      try { merged = await git(work, ['merge-file', '-p', '--diff3', '-L', 'local', '-L', 'upstream-base', '-L', 'new-upstream', 'local', 'base', 'new']) }
      catch (error) {
        if (!Number.isInteger(error.code) || error.code < 1 || error.code > 127) throw error
        merged = error.stdout; conflict = true
      }
      await writeFile(proposal, merged)
    } finally { await rm(work, { recursive: true, force: true }) }
    proposals.push({ ...change, resolution: conflict ? 'conflict' : 'clean-merge' })
  }
  const result = { ...report, reviewRoot, proposals }
  await writeFile(join(reviewRoot, 'review.json'), JSON.stringify(result, null, 2) + '\n')
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const prepare = args[0] === '--prepare'
    const target = args[prepare ? 1 : 0] ?? 'origin/main'
    const report = await (prepare ? prepareUpgrade({ target }) : compareUpstream({ target }))
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1 }
}
