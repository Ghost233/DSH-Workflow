// Native Cordis service lifetimes own plugin-load health. No cross-package
// helper dependency, second registry, persisted control state or settings.
const required = ['owner', 'sol', 'approval']
export function hostReadiness(host, instanceId) {
  const components = Object.fromEntries(required.map(name => [name, host?.get(`workflowComponent:${name}`)?.ready === true ? 'ready' : 'offline']))
  return { contract: 'DSH_WEB_HOST_READY_V1', instanceId: instanceId ?? null, components,
    ready: typeof instanceId === 'string' && /^[a-f0-9-]{36}$/.test(instanceId) && Object.values(components).every(value => value === 'ready') }
}
