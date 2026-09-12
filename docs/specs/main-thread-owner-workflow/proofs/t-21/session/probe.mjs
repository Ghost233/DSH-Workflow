/**
 * T-21 source-plane probe for the real Harness JSONL session backend.
 *
 * Run from the repository root with the fixed Node 24 launcher recorded in
 * run-command.txt.  The coordinator process deliberately SIGKILLs one child
 * while it owns a lazy creation and another after a flushed, completed live
 * session.  Each restart is a separate Node process and mounts fresh Cordis
 * services over the same JSONL root.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const selfPath = fileURLToPath(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
const harnessRoot = join(repositoryRoot, 'deepseek-harness')
const sessionIdText = 't21-explicit-session-v1'
const noFileIdText = 't21-never-created-v1'
const cwd = '/t21/session-persistence-proof'
const sourcePaths = [
  'vendor/cordis/src/index.ts',
  'packages/core/session/src/index.ts',
  'packages/llm/llm/src/index.ts',
  'packages/core/system-prompt/src/index.ts',
  'packages/core/tools/src/index.ts',
  'packages/core/agent/src/index.ts',
  'packages/core/agent-loop/src/index.ts',
  'packages/session/session-persistence/src/index.ts',
  'packages/session/session-persistence/src/coordinator.ts',
  'packages/session/session-persistence-jsonl/src/index.ts',
]

/** Return a SHA-256 source manifest for the direct real Harness surfaces. */
async function sourceManifest() {
  return await Promise.all(sourcePaths.map(async sourcePath => {
    const absolute = join(harnessRoot, sourcePath)
    const content = await readFile(absolute)
    return {
      path: `deepseek-harness/${sourcePath}`,
      sha256: createHash('sha256').update(content).digest('hex'),
    }
  }))
}

/** Load the direct TypeScript sources, never a package's built lib/ artifact. */
async function sourceModules() {
  const source = async path => await import(pathToFileURL(join(harnessRoot, path)).href)
  const [cordis, session, llm, systemPrompt, tools, agent, agentLoop, jsonl] = await Promise.all([
    source('vendor/cordis/src/index.ts'),
    source('packages/core/session/src/index.ts'),
    source('packages/llm/llm/src/index.ts'),
    source('packages/core/system-prompt/src/index.ts'),
    source('packages/core/tools/src/index.ts'),
    source('packages/core/agent/src/index.ts'),
    source('packages/core/agent-loop/src/index.ts'),
    source('packages/session/session-persistence-jsonl/src/index.ts'),
  ])
  return {
    Context: cordis.Context,
    SessionStore: session.default,
    SessionId: session.SessionId,
    LlmRuntime: llm.default,
    SystemPrompt: systemPrompt.default,
    ToolRuntime: tools.default,
    AgentRegistry: agent.default,
    AgentLoop: agentLoop.default,
    JsonlSessionPersistence: jsonl.default,
  }
}

/** Mount exactly the production services needed for a no-model create/resume lifecycle. */
async function mountAgentHarness(root) {
  const modules = await sourceModules()
  const ctx = new modules.Context()
  await ctx.plugin(modules.LlmRuntime)
  await ctx.plugin(modules.SessionStore)
  await ctx.plugin(modules.SystemPrompt)
  await ctx.plugin(modules.ToolRuntime)
  await ctx.plugin(modules.AgentRegistry)
  await ctx.plugin(modules.AgentLoop, { agents: [] })
  await ctx.plugin(modules.JsonlSessionPersistence, { root, compression: 'none' })
  return { ctx, modules }
}

/** Mount the real backend without agent-loop services for a detached lazy-create check. */
async function mountPersistence(root) {
  const modules = await sourceModules()
  const ctx = new modules.Context()
  await ctx.plugin(modules.SessionStore)
  await ctx.plugin(modules.JsonlSessionPersistence, { root, compression: 'none' })
  return { ctx, modules }
}

/** Convert the error into a stable evidence value while requiring rejection. */
async function rejected(job, label) {
  try {
    await job
  } catch (error) {
    return { label, name: error?.name ?? typeof error, message: String(error?.message ?? error) }
  }
  assert.fail(`${label} unexpectedly succeeded`)
}

