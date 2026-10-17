import { randomUUID } from 'node:crypto'
import { packageMutationModules } from './dsh-delivery-policy.mjs'

/** Use the fixed DSH Connection/Remote public transport, without adding a service. */
export async function dshReadiness(url, { cookie = '', signal, request = fetch } = {}) {
  const rpcId = randomUUID()
  const response = await request(new URL('/api/pluginInventory/list', url), {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, signal,
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'pluginInventory/list', payload: { args: {} } }),
  })
  const envelope = await response.json()
  if (!response.ok || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
    || envelope.result?.ok !== true || !Array.isArray(envelope.result.value?.entries)) {
    throw new Error('Official DSH readonly inventory did not return a valid ready response')
  }
  const inventory = envelope.result.value
  if (inventory.managementAvailable !== undefined && typeof inventory.managementAvailable !== 'boolean'
    || inventory.agentPresets !== undefined && !Array.isArray(inventory.agentPresets)
    || inventory.entries.some(row => typeof row?.enabled !== 'boolean')) {
    throw new Error('Official DSH readonly inventory is malformed')
  }
  const rows = [...inventory.entries]
  for (const preset of inventory.agentPresets ?? []) {
    if (preset?.broken || !Array.isArray(preset?.rows)) {
      throw new Error(`DSH 代理预设 ${preset?.id ?? '未知'} 无法检查受管只读策略：${preset?.broken || '清单格式无效'}`)
    }
    rows.push(...preset.rows)
  }
  if (rows.some(row => typeof row?.moduleName !== 'string' || typeof row.enabled !== 'boolean' && row.enabled !== 'conditional'
    || !['pending', 'loading', 'active', 'failed', 'unloading', null].includes(row.fiberPhase))) {
    throw new Error('Official DSH readonly inventory entries are malformed')
  }
  const mutable = rows.filter(row => packageMutationModules.includes(row.moduleName)
    && (row.enabled !== false || ['pending', 'loading', 'active', 'unloading'].includes(row.fiberPhase)))
  if (inventory.managementAvailable === true || mutable.length) {
    throw new Error(`DSH 受管版本策略不允许运行端换包通道${mutable.length ? `：${[...new Set(mutable.map(row => row.moduleName))].join('、')}` : '。'}`)
  }
  return { ready: true, plugins: inventory.entries }
}
