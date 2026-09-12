import { mkdtemp, readFile, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const runtimeURL = new URL('../../../../../../owner-workflow-plugin/src/runtime.mjs', import.meta.url)
const self = fileURLToPath(import.meta.url)

if (process.argv[2] === 'child') {
  // Keep the controlled process alive at the barrier until the parent sends SIGKILL.
  setInterval(() => {}, 1000)
  const [adapter, dir, phase] = process.argv.slice(3)
  const { createOwnerWorkflowRuntime, ownerWorkflowChildProvider } = await import(pathToFileURL(adapter))
  const runtime = createOwnerWorkflowRuntime({})
  const record = async event => appendFile(join(dir, 'external.jsonl'), `${JSON.stringify({ pid: process.pid, ...event })}\n`)
  const forever = () => new Promise(() => {})
  const parent = {
    options: {}, session: { id: 'parent', header: { delegationDepth: 0 } },
    ctx: { agents: { async create(request) {
      await record({ kind: 'create-accepted', sessionId: request.sessionId })
      if (phase === 'create-before-receipt') {
        process.send({ phase, sessionId: request.sessionId })
        return forever()
      }
      // Controlled service boundary: no real Harness setup, model, tools, or worktree.
      const child = { id: request.sessionId, session: { events: [] },
        followup(message) {
          record({ kind: 'prompt-accepted', sessionId: request.sessionId, promptId: message.id }).then(() => {
            process.send({ phase, sessionId: request.sessionId })
          }).catch(error => { throw error })
        },
        whenIdle: forever, cancel() {},
      }
      return { agent: child, async dispose() {} }
    } } },
  }
  runtime.persistOwnerSession = async (_owner, sessionId) => {
    await writeFile(join(dir, 'session-receipt.json'), JSON.stringify({ sessionId }))
    await record({ kind: 'session-receipt', sessionId })
  }
  const provider = ownerWorkflowChildProvider(runtime)
  runtime.subagentRuntime = () => ({ async start(name, request) {
    await record({ kind: 'start-request', name, fields: Object.keys(request).sort() })
    return provider.start(request)
  } })
  const activeOwner = { workflowId: 'wf', stageId: 'T1', owner: { id: 'owner' }, attempt: 1, planDigest: 'plan-v1' }
  await runtime.runChild(parent, dir, 'bounded technical probe', new AbortController().signal,
    { role: 'owner', workflowId: 'wf', activeOwner, requestId: 'request-1', attemptId: 'attempt-1' })
} else {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-t14-session-'))
  const source = await readFile(runtimeURL, 'utf8')
  const rewritten = source.replace(/(from\s+['"])(\.[^'"]+)(['"])/g,
    (_all, prefix, specifier, suffix) => prefix + new URL(specifier, runtimeURL).href + suffix)
  const adapter = join(temp, 'runtime-adapter.mjs')
  await writeFile(adapter, rewritten + '\nexport { ownerWorkflowChildProvider };\n')
  const children = new Set()
  function interrupted(dir, phase) {
    return new Promise((resolve, reject) => {
      const child = fork(self, ['child', adapter, dir, phase], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      children.add(child)
      let stdout = '', stderr = '', barrier
      child.stdout.on('data', x => { stdout += x })
      child.stderr.on('data', x => { stderr += x })
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout ${phase}: ${stderr}`)) }, 10000)
      child.on('message', value => { barrier = value; child.kill('SIGKILL') })
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        clearTimeout(timer); children.delete(child)
        if (!barrier || signal !== 'SIGKILL') reject(new Error(JSON.stringify({ code, signal, stdout, stderr })))
        else resolve({ pid: child.pid, code, signal, barrier, stdout, stderr })
      })
    })
  }
  try {
    for (const phase of ['create-before-receipt', 'prompt-after-session-receipt']) {
      const dir = await mkdtemp(join(temp, 'case-'))
      try {
        const first = await interrupted(dir, phase)
        const receiptAfterFirst = await readFile(join(dir, 'session-receipt.json'), 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return null; throw e })
        const second = await interrupted(dir, phase)
        const events = (await readFile(join(dir, 'external.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
        const creates = events.filter(e => e.kind === 'create-accepted')
        assert.equal(creates.length, 2)
        assert.notEqual(creates[0].sessionId, creates[1].sessionId)
        const prompts = events.filter(e => e.kind === 'prompt-accepted')
        assert.equal(prompts.length, phase === 'create-before-receipt' ? 0 : 2)
        assert.equal(receiptAfterFirst !== null, phase === 'prompt-after-session-receipt')
        console.log(JSON.stringify({ case: phase, classification: 'negative-adapter-evidence', observed: 'direct replay issues a new session identity', first, receiptAfterFirst, second, events,
          runtimeSourceSha256: createHash('sha256').update(source).digest('hex'),
          boundary: 'real runChild and ownerWorkflowChildProvider; mock agents.create/persistOwnerSession/child; replay bypasses runExternalOwner and lease/reconciliation; not proof production automatically double-starts' }))
      } catch (error) {
        console.log(JSON.stringify({ case: phase, classification: 'probe-error', error: String(error.stack ?? error) }))
        process.exitCode = 1
      }
    }
    const { createOwnerWorkflowRuntime, ownerWorkflowChildProvider } = await import(pathToFileURL(adapter))
    for (const phase of ['create-rejected', 'session-bind-rejected']) {
      const runtime = createOwnerWorkflowRuntime({})
      let prompts = 0, disposed = 0
      const child = { id: 'guard-session', session: { events: [] }, followup() { prompts++ }, async whenIdle() {}, cancel() {} }
      const parent = { options: {}, session: { id: 'parent', header: {} }, ctx: { agents: { async create() {
        if (phase === 'create-rejected') throw new Error('injected create failure')
        return { agent: child, async dispose() { disposed++ } }
      } } } }
      runtime.persistOwnerSession = async () => { throw new Error('injected persistence failure') }
      const provider = ownerWorkflowChildProvider(runtime)
      runtime.subagentRuntime = () => ({ start: (_name, request) => provider.start(request) })
      await assert.rejects(runtime.runChild(parent, temp, 'guard probe', new AbortController().signal,
        { role: 'owner', activeOwner: { owner: { id: 'owner' } } }), /injected/)
      assert.equal(prompts, 0)
      assert.equal(disposed, phase === 'create-rejected' ? 0 : 1)
      console.log(JSON.stringify({ case: phase, classification: 'positive-boundary-evidence', prompts, disposed,
        boundary: 'real runChild/provider fail-before-followup; injected service errors; not physical disk error' }))
    }
  } finally {
    for (const child of children) child.kill('SIGKILL')
    await rm(temp, { recursive: true, force: true })
  }
}