/** Reduce a failed probe stage to reviewable evidence without classifying it as a pass. */
function failedStage(error) {
  return { name: error?.name ?? typeof error, message: String(error?.stack ?? error?.message ?? error) }
}

/** Check that a physical JSONL artifact is absent without swallowing other I/O failures. */
async function isAbsent(path) {
  try {
    await stat(path)
    return false
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
}

/** Deliver one result to the coordinator and retain the process for SIGKILL when requested. */
async function sendResult(value, retain) {
  if (typeof process.send !== 'function') throw new Error('probe child requires an IPC parent')
  process.send(value)
  if (retain) await new Promise(() => {})
}

async function lazyCreateChild(root) {
  const { ctx, modules } = await mountPersistence(root)
  try {
    const id = modules.SessionId(sessionIdText)
    const meta = { version: 0, id, createdAt: 21001, cwd }
    const missingId = modules.SessionId(noFileIdText)
    const location = ctx.sessionPersistence.locate(meta)
    assert.ok(location?.path)
    assert.equal(await isAbsent(location.path), true)
    assert.equal(await ctx.sessionPersistence.readRaw(missingId), undefined)

    await ctx.sessionPersistence.create(meta)
    assert.equal(await isAbsent(location.path), true)
    assert.equal(await ctx.sessionPersistence.readRaw(id), undefined)
    const duplicate = await rejected(ctx.sessionPersistence.create(meta), 'duplicate-lazy-create')
    await sendResult({
      role: 'lazy-create',
      pid: process.pid,
      sessionId: id,
      location,
      states: {
        neverCreatedNoFile: true,
        createdLazyNoFile: true,
        createdLazyReadRaw: 'undefined',
        persistedRecoverable: false,
        currentActive: false,
      },
      duplicate,
      sources: await sourceManifest(),
      mockBoundary: 'none: real Context, SessionStore, and JsonlSessionPersistence; no model, prompt, adapter, or persistence stub',
    }, true)
  } finally {
    // SIGKILL deliberately prevents this disposal in the observed crash path.
    await ctx.fiber.dispose()
  }
}

async function checkNoFileAfterRestart(root) {
  const { ctx, modules } = await mountPersistence(root)
  try {
    const id = modules.SessionId(sessionIdText)
    const meta = { version: 0, id, createdAt: 21001, cwd }
    const location = ctx.sessionPersistence.locate(meta)
    assert.ok(location?.path)
    assert.equal(await isAbsent(location.path), true)
    const missing = await rejected(ctx.sessionPersistence.load(id), 'load-after-killed-lazy-create')
    await sendResult({
      role: 'no-file-restart',
      pid: process.pid,
      sessionId: id,
      location,
      states: {
        neverCreatedNoFile: true,
        createdLazyNoFile: true,
        persistedRecoverable: false,
        currentActive: false,
      },
      missing,
      sources: await sourceManifest(),
      mockBoundary: 'none: fresh real backend process reads the same root after SIGKILL',
    }, false)
  } finally {
    await ctx.fiber.dispose()
  }
}

async function appendChild(root) {
  const { ctx, modules } = await mountAgentHarness(root)
  try {
    const id = modules.SessionId(sessionIdText)
    const handle = await ctx.agents.create({ sessionId: id, meta: { cwd } })
    const location = ctx.sessionPersistence.locate(handle.agent.session.header)
    assert.ok(location?.path)
    const beforeFirstAppend = {
      artifactAbsent: await isAbsent(location.path),
      readRaw: await ctx.sessionPersistence.readRaw(id),
      agentPresent: ctx.agents.get(id) === handle.agent,
    }
    assert.equal(beforeFirstAppend.artifactAbsent, true)
    assert.equal(beforeFirstAppend.readRaw, undefined)
    assert.equal(beforeFirstAppend.agentPresent, true)

    handle.agent.session.append('turn/start', { turn: 1 })
    await ctx.sessions.flush(handle.agent.session)
    const firstAppendRaw = await ctx.sessionPersistence.readRaw(id)
    assert.ok(firstAppendRaw)
    assert.equal(await isAbsent(location.path), false)

    handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(handle.agent.session)
    const raw = await ctx.sessionPersistence.readRaw(id)
    assert.ok(raw)
    const duplicateAgent = await rejected(ctx.agents.create({ sessionId: id }), 'duplicate-live-agent-create')
    await sendResult({
      role: 'append',
      pid: process.pid,
      sessionId: id,
      location,
      states: {
        neverCreatedNoFile: false,
        createdLazyNoFile: beforeFirstAppend.artifactAbsent,
        persistedRecoverable: true,
        currentActive: ctx.agents.get(id) === handle.agent,
      },
      beforeFirstAppend: {
        artifactAbsent: beforeFirstAppend.artifactAbsent,
        readRaw: 'undefined',
        agentPresent: beforeFirstAppend.agentPresent,
      },
      afterFirstAppend: {
        artifactPresent: true,
        rawFilename: firstAppendRaw.filename,
      },
      duplicateAgent,
      rawArtifact: raw.content,
      sources: await sourceManifest(),
      mockBoundary: 'none: real AgentRegistry/AgentLoop/SessionStore/JSONL write path; no prompt, adapter, or model invocation',
    }, true)
  } finally {
    // SIGKILL deliberately prevents this disposal in the observed crash path.
    await ctx.fiber.dispose()
  }
}

async function resumeAfterRestart(root) {
  const { ctx, modules } = await mountAgentHarness(root)
  try {
    const id = modules.SessionId(sessionIdText)
    assert.equal(ctx.agents.get(id), undefined)
    const inspection = await ctx.sessionPersistence.load(id)
    assert.equal(inspection.meta.id, id)
    assert.deepEqual(inspection.events.map(event => event.type), ['turn/start', 'turn/end'])
    const duplicatePersisted = await rejected(ctx.sessionPersistence.create(inspection.meta), 'duplicate-persisted-create')
    const handle = await ctx.agents.resume({ resumeSessionId: id })
    assert.equal(handle.agent.id, id)
    const resumedEventTypes = handle.agent.session.events.map(event => event.type)
    assert.deepEqual(resumedEventTypes.slice(0, 2), ['turn/start', 'turn/end'])
    assert.equal(resumedEventTypes.at(-1), 'session/end-seed')
    assert.equal(ctx.agents.get(id), handle.agent)
    await sendResult({
      role: 'resume-restart',
      pid: process.pid,
      sessionId: id,
      states: {
        neverCreatedNoFile: false,
        createdLazyNoFile: false,
        persistedRecoverable: true,
        currentActiveBeforeResume: false,
        currentActiveAfterResume: true,
      },
      inspection: {
        meta: inspection.meta,
        eventTypes: inspection.events.map(event => event.type),
      },
      resumedEventTypes,
      duplicatePersisted,
      sources: await sourceManifest(),
      mockBoundary: 'none: separate real AgentLoop process resumes persisted JSONL without a prompt or model call',
    }, false)
  } finally {
    await ctx.fiber.dispose()
  }
}

/** Terminate a failed child and wait for its process handle to retire. */
async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode }
  }
  child.kill('SIGKILL')
  return await new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
}

