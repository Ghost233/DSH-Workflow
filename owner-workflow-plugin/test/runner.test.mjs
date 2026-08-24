import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { discoverRunnableWorkflows, parseArgs } from '../src/external-runner.mjs'

const execFileAsync = promisify(execFile)
const RUNNER_PATH = fileURLToPath(new URL('../src/external-runner.mjs', import.meta.url))
const SUPERVISOR_REQUESTS = new Set([
  'supervisor-start',
  'supervisor-next',
  'supervisor-ack',
  'supervisor-inspect',
  'supervisor-stop',
  'supervisor-execute',
  'supervisor-recover',
  'supervisor-await-event',
  'supervisor-outbox-next',
  'supervisor-outbox-ack',
])

test('runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id', () => {
  const parsed = parseArgs(['--daemon', '--catalog-root', '/tmp/catalog', '--poll-ms', '500', '--parallel', '2'])
  assert.equal(parsed.daemon, true)
  assert.equal(parsed.workflowId, undefined)
  assert.equal(parsed.catalogRoot, '/tmp/catalog')
  assert.equal(parsed.pollMs, 500)
  assert.equal(parsed.parallel, 2)
  assert.throws(() => parseArgs(['--daemon', '--workflow-id', 'wf-invalid']), /不能指定 workflow-id/u)
  assert.throws(() => parseArgs(['--catalog-root', '/tmp/catalog', '--workflow-id', 'wf-invalid']), /只能与 --daemon/u)
})

test('runner daemon 只发现目录表中已批准或运行的合法 Workflow', async t => {
  const catalog = await mkdtemp(join(tmpdir(), 'dsh-runner-catalog-'))
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-runner-workspace-'))
  t.after(() => rm(catalog, { recursive: true, force: true }))
  t.after(() => rm(workspace, { recursive: true, force: true }))
  const workspaceId = createHash('sha256').update(workspace).digest('hex').slice(0, 20)
  await mkdir(join(catalog, '.dsh-workflow', 'dashboard'), { recursive: true })
  await writeFile(join(catalog, '.dsh-workflow', 'dashboard', 'workspaces.json'), `${JSON.stringify({
    contract: 'DSH_DASHBOARD_WORKSPACES_V1',
    workspaces: [{ id: workspaceId, root: workspace, name: '业务项目' }],
  }, null, 2)}\n`, 'utf8')
  await mkdir(join(workspace, '.dsh-workflow', 'workflows'), { recursive: true })
  for (const [workflowId, status] of [['wf-approved', 'approved'], ['wf-running', 'running'], ['wf-planned', 'planned']]) {
    await writeFile(join(workspace, '.dsh-workflow', 'workflows', `${workflowId}.json`), `${JSON.stringify({
      contract: 'DSH_WORKFLOW_STATE_V2',
      id: workflowId,
      root: workspace,
      status,
    }, null, 2)}\n`, 'utf8')
  }
  const discovered = await discoverRunnableWorkflows(catalog)
  assert.deepEqual(discovered.map(item => [item.workflowId, item.status]).sort(), [
    ['wf-approved', 'approved'],
    ['wf-running', 'running'],
  ])
})

