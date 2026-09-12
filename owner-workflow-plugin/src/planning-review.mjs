import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, open, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { preparePlanningRuntimeDirectory } from './planning-authority.mjs'

export const PLANNING_REVIEW_RECEIPT_CONTRACT = 'DSH_PLANNING_REVIEW_RECEIPT_V1'
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const fail = reason => { throw new Error(`Planning review: ${reason}`) }
function validate(value, root, id) {
  if (value?.contract !== PLANNING_REVIEW_RECEIPT_CONTRACT || value.root !== root || value.id !== id
    || value.activationAuthorized !== false) fail('INVALID_RECEIPT')
  const { id: ignored, ...body } = value
  if (digest(body) !== id) fail('RECEIPT_CHANGED')
  if (!/^[a-f0-9]{64}$/.test(value.candidateId ?? '') || !/^[a-f0-9]{64}$/.test(value.planDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(value.registryDigest ?? '')) fail('INVALID_BINDING')
  const source = value.source
  if (source?.kind !== 'structured-plan-review-submit' || source.candidateId !== value.candidateId
    || typeof source.callId !== 'string' || !source.callId
    || typeof source.sessionId !== 'string' || !source.sessionId
    || source.parentId !== value.orchestratorId || source.sessionId === value.orchestratorId
    || source.rawReview === undefined) fail('INVALID_SOURCE')
  return value
}
export async function readPlanningReviewReceipt({ root, id }) {
  if (!/^[a-f0-9]{64}$/.test(id ?? '')) fail('INVALID_ID')
  if (await realpath(root) !== root) fail('NONCANONICAL_ROOT')
  const directory = join(root, '.dsh-workflow', 'planning-reviews')
  for (const path of [join(root, '.dsh-workflow'), directory]) {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) fail('UNSAFE_PATH')
  }
  const path = join(directory, `${id}.json`), stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('UNSAFE_PATH')
  return validate(JSON.parse(await readFile(path, 'utf8')), root, id)
}
export async function persistPlanningReviewReceipt({ root, candidateId, planDigest, registryDigest,
  authorizationId, orchestratorId, source, review, signal }) {
  const body = { contract: PLANNING_REVIEW_RECEIPT_CONTRACT, root, candidateId, planDigest, registryDigest,
    authorizationId, orchestratorId, source, review, activationAuthorized: false }
  const id = digest(body), value = validate({ ...body, id }, root, id)
  const directory = join(root, '.dsh-workflow', 'planning-reviews')
  signal?.throwIfAborted()
  await preparePlanningRuntimeDirectory(root, directory)
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); await handle.close(); handle = undefined
    await preparePlanningRuntimeDirectory(root, directory)
    signal?.throwIfAborted()
    try { await link(temporary, join(directory, `${id}.json`)) } catch (error) { if (error.code !== 'EEXIST') throw error }
    await unlink(temporary)
    const parent = await open(directory, 'r')
    try { await parent.sync() } finally { await parent.close() }
    signal?.throwIfAborted()
    return readPlanningReviewReceipt({ root, id })
  } finally {
    await handle?.close().catch(() => {})
    await unlink(temporary).catch(() => {})
  }
}
