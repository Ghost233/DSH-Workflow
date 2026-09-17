import { randomUUID } from 'node:crypto'
import { mkdir, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { kernelDigest } from './workflow-engine.mjs'
import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'
import { isManagedRangeStopped, MANAGED_RANGE_SCOPE } from './execution-evidence.mjs'
import { withControlLock } from './workflow-store.mjs'

/** Owns exact DSH subprocess handles. A direct child's exit is never a range-exit receipt. */
export class NativeCommandEffects {
  constructor(ctx, { root, hostId = randomUUID(), assertAuthority = async () => {}, assertReusablePath = async () => {} }) {
    this.ctx = ctx; this.root = root; this.hostId = hostId; this.assertAuthority = assertAuthority
    this.assertReusablePath = assertReusablePath
    this.handles = new Map(); this.closed = false
    if (typeof ctx.subprocess?.spawn !== 'function' || typeof ctx.sandbox?.confine !== 'function') throw new Error('DSH managed subprocess and sandbox capabilities are required')
  }
  actionIntentRoot(actionId) {
    return join(this.root, 'action-intents', kernelDigest(actionId))
  }
  actionIntentPath(actionId, commandId) {
    return artifactPath(this.actionIntentRoot(actionId), commandId, 'intent.json')
  }
  async scopedActionIntents(actionId) {
    const root = this.actionIntentRoot(actionId)
    const ids = (await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error }))
      .filter(id => id.startsWith('cmd-'))
    const intents = []
    for (const id of ids) {
      const intent = await readArtifact(artifactPath(root, id, 'intent.json'))
      if (!intent || intent.id !== id || intent.actionId !== actionId) throw new Error('Action command intent identity changed')
      intents.push(intent)
    }
    return intents
  }
  async actionIntents(actionId) {
    const records = new Map()
    for (const intent of await this.scopedActionIntents(actionId)) {
      const previous = records.get(intent.id)
      if (previous && kernelDigest(previous) !== kernelDigest(intent)) throw new Error('Command intent identity conflict')
      records.set(intent.id, intent)
    }
    return [...records.values()]
  }
  async withAdmission(actionId, callback, { signal } = {}) {
    if (typeof actionId !== 'string' || !actionId) throw new Error('Command admission requires an Action identity')
    await mkdir(join(this.root, 'action-admission'), { recursive: true, mode: 0o700 })
    return withControlLock(join(this.root, 'action-admission', `${kernelDigest(actionId)}.lock`), callback, { signal })
  }
  async assertActionDispatch(actionId) {
    for (const intent of await this.actionIntents(actionId)) {
      const id = intent.id
      const result = await readArtifact(artifactPath(this.root, id))
      const termination = await readArtifact(artifactPath(this.root, id, 'termination.json'))
      if (isManagedRangeStopped(result) || isManagedRangeStopped(termination)) continue
      // An equal host ID is not ownership. Only this instance's managed handle
      // can account for a concurrent dispatch while another command starts.
      if (this.handles.get(id)?.admission === 'running') continue
      throw Object.assign(new Error('Action has an unresolved command dispatch; observation is required'), { code: 'EXECUTION_UNCONFIRMED', commandId: id })
    }
  }
  async execute({ action, argv, cwd, verificationId, signal, mode = 'workspace-write', timeoutMs = 120_000, sessionId, authority }) {
    if (this.closed) throw new Error('Command host is closed')
    signal?.throwIfAborted()
    if (!Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Invalid fixed argv')
    const directory = await realpath(cwd)
    const binding = { actionId: action.id, attemptId: action.attemptId, argv, cwd: directory, mode, verificationId,
      authority: authority ?? action.input.authority ?? action.input.candidate?.authority ?? null }
    const id = `cmd-${kernelDigest([action.id, verificationId]).slice(0, 40)}`
    const receipt = artifactPath(this.root, id)
    const intentPath = this.actionIntentPath(action.id, id)
    await mkdir(join(this.root, id), { recursive: true, mode: 0o700 })
    return withControlLock(artifactPath(this.root, id, 'execution.lock'), async () => {
      const previous = await readArtifact(receipt)
      if (previous) {
        if (previous.bindingDigest !== kernelDigest(binding)) throw new Error('Command input changed under an existing identity')
        if (!isManagedRangeStopped(previous)) throw Object.assign(new Error('Stored command receipt lacks scoped termination evidence'), { code: 'EXECUTION_UNCONFIRMED', commandId: id })
        return previous
      }
      if (await readArtifact(intentPath)) throw Object.assign(new Error('Command dispatch is unresolved; observation is required'), { code: 'EXECUTION_UNCONFIRMED', commandId: id })
      const intent = { id, ...binding, bindingDigest: kernelDigest(binding), hostId: this.hostId }
      const controller = new AbortController()
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      let timedOut = false
      let timer
      try {
        // Serialize admission, not execution: different command identities may
        // run concurrently, but cannot bypass a previous host's unknown intent.
        const { handle, confined } = await this.withAdmission(action.id, async () => {
          if (this.closed) throw new Error('Command host is closed')
          signal?.throwIfAborted()
          await this.assertActionDispatch(action.id)
          await this.assertReusablePath(directory)
          await this.assertAuthority(binding.authority, { writes: false, signal })
          const confined = await this.ctx.sandbox.confine(argv,
            { mode, workspaceRoot: directory, ...(sessionId ? { sessionId } : {}) }, signal)
          if (confined.enforcement !== 'full') throw new Error('Command sandbox does not provide full enforcement')
          await publishArtifact(intentPath, intent)
          signal?.throwIfAborted()
          timer = setTimeout(() => { timedOut = true; controller.abort(new Error('Fixed command deadline exceeded')) }, timeoutMs)
          const handle = this.ctx.subprocess.spawn({ argv: confined.argv, cwd: directory, graceMs: 1000, signal: combined,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 256 * 1024 }, stderr: { maxBytes: 256 * 1024 } } })
          this.handles.set(id, { handle, intent, controller, admission: 'running' })
          return { handle, confined }
        }, { signal })
        const outcome = await handle.done
        // Also terminate helpers deliberately left behind by an otherwise successful command.
        handle.terminate()
        if (await handle.waitForExit(AbortSignal.timeout(30_000)) !== true) throw new Error('Managed process range termination is unconfirmed')
        const stdout = handle.collected.stdout?.readFrom(0)
        const stderr = handle.collected.stderr?.readFrom(0)
        const text = stderr?.text ?? ''
        const runnerFailed = (confined.runnerFailureRules ?? []).some(rule => {
          if (outcome.exitCode === 0 || (rule.allowedExitCodes && !rule.allowedExitCodes.includes(outcome.exitCode))) return false
          const lines = text.toLowerCase().split(/\r?\n/).filter(line => !(rule.informationalLines ?? []).some(info => info.toLowerCase() === line))
          return rule.fatalSignatures.some(signature => lines.some(line => line.includes(signature.toLowerCase())))
        })
        const result = { commandId: id, bindingDigest: intent.bindingDigest, hostId: this.hostId,
          exitCode: outcome.exitCode ?? -1, enforcement: confined.enforcement, timedOut, aborted: signal?.aborted === true,
          ok: outcome.exitCode === 0 && !timedOut && !signal?.aborted && !runnerFailed,
          kind: runnerFailed ? 'sandbox_unavailable' : 'completed', stdout: stdout?.text ?? '', stderr: text, stdoutTruncated: stdout?.lossy ?? false, stderrTruncated: stderr?.lossy ?? false,
          managedRangeStopped: true, terminationScope: MANAGED_RANGE_SCOPE, terminationId: `${id}:managed-range-exit` }
        await publishArtifact(receipt, result)
        this.handles.delete(id)
        return result
      } catch (error) {
        const entry = this.handles.get(id)
        if (entry) entry.admission = 'unconfirmed'
        throw error
      } finally { clearTimeout(timer) }
    }, { signal, timeoutMs: timeoutMs + 35_000 })
  }
  async stop(actionIds, { signal } = {}) {
    const ids = new Set(actionIds)
    const live = [...this.handles.values()].filter(entry => ids.has(entry.intent.actionId))
    for (const entry of live) { entry.controller.abort(new Error('Action stopped')); entry.handle.terminate() }
    const exits = await Promise.all(live.map(entry => entry.handle.waitForExit(signal ?? AbortSignal.timeout(30_000))))
    if (exits.some(exit => exit !== true)) return { managedRangeStopped: false }
    // Include durable dispatches from other/previous hosts. Missing handles are uncertainty, not proof of death.
    const intents = (await Promise.all([...ids].map(actionId => this.actionIntents(actionId)))).flat()
    for (const intent of intents) {
      const id = intent.id
      const result = await readArtifact(artifactPath(this.root, id))
      if (isManagedRangeStopped(result) || isManagedRangeStopped(await readArtifact(artifactPath(this.root, id, 'termination.json')))) continue
      const entry = this.handles.get(id)
      if (!entry || !live.includes(entry)) return { managedRangeStopped: false, unresolvedCommandId: id }
      await publishArtifact(artifactPath(this.root, id, 'termination.json'), { commandId: id, hostId: this.hostId, managedRangeStopped: true, terminationScope: MANAGED_RANGE_SCOPE, terminationId: `${id}:managed-range-exit` })
    }
    return { managedRangeStopped: true, terminationScope: MANAGED_RANGE_SCOPE, terminationId: `range-${kernelDigest([...ids].sort())}` }
  }
  async close() {
    this.closed = true
    return this.stop([...new Set([...this.handles.values()].map(entry => entry.intent.actionId))])
  }
}
