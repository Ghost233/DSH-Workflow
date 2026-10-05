// Native Cordis service lifetimes own plugin-load health. No cross-package
// helper dependency, second registry, persisted control state or settings.
const required = ['owner']
export function hostReadiness(host, instanceId) {
  const activeInstanceId = instanceId ?? host?.get('workflowHostInstance')?.instanceId
  const components = Object.fromEntries(required.map(name => [name, host?.get(`workflowComponent:${name}`)?.ready === true ? 'ready' : 'offline']))
  return { contract: 'DSH_WEB_HOST_READY_V1', instanceId: activeInstanceId ?? null, components,
    ready: typeof activeInstanceId === 'string' && /^[a-f0-9-]{36}$/.test(activeInstanceId) && Object.values(components).every(value => value === 'ready') }
}
