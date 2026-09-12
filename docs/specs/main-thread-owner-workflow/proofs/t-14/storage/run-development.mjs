import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { generateRuntimeAdapter } from './generate-runtime-adapter.mjs'
import {
  createRecoveryBudget,
  registerRecoveryProblem,
} from '../../../../../../owner-workflow-plugin/src/recovery-budget.mjs'

const storage = dirname(fileURLToPath(import.meta.url))
const sessionsDirectory = join(storage, 'sessions')
const worker = join(storage, 'probe-worker.mjs')
const ownedChildren = new Set()
const ownedRoots = new Set()
const mode = process.argv[2] ?? '--development'
if (!['--development', '--formal'].includes(mode)) throw new Error('用法：node run-development.mjs [--development|--formal]')
const adapter = await generateRuntimeAdapter()
const { readJson, saveState, statePath, writeJsonAtomic } = await import(pathToFileURL(adapter.path).href)

function valueAt(messages, type) {
  return messages.find(message => message.type === type)
}

function valuesAt(messages, type) {
  return messages.filter(message => message.type === type)
}

function digestProcess(result) {
  return {
    pid: result.child.pid,
    code: result.exit.code,
    signal: result.exit.signal,
    messages: result.messages,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function startWorker(scenario, config) {
  const child = fork(worker, [scenario, JSON.stringify(config)], { silent: true })
  ownedChildren.add(child)
  child.once('exit', () => ownedChildren.delete(child))
  const messages = []
  let stdout = ''
  let stderr = ''
  child.on('message', message => messages.push(message))
  child.stdout?.on('data', value => { stdout += String(value) })
  child.stderr?.on('data', value => { stderr += String(value) })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  return { child, messages, get stdout() { return stdout }, get stderr() { return stderr }, exited }
}

async function awaitExit(result, timeoutMs = 10_000) {
  let timer
  try {
    const exit = await Promise.race([result.exited, new Promise((_, reject) => {
      timer = setTimeout(() => {
        result.child.kill('SIGKILL')
        reject(new Error(`子进程 ${result.child.pid} 在 ${timeoutMs}ms 内未退出`))
      }, timeoutMs)
    })])
    return { ...result, exit }
  } finally { clearTimeout(timer) }
}

async function awaitMessage(result, predicate, description, timeoutMs = 10_000) {
  const existing = result.messages.find(predicate)
  if (existing !== undefined) return existing
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      result.child.off('message', onMessage)
      reject(new Error(`等待 ${description} 超时；当前消息：${JSON.stringify(result.messages)}`))
    }, timeoutMs)
    const onMessage = message => {
      if (!predicate(message)) return
      clearTimeout(timer)
      result.child.off('message', onMessage)
      resolve(message)
    }
    result.child.on('message', onMessage)
  })
}

async function killAt(result, point) {
  await awaitMessage(result, message => message.type === 'barrier-ready' && message.point === point, `barrier ${point}`)
  assert.equal(result.child.kill('SIGKILL'), true, `无法向子进程 ${result.child.pid} 发送 SIGKILL`)
  const ended = await awaitExit(result)
  assert.equal(ended.exit.signal, 'SIGKILL', `子进程 ${result.child.pid} 没有以 SIGKILL 结束`)
  return ended
}

function continueWorker(result) {
  result.child.send({ command: 'continue' })
}

function baseLedger(workflowId, totalLimit = 1) {
  return registerRecoveryProblem(createRecoveryBudget({ workflowId, totalLimit }), {
    rootProblemId: 'root-problem-1',
    limit: totalLimit,
    source: { id: 'obligation-1', version: 'review-v1' },
  })
}

async function fixture(label, totalLimit = 1) {
  const root = await mkdtemp(join(sessionsDirectory, `${label}-`))
  ownedRoots.add(root)
  const runtimeDirectory = '.probe-runtime'
  const workflowId = `wf-${label}`
  const runtime = { config: { runtimeDirectory } }
  const path = statePath(runtime, root, workflowId)
  await writeJsonAtomic(path, {
    contract: 'DSH_T14_PROBE_WORKFLOW_STATE_V1',
    root,
    id: workflowId,
    status: 'running',
    revision: 0,
    recoveryBudget: baseLedger(workflowId, totalLimit),
  })
  return { root, runtimeDirectory, workflowId, path, runtime }
}

