import { createHash, randomUUID } from 'node:crypto'
import { lstat, realpath, mkdir, readdir, readFile, open, link, unlink } from 'node:fs/promises'
import { join, isAbsolute, relative, sep } from 'node:path'
import { sessionEvents } from './dsh-execution.mjs'
import { planningAuthorizationDetail } from './approval-markdown.mjs'

const CONTRACT = 'DSH_PLANNING_AUTHORITY_V1'
const DECISION_CONTRACT = 'DSH_PLANNING_AUTHORIZATION_DECISION_V1'
const APPROVE = '按此规格实施并允许规划文档提交'
const REJECT = '暂不授权'
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))

export class PlanningAuthorizationDecisionError extends Error {
  constructor(decision, options = {}) {
    const code = decision.outcome.toUpperCase()
    const detail = decision.custom ?? decision.answer?.answers?.flatMap(item => item?.selected ?? []).join('、') ?? ''
    super(`Planning authority: ${code}${detail === '' ? '' : ` (${detail})`}`,
      options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'PlanningAuthorizationDecisionError'
    this.code = code
    this.outcome = decision.outcome
    this.decision = clone(decision)
  }
}

/** DSH user messages are local { kind } or Web RPC messages with correlation metadata. */
function nativeUserSource(source) {
  if (source?.kind !== 'user') return false
  if (Object.keys(source).length === 1) return true
  return Object.keys(source).every(key => ['kind', 'rpcId', 'clientTimeZone'].includes(key))
    && typeof source.rpcId === 'string' && source.rpcId.trim() !== ''
    && (source.clientTimeZone === undefined
      || (typeof source.clientTimeZone === 'string' && source.clientTimeZone.trim() !== ''))
}

/** The trusted main thread interprets intent; runtime verifies native provenance.
 * This deliberately does not pretend a keyword matcher understands consent.
 * The quote is evidence, never an externally supplied grant or permission.
 */
export function implementationRequestReceipt(agent, interpretation) {
  if (interpretation === undefined) return undefined
  if (!interpretation || Object.keys(interpretation).sort().join(',') !== 'quote,rationale'
    || typeof interpretation.quote !== 'string' || interpretation.quote.trim().length < 2
    || typeof interpretation.rationale !== 'string' || !interpretation.rationale.trim()) fail('INVALID_IMPLEMENTATION_INTERPRETATION')
  const event = sessionEvents(agent).filter(event => event.type === 'user/message' && event.data?.source?.kind === 'user').at(-1)
  const message = event?.data, source = message?.source
  if (!nativeUserSource(source) || typeof message.id !== 'string'
    || !Number.isSafeInteger(event.seq) || !Array.isArray(message.content)
    || message.content.some(item => item.type !== 'text')) fail('IMPLEMENTATION_REQUEST_NOT_NATIVE_USER')
  const text = message.content.map(item => item.text).join('\n')
  if (!text.includes(interpretation.quote)) fail('IMPLEMENTATION_QUOTE_NOT_IN_LATEST_USER_MESSAGE')
  return { kind: 'direct-user-proceed', messageId: message.id, messageSeq: event.seq,
    messageDigest: createHash('sha256').update(text).digest('hex'), interpretation: clone(interpretation) }
}

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
function nativeDecision(question, answer, exec, bound) {
  const choices = answer?.answers?.filter(item => item?.id === question.id)
  const choice = choices?.length === 1 ? choices[0] : undefined
  const selected = Array.isArray(choice?.selected) ? choice.selected : []
  const custom = typeof choice?.custom === 'string' && choice.custom.trim() !== '' ? choice.custom.trim() : null
  let outcome = 'cancelled'
  if (custom !== null) outcome = 'revision_requested'
  else if (selected.length === 1 && selected[0] === APPROVE) outcome = 'granted'
  else if (selected.length === 1 && selected[0] === REJECT) outcome = 'rejected'
  return {
    contract: DECISION_CONTRACT,
    outcome,
    question: clone(question),
    answer: answer === undefined ? null : clone(answer),
    custom,
    source: {
      kind: 'native-user-question',
      callId: exec.callId,
      rootCallId: exec.rootCallId ?? exec.callId,
      agentId: bound.agentId,
      sessionId: bound.sessionId,
    },
  }
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
function paths(source) {
  return [source.references.spec.path, ...source.references.tickets.map(item => item.document.path),
    ...(source.references.supporting ?? []).map(item => item.path)].sort()
}
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
    || (value.outcome !== undefined && value.outcome !== 'granted')
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) fail('INVALID_GRANT')
  if (value.receipt?.kind === 'native-user-question') {
    if (typeof value.receipt.callId !== 'string') fail('INVALID_GRANT')
    const answers = value.receipt.answer?.answers?.filter(item => item?.id === value.receipt.question?.id)
    if (answers?.length !== 1 || answers[0].custom?.trim()
      || answers[0].selected?.length !== 1 || answers[0].selected[0] !== APPROVE) fail('INVALID_GRANT')
  } else if (value.receipt?.kind === 'direct-user-proceed') {
    const receipt = value.receipt
    if (typeof receipt.messageId !== 'string' || receipt.messageId === ''
      || !/^[a-f0-9]{64}$/u.test(receipt.messageDigest ?? '')
      || !Number.isSafeInteger(receipt.messageSeq) || receipt.messageSeq < 0
      || typeof receipt.toolCallId !== 'string' || receipt.toolCallId === ''
      || receipt.sourceDigest !== value.initialSourceDigest
      || receipt.baselineHead !== value.initialBaseline?.head) fail('INVALID_GRANT')
  } else fail('INVALID_GRANT')
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
function directReceipt(binding, exec, receipt) {
  if (receipt === undefined) return undefined
  if (receipt?.kind !== 'direct-user-proceed'
    || typeof receipt.messageId !== 'string' || receipt.messageId === ''
    || !/^[a-f0-9]{64}$/u.test(receipt.messageDigest ?? '')
    || !Number.isSafeInteger(receipt.messageSeq) || receipt.messageSeq < 0
    || typeof exec?.callId !== 'string' || exec.callId === '') fail('INVALID_DIRECT_RECEIPT')
  return {
    kind: 'direct-user-proceed', messageId: receipt.messageId, messageDigest: receipt.messageDigest,
    messageSeq: receipt.messageSeq, toolCallId: exec.callId,
    sourceDigest: createHash('sha256').update(canonical(binding.source)).digest('hex'),
    baselineHead: binding.source.baseline.head,
    ...(receipt.interpretation ? { interpretation: clone(receipt.interpretation) } : {}),
  }
}

/** Called only by the root Runtime adapter; tool parameters never contain a grant or approval. */
export async function authorizePlanningCheckpoint({ ctx, agent, exec, binding, signal, directProceed, implementationRequest } = {}) {
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
    if (grant.receipt.kind === 'direct-user-proceed'
      && (grant.receipt.sourceDigest !== createHash('sha256').update(canonical(binding.source)).digest('hex')
        || grant.receipt.baselineHead !== binding.source.baseline.head)) fail('ORIGINAL_GRANT_UNAVAILABLE')
    return clone(grant)
  }
  const reusable = existing.filter(grant => grant.receipt.kind === 'native-user-question' && covers(grant, binding.source))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0]
  if (reusable !== undefined) return clone(reusable)
  if (typeof exec?.callId !== 'string' || exec.callId === '') fail('MISSING_NATIVE_CALL_ID')
  const scope = scopeFor(binding.source), id = randomUUID()
  const spec = binding.source.references.spec
  // An existing scoped grant is authoritative without reinterpreting a historical quote.
  // Only a new grant needs fresh native-user evidence; invalid evidence still fails closed.
  const approvedDirectly = directReceipt(binding, exec,
    directProceed ?? implementationRequestReceipt(agent, implementationRequest))
  if (approvedDirectly !== undefined) {
    const body = {
      contract: CONTRACT, outcome: 'granted', id, key, identity: bound, documentScope: scope,
      implementationScope: clone(spec), initialSourceDigest: approvedDirectly.sourceDigest,
      initialBaseline: clone(binding.source.baseline), createdAt: new Date().toISOString(), receipt: approvedDirectly,
    }
    const grant = { ...body, checksum: digest(body) }
    await publish(bound.root, grant, signal)
    abortIfNeeded(signal)
    return clone(validateGrant(grant, key, `${key}-${id}.json`))
  }
  const service = ctx?.userQuestions ?? ctx?.get?.('userQuestions')
  if (typeof service?.ask !== 'function') fail('NATIVE_QUESTION_UNAVAILABLE')
  const question = {
    id: `planning-authority-${id}`, header: '实施与文档提交',
    question: '是否按这份规格继续实施，并允许在当前本地分支提交规划文档？',
    detail: planningAuthorizationDetail({ root: bound.root, branch: bound.branch, spec, scope,
      files: paths(binding.source) }),
    options: [{ label: APPROVE, description: '按当前规格推进，并允许上述范围内的本地规划文档提交。' },
      { label: REJECT, description: '保留当前文档，不提交或启动执行。' }], multiSelect: false,
  }
  let answer
  try {
    answer = await service.ask({ questions: [question], agent, signal })
  } catch (error) {
    if (signal?.aborted !== true && error?.code !== 'DECLINED' && error?.name !== 'AuthorizationDeclinedError') throw error
    throw new PlanningAuthorizationDecisionError(nativeDecision(question, undefined, exec, bound), { cause: error })
  }
  if (signal?.aborted) {
    throw new PlanningAuthorizationDecisionError(nativeDecision(question, answer, exec, bound), { cause: signal.reason })
  }
  const decision = nativeDecision(question, answer, exec, bound)
  if (decision.outcome !== 'granted') throw new PlanningAuthorizationDecisionError(decision)
  const body = {
    contract: CONTRACT, outcome: decision.outcome, id, key, identity: bound, documentScope: scope,
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
