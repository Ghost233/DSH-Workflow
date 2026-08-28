import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appendProjectionEvent,
  readDashboardSnapshot,
  startDashboard,
  writeProgressProjection,
} from '../src/dashboard.mjs'
import { parseArgs } from '../src/external-runner.mjs'

async function workspaceFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dashboard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function progressFixture(workflowId, taskId, status) {
  return { workflowId, tasks: [{ id: taskId, status }] }
}

function dashboardProjectionPath(root, workflowId, fileName) {
  return join(root, '.dsh-workflow', 'dashboard', workflowId, fileName)
}

async function closeDashboard(dashboard) {
  if (dashboard === undefined) return
  await dashboard.close()
}

function createSseClient(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let closed = false
  return {
    async read(timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs
      while (true) {
        const separator = buffer.indexOf('\n\n')
        if (separator >= 0) {
          const frame = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          const data = frame
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice('data:'.length).trimStart())
            .join('\n')
          if (data !== '') return JSON.parse(data)
          continue
        }

        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new Error('读取 SSE 事件超时')
        let timer
        try {
          const result = await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('读取 SSE 事件超时')), remaining)
            }),
          ])
          if (result.done) throw new Error('SSE 在事件到达前断开')
          buffer += decoder.decode(result.value, { stream: true })
        } finally {
          clearTimeout(timer)
        }
      }
    },
    async close() {
      if (closed) return
      closed = true
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}

async function readSseEvent(response, timeoutMs = 3000) {
  const client = createSseClient(response)
  try {
    return await client.read(timeoutMs)
  } finally {
    await client.close()
  }
}

test('Dashboard 只读取指定 workflow 的 progress 投影并将投影变化作为 SSE 推送', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-1'
  const dashboard = await startDashboard(root, { workflowId, port: 0 })
  t.after(() => closeDashboard(dashboard))

  await writeProgressProjection(root, progressFixture(workflowId, 'T1', 'running'))

  const progressResponse = await fetch(`${dashboard.url}/api/progress`)
  assert.equal(progressResponse.status, 200)
  assert.deepEqual(await progressResponse.json(), {
    workflowId,
    tasks: [{ id: 'T1', status: 'running' }],
  })

  const eventsResponse = await fetch(`${dashboard.url}/events`)
  assert.equal(eventsResponse.status, 200)
  const event = await readSseEvent(eventsResponse)
  assert.equal(event.type, 'task.updated')
  assert.equal(event.workflowId, workflowId)
  assert.deepEqual(event.task, { id: 'T1', status: 'running' })
})

test('尚未生成计划的 workflow 也会投影为可读取的空任务进度', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-initializing'

  await writeProgressProjection(root, {
    id: workflowId,
    status: 'initializing',
  })

  const projection = JSON.parse(await readFile(
    dashboardProjectionPath(root, workflowId, 'progress.json'),
    'utf8',
  ))
  assert.deepEqual(projection, {
    contract: 'DSH_WORKFLOW_PROGRESS_V1',
    workflowId,
    status: 'initializing',
    summary: '',
    tasks: [],
  })
})

test('Dashboard 投影显示 Owner 会话、阶段、心跳、恢复次数和授权等待', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-owner-observability'
  await writeProgressProjection(root, {
    id: workflowId,
    revision: 1,
    status: 'running',
    config: { parallel: 1 },
    plan: {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: 'Owner 可观测性测试',
      owners: [{ id: 'api', name: 'API', description: 'API Owner', scope: ['src/**'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'api',
        title: '实现 API',
        dependsOn: [],
        write: ['src/api.mjs'],
        verify: ['unit'],
        done: ['测试通过'],
      }],
    },
    tasks: [{
      taskId: 'T1',
      status: 'running',
      executorId: 'owner-visible-session',
      cursor: null,
      unchangedPolls: 0,
      reason: null,
      action: null,
    }],
    ownerRuns: {
      'T1:api': {
        status: 'waiting_approval',
        phase: 'waiting_approval',
        taskId: 'T1',
        ownerId: 'api',
        sessionId: 'owner-visible-session',
        startedAt: '2026-08-20T08:00:00.000Z',
        lastHeartbeatAt: '2026-08-20T08:01:00.000Z',
        recoveryCount: 2,
        pendingApprovalId: 'oa-visible',
      },
    },
  })

  const snapshot = await readDashboardSnapshot(root, workflowId)
  assert.deepEqual(snapshot.tasks[0], {
    id: 'T1',
    ownerId: 'api',
    role: 'work',
    title: '实现 API',
    dependsOn: [],
    status: 'running',
    ownerStatus: 'waiting_approval',
    phase: 'waiting_approval',
    ownerSessionId: 'owner-visible-session',
    startedAt: '2026-08-20T08:00:00.000Z',
    lastHeartbeatAt: '2026-08-20T08:01:00.000Z',
    recoveryCount: 2,
    pendingApprovalId: 'oa-visible',
  })
})