function workerConfig(fixtureValue, requestId, attemptId, extra = {}) {
  return {
    root: fixtureValue.root,
    runtimeDirectory: fixtureValue.runtimeDirectory,
    workflowId: fixtureValue.workflowId,
    requestId,
    attemptId,
    adapterPath: adapter.path,
    ...extra,
  }
}

async function stateOf(fixtureValue) {
  return readJson(fixtureValue.path)
}

function boundaryCount(result) {
  return valuesAt(result.messages, 'simulated-external-start-boundary').length
}

async function runNormal() {
  const item = await fixture('normal')
  const result = await awaitExit(startWorker('reserve', workerConfig(item, 'request-normal', 'attempt-normal')))
  const state = await stateOf(item)
  assert.equal(result.exit.code, 0)
  assert.equal(valueAt(result.messages, 'result')?.outcome, 'reserved')
  assert.equal(boundaryCount(result), 1)
  assert.equal(state.recoveryBudget.totalUsed, 1)
  return { item, result: digestProcess(result), state }
}

async function runBeforeReadKill() {
  const item = await fixture('before-read')
  const crashed = await killAt(startWorker('reserve', workerConfig(item, 'request-before-read', 'attempt-before-read', { gate: 'before-read' })), 'before-read')
  const afterKill = await stateOf(item)
  assert.equal(afterKill.recoveryBudget.totalUsed, 0)
  const restarted = await awaitExit(startWorker('reserve', workerConfig(item, 'request-before-read', 'attempt-before-read')))
  const afterRestart = await stateOf(item)
  assert.equal(boundaryCount(restarted), 1)
  assert.equal(afterRestart.recoveryBudget.totalUsed, 1)
  return { item, crashed: digestProcess(crashed), afterKill, restarted: digestProcess(restarted), afterRestart }
}

async function runComputeKillAndTrueStaleRecovery() {
  const item = await fixture('compute-kill')
  const crashed = await killAt(startWorker('reserve', workerConfig(item, 'request-compute', 'attempt-compute', { gate: 'reserved-in-memory-before-save' })), 'reserved-in-memory-before-save')
  const afterKill = await stateOf(item)
  assert.equal(afterKill.recoveryBudget.totalUsed, 0)
  const immediate = await awaitExit(startWorker('reserve', workerConfig(item, 'request-compute', 'attempt-compute')))
  const immediateError = valueAt(immediate.messages, 'operation-error')
  assert.match(immediateError?.message ?? '', /状态正在由另一个 Harness 临界区更新/)
  assert.equal(boundaryCount(immediate), 0)
  const waitedAt = Date.now()
  await new Promise(resolve => setTimeout(resolve, 30_300))
  const staleWaitMs = Date.now() - waitedAt
  const recovered = await awaitExit(startWorker('reserve', workerConfig(item, 'request-compute', 'attempt-compute')))
  const afterRecovery = await stateOf(item)
  assert.equal(boundaryCount(recovered), 1)
  assert.equal(afterRecovery.recoveryBudget.totalUsed, 1)
  return {
    item,
    crashed: digestProcess(crashed),
    afterKill,
    immediate: digestProcess(immediate),
    trueStaleWaitMs: staleWaitMs,
    recovered: digestProcess(recovered),
    afterRecovery,
  }
}

async function runAfterSaveKill() {
  const item = await fixture('after-save')
  const crashed = await killAt(startWorker('reserve', workerConfig(item, 'request-after-save', 'attempt-after-save', { gate: 'after-save-before-start' })), 'after-save-before-start')
  const afterKill = await stateOf(item)
  assert.equal(afterKill.recoveryBudget.totalUsed, 1)
  assert.equal(afterKill.recoveryBudget.attempts.length, 1)
  const reconciled = await awaitExit(startWorker('reconcile', workerConfig(item, 'request-after-save', 'attempt-after-save')))
  assert.equal(valueAt(reconciled.messages, 'reconciliation-required')?.outcome, 'replayed')
  assert.equal(boundaryCount(reconciled), 0)
  return { item, crashed: digestProcess(crashed), afterKill, reconciled: digestProcess(reconciled) }
}