/** Wait only to the bounded child barrier, then return a real SIGKILL observation. */
async function killAtBarrier(role, root) {
  const child = fork(selfPath, [role, root], {
    cwd: harnessRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let stdout = ''
  let stderr = ''
  const result = await new Promise((resolve, reject) => {
    let settled = false
    const settle = async (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('error', onError)
      child.off('exit', onExit)
      if (callback === reject) await terminateChild(child)
      callback(value)
    }
    const onMessage = message => { void settle(resolve, message) }
    const onError = error => { void settle(reject, error) }
    const onExit = (code, signal) => {
      void settle(reject, new Error(`${role} exited before barrier: ${JSON.stringify({ code, signal, stdout, stderr })}`))
    }
    const timer = setTimeout(() => {
      void settle(reject, new Error(`${role} did not reach its bounded IPC result: ${stderr}`))
    }, 15_000)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.once('message', onMessage)
    child.once('error', onError)
    child.once('exit', onExit)
  })
  const exit = await terminateChild(child)
  assert.equal(exit.signal, 'SIGKILL')
  return { role, pid: child.pid, result, stdout, stderr, exit }
}

/** Run a non-retained restart child and require an IPC result plus normal exit. */
async function restart(role, root) {
  const child = fork(selfPath, [role, root], {
    cwd: harnessRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let stdout = ''
  let stderr = ''
  let result
  const exit = await new Promise((resolve, reject) => {
    let settled = false
    const fail = async error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('error', onError)
      child.off('exit', onExit)
      await terminateChild(child)
      reject(error)
    }
    const onError = error => { void fail(error) }
    const onExit = (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('error', onError)
      resolve({ code, signal })
    }
    const timer = setTimeout(() => {
      void fail(new Error(`${role} restart exceeded 15 seconds: ${stderr}`))
    }, 15_000)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('message', message => { result = message })
    child.once('error', onError)
    child.once('exit', onExit)
  })
  assert.equal(exit.code, 0, JSON.stringify({ role, exit, stdout, stderr, result }))
  assert.equal(exit.signal, null, JSON.stringify({ role, exit, stdout, stderr, result }))
  assert.ok(result, JSON.stringify({ role, exit, stdout, stderr, result }))
  return { role, pid: child.pid, result, stdout, stderr, exit }
}

async function coordinator() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-t21-session-'))
  const keepRoot = process.env.T21_KEEP_ROOT === '1'
  try {
    const lazyGroup = await runLazyGroup(join(root, 'lazy'))
    const persistedGroup = await runPersistedGroup(join(root, 'persisted'))
    const failed = lazyGroup.status !== 'passed' || persistedGroup.status !== 'passed'
    const result = {
      ticket: 'T-21',
      probe: 'real-jsonl-session-persistence',
      sourcePlane: true,
      backend: 'JsonlSessionPersistence (compression: none)',
      node: process.version,
      root: keepRoot ? root : 'temporary root removed after evidence capture',
      scenarios: { lazyGroup, persistedGroup },
      conclusion: {
        explicitIdCreate: 'verified through real AgentRegistry.create(sessionId)',
        lazyCreate: 'verified: create is process-local until first flushed Session append',
        duplicateId: 'verified for a live agent, an in-memory lazy backend entry, and a persisted backend entry',
        restartResume: 'verified after true SIGKILL and a separate process mounts and resumes the persisted session',
        promptScope: 'not exercised here; this probe has no prompt submission, model adapter, or settlement mock',
      },
    }
    console.log(JSON.stringify(result))
    if (failed) process.exitCode = 1
  } finally {
    if (!keepRoot) await rm(root, { recursive: true, force: true })
  }
}

/** Run the lazy-create crash/restart pair without blocking the persisted-session pair. */
async function runLazyGroup(root) {
  try {
    const lazyKilled = await killAtBarrier('lazy-create', root)
    try {
      return { status: 'passed', lazyKilled, noFileRestart: await restart('no-file-restart', root) }
    } catch (error) {
      return { status: 'failed', lazyKilled, noFileRestart: { status: 'failed', error: failedStage(error) } }
    }
  } catch (error) {
    return {
      status: 'failed',
      lazyKilled: { status: 'failed', error: failedStage(error) },
      noFileRestart: { status: 'skipped', reason: 'lazy-create did not establish a crash barrier' },
    }
  }
}

/** Run the independent persisted-session crash/resume pair even after a lazy-group failure. */
async function runPersistedGroup(root) {
  try {
    const persistedKilled = await killAtBarrier('append', root)
    try {
      return { status: 'passed', persistedKilled, resumed: await restart('resume-restart', root) }
    } catch (error) {
      return { status: 'failed', persistedKilled, resumed: { status: 'failed', error: failedStage(error) } }
    }
  } catch (error) {
    return {
      status: 'failed',
      persistedKilled: { status: 'failed', error: failedStage(error) },
      resumed: { status: 'skipped', reason: 'append did not establish a crash barrier' },
    }
  }
}

const role = process.argv[2]
const root = process.argv[3]
if (role === 'lazy-create') await lazyCreateChild(root)
else if (role === 'no-file-restart') await checkNoFileAfterRestart(root)
else if (role === 'append') await appendChild(root)
else if (role === 'resume-restart') await resumeAfterRestart(root)
else await coordinator()
