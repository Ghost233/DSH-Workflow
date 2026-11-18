export const name = 'dsh-workflow-stop-inspection'
export const inject = ['agents', 'jobs', 'workflowHostInstance']

/** Check whether Station should ask before stopping the current Host. */
export function apply(ctx) {
  const instanceId = ctx.workflowHostInstance.instanceId
  const hasWork = async () => {
    const schedule = ctx.get('schedule')
    if (!schedule) throw new Error('提醒库存服务不可用。')
    const terminals = ctx.get('terminalController')
    const runningJob = job => ['running', 'stopping'].includes(job.status)
    for (const agent of ctx.agents.list()) {
      if (agent.status === 'running' || agent.inbox.nextStep.length || agent.inbox.nextTurn.length
        || ctx.jobs.list(agent.id).some(runningJob)
        || terminals?.list(agent.id).some(terminal => terminal.state !== 'exited')) return true
    }
    return ctx.jobs.list().some(runningJob)
      || (await schedule.catalog()).some(row => row.status === 'active')
  }
  const message = async input => {
    if (input?.type !== 'workflow-stop-inspection' || !Number.isSafeInteger(input.requestId)) return
    let result
    try { result = { hasWork: await hasWork(), unknown: false } }
    catch (error) {
      result = { hasWork: false, unknown: true, message: error instanceof Error ? error.message : String(error) }
    }
    if (process.connected) process.send({ type: input.type, requestId: input.requestId, instanceId, ...result }, () => {})
  }
  process.on('message', message)
  ctx.effect(() => () => process.removeListener('message', message))
}
