import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const CHILD = new URL('./fixtures/recovery-session-restart-child.mjs', import.meta.url)
const EVIDENCE_ROOT = process.env.DSH_T22_RESTART_EVIDENCE_DIR
  ?? join(tmpdir(), 'dsh-t22-restart-r22')

function serializeChildOutput(output) {
  return output === '' ? '<empty>' : output
}

function startRestartChild(input) {
  const child = fork(CHILD, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  let received = false
  let settleMessage
  const message = new Promise((resolvePromise, rejectPromise) => {
    settleMessage = { resolve: resolvePromise, reject: rejectPromise }
  })
  const timeout = setTimeout(() => {
    child.kill('SIGKILL')
    settleMessage.reject(new Error(`restart child IPC timed out\nstdout=${serializeChildOutput(stdout)}\nstderr=${serializeChildOutput(stderr)}`))
  }, 30_000)
  const exited = new Promise(resolvePromise => {
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (!received) {
        settleMessage.reject(new Error(
          `restart child exited before its IPC checkpoint: code=${code} signal=${signal}\n`
          + `stdout=${serializeChildOutput(stdout)}\nstderr=${serializeChildOutput(stderr)}`,
        ))
      }
      resolvePromise({ code, signal })
    })
  })
  child.once('error', error => {
    clearTimeout(timeout)
    settleMessage.reject(error)
  })
  child.once('message', value => {
    received = true
    settleMessage.resolve(value)
  })
  child.send(input)
  return { child, message, exited, output: () => ({ stdout, stderr }) }
}

async function killAtCheckpoint(handle, scenario) {
  try {
    const checkpoint = await handle.message
    assert.equal(checkpoint.type, 'checkpoint', `${scenario} child error: ${JSON.stringify(checkpoint)}`)
    assert.equal(checkpoint.scenario, scenario)
    assert.equal(typeof checkpoint.pid, 'number')
    assert.equal(handle.child.pid, checkpoint.pid)
    assert.equal(handle.child.kill('SIGKILL'), true)
    const exit = await handle.exited
    assert.equal(exit.code, null)
    assert.equal(exit.signal, 'SIGKILL')
    return { checkpoint, exit }
  } finally {
    if (handle.child.exitCode === null && handle.child.signalCode === null) handle.child.kill('SIGKILL')
    await handle.exited
  }
}

async function finishReplay(input) {
  const handle = startRestartChild({ mode: 'replay', ...input })
  try {
    const replay = await handle.message
    assert.equal(replay.type, 'replayed', `restart replay child error: ${JSON.stringify(replay)}`)
    const exit = await handle.exited
    assert.equal(exit.code, 0)
    assert.equal(exit.signal, null)
    return replay
  } finally {
    if (handle.child.exitCode === null && handle.child.signalCode === null) handle.child.kill('SIGKILL')
    await handle.exited
  }
}

function budgetFrom(bytes) {
  return JSON.parse(bytes).recoveryAdmission?.budget
}

function workflowStatePath(root, workflowId) {
  return join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
}

async function capturePostKill(checkpoint) {
  assert.equal(typeof checkpoint.rawLocationPath, 'string')
  return {
    stateBytes: await readFile(workflowStatePath(checkpoint.root, checkpoint.workflowId), 'utf8'),
    rawContent: await readFile(checkpoint.rawLocationPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT' && checkpoint.scenario === 'created') return null
      throw error
    }),
  }
}

function assertReplayReadOnly(postKill, replay) {
  assert.equal(replay.modelRequests, 0)
  assert.deepEqual(replay.agentOperations, { create: 0, resume: 0, followup: 0 })
  assert.equal(replay.before.stateBytes, postKill.stateBytes)
  assert.equal(replay.before.rawContent, postKill.rawContent)
  assert.equal(replay.before.stateBytes, replay.after.stateBytes)
  assert.equal(replay.before.rawContent, replay.after.rawContent)
  assert.deepEqual(budgetFrom(replay.after.stateBytes), budgetFrom(replay.before.stateBytes))
}

async function writeEvidence(scenario, producer, postKill, replay) {
  const directory = join(EVIDENCE_ROOT, scenario)
  await mkdir(directory, { recursive: true })
  const write = async (name, content) => await writeFile(join(directory, name), content ?? 'null\n', 'utf8')
  await Promise.all([
    write('checkpoint.workflow-state.json', producer.checkpoint.stateBytes),
    write('checkpoint.reserved-session.jsonl', producer.checkpoint.rawContent),
    write('kill.json', `${JSON.stringify({
      producerPid: producer.checkpoint.pid,
      exit: producer.exit,
      checkpoint: producer.checkpoint.checkpoint,
      rawLocationPath: producer.checkpoint.rawLocationPath,
      rawArtifactPresent: postKill.rawContent !== null,
    }, null, 2)}\n`),
    write('postkill.workflow-state.json', postKill.stateBytes),
    write('postkill.reserved-session.jsonl', postKill.rawContent),
    write('replay-before.workflow-state.json', replay.before.stateBytes),
    write('replay-before.reserved-session.jsonl', replay.before.rawContent),
    write('replay-after.workflow-state.json', replay.after.stateBytes),
    write('replay-after.reserved-session.jsonl', replay.after.rawContent),
    write('replay.json', `${JSON.stringify({
      replayerPid: replay.pid,
      result: replay.result,
      modelRequests: replay.modelRequests,
      agentOperations: replay.agentOperations,
      beforeCheckpoint: replay.before.checkpoint,
      afterCheckpoint: replay.after.checkpoint,
    }, null, 2)}\n`),
  ])
}

