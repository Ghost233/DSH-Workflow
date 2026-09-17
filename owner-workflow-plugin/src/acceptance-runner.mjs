import { normalizeVerificationCwd } from './model.mjs'

export const ACCEPTANCE_CANDIDATE_CONTRACT = 'DSH_ACCEPTANCE_CANDIDATE_V1'
export const ACCEPTANCE_RUN_CONTRACT = 'DSH_ACCEPTANCE_RUN_V1'
export const ACCEPTANCE_ITEM_RESULT_CONTRACT = 'DSH_ACCEPTANCE_ITEM_RESULT_V1'

const DIGEST = /^[a-f0-9]{64}$/iu
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu
const ITEM_STATUSES = new Set([
  'passed',
  'failed',
  'timed_out',
  'cancelled',
  'skipped',
  'blocked',
  'not_run',
  'stale_candidate',
])
const MAX_OUTPUT_BYTES = 64 * 1024

function text(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 必须是非空字符串`)
  return value.trim()
}

function digest(value, field) {
  const normalized = text(value, field).toLowerCase()
  if (!DIGEST.test(normalized)) throw new Error(`${field} 必须是64位十六进制SHA-256`)
  return normalized
}

function commit(value, field) {
  const normalized = text(value, field).toLowerCase()
  if (!COMMIT.test(normalized)) throw new Error(`${field} 必须是完整Git commit SHA`)
  return normalized
}

function stringList(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`)
  return value.map((item, index) => text(item, `${field}[${index}]`))
}

function documentReference(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 必须是对象`)
  return Object.freeze({
    id: text(value.id, `${field}.id`),
    revision: text(value.revision, `${field}.revision`),
    digest: digest(value.digest, `${field}.digest`),
  })
}

export function normalizeAcceptanceCandidate(value) {
  if (value?.contract !== ACCEPTANCE_CANDIDATE_CONTRACT) {
    throw new Error(`集中验收候选contract必须是${ACCEPTANCE_CANDIDATE_CONTRACT}`)
  }
  if (!Array.isArray(value.tickets) || value.tickets.length === 0) throw new Error('集中验收候选至少绑定一个Ticket')
  const tickets = value.tickets.map((item, index) => documentReference(item, `candidate.tickets[${index}]`))
  if (new Set(tickets.map(item => item.id)).size !== tickets.length) throw new Error('集中验收候选Ticket不能重复')
  return Object.freeze({
    contract: ACCEPTANCE_CANDIDATE_CONTRACT,
    candidateId: text(value.candidateId, 'candidate.candidateId'),
    workflowId: text(value.workflowId, 'candidate.workflowId'),
    planningSnapshotDigest: digest(value.planningSnapshotDigest, 'candidate.planningSnapshotDigest'),
    planDigest: digest(value.planDigest, 'candidate.planDigest'),
    codeCommitSha: commit(value.codeCommitSha, 'candidate.codeCommitSha'),
    spec: documentReference(value.spec, 'candidate.spec'),
    tickets: Object.freeze(tickets),
  })
}

function normalizeDisposition(value, field) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 必须是对象`)
  if (!['skip', 'not_run'].includes(value.kind)) throw new Error(`${field}.kind必须是skip或not_run`)
  return Object.freeze({ kind: value.kind, reason: text(value.reason, `${field}.reason`) })
}

