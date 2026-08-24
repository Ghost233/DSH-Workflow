import { resolve } from 'node:path'

import {
  listDashboardOperations,
  listDashboardWaits,
  listDashboardWorkspaces,
  listDashboardWorkflows,
  readDashboardOperationSnapshot,
  readDashboardSnapshot,
  registerDashboardWorkspace,
  resolveDashboardWorkspace,
} from './src/dashboard.mjs'
import { renderDashboardPage } from './src/dashboard-page.mjs'

export const name = 'dsh-owner-workflow-dashboard'
export const inject = ['webServer']

function dashboardRoot(config) {
  const candidate = typeof config?.root === 'string' && config.root.trim() !== ''
    ? config.root
    : process.cwd()
  return resolve(candidate)
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(body)
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), {
    'Content-Type': 'application/json; charset=utf-8',
  })
}

function methodNotAllowed(response) {
  sendJson(response, 405, { error: 'Owner Workflow Dashboard 只提供只读 GET 接口' })
}

function invalidRequest(response) {
  sendJson(response, 400, { error: 'Dashboard 请求参数无效' })
}

function unavailable(response) {
  sendJson(response, 404, { error: '指定 workflow 暂无可读 Dashboard 投影' })
}

function internalError(response) {
  sendJson(response, 500, { error: 'Dashboard 数据暂时不可用' })
}

/**
 * 创建 Web 宿主路由。页面与 JSON 接口都只读固定的启动工作区，
 * 因而浏览器请求不能指定本地路径或驱动 Runtime 状态迁移。
 */
export function createDashboardHandler(root) {
  const catalogRoot = dashboardRoot({ root })
  const catalogReady = registerDashboardWorkspace(catalogRoot, catalogRoot)
  const requestWorkspace = async url => {
    await catalogReady
    const workspaceId = url.searchParams.get('workspace_id')
    return workspaceId === null || workspaceId === ''
      ? catalogRoot
      : resolveDashboardWorkspace(catalogRoot, workspaceId)
  }
  return async (request, response) => {
    if (request.method !== 'GET') {
      methodNotAllowed(response)
      return
    }
    let url
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1')
    } catch {
      invalidRequest(response)
      return
    }
    if (url.pathname === '/owner-workflow' || url.pathname === '/owner-workflow/') {
      send(response, 200, renderDashboardPage(), {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
        'Referrer-Policy': 'no-referrer',
      })
      return
    }
    if (url.pathname === '/owner-workflow/api/workflows') {
      try {
        const workspace = await requestWorkspace(url)
        sendJson(response, 200, { workflows: await listDashboardWorkflows(workspace) })
      } catch {
        invalidRequest(response)
      }
      return
    }
    if (url.pathname === '/owner-workflow/api/operations') {
      try {
        const workspace = await requestWorkspace(url)
        sendJson(response, 200, { operations: await listDashboardOperations(workspace) })
      } catch {
        invalidRequest(response)
      }
      return
    }
    if (url.pathname === '/owner-workflow/api/workspaces') {
      try {
        await catalogReady
        sendJson(response, 200, { workspaces: await listDashboardWorkspaces(catalogRoot) })
      } catch {
        internalError(response)
      }
      return
    }
    if (url.pathname === '/owner-workflow/api/waits') {
      try {
        await catalogReady
        sendJson(response, 200, await listDashboardWaits(catalogRoot))
      } catch {
        internalError(response)
      }
      return
    }
    if (url.pathname === '/owner-workflow/api/operation') {
      const operationId = url.searchParams.get('operation_id')
      if (operationId === null || operationId.trim() === '') {
        invalidRequest(response)
        return
      }
      try {
        const workspace = await requestWorkspace(url)
        const snapshot = await readDashboardOperationSnapshot(workspace, operationId)
        if (snapshot === undefined) unavailable(response)
        else sendJson(response, 200, snapshot)
      } catch {
        unavailable(response)
      }
      return
    }
    if (url.pathname === '/owner-workflow/api/snapshot') {
      const workflowId = url.searchParams.get('workflow_id')
      if (workflowId === null || workflowId.trim() === '') {
        invalidRequest(response)
        return
      }
      try {
        const workspace = await requestWorkspace(url)
        const snapshot = await readDashboardSnapshot(workspace, workflowId)
        if (snapshot === undefined) unavailable(response)
        else sendJson(response, 200, snapshot)
      } catch {
        unavailable(response)
      }
      return
    }
    sendJson(response, 404, { error: 'Dashboard 路径不存在' })
  }
}

export function apply(ctx, config = {}) {
  const root = dashboardRoot(config)
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: '/owner-workflow',
    handler: createDashboardHandler(root),
  })
  ctx.effect(() => dispose, 'Owner 工作流 Dashboard 路由')
}

export default { name, inject, apply }
