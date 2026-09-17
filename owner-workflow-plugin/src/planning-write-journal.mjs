import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { mkdir, open, readdir, readFile, link, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PLANNING_WRITE_PREPARED_CONTRACT = 'DSH_PLANNING_WRITE_JOURNAL_PREPARED_V1'
export const PLANNING_WRITE_TERMINAL_CONTRACT = 'DSH_PLANNING_WRITE_JOURNAL_TERMINAL_V1'
export const PLANNING_WRITE_JOURNAL_CONTRACT = 'DSH_PLANNING_WRITE_JOURNAL_V1'

const RECORD_NAME = /^[a-f0-9]{64}\.json$/u

export class PlanningWriteJournalError extends Error {
  constructor(code, detail) {
    super(`Planning write journal: ${code}${detail === undefined ? '' : ` (${detail})`}`)
    this.name = 'PlanningWriteJournalError'
    this.code = code
  }
}

function fail(code, detail) { throw new PlanningWriteJournalError(code, detail) }

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function text(value) {
  return typeof value === 'string' ? value : undefined
}

function callIdentity(actor) {
  const callId = text(actor?.callId)
  const rootCallId = text(actor?.rootCallId)
  const agentId = text(actor?.agent?.id)
  const sessionId = text(actor?.agent?.session?.header?.id)
    ?? text(actor?.agent?.session?.id)
    ?? agentId
  if (callId === undefined || callId === '' || rootCallId === undefined || rootCallId === ''
    || agentId === undefined || agentId === '' || sessionId === undefined || sessionId === '') return undefined
  return { callId, rootCallId, agentId, sessionId }
}

function actorIds(actor) {
  return new Set([
    text(actor?.agent?.id),
    text(actor?.agent?.session?.id),
    text(actor?.agent?.session?.header?.id),
  ].filter(value => value !== undefined && value !== ''))
}

function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function pathForTarget(ctx, target) {
  const processed = typeof ctx?.fs?.processPath === 'function' ? ctx.fs.processPath(target) : undefined
  return typeof processed === 'string' && isAbsolute(processed)
    ? resolve(processed)
    : typeof target?.displayPath === 'string' && isAbsolute(target.displayPath)
      ? resolve(target.displayPath)
      : undefined
}

function finalIntent(event, intent) {
  if (event === 'fs/write-intent') {
    if (intent?.kind === 'createIfAbsent') {
      return { provider: intent, journal: { kind: 'createIfAbsent' } }
    }
    if (intent?.kind === 'replaceIfVersion' && typeof intent.version === 'string' && intent.version !== '') {
      return { provider: intent, journal: { kind: 'replaceIfVersion', version: intent.version } }
    }
    return undefined
  }
  if (event === 'fs/edit-intent' && typeof intent?.version === 'string' && intent.version !== '') {
    return { provider: intent, journal: { kind: 'replaceIfVersion', version: intent.version } }
  }
  return undefined
}

function journalId(callId) {
  return sha256(callId)
}

function pendingKey(call) {
  return JSON.stringify([call.callId, call.rootCallId, call.agentId, call.sessionId])
}

function journalPaths(root) {
  const base = join(root, '.dsh-workflow', 'planning-write-journal')
  return {
    root,
    base,
    prepared: join(base, 'prepared'),
    terminal: join(base, 'terminal'),
  }
}

function assertDirectory(path, root) {
  let stat
  try { stat = lstatSync(path) } catch (error) {
    if (error?.code === 'ENOENT') return false
    fail('STATE_IO', `${path}: ${error?.message ?? String(error)}`)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('STATE_PATH_UNSAFE', path)
  let canonical
  try { canonical = realpathSync(path) } catch (error) {
    fail('STATE_IO', `${path}: ${error?.message ?? String(error)}`)
  }
  if (!within(root, canonical)) fail('STATE_PATH_UNSAFE', path)
  return true
}

async function ensureJournalDirectories(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT')
  let canonicalRoot
  try { canonicalRoot = realpathSync(root) } catch (error) {
    fail('INVALID_ROOT', error?.message ?? String(error))
  }
  const paths = journalPaths(canonicalRoot)
  const segments = [join(canonicalRoot, '.dsh-workflow'), paths.base, paths.prepared, paths.terminal]
  for (const directory of segments) {
    if (!assertDirectory(directory, canonicalRoot)) {
      try { await mkdir(directory, { recursive: false, mode: 0o700 }) } catch (error) {
        if (error?.code !== 'EEXIST') fail('STATE_IO', `${directory}: ${error?.message ?? String(error)}`)
      }
      if (!assertDirectory(directory, canonicalRoot)) fail('STATE_PATH_UNSAFE', directory)
    }
  }
  return paths
}

async function existingJournalDirectories(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('INVALID_ROOT')
  let canonicalRoot
  try { canonicalRoot = realpathSync(root) } catch (error) {
    fail('INVALID_ROOT', error?.message ?? String(error))
  }
  const paths = journalPaths(canonicalRoot)
  const segments = [join(canonicalRoot, '.dsh-workflow'), paths.base, paths.prepared, paths.terminal]
  for (const directory of segments) {
    if (!assertDirectory(directory, canonicalRoot)) return undefined
  }
  return paths
}

async function syncDirectory(directory) {
  let handle
  try {
    handle = await open(directory, 'r')
    await handle.sync()
  } catch (error) {
    fail('STATE_IO', `${directory}: ${error?.message ?? String(error)}`)
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function publishExclusive(directory, name, value) {
  const finalPath = join(directory, `${name}.json`)
  const temporaryPath = join(directory, `.${name}.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await link(temporaryPath, finalPath)
    await syncDirectory(directory)
  } catch (error) {
    if (error?.code === 'EEXIST') fail('DUPLICATE_CALL_ID', value.call?.callId ?? name)
    fail('STATE_IO', `${finalPath}: ${error?.message ?? String(error)}`)
  } finally {
    await handle?.close().catch(() => {})
    await unlink(temporaryPath).catch(() => {})
  }
}

function assertRecordFile(path) {
  let stat
  try { stat = lstatSync(path) } catch (error) {
    fail('STATE_IO', `${path}: ${error?.message ?? String(error)}`)
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) fail('STATE_PATH_UNSAFE', path)
}

async function readRecord(directory, name) {
  const path = join(directory, name)
  assertRecordFile(path)
  let raw
  try { raw = await readFile(path, 'utf8') } catch (error) {
    fail('STATE_IO', `${path}: ${error?.message ?? String(error)}`)
  }
  assertRecordFile(path)
  try { return JSON.parse(raw) } catch { fail('STATE_CORRUPT', path) }
}

async function snapshotBefore(ctx, target, intent, signal) {
  const info = await ctx.fs.stat(target, signal)
  if (intent.kind === 'createIfAbsent') {
    if (info !== undefined) fail('NATIVE_INTENT_MISMATCH', 'create target exists')
    return { version: null, sha256: null, normalizedSha256: null, bytes: 0, rawRoundTrip: true }
  }
  if (info === undefined || String(info.version) !== intent.version) fail('NATIVE_INTENT_MISMATCH', 'replacement version changed')
  const before = await ctx.fs.readText(target, signal)
  const raw = Number.isSafeInteger(info.size) && info.size >= 0
    ? await ctx.fs.readBytes(target, signal, info.size)
    : undefined
  const checked = await ctx.fs.stat(target, signal)
  if (checked === undefined || String(checked.version) !== intent.version) {
    fail('NATIVE_INTENT_MISMATCH', 'replacement changed while journaling')
  }
  const roundTrips = raw !== undefined && raw.byteLength === checked.size
    && Buffer.from(before, 'utf8').equals(Buffer.from(raw))
  return {
    version: intent.version,
    sha256: raw === undefined ? null : sha256Bytes(raw),
    normalizedSha256: sha256(normalizeLineEndings(before)),
    bytes: raw?.byteLength ?? null,
    rawRoundTrip: roundTrips,
  }
}

function writeExpectedAfter(actor) {
  return actor?.name === 'write' && typeof actor?.arguments?.content === 'string'
    ? { sha256: sha256(actor.arguments.content), bytes: Buffer.byteLength(actor.arguments.content, 'utf8') }
    : { sha256: null, bytes: null }
}

function acceptedActor(ctx, runtime, target, actor) {
  const call = callIdentity(actor)
  if (call === undefined || !['write', 'edit'].includes(actor?.name)) return undefined
  const ids = actorIds(actor)
  if ([...ids].some(id => runtime.activeOwners?.has(id) || runtime.agentRoles?.has(id))) return undefined
  if (runtime.modeEnabledForActor?.(actor) !== true) return undefined
  if (runtime.checkToolExecution?.(actor) !== undefined) return undefined
  const root = runtime.actorRoot?.(actor)
  const intendedPath = runtime.orchestratorDocumentPath?.(actor, actor?.arguments?.file_path)
  const actualPath = pathForTarget(ctx, target)
  if (typeof root !== 'string' || typeof intendedPath !== 'string' || actualPath === undefined
    || resolve(intendedPath) !== actualPath) return undefined
  let canonicalRoot
  try { canonicalRoot = realpathSync(root) } catch { return undefined }
  if (!within(canonicalRoot, actualPath)) return undefined
  return { call, root: canonicalRoot, path: actualPath }
}

function valueShape(name, value) {
  if (value === null || typeof value !== 'object') return undefined
  if (typeof value.before !== 'string' && value.before !== null) return undefined
  if (typeof value.after !== 'string') return undefined
  if (name === 'write' && !['create', 'update'].includes(value.operation)) return undefined
  return { before: value.before, after: value.after }
}

async function verifyPost(ctx, pending, marker, result) {
  const base = {
    postVersion: marker.version,
    observedAt: marker.observedAt,
    completeness: 'incomplete',
    checkpointEligible: false,
    before: { ...pending.before },
    after: { sha256: null, normalizedSha256: null, bytes: null, rawRoundTrip: false },
  }
  let info
  let after
  let raw
  try {
    info = await ctx.fs.stat(marker.target)
    if (info === undefined || String(info.version) !== marker.version) return { ...base, reason: 'post-version-changed-before-verification' }
    after = await ctx.fs.readText(marker.target)
    raw = Number.isSafeInteger(info.size) && info.size >= 0
      ? await ctx.fs.readBytes(marker.target, undefined, info.size)
      : undefined
    const rechecked = await ctx.fs.stat(marker.target)
    if (rechecked === undefined || String(rechecked.version) !== marker.version) return { ...base, reason: 'post-version-changed-during-verification' }
  } catch (error) {
    return { ...base, reason: `post-verification-failed:${error?.code ?? error?.name ?? 'error'}` }
  }
  const observedAfter = {
    sha256: raw === undefined ? null : sha256Bytes(raw),
    normalizedSha256: sha256(normalizeLineEndings(after)),
    bytes: raw?.byteLength ?? null,
    rawRoundTrip: raw !== undefined && raw.byteLength === info.size
      && Buffer.from(after, 'utf8').equals(Buffer.from(raw)),
  }
  const shape = result?.isError === false ? valueShape(pending.call.name, result.value) : undefined
  if (shape === undefined) return { ...base, after: observedAfter, reason: 'tool-result-does-not-carry-native-outcome' }
  const beforeMatches = (shape.before === null && pending.before.sha256 === null)
    || (typeof shape.before === 'string' && pending.before.normalizedSha256 === sha256(shape.before))
  const afterMatches = sha256(shape.after) === observedAfter.normalizedSha256
  const expectedMatches = pending.expectedAfter.sha256 === null || pending.expectedAfter.sha256 === observedAfter.sha256
  if (!pending.before.rawRoundTrip || !observedAfter.rawRoundTrip || !beforeMatches || !afterMatches || !expectedMatches) {
    return { ...base, after: observedAfter, reason: 'native-outcome-cross-check-failed' }
  }
  return {
    ...base,
    after: observedAfter,
    completeness: 'complete',
    checkpointEligible: false,
    resultBeforeNormalizedSha256: shape.before === null ? null : sha256(shape.before),
    resultAfterNormalizedSha256: sha256(shape.after),
  }
}

/**
 * Register a bounded provenance recorder for already-authorized main-thread native write/edit calls.
 * It does not authorize Git/checkpoints, promote pending records, or infer a native write from an error.
 */
export function registerPlanningWriteJournal(ctx, runtime) {
  const pending = new Map()
  const observed = new Map()

  const registerIntent = event => ctx.on(event, async (target, actor, next) => {
    const actorFs = actor?.agent?.ctx?.get?.('fs')
    const filesystem = actorFs ? { fs: actorFs } : ctx
    const accepted = acceptedActor(filesystem, runtime, target, actor)
    if (accepted === undefined) return next()
    const intent = finalIntent(event, await next())
    if (intent === undefined) fail('NATIVE_CAS_REQUIRED', accepted.call.callId)
    const before = await snapshotBefore(filesystem, target, intent.journal, actor.signal)
    const paths = await ensureJournalDirectories(accepted.root)
    const id = journalId(accepted.call.callId)
    const expectedAfter = writeExpectedAfter(actor)
    const record = {
      contract: PLANNING_WRITE_PREPARED_CONTRACT,
      phase: 'prepared',
      checkpointEligible: false,
      journalId: id,
      call: { ...accepted.call, name: actor.name },
      root: accepted.root,
      target: {
        path: accepted.path,
        targetKey: String(target.targetKey),
        displayPath: String(target.displayPath),
      },
      finalIntent: intent.journal,
      before,
      expectedAfter,
    }
    await publishExclusive(paths.prepared, id, record)
    pending.set(pendingKey(accepted.call), { ...record, paths, target, filesystem })
    return intent.provider
  }, { global: true, prepend: true })

  const observedDisposer = ctx.on('fs/observed', (target, observation, actor) => {
    const call = callIdentity(actor)
    const active = call === undefined ? undefined : pending.get(pendingKey(call))
    if (active === undefined || observation?.kind !== 'present' || String(observation.version) === '') return
    if (String(target?.targetKey) !== active.target.targetKey) return
    observed.set(pendingKey(call), { target, version: String(observation.version), observedAt: new Date().toISOString() })
  }, { global: true, prepend: true })

  const executionDisposer = ctx.on('tools/execute', async (actor, next) => {
    const call = callIdentity(actor)
    const key = call === undefined ? undefined : pendingKey(call)
    let result
    let nextError
    try {
      result = await next()
    } catch (error) {
      nextError = error
    }
    const active = key === undefined ? undefined : pending.get(key)
    if (active === undefined) {
      if (nextError !== undefined) throw nextError
      return result
    }
    try {
      const marker = observed.get(key)
      const terminal = marker === undefined
        ? {
            contract: PLANNING_WRITE_TERMINAL_CONTRACT,
            phase: 'terminal',
            status: 'unknown',
            checkpointEligible: false,
            journalId: active.journalId,
            call: active.call,
            preparedContract: active.contract,
            reason: 'no-same-call-native-observation',
          }
        : {
            contract: PLANNING_WRITE_TERMINAL_CONTRACT,
            phase: 'terminal',
            status: 'native-observed',
            journalId: active.journalId,
            call: active.call,
            preparedContract: active.contract,
            ...(await verifyPost(active.filesystem, active, marker, result)),
          }
      // A terminal publication failure deliberately propagates after the native call. The immutable
      // prepared record remains the sole durable fact; it is never checkpoint-eligible.
      const paths = await ensureJournalDirectories(active.root)
      if (paths.prepared !== active.paths.prepared || paths.terminal !== active.paths.terminal) {
        fail('STATE_PATH_UNSAFE', active.root)
      }
      await publishExclusive(paths.terminal, active.journalId, terminal)
    } finally {
      pending.delete(key)
      observed.delete(key)
    }
    if (nextError !== undefined) throw nextError
    return result
  }, { global: true, prepend: true })

  return [registerIntent('fs/write-intent'), registerIntent('fs/edit-intent'), observedDisposer, executionDisposer]
}

/** Read immutable records for diagnostics only. Neither prepared nor terminal records authorize a checkpoint. */
export async function readPlanningWriteJournal({ root } = {}) {
  const paths = await existingJournalDirectories(root)
  if (paths === undefined) return Object.freeze({ contract: PLANNING_WRITE_JOURNAL_CONTRACT, records: [] })
  const [preparedNames, terminalNames] = await Promise.all([
    readdir(paths.prepared),
    readdir(paths.terminal),
  ])
  for (const name of [...preparedNames, ...terminalNames]) {
    if (!RECORD_NAME.test(name)) fail('STATE_AMBIGUOUS', name)
  }
  const names = [...new Set([...preparedNames, ...terminalNames])].sort()
  const records = []
  for (const name of names) {
    const [prepared, terminal] = await Promise.all([
      preparedNames.includes(name) ? readRecord(paths.prepared, name) : undefined,
      terminalNames.includes(name) ? readRecord(paths.terminal, name) : undefined,
    ])
    if (prepared?.contract !== PLANNING_WRITE_PREPARED_CONTRACT) fail('STATE_CORRUPT', `prepared/${name}`)
    if (terminal !== undefined && terminal?.contract !== PLANNING_WRITE_TERMINAL_CONTRACT) fail('STATE_CORRUPT', `terminal/${name}`)
    records.push(Object.freeze({
      journalId: name.slice(0, -'.json'.length),
      prepared: prepared === undefined ? null : Object.freeze(prepared),
      terminal: terminal === undefined ? null : Object.freeze(terminal),
      checkpointEligible: false,
    }))
  }
  return Object.freeze({ contract: PLANNING_WRITE_JOURNAL_CONTRACT, records: Object.freeze(records) })
}
