import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, open, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { preparePlanningRuntimeDirectory } from './planning-authority.mjs'
import { compilePlanningPackages } from './planning-packages.mjs'

export const PLANNING_CANDIDATE_CONTRACT = 'DSH_PLANNING_CANDIDATE_V1'
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
function fail(message) { throw new Error(`Planning candidate: ${message}`) }
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value) }
  return value
}
function validate(value, root, id) {
  if (value?.contract !== PLANNING_CANDIDATE_CONTRACT || value.id !== id || value.root !== root
    || value.activationAuthorized !== false) fail('INVALID_CANDIDATE')
  const { id: ignored, ...body } = value
  if (digest(body) !== id) fail('CANDIDATE_CHANGED')
  if (digest(compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan })) !== digest(value.packages)) fail('PACKAGES_CHANGED')
  return freeze(value)
}
async function read(root, id) {
  if (!/^[a-f0-9]{64}$/.test(id ?? '')) fail('INVALID_ID')
  if (await realpath(root) !== root) fail('NONCANONICAL_ROOT')
  const directory = join(root, '.dsh-workflow', 'planning-candidates')
  for (const path of [join(root, '.dsh-workflow'), directory]) {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) fail('UNSAFE_PATH')
  }
  const file = join(directory, `${id}.json`)
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('UNSAFE_PATH')
  return validate(JSON.parse(await readFile(file, 'utf8')), root, id)
}
export async function readPlanningCandidate({ root, id }) { return read(root, id) }

/** Persist a compiled draft only. It carries no activation/Owner dispatch authority. */
export async function persistPlanningCandidate({ root, snapshot, plan, packages, registryOperation = null, signal }) {
  const body = { contract: PLANNING_CANDIDATE_CONTRACT, root, snapshot, plan, packages,
    registryOperation, activationAuthorized: false }
  const id = digest(body)
  const candidate = validate({ ...body, id }, root, id)
  const directory = join(root, '.dsh-workflow', 'planning-candidates')
  signal?.throwIfAborted()
  await preparePlanningRuntimeDirectory(root, directory)
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(candidate)}\n`)
    await handle.sync(); await handle.close(); handle = undefined
    await preparePlanningRuntimeDirectory(root, directory)
    signal?.throwIfAborted()
    try { await link(temporary, join(directory, `${id}.json`)) } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    await unlink(temporary)
    const parent = await open(directory, 'r')
    try { await parent.sync() } finally { await parent.close() }
    signal?.throwIfAborted()
    return await read(root, id)
  } finally {
    await handle?.close().catch(() => {})
    await unlink(temporary).catch(() => {})
  }
}
