import { randomUUID } from 'node:crypto'

/** Use the fixed DSH Connection/Remote public transport, without adding a service. */
export async function dshReadiness(url, { cookie = '', signal, request = fetch } = {}) {
  const rpcId = randomUUID()
  const response = await request(new URL('/api/pluginManager/listPlugins', url), {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal,
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'pluginManager/listPlugins', payload: { args: {} } }),
  })
  const envelope = await response.json()
  if (!response.ok || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
    || envelope.result?.ok !== true || !Array.isArray(envelope.result.value)) {
    throw new Error('Official DSH plugin manager did not return a valid ready response')
  }
  return { ready: true, plugins: envelope.result.value }
}