async function runConcurrentLastCredit(sameRequest = false) {
  const item = await fixture('concurrent-credit')
  const left = startWorker('reserve', workerConfig(item, 'request-left', 'attempt-left', {
    gate: 'before-read', holdInsideMs: 150, retryLockMs: 1_000,
  }))
  const right = startWorker('reserve', workerConfig(item, sameRequest ? 'request-left' : 'request-right', sameRequest ? 'attempt-left' : 'attempt-right', {
    gate: 'before-read', holdInsideMs: 150, retryLockMs: 1_000,
  }))
  await Promise.all([
    awaitMessage(left, message => message.type === 'barrier-ready' && message.point === 'before-read', 'left concurrent barrier'),
    awaitMessage(right, message => message.type === 'barrier-ready' && message.point === 'before-read', 'right concurrent barrier'),
  ])
  continueWorker(left)
  continueWorker(right)
  const [leftDone, rightDone] = await Promise.all([awaitExit(left), awaitExit(right)])
  const outcomes = [leftDone, rightDone].map(value => valueAt(value.messages, 'result')?.outcome).sort()
  const state = await stateOf(item)
  assert.deepEqual(outcomes, [sameRequest ? 'replayed' : 'rejected', 'reserved'])
  assert.equal(boundaryCount(leftDone) + boundaryCount(rightDone), 1)
  assert.equal(state.recoveryBudget.totalUsed, 1)
  assert.equal(state.recoveryBudget.attempts.length, 1)
  assert.ok(valuesAt(leftDone.messages, 'write-lock-contended').length + valuesAt(rightDone.messages, 'write-lock-contended').length >= 1)
  return { item, left: digestProcess(leftDone), right: digestProcess(rightDone), outcomes, state }
}

async function runSameRequestReplay() {
  const item = await fixture('same-request')
  const first = await awaitExit(startWorker('reserve', workerConfig(item, 'request-replay', 'attempt-replay')))
  const replay = await awaitExit(startWorker('reserve', workerConfig(item, 'request-replay', 'attempt-replay')))
  const state = await stateOf(item)
  assert.equal(valueAt(first.messages, 'result')?.outcome, 'reserved')
  assert.equal(valueAt(replay.messages, 'result')?.outcome, 'replayed')
  assert.equal(boundaryCount(first), 1)
  assert.equal(boundaryCount(replay), 0)
  assert.equal(state.recoveryBudget.totalUsed, 1)
  assert.equal(state.recoveryBudget.attempts.length, 1)
  return { item, first: digestProcess(first), replay: digestProcess(replay), state }
}

async function runUnreadableAndSaveFailure() {
  const syntax = await fixture('syntax-corrupt')
  await writeFile(syntax.path, '{', 'utf8')
  const syntaxRun = await awaitExit(startWorker('reserve', workerConfig(syntax, 'request-syntax', 'attempt-syntax')))
  assert.equal(boundaryCount(syntaxRun), 0)
  assert.ok(valueAt(syntaxRun.messages, 'operation-error'))

  const incomplete = await fixture('shape-incomplete')
  await writeJsonAtomic(incomplete.path, {
    root: incomplete.root,
    id: incomplete.workflowId,
    status: 'running',
    revision: 0,
  })
  const incompleteRun = await awaitExit(startWorker('reserve', workerConfig(incomplete, 'request-incomplete', 'attempt-incomplete')))
  assert.equal(boundaryCount(incompleteRun), 0)
  assert.match(valueAt(incompleteRun.messages, 'operation-error')?.message ?? '', /必须是普通对象/)

  const failedSave = await fixture('save-failure')
  const failedSaveRun = await awaitExit(startWorker('reserve', workerConfig(failedSave, 'request-save-failure', 'attempt-save-failure', {
    inject: 'replace-state-with-directory',
  })))
  assert.equal(boundaryCount(failedSaveRun), 0)
  assert.ok(valueAt(failedSaveRun.messages, 'save-failure-injected'))
  assert.ok(valueAt(failedSaveRun.messages, 'operation-error'))
  assert.equal(existsSync(failedSave.path), true)
  await rm(failedSave.path, { recursive: true, force: true })
  return {
    syntax: { item: syntax, run: digestProcess(syntaxRun) },
    incomplete: { item: incomplete, run: digestProcess(incompleteRun) },
    saveFailure: { item: failedSave, run: digestProcess(failedSaveRun) },
  }
}