async function runRunnerAgainst(receipts, { inspectObservation, expectFailure = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-runner-'))
  const workflowId = 'wf-runner-test'
  const socketPath = join('/tmp', `dsh-owner-runner-${randomUUID()}.sock`)
  const requests = []
  const queue = [...receipts]
  let lastReceipt
  let notification
  const server = createServer(socket => {
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk
      while (true) {
        const lineEnd = buffer.indexOf('\n')
        if (lineEnd < 0) break
        const request = JSON.parse(buffer.slice(0, lineEnd))
        buffer = buffer.slice(lineEnd + 1)
        requests.push(request)
        let result
        if (request.action === 'supervisor-start') {
          result = { workflowId, status: 'running', eventCursor: 0 }
        } else if (request.action === 'supervisor-recover') {
          result = { reservations: [], eventCursor: 0 }
        } else if (request.action === 'supervisor-next') {
          lastReceipt = queue.shift()
          result = { ...lastReceipt, eventCursor: 0 }
        } else if (request.action === 'supervisor-execute') {
          result = { execute: true, eventCursor: 0 }
        } else if (request.action === 'supervisor-await-event') {
          result = { kind: 'timeout', cursor: 0, status: 'running' }
        } else if (request.action === 'supervisor-inspect') {
          result = inspectObservation
        } else if (request.action === 'supervisor-ack') {
          const reservations = lastReceipt?.action === 'create'
            ? lastReceipt.tasks.map((task, index) => ({
              reservationId: `reservation-${index + 1}`,
              taskId: task.taskId,
              ownerId: task.ownerId,
              status: 'reserved',
              attempts: 1,
            }))
            : []
          if (lastReceipt?.action === 'notify') {
            notification = {
              notificationId: 'notification-1',
              kind: 'main',
              reason: 'decision_required',
              status: 'pending',
            }
          }
          result = { actionId: request.actionId, observation: request.observation, reservations, notification, eventCursor: 0 }
        } else if (request.action === 'supervisor-outbox-next') {
          result = { notification, eventCursor: 0 }
        } else if (request.action === 'supervisor-outbox-ack') {
          result = { notificationId: request.notificationId, status: 'delivered', eventCursor: 0 }
        } else if (request.action === 'supervisor-stop') {
          result = { actionId: request.actionId, status: 'completed' }
        } else {
          result = { error: `runner 不得发送控制动作：${request.action}` }
        }
        socket.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`)
      }
    })
  })

  try {
    await mkdir(join(root, '.dsh-workflow', 'control'), { recursive: true })
    await writeFile(
      join(root, '.dsh-workflow', 'control', `${workflowId}.json`),
      `${JSON.stringify({
        contract: 'DSH_WORKFLOW_CONTROL_V1',
        workflowId,
        socketPath,
        token: 'runner-test-token',
      }, null, 2)}\n`,
      'utf8',
    )
    await rm(socketPath, { force: true })
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(socketPath, resolveListen)
    })

    let execution
    try {
      execution = await execFileAsync(process.execPath, [
        RUNNER_PATH,
        '--root',
        root,
        '--workflow-id',
        workflowId,
        '--parallel',
        '2',
        '--timeout-ms',
        '10000',
      ], { cwd: root, encoding: 'utf8' })
      if (expectFailure) assert.fail('runner 应当关闭处理未知 Supervisor 动作')
    } catch (error) {
      if (!expectFailure) throw error
      execution = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', error }
    }
    return { requests, execution }
  } finally {
    await new Promise(resolveClose => server.close(() => resolveClose())).catch(() => undefined)
    await rm(socketPath, { force: true })
    await rm(root, { recursive: true, force: true })
  }
}

test('runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK', async () => {
  const { requests } = await runRunnerAgainst([
    { action: 'create', actionId: 'a1', tasks: [{ taskId: 'T1', ownerId: 'api' }] },
    { action: 'wait', actionId: 'a2', watches: [{ taskId: 'T1', cursor: 'c1' }] },
    { action: 'stop', actionId: 'a3' },
  ])

  assert.deepEqual(requests.map(item => item.action), [
    'supervisor-start',
    'supervisor-recover',
    'supervisor-next',
    'supervisor-ack',
    'supervisor-execute',
    'supervisor-await-event',
    'supervisor-next',
    'supervisor-await-event',
    'supervisor-next',
    'supervisor-stop',
  ])
  assert.deepEqual(requests.filter(item => item.action === 'supervisor-ack').map(item => ({
    actionId: item.actionId,
    observation: item.observation,
  })), [
    { actionId: 'a1', observation: {} },
  ])
  assert.equal(requests.every(item => SUPERVISOR_REQUESTS.has(item.action)), true)
})

test('runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK', async () => {
  const observation = {
    tasks: [{ taskId: 'T1', status: 'running', executorId: 'agent-1', cursor: 'c2' }],
  }
  const { requests } = await runRunnerAgainst([
    { action: 'inspect', actionId: 'inspect-1', watches: [{ taskId: 'T1', cursor: 'c1' }] },
    { action: 'stop', actionId: 'stop-1' },
  ], { inspectObservation: observation })

  assert.deepEqual(requests.map(item => item.action), [
    'supervisor-start',
    'supervisor-recover',
    'supervisor-next',
    'supervisor-inspect',
    'supervisor-ack',
    'supervisor-await-event',
    'supervisor-next',
    'supervisor-stop',
  ])
  assert.equal(requests[3].actionId, 'inspect-1')
  assert.equal(requests[4].actionId, 'inspect-1')
  assert.deepEqual(requests[4].observation, observation)
})

test('runner 转发 notify 的空宿主观察后停止本次运行等待主会话', async () => {
  const { requests, execution } = await runRunnerAgainst([
    { action: 'notify', actionId: 'notify-1', notification: { kind: 'main', reason: 'decision_required' } },
  ])

  assert.deepEqual(requests.map(item => item.action), [
    'supervisor-start',
    'supervisor-recover',
    'supervisor-next',
    'supervisor-ack',
    'supervisor-outbox-next',
    'supervisor-outbox-ack',
  ])
  assert.equal(requests[3].actionId, 'notify-1')
  assert.deepEqual(requests[3].observation, {})
  assert.match(execution.stdout, /decision_required/u)
})

test('runner 对未知 Supervisor 动作关闭处理且不发送派生请求', async () => {
  const { requests, execution } = await runRunnerAgainst([
    { action: 'launch', actionId: 'unknown-1', tasks: [{ taskId: 'T1', ownerId: 'api' }] },
  ], { expectFailure: true })

  assert.deepEqual(requests.map(item => item.action), ['supervisor-start', 'supervisor-recover', 'supervisor-next'])
  assert.match(execution.stderr, /未知 Supervisor 动作：launch/u)
})
