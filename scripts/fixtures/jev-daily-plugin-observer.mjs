export const name = 'jev-daily-plugin-observer'
export const inject = ['loader', 'webServer']

/** Test-only read face over the real Loader; never starts or changes another plugin. */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/daily-launch-fixture/plugins', handler: (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
    const plugins = [...ctx.loader.entries()].map(entry => ({ id: entry.options.id, package: entry.options.name,
      disabled: entry.options.disabled === true, state: entry.fiber?.state,
      hasRuntime: Boolean(entry.fiber?.runtime) }))
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ observerState: ctx.fiber.state, services: { jevCenter: typeof ctx.get('jevCenter')?.evaluate === 'function',
      agentMonitor: typeof ctx.get('agentMonitor')?.snapshot === 'function' }, plugins }))
  } }))
}

export default { name, inject, apply }