test('Dashboard 先推送指定 workflow 的既有事件，再推送后续 projection 变化', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-1'
  await writeProgressProjection(root, progressFixture(workflowId, 'T1', 'pending'))
  await appendProjectionEvent(root, workflowId, 'workflow.created', { summary: '创建 workflow' })

  const dashboard = await startDashboard(root, { workflowId, port: 0 })
  t.after(() => closeDashboard(dashboard))
  const response = await fetch(`${dashboard.url}/events`)
  assert.equal(response.status, 200)
  const sse = createSseClient(response)
  t.after(() => sse.close())

  const existing = await sse.read()
  assert.equal(existing.type, 'workflow.created')
  const initialProjection = await sse.read()
  assert.equal(initialProjection.type, 'task.updated')

  await writeProgressProjection(root, progressFixture(workflowId, 'T1', 'completed'))
  const updated = await sse.read()
  assert.equal(updated.type, 'task.updated')
  assert.equal(updated.task.status, 'completed')
})

test('Dashboard 按 workflowId 隔离 progress、事件和 SSE，不发生跨 workflow 污染', async t => {
  const root = await workspaceFixture(t)
  const firstWorkflowId = 'wf-a'
  const secondWorkflowId = 'wf-b'
  await writeProgressProjection(root, progressFixture(firstWorkflowId, 'TASK-A', 'running'))
  await writeProgressProjection(root, progressFixture(secondWorkflowId, 'TASK-B', 'pending'))
  await appendProjectionEvent(root, firstWorkflowId, 'workflow.created', { marker: 'A' })
  await appendProjectionEvent(root, secondWorkflowId, 'workflow.created', { marker: 'B' })

  const firstDashboard = await startDashboard(root, { workflowId: firstWorkflowId, port: 0 })
  const secondDashboard = await startDashboard(root, { workflowId: secondWorkflowId, port: 0 })
  t.after(() => closeDashboard(firstDashboard))
  t.after(() => closeDashboard(secondDashboard))

  const firstProgress = await fetch(`${firstDashboard.url}/api/progress`)
  const secondProgress = await fetch(`${secondDashboard.url}/api/progress`)
  assert.deepEqual(await firstProgress.json(), progressFixture(firstWorkflowId, 'TASK-A', 'running'))
  assert.deepEqual(await secondProgress.json(), progressFixture(secondWorkflowId, 'TASK-B', 'pending'))

  const firstResponse = await fetch(`${firstDashboard.url}/events`)
  const secondResponse = await fetch(`${secondDashboard.url}/events`)
  const firstSse = createSseClient(firstResponse)
  const secondSse = createSseClient(secondResponse)
  t.after(() => firstSse.close())
  t.after(() => secondSse.close())

  const firstExisting = await firstSse.read()
  const secondExisting = await secondSse.read()
  assert.equal(firstExisting.workflowId, firstWorkflowId)
  assert.equal(secondExisting.workflowId, secondWorkflowId)
  assert.equal((await firstSse.read()).workflowId, firstWorkflowId)
  assert.equal((await secondSse.read()).workflowId, secondWorkflowId)

  const secondCrossResponse = await fetch(`${secondDashboard.url}/events`)
  const secondCrossSse = createSseClient(secondCrossResponse)
  await appendProjectionEvent(root, firstWorkflowId, 'workflow.updated', { marker: 'A-live' })
  const firstLiveEvent = await firstSse.read()
  assert.equal(firstLiveEvent.workflowId, firstWorkflowId)
  assert.equal(firstLiveEvent.marker, 'A-live')
  await assert.rejects(secondCrossSse.read(200), /读取 SSE 事件超时/u)
  await secondCrossSse.close()

  const firstCrossResponse = await fetch(`${firstDashboard.url}/events`)
  const firstCrossSse = createSseClient(firstCrossResponse)
  const firstCrossExisting = await firstCrossSse.read()
  assert.equal(firstCrossExisting.marker, 'A-live')
  await writeProgressProjection(root, progressFixture(secondWorkflowId, 'TASK-B', 'completed'))
  const secondProjectionEvent = await secondSse.read()
  assert.equal(secondProjectionEvent.workflowId, secondWorkflowId)
  assert.equal(secondProjectionEvent.task.status, 'completed')
  await assert.rejects(firstCrossSse.read(200), /读取 SSE 事件超时/u)
  await firstCrossSse.close()
})