async function runOrdinaryCasCounterexample() {
  const item = await fixture('ordinary-cas')
  const stale = startWorker('ordinary-cas', workerConfig(item, 'request-unused', 'attempt-unused', { gate: 'stale-read' }))
  await awaitMessage(stale, message => message.type === 'barrier-ready' && message.point === 'stale-read', 'ordinary CAS stale-read barrier')
  const writer = await awaitExit(startWorker('mutate', workerConfig(item, 'request-unused', 'attempt-unused', { marker: 'writer-won' })))
  assert.equal(valueAt(writer.messages, 'result')?.status, 'ok')
  continueWorker(stale)
  const staleDone = await awaitExit(stale)
  const state = await stateOf(item)
  assert.match(valueAt(staleDone.messages, 'ordinary-cas-rejected')?.message ?? '', /状态已被其他 Harness 更新/)
  assert.equal(state.probeMarker, 'writer-won')
  assert.equal(state.revision, 1)
  return { item, writer: digestProcess(writer), stale: digestProcess(staleDone), state }
}

const results = {
  contract: 'DSH_T14_STORAGE_PROBE_V1',
  mode,
  startedAt: new Date().toISOString(),
  source: {
    runtime: '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs',
    adapter,
    recoveryBudget: '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/recovery-budget.mjs',
  },
  scenarios: {},
}

await mkdir(sessionsDirectory, { recursive: true })
results.failures = {}
try {
  for (const [name, run] of [
    ['normal', runNormal], ['beforeReadKill', runBeforeReadKill],
    ['computeKillAndTrueStaleRecovery', runComputeKillAndTrueStaleRecovery],
    ['afterSaveKill', runAfterSaveKill], ['concurrentLastCredit', runConcurrentLastCredit],
    ['concurrentSameRequest', () => runConcurrentLastCredit(true)],
    ['sameRequestReplay', runSameRequestReplay],
    ['unreadableAndSaveFailure', runUnreadableAndSaveFailure],
    ['ordinaryCasCounterexample', runOrdinaryCasCounterexample],
  ]) {
    try { results.scenarios[name] = await run() }
    catch (error) {
      results.failures[name] = String(error?.stack ?? error)
      // Stop only this probe's remaining children before collecting independent cases.
      await Promise.allSettled([...ownedChildren].map(child => new Promise(resolve => {
        child.once('exit', resolve); child.kill('SIGKILL')
      })))
    }
    await writeFile(join(storage, mode === '--formal' ? 'formal-results.json' : 'development-takeover-results.json'), `${JSON.stringify(results, null, 2)}\n`)
  }
  results.finishedAt = new Date().toISOString()
  results.status = Object.keys(results.failures).length === 0 ? 'passed' : 'failed'
  if (results.status === 'failed') process.exitCode = 1
} finally {
  await Promise.allSettled([...ownedChildren].map(child => new Promise(resolve => {
    child.once('exit', resolve); child.kill('SIGKILL')
  })))
  await Promise.allSettled([...ownedRoots].map(root => rm(root, { recursive: true, force: true })))
  await rm(adapter.directory, { recursive: true, force: true })
  await writeFile(join(storage, mode === '--formal' ? 'formal-results.json' : 'development-takeover-results.json'), `${JSON.stringify(results, null, 2)}\n`)
}
console.log(JSON.stringify({ status: results.status, mode, scenarios: Object.keys(results.scenarios), failures: results.failures }))
