import { realpath } from 'node:fs/promises'
import { createKernelDashboardHandler } from './kernel-dashboard.mjs'
import { kernelHostHealth } from './kernel-plugin.mjs'
import { hostReadiness } from './kernel-host-readiness.mjs'

export const name = 'dsh-owner-workflow-dashboard'
export const inject = ['webServer']
export async function apply(ctx, config = {}) {
  const root = await realpath(config.catalogRoot ?? process.env.DSH_OWNER_WORKFLOW_CATALOG_ROOT ?? config.root ?? process.cwd())
  const handler = createKernelDashboardHandler(root, { health: () => kernelHostHealth(ctx.root, root) })
  const dispose = ctx.webServer.register({ kind: 'prefix', path: '/owner-workflow', handler: (req, res) => {
    if (req.url?.split('?')[0] === '/owner-workflow/api/health') {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      const result = hostReadiness(ctx.root, process.env.DSH_OWNER_WORKFLOW_HOST_INSTANCE)
      res.writeHead(result.ready ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result)); return
    }
    return handler(req, res)
  } })
  ctx.effect(() => () => { handler.close(); dispose() }, 'Unified Owner dashboard')
}
export default { name, inject, apply }
