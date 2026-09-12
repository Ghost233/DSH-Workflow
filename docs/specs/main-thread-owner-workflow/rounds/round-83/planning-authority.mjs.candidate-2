import { createHash, randomUUID } from 'node:crypto'
import { lstat, realpath, mkdir, readdir, readFile, open, link, unlink } from 'node:fs/promises'
import { join, isAbsolute, relative, sep } from 'node:path'

const CONTRACT = 'DSH_PLANNING_AUTHORITY_V1'
const APPROVE = '按此规格实施并允许规划文档提交'
const REJECT = '暂不授权'
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fail(code) { throw new Error(`Planning authority: ${code}`) }
function abortIfNeeded(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('Planning authority: ABORTED')
}
function identity(binding) {
  const { root, source } = binding
  if (!isAbsolute(root ?? '') || source?.contract !== 'DSH_PLANNING_SOURCE_CHAIN_V1') fail('INVALID_SOURCE')
  const spec = source.references.spec
  const value = { root, agentId: source.source.agentId, sessionId: source.source.sessionId,
    specId: spec.id, specPath: spec.path, branch: source.baseline.branch }
  if (Object.values(value).some(item => typeof item !== 'string' || item === '')) fail('INVALID_SOURCE')
  return value
}
function paths(source) { return [source.references.spec.path, ...source.references.tickets.map(item => item.document.path)].sort() }
function scopeFor(source) {
  const roots = new Set(), files = new Set()
  for (const path of paths(source)) {
    const parts = path.split('/')
    if (parts[0] === 'docs' && parts[1] === 'specs' && parts.length >= 4) roots.add(parts.slice(0, 3).join('/'))
    else files.add(path)
  }
  return { roots: [...roots].sort(), files: [...files].sort() }
}
function covers(grant, source) {
  return paths(source).every(path => grant.documentScope.files.includes(path)
    || grant.documentScope.roots.some(root => path.startsWith(`${root}/`)))
}
export async function preparePlanningRuntimeDirectory(root, target) {
  const rel = relative(root, target)
  if (await realpath(root) !== root || rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('UNSAFE_STATE_PATH')
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    try { await mkdir(current, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const stat = await lstat(current)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(current) !== current) fail('UNSAFE_STATE_PATH')
  }
}
async function directory(root, create) {
  if (await realpath(root) !== root) fail('ROOT_NOT_CANONICAL')
  let path = root
  for (const segment of ['.dsh-workflow', 'planning-authority']) {
    path = join(path, segment)
    let stat
    try { stat = await lstat(path) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (!create) return undefined
      try { await mkdir(path, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
      stat = await lstat(path)
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) fail('UNSAFE_STATE_PATH')
  }
  return path
}
function validateGrant(value, key, filename) {
  if (value?.contract !== CONTRACT || value.key !== key || filename !== `${key}-${value.id}.json`
    || !/^[a-f0-9-]{36}$/.test(value.id ?? '') || digest(value.identity) !== key
    || !Array.isArray(value.documentScope?.roots) || !Array.isArray(value.documentScope?.files)
    || !value.documentScope.roots.every(path => /^docs\/specs\/[^/.][^/]*$/.test(path))
    || !value.documentScope.files.every(path => typeof path === 'string')
    || value.implementationScope?.id !== value.identity.specId
    || value.implementationScope?.path !== value.identity.specPath
    || value.receipt?.kind !== 'native-user-question' || typeof value.receipt.callId !== 'string'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) fail('INVALID_GRANT')
  const answers = value.receipt.answer?.answers?.filter(item => item?.id === value.receipt.question?.id)
  if (answers?.length !== 1 || answers[0].custom?.trim()
    || answers[0].selected?.length !== 1 || answers[0].selected[0] !== APPROVE) fail('INVALID_GRANT')
  const { checksum, ...body } = value
  if (digest(body) !== checksum) fail('INVALID_GRANT')
  return value
}
async function load(root, key) {
  const dir = await directory(root, false)
  if (dir === undefined) return []
  const result = []
  for (const name of (await readdir(dir)).filter(name => name.startsWith(`${key}-`)).sort()) {
    const path = join(dir, name), stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('UNSAFE_STATE_PATH')
    const value = JSON.parse(await readFile(path, 'utf8'))
    result.push(validateGrant(value, key, name))
  }
  return result
}
async function publish(root, value, signal) {
  abortIfNeeded(signal)
  const dir = await directory(root, true)
  const name = `${value.key}-${value.id}.json`
  const temporary = join(dir, `.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(value)}\n`)
    await handle.sync(); await handle.close(); handle = undefined
    await directory(root, false)
    abortIfNeeded(signal)
    await link(temporary, join(dir, name))
    const parent = await open(dir, 'r')
    try { await parent.sync() } finally { await parent.close() }
  } finally {
    await handle?.close().catch(() => {})
    await unlink(temporary).catch(() => {})
  }
}

/** Called only by the root Runtime adapter; tool parameters never contain a grant or approval. */
export async function authorizePlanningCheckpoint({ ctx, agent, exec, binding, signal }) {
  abortIfNeeded(signal)
  const bound = identity(binding), key = digest(bound)
  const agents = ctx?.agents ?? ctx?.get?.('agents')
  if (agents?.get?.(agent?.id) !== agent || !agents?.roots?.().includes(agent)) fail('CALLER_NOT_LIVE_ROOT')
  if (agent?.id !== bound.agentId
    || (agent.session?.header?.id ?? agent.session?.id ?? agent.id) !== bound.sessionId) fail('ACTOR_MISMATCH')
  const existing = await load(bound.root, key)
  abortIfNeeded(signal)
  if (binding.authorizationId !== undefined) {
    const grant = existing.find(item => item.id === binding.authorizationId)
    if (grant === undefined || !covers(grant, binding.source)) fail('ORIGINAL_GRANT_UNAVAILABLE')
    return clone(grant)
  }
  const reusable = existing.filter(grant => covers(grant, binding.source))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0]
  if (reusable !== undefined) return clone(reusable)
  if (typeof exec?.callId !== 'string' || exec.callId === '') fail('MISSING_NATIVE_CALL_ID')
  const service = ctx?.userQuestions ?? ctx?.get?.('userQuestions')
  if (typeof service?.ask !== 'function') fail('NATIVE_QUESTION_UNAVAILABLE')
  const scope = scopeFor(binding.source), id = randomUUID()
  const spec = binding.source.references.spec
  const question = {
    id: `planning-authority-${id}`, header: '实施与文档提交',
    question: '是否按这份规格继续实施，并允许在当前本地分支提交规划文档？',
    detail: [
      `项目：${bound.root}\n分支：${bound.branch}\n规格：${spec.id} / ${spec.revision}`,
      '实施范围以本次展示的规格为准；后续业务承诺变化仍需你的决定。',
      `本地文档提交范围：${[...scope.roots.map(path => `${path}/**/*.md`), ...scope.files].join('、')}。这个范围内的后续规划文档修订复用本次授权，不逐阶段重复询问。`,
      '每次提交仍核验本次写入来源与代码基线，不包含其他人的修改、业务源码或远程推送。',
      `本次文件：\n${paths(binding.source).map(path => `- ${path}`).join('\n')}`,
      `规格内容：\n${spec.content}`,
    ].join('\n\n'),
    options: [{ label: APPROVE, description: '按当前规格推进，并允许上述范围内的本地规划文档提交。' },
      { label: REJECT, description: '保留当前文档，不提交或启动执行。' }], multiSelect: false,
  }
  const answer = await service.ask({ questions: [question], agent, signal })
  abortIfNeeded(signal)
  const choices = answer?.answers?.filter(item => item?.id === question.id)
  if (choices?.length !== 1 || choices[0].custom?.trim()
    || choices[0].selected?.length !== 1 || choices[0].selected[0] !== APPROVE) fail('NOT_GRANTED')
  const body = {
    contract: CONTRACT, id, key, identity: bound, documentScope: scope,
    implementationScope: clone(spec), initialSourceDigest: createHash('sha256').update(canonical(binding.source)).digest('hex'),
    initialBaseline: clone(binding.source.baseline), createdAt: new Date().toISOString(),
    receipt: { kind: 'native-user-question', callId: exec.callId,
      rootCallId: exec.rootCallId ?? exec.callId, question, answer: clone(answer) },
  }
  const grant = { ...body, checksum: digest(body) }
  await publish(bound.root, grant, signal)
  abortIfNeeded(signal)
  return clone(validateGrant(grant, key, `${key}-${id}.json`))
}