test('Dashboard、投影和事件缺失 workflowId 时 fail closed', async t => {
  const root = await workspaceFixture(t)
  await assert.rejects(
    startDashboard(root, { port: 0 }),
    /workflowId/u,
  )
  await assert.rejects(
    writeProgressProjection(root, { tasks: [{ id: 'T1', status: 'running' }] }),
    /workflowId/u,
  )
  await assert.rejects(
    appendProjectionEvent(root, 'workflow.created', { summary: '缺失 workflowId' }),
    /workflowId/u,
  )
})

test('runner 的 Dashboard 模式必须验证并传递安全 workflow-id', () => {
  assert.equal(parseArgs(['--dashboard', '--workflow-id', 'wf-dashboard']).workflowId, 'wf-dashboard')
  assert.throws(() => parseArgs(['--dashboard']), /必须提供 --workflow-id/u)
  assert.throws(() => parseArgs(['--dashboard', '--workflow-id', '../other']), /workflow-id/u)
})

test('Dashboard 只绑定 127.0.0.1，且没有写状态、调度、命令或 CORS 接口', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-1'
  await writeProgressProjection(root, progressFixture(workflowId, 'T1', 'running'))
  const dashboard = await startDashboard(root, { workflowId, port: 0 })
  t.after(() => closeDashboard(dashboard))
  assert.equal(dashboard.server.address().address, '127.0.0.1')

  const progressPath = dashboardProjectionPath(root, workflowId, 'progress.json')
  const before = await readFile(progressPath, 'utf8')
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await fetch(`${dashboard.url}/api/progress`, { method })
    assert.equal(response.status, 404)
    assert.equal(response.headers.has('access-control-allow-origin'), false)
  }
  const commandEndpoint = await fetch(`${dashboard.url}/api/command`)
  assert.equal(commandEndpoint.status, 404)
  assert.equal(await readFile(progressPath, 'utf8'), before)
})

test('缺失或畸形 progress 投影安全失败，不泄露本地路径', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-1'
  const dashboard = await startDashboard(root, { workflowId, port: 0 })
  t.after(() => closeDashboard(dashboard))

  const missing = await fetch(`${dashboard.url}/api/progress`)
  assert.equal(missing.status, 404)
  assert.doesNotMatch(await missing.text(), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  await mkdir(join(root, '.dsh-workflow', 'dashboard', workflowId), { recursive: true })
  await writeFile(dashboardProjectionPath(root, workflowId, 'progress.json'), '{ malformed', 'utf8')
  const malformed = await fetch(`${dashboard.url}/api/progress`)
  assert.ok([404, 500].includes(malformed.status))
  assert.doesNotMatch(await malformed.text(), /SyntaxError|at .*dashboard|progress\.json/u)
})

test('progress 投影原子写入后不遗留临时文件', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-1'
  await writeProgressProjection(root, progressFixture(workflowId, 'T1', 'running'))
  const entries = await readdir(join(root, '.dsh-workflow', 'dashboard', workflowId))
  assert.deepEqual(entries, ['progress.json'])
  assert.deepEqual(JSON.parse(await readFile(dashboardProjectionPath(root, workflowId, 'progress.json'), 'utf8')), {
    workflowId,
    tasks: [{ id: 'T1', status: 'running' }],
  })
})
