import { defineTool } from '@deepseek-ai/dsh-tools'
import { ToolCallId, HarnessError } from '@deepseek-ai/dsh-llm'
import { scopeTarget } from '@deepseek-ai/dsh-scope'

const escalation = {
  sandbox_permissions: { type: 'string', description: 'Forwarded to the native tool; it still enforces supported modes and approval.' },
  justification: { type: 'string' },
}
const thenRun = {
  type: 'object', required: true, additionalProperties: false,
  properties: {
    command: { type: 'string', required: true },
    description: { type: 'string', required: true },
    timeoutMs: { type: 'number' }, workdir: { type: 'string' }, ...escalation,
  },
}

function snapshotResult(result) {
  return result.isError
    ? { isError: true, content: result.content, error: result.error }
    : { isError: false, content: result.content, value: result.value }
}

/** Render each phase separately: a failed check never implies the edit was rolled back. */
function renderFusion(_args, value) {
  return [
    { type: 'text', text: `mutation=${value.mutation.isError ? 'failed' : 'applied'}; command=${value.commandStatus}` },
    ...value.mutation.content,
    ...(value.command?.content ?? []),
    ...(value.reason ? [{ type: 'text', text: value.reason }] : []),
  ]
}

/** Register composites and version checks scoped to the current plugin fiber. */
export function installActionFusion(ctx, calls, lifetime) {
  ctx.on('fs/observed', (target, observation, actor) => {
    const state = calls.get(actor?.parent)
    if (state && actor.name === state.mutationName && observation.kind === 'present') {
      state.observed = { target, version: observation.version }
    }
  })
  ctx.on('tools/execute', async (exec, next) => {
    const state = calls.get(exec.parent)
    if (state && exec.name === 'bash') {
      if (!state.observed) throw new HarnessError('Mutation has no recorded file version; command skipped.', 'SOL_NO_VERSION')
      const info = await ctx.fs.stat(state.observed.target, exec.signal)
      if (!info || info.version !== state.observed.version) {
        throw new HarnessError('File changed after the mutation; command skipped. Re-read before retrying.', 'SOL_STALE_FILE')
      }
    }
    return next()
  })

  for (const mutationName of ['edit', 'write']) {
    ctx.tools.register(defineTool({
      name: `${mutationName}_then_run`,
      description: `${mutationName === 'edit' ? 'Edit' : 'Write'} a file, then run a foreground verification command in one call. All native approvals and file observation rules apply. A failed command does not undo the mutation.`,
      parameters: {
        file_path: { type: 'string', required: true },
        ...(mutationName === 'edit' ? {
          old_string: { type: 'string', required: true }, new_string: { type: 'string', required: true },
          replace_all: { type: 'boolean' },
        } : { content: { type: 'string', required: true } }),
        ...escalation, then_run: thenRun,
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderFusion },
      isConcurrencySafe: () => false,
      presentCall: args => ({ card: 'generic', title: `${mutationName} then verify: ${args.file_path}` }),
      async execute(args, exec) {
        return lifetime.run(exec.signal, async signal => {
          const { then_run: commandArgs, ...mutationArgs } = args
          if (!args.file_path.trim() || !commandArgs.command.trim() || !commandArgs.description.trim()) {
            throw new HarnessError('file_path, command and description must not be blank', 'INVALID_ARGS')
          }
          for (const required of [mutationName, 'bash']) {
            if (!ctx.tools.get(required, exec.agent)) {
              throw new HarnessError(`Required native tool "${required}" is unavailable; no mutation performed.`, 'SOL_MISSING_TOOL')
            }
          }
          const dispatch = async (name, arguments_) => {
            const callId = ToolCallId(`${exec.callId}:sol:${name}`)
            const log = { rootCallId: exec.rootCallId, parentCallId: exec.callId, subCallId: callId, name, arguments: arguments_ }
            exec.agent?.session.append('tool/ptc-dispatch-start', log)
            const result = await ctx.tools.execute({ name, arguments: arguments_, callId,
              rootCallId: exec.rootCallId, parent: exec.token, agent: exec.agent, signal })
            for (const context of result.additionalContexts ?? []) exec.deferContext(context)
            if (!result.isError && result.concludesTurn) exec.concludeTurn()
            if (exec.agent !== undefined) {
              let content = result.content
              try {
                content = await ctx.waterfall(scopeTarget(ctx.tools, exec.agent), 'tools/ptc-dispatch-log', {
                  exec, agent: exec.agent, subCallId: callId, name, isError: result.isError, content,
                }, () => Promise.resolve(content))
              } catch {
                // Log-shaping failure cannot erase a settled mutation or change its value.
                ctx.logger.warn('sol-efficiency: nested log shaping failed; retaining the original result')
              }
              exec.agent.session.append('tool/ptc-dispatch', { ...log, isError: result.isError, content })
            }
            return result
          }
          calls.set(exec.token, { mutationName })
          try {
            const mutation = await dispatch(mutationName, mutationArgs)
            if (mutation.isError || mutation.concludesTurn || signal.aborted) {
              return { mutation: snapshotResult(mutation), command: null, commandStatus: 'skipped',
                reason: mutation.isError ? 'Mutation failed; command was not run.' : 'Turn ended or cancelled; command was not run.' }
            }
            const command = await dispatch('bash', commandArgs)
            const failed = command.isError || command.value.exitCode !== 0 || command.value.timedOut || command.value.aborted
            const skipped = command.isError && ['SOL_NO_VERSION', 'SOL_STALE_FILE'].includes(command.error.info?.code)
            return { mutation: snapshotResult(mutation), command: snapshotResult(command), commandStatus: skipped ? 'skipped' : failed ? 'failed' : 'succeeded' }
          } finally {
            calls.delete(exec.token)
          }
        })
      },
    }))
  }
}