// The parent knows this private container before the child can create any
// fixture files. Cleanup therefore does not depend on a successful IPC reply.
async function withFixtureContainer(operation) {
  const container = await realpath(await mkdtemp(join(tmpdir(), 'dsh-t22-restart-owned-')))
  try {
    return await operation(container)
  } finally {
    await rm(container, { recursive: true, force: true, maxRetries: 3 })
  }
}

test('T22 SIGKILL after the real submitted checkpoint reopens only to a non-mutating technical pause', async () => {
  return withFixtureContainer(async fixtureParent => {
    const producer = await killAtCheckpoint(
      startRestartChild({ mode: 'produce_submitted', fixtureParent }),
      'submitted',
    )
    assert.equal(producer.checkpoint.checkpoint.phase, 'submitted')
    assert.equal(producer.checkpoint.checkpoint.ownerStatus, 'running')
    assert.ok(producer.checkpoint.checkpoint.modelRequests >= 1)
    assert.ok(producer.checkpoint.rawContent.includes(producer.checkpoint.receipt.executionIdentity.promptId))
    const postKill = await capturePostKill(producer.checkpoint)

    // The replay child builds a new Context, parent Agent, and Runtime after
    // observing the producer's actual SIGKILL exit.  That initialization is not
    // an Owner resend: transparent source API counters begin after it and prove
    // reconciliation made no create, resume, or followup call.
    const replay = await finishReplay({
      scenario: 'submitted',
      root: producer.checkpoint.root,
      workflowId: producer.checkpoint.workflowId,
      receipt: producer.checkpoint.receipt,
      request: producer.checkpoint.request,
    })
    assert.notEqual(replay.pid, producer.checkpoint.pid)
    assert.equal(replay.result.outcome, 'paused')
    assert.equal(replay.result.phase, 'technical_pause')
    assertReplayReadOnly(postKill, replay)
    await writeEvidence('submitted-sigkill-pause', producer, postKill, replay)
  })
})

test('T22 SIGKILL after real failed settlement replays its persisted receipt without a second debit', async () => {
  return withFixtureContainer(async fixtureParent => {
    const producer = await killAtCheckpoint(
      startRestartChild({ mode: 'produce_settled_failed', fixtureParent }),
      'settled_failed',
    )
    assert.equal(producer.checkpoint.checkpoint.phase, 'settled_failed')
    assert.equal(producer.checkpoint.checkpoint.ownerStatus, 'failed')
    assert.equal(producer.checkpoint.checkpoint.budgetAttempt?.state, 'settled')
    assert.equal(producer.checkpoint.checkpoint.budgetAttempt?.result?.status, 'failed')
    assert.ok(producer.checkpoint.checkpoint.modelRequests >= 2)
    assert.match(producer.checkpoint.rawContent, /"name":"owner_submit"/u)
    const postKill = await capturePostKill(producer.checkpoint)

    const replay = await finishReplay({
      scenario: 'settled_failed',
      root: producer.checkpoint.root,
      workflowId: producer.checkpoint.workflowId,
      receipt: producer.checkpoint.receipt,
      request: producer.checkpoint.request,
    })
    assert.notEqual(replay.pid, producer.checkpoint.pid)
    assert.equal(replay.result.outcome, 'settled_failed')
    assert.equal(replay.result.phase, 'settled_failed')
    assert.deepEqual(replay.result.continuation.executionIdentity, producer.checkpoint.receipt.executionIdentity)
    assertReplayReadOnly(postKill, replay)
    await writeEvidence('settled-failed-sigkill-replay', producer, postKill, replay)
  })
})

test('T22 cleans the parent-owned fixture container when the producer fails before its checkpoint', async () => {
  let containerPath
  let producerExit
  await withFixtureContainer(async fixtureParent => {
    containerPath = fixtureParent
    const handle = startRestartChild({ mode: 'produce_fixture_error', fixtureParent })
    await assert.rejects(killAtCheckpoint(handle, 'unreachable'), /controlled pre-checkpoint failure/u)
    producerExit = await handle.exited
    assert.ok(producerExit.code !== null || producerExit.signal !== null)
    const entries = await readdir(fixtureParent)
    assert.equal(entries.length, 1)
    assert.ok((await stat(join(fixtureParent, entries[0], '.git'))).isDirectory())
    assert.ok((await stat(join(fixtureParent, entries[0], '.dsh-workflow', 'worktrees'))).isDirectory())
  })
  await assert.rejects(stat(containerPath), { code: 'ENOENT' })
  await mkdir(EVIDENCE_ROOT, { recursive: true })
  await writeFile(join(EVIDENCE_ROOT, 'pre-checkpoint-cleanup.json'), `${JSON.stringify({
    containerPath, producerExit, checkpointReceived: false, realGitWorktreeVerified: true,
    containerRemoved: true,
  }, null, 2)}\n`, 'utf8')
})


