import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const exec = promisify(execFile)
const repository = 'https://github.com/browser-use/browser-harness'
const submodule = 'vendor/browser-harness'
const selected = path => ['SKILL.md', 'install.md', 'LICENSE'].includes(path) || /^interaction-skills\/[\w-]+\.md$/.test(path)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const skillRoot = root => join(root, 'browser-harness-plugin/skills/browser-harness')

/** Read only committed, unmodified official skill inputs from the exact gitlink. */
export async function readPinnedBrowserHarness(root) {
  const git = async (cwd, args) => (await exec('git', ['-C', cwd, ...args], { maxBuffer: 2 * 1024 * 1024 })).stdout
  const pin = (await git(root, ['ls-files', '--stage', '--', submodule])).match(/^160000 ([a-f0-9]{40}) 0\t/)
  if (!pin) throw new Error('Browser Harness submodule gitlink is missing')
  const directory = join(root, submodule)
  const commit = (await git(directory, ['rev-parse', 'HEAD'])).trim()
  if (commit !== pin[1]) throw new Error('Browser Harness submodule differs from the fixed gitlink')
  if ((await git(directory, ['status', '--porcelain', '--untracked-files=no'])).trim()) {
    throw new Error('Browser Harness submodule contains tracked changes')
  }
  const paths = (await git(directory, ['ls-tree', '-rz', 'HEAD'])).split('\0').filter(Boolean)
    .map(row => row.split('\t')[1]).filter(selected).sort()
  if (!['SKILL.md', 'install.md', 'LICENSE'].every(path => paths.includes(path))) throw new Error('Browser Harness official skill inputs are incomplete')
  const files = {}, blobs = {}
  for (const path of paths) {
    const target = join(directory, path)
    if (!(await lstat(target)).isFile()) throw new Error(`Browser Harness input is not a regular file: ${path}`)
    const bytes = await readFile(target)
    files[path] = sha256(bytes)
    blobs[path] = blobHash(bytes)
  }
  const version = (await readFile(join(directory, 'pyproject.toml'), 'utf8')).match(/^version = "([^"]+)"/m)?.[1]
  if (!version) throw new Error('Browser Harness upstream version is missing')
  return { schema: 1, repository, commit, version, files, blobs }
}

/** Materialize original bytes beside the project skill; no upstream file is rewritten. */
export async function stageBrowserHarnessSkills(root, destination) {
  const { blobs, ...metadata } = await readPinnedBrowserHarness(root)
  const directory = skillRoot(destination)
  await mkdir(directory, { recursive: true })
  await cp(join(skillRoot(root), 'SKILL.md'), join(directory, 'SKILL.md'))
  for (const path of Object.keys(metadata.files)) {
    const target = join(directory, 'references', path)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(root, submodule, path), target)
  }
  await writeFile(join(destination, 'browser-harness-plugin/upstream.json'), JSON.stringify(metadata, null, 2) + '\n')
  await verifyBrowserHarnessSkills(destination)
  return metadata
}

/** Validate the packaged skill independently of a checkout, including after relocation. */
export async function verifyBrowserHarnessSkills(root) {
  const metadata = JSON.parse(await readFile(join(root, 'browser-harness-plugin/upstream.json'), 'utf8'))
  if (metadata.schema !== 1 || metadata.repository !== repository || !/^[a-f0-9]{40}$/.test(metadata.commit)
    || typeof metadata.version !== 'string' || !metadata.files
    || !['SKILL.md', 'install.md', 'LICENSE'].every(path => metadata.files[path])) throw new Error('Invalid Browser Harness skill metadata')
  for (const [path, expected] of Object.entries(metadata.files)) {
    if (!selected(path) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid Browser Harness skill file record')
    const target = join(skillRoot(root), 'references', path)
    if (!(await lstat(target)).isFile() || sha256(await readFile(target)) !== expected) {
      throw new Error(`Browser Harness packaged file differs: ${path}`)
    }
  }
  return metadata
}

/** Informational build-time comparison. A network failure never changes the fixed source. */
export async function checkBrowserHarnessUpstream(root, { fetch: request = globalThis.fetch } = {}) {
  const fixed = await readPinnedBrowserHarness(root)
  try {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'DSH-Workflow' }
    const get = async path => {
      const response = await request(`https://api.github.com/repos/browser-use/browser-harness/${path}`, { headers, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
      return response.json()
    }
    const latest = await get('commits/main')
    if (!/^[a-f0-9]{40}$/.test(latest.sha) || !/^[a-f0-9]{40}$/.test(latest.commit?.tree?.sha)) throw new Error('Invalid upstream commit')
    const tree = await get(`git/trees/${latest.commit.tree.sha}?recursive=1`)
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete upstream tree')
    const blobs = Object.fromEntries(tree.tree.filter(row => row.type === 'blob' && selected(row.path)).map(row => [row.path, row.sha]))
    if (!blobs['SKILL.md']) throw new Error('Upstream skill is missing')
    const changed = [...new Set([...Object.keys(fixed.blobs), ...Object.keys(blobs)])].filter(path => fixed.blobs[path] !== blobs[path]).sort()
    return { state: changed.length ? 'update-available' : 'current', fixed: fixed.commit, latest: latest.sha, changed,
      diff: changed.map(path => ({ path, before: fixed.blobs[path] ?? null, after: blobs[path] ?? null })),
      compareUrl: `${repository}/compare/${fixed.commit}...${latest.sha}` }
  } catch (error) {
    return { state: 'check-failed', fixed: fixed.commit, latest: null, message: String(error.message).slice(0, 200) }
  }
}