function normalizeItem(value, index) {
  const field = `items[${index}]`
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field}必须是对象`)
  const timeoutMs = Number(value.timeoutMs)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error(`${field}.timeoutMs必须是正整数`)
  const argv = stringList(value.argv, `${field}.argv`)
  if (argv.length === 0) throw new Error(`${field}.argv必须非空`)
  return Object.freeze({
    id: text(value.id, `${field}.id`),
    title: text(value.title, `${field}.title`),
    dependsOn: Object.freeze(stringList(value.dependsOn ?? [], `${field}.dependsOn`)),
    argv: Object.freeze(argv),
    cwd: normalizeVerificationCwd(value.cwd ?? '.', `${field}.cwd`),
    timeoutMs,
    disposition: normalizeDisposition(value.disposition, `${field}.disposition`),
  })
}

export function normalizeAcceptanceItems(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('集中验收至少声明一个验证项')
  const items = values.map(normalizeItem)
  const byId = new Map()
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`集中验收验证项重复：${item.id}`)
    byId.set(item.id, item)
  }
  for (const item of items) {
    for (const dependency of item.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`集中验收验证项${item.id}依赖未知项：${dependency}`)
      if (dependency === item.id) throw new Error(`集中验收验证项${item.id}不能依赖自身`)
    }
  }
  const remaining = new Map(items.map((item, index) => [item.id, { item, index }]))
  const resolved = new Set()
  const ordered = []
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(({ item }) => item.dependsOn.every(id => resolved.has(id)))
      .sort((left, right) => left.index - right.index)
    if (ready.length === 0) throw new Error(`集中验收验证项存在依赖环：${[...remaining.keys()].join(', ')}`)
    for (const entry of ready) {
      ordered.push(entry.item)
      resolved.add(entry.item.id)
      remaining.delete(entry.item.id)
    }
  }
  return Object.freeze(ordered)
}

function boundedOutput(value) {
  const buffer = Buffer.from(String(value ?? ''), 'utf8')
  if (buffer.byteLength <= MAX_OUTPUT_BYTES) return { text: buffer.toString('utf8'), truncated: false }
  return { text: buffer.subarray(buffer.byteLength - MAX_OUTPUT_BYTES).toString('utf8'), truncated: true }
}

function itemResult(item, candidate, status, detail = {}) {
  if (!ITEM_STATUSES.has(status)) throw new Error(`集中验收结果状态不受支持：${status}`)
  return Object.freeze({
    contract: ACCEPTANCE_ITEM_RESULT_CONTRACT,
    itemId: item.id,
    title: item.title,
    status,
    candidateId: candidate.candidateId,
    codeCommitSha: candidate.codeCommitSha,
    argv: item.argv,
    cwd: item.cwd,
    dependsOn: item.dependsOn,
    ...detail,
  })
}

function classifyEvidence(item, candidate, evidence) {
  const stdout = boundedOutput(evidence?.stdout?.text ?? evidence?.stdout)
  const stderr = boundedOutput(evidence?.stderr?.text ?? evidence?.stderr)
  const base = {
    exitCode: Number.isInteger(evidence?.exitCode) ? evidence.exitCode : null,
    timedOut: evidence?.timedOut === true,
    aborted: evidence?.aborted === true,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
  }
  if (evidence?.codeCommitSha !== candidate.codeCommitSha) {
    return itemResult(item, candidate, 'stale_candidate', {
      ...base,
      reason: '执行证据与固定候选的代码提交不一致',
      observedCodeCommitSha: evidence?.codeCommitSha ?? null,
    })
  }
  if (evidence?.timedOut === true) return itemResult(item, candidate, 'timed_out', base)
  if (evidence?.aborted === true) return itemResult(item, candidate, 'cancelled', base)
  if (!Number.isInteger(evidence?.exitCode) || evidence.exitCode !== 0) return itemResult(item, candidate, 'failed', base)
  return itemResult(item, candidate, 'passed', base)
}

function runStatus(results) {
  if (results.every(result => result.status === 'passed')) return 'passed'
  if (results.some(result => ['cancelled', 'not_run'].includes(result.status))) return 'cancelled'
  return 'failed'
}

export async function runAcceptanceSuite({ candidate: rawCandidate, items: rawItems, executor, signal }) {
  const candidate = normalizeAcceptanceCandidate(rawCandidate)
  const items = normalizeAcceptanceItems(rawItems)
  if (executor === null || typeof executor?.run !== 'function') throw new Error('集中验收执行器必须提供run方法')
  const results = []
  const byId = new Map()
  for (const item of items) {
    let result
    if (signal?.aborted) {
      result = itemResult(item, candidate, 'not_run', { reason: '集中验收在该项启动前已取消' })
    } else if (item.disposition?.kind === 'skip') {
      result = itemResult(item, candidate, 'skipped', { reason: item.disposition.reason })
    } else if (item.disposition?.kind === 'not_run') {
      result = itemResult(item, candidate, 'not_run', { reason: item.disposition.reason })
    } else {
      const blockers = item.dependsOn.filter(id => byId.get(id)?.status !== 'passed')
      if (blockers.length > 0) {
        result = itemResult(item, candidate, 'blocked', {
          blockedBy: blockers.map(id => ({ itemId: id, status: byId.get(id).status })),
          reason: '真实前置没有通过，当前项未执行',
        })
      } else {
        try {
          const evidence = await executor.run({
            itemId: item.id,
            argv: item.argv,
            cwd: item.cwd,
            timeoutMs: item.timeoutMs,
            candidate,
            signal,
          })
          result = classifyEvidence(item, candidate, evidence)
        } catch (error) {
          result = itemResult(item, candidate, signal?.aborted ? 'cancelled' : 'failed', {
            failureKind: 'execution_error',
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    results.push(result)
    byId.set(item.id, result)
  }
  const counts = Object.fromEntries([...ITEM_STATUSES].map(status => [status, results.filter(item => item.status === status).length]))
  return Object.freeze({
    contract: ACCEPTANCE_RUN_CONTRACT,
    candidate,
    status: runStatus(results),
    counts: Object.freeze(counts),
    results: Object.freeze(results),
  })
}