test('T22 SIGKILL after real successful settlement replays the fixed-commit receipt without new execution', async () => {
  return withFixtureContainer(async fixtureParent => {
    const producer = await killAtCheckpoint(
      startRestartChild({ mode: 'produce_settled_succeeded', fixtureParent }),
      'settled_succeeded',
    )
    const postKill = await capturePostKill(producer.checkpoint)
    const state = JSON.parse(postKill.stateBytes)
    const run = state.ownerRuns['T1:api']
    const task = state.tasks.find(item => item.taskId === 'T1')
    const success = run.recoverySession.successReceipt
    assert.equal(run.status, 'completed')
    assert.equal(run.recoverySession.phase, 'settled_succeeded')
    assert.equal(task.status, 'completed')
    assert.equal(task.checkState, 'valid')
    assert.match(run.result.commitSha, /^[0-9a-f]{40}$/u)
    assert.equal(task.fixedCommitSha, run.result.commitSha)
    assert.equal(success.commitSha, run.result.commitSha)
    assert.equal(success.workflowHead, run.result.workflowHead)
    assert.deepEqual(success.executionRef, {
      id: producer.checkpoint.receipt.executionIdentity.sessionId,
      version: producer.checkpoint.receipt.executionIdentity.promptId,
    })
    const attempt = producer.checkpoint.checkpoint.budgetAttempt
    assert.equal(attempt.state, 'settled')
    assert.equal(attempt.result.status, 'succeeded')
    assert.deepEqual(attempt.result, success.result)
    assert.deepEqual(attempt.executionRef, success.executionRef)
    assert.ok(producer.checkpoint.checkpoint.modelRequests >= 4)
    assert.match(postKill.rawContent, /"name":"owner_submit"/u)
    const replay = await finishReplay({
      scenario: 'settled_succeeded',
      root: producer.checkpoint.root,
      workflowId: producer.checkpoint.workflowId,
      receipt: producer.checkpoint.receipt,
      request: producer.checkpoint.request,
    })
    assert.notEqual(replay.pid, producer.checkpoint.pid)
    assert.equal(replay.result.outcome, 'settled_succeeded')
    assert.equal(replay.result.phase, 'settled_succeeded')
    assert.deepEqual(replay.result.successReceipt, success)
    assertReplayReadOnly(postKill, replay)
    await writeEvidence('settled-succeeded-sigkill-replay', producer, postKill, replay)
  })
})


test('T22 SIGKILL after real session binding before followup preserves the unsubmitted execution on restart', async () => {
  return withFixtureContainer(async fixtureParent => {
    const producer = await killAtCheckpoint(
      startRestartChild({ mode: 'produce_created', fixtureParent }),
      'created',
    )
    assert.equal(producer.checkpoint.checkpoint.phase, 'created')
    assert.equal(producer.checkpoint.checkpoint.ownerStatus, 'running')
    assert.equal(producer.checkpoint.checkpoint.modelRequests, 0)
    const postKill = await capturePostKill(producer.checkpoint)
    const state = JSON.parse(postKill.stateBytes)
    const run = state.ownerRuns['T1:api']
    const identity = producer.checkpoint.receipt.executionIdentity
    assert.equal(run.sessionId, identity.sessionId)
    assert.deepEqual(run.recoverySession.executionIdentity, identity)
    assert.equal(run.recoverySession.prompt.id, identity.promptId)
    assert.ok(run.recoverySession.prompt.content.length > 0)
    assert.equal(postKill.rawContent, null)
    assert.notEqual(producer.checkpoint.checkpoint.budgetAttempt.state, 'settled')
    const replay = await finishReplay({
      scenario: 'created',
      rawLocationPath: producer.checkpoint.rawLocationPath,
      root: producer.checkpoint.root,
      workflowId: producer.checkpoint.workflowId,
      receipt: producer.checkpoint.receipt,
      request: producer.checkpoint.request,
    })
    assert.notEqual(replay.pid, producer.checkpoint.pid)
    assert.equal(replay.result.outcome, 'paused')
    assert.equal(replay.result.phase, 'technical_pause')
    assertReplayReadOnly(postKill, replay)
    await assert.rejects(readFile(producer.checkpoint.rawLocationPath), { code: 'ENOENT' })
    assert.equal(replay.result.reason, 'raw_artifact_missing')
    await writeEvidence('created-before-followup-sigkill-pause', producer, postKill, replay)
  })
})
