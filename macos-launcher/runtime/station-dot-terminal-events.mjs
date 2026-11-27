// Station-owned composition. No configuration/transport is inferred from the environment.
import { createStationHttpsDelivery } from './station-dot-https-delivery.mjs'
import { openStationSubscriptionStore } from './station-dot-subscription-store.mjs'
import { createHmac } from 'node:crypto'
import { createStationMcpEvents } from './station-dot-mcp-events.mjs'
import { openStationTerminalOutbox, attachStationTerminalOutbox } from './station-dot-terminal-outbox.mjs'

export async function startStationTerminalEvents({ctx, options}={}) {
  if (options?.enabled !== true) return null
  const { directory, scope, key, principal, sessionIds, transport, callback, httpsApproval, subscriptionDirectory, endpointBinding, onResult=()=>{} } = options
  if (!Buffer.isBuffer(key) || key.length!==32 || typeof principal!=='string' ||
      principal.length<1 || principal.length>128 || !Array.isArray(sessionIds) ||
      sessionIds.length<1 || sessionIds.length>8 || new Set(sessionIds).size!==sessionIds.length ||
      sessionIds.some(id=>typeof id!=='string'||!id.length||id.length>128||/[\x00-\x1f\x7f]/.test(id)) ||
      typeof onResult!=='function') throw new TypeError('invalid_station_terminal_scope')
  if(transport!==undefined&&httpsApproval!==undefined)throw new Error('station_callback_not_approved')
  if(httpsApproval!==undefined&&httpsApproval.url!==callback)throw new Error('station_callback_not_approved')
  const sender=transport??createStationHttpsDelivery({enabled:true,approval:httpsApproval})
  const ids = new Set(sessionIds)
  const aliases = new Set(sessionIds.map(id=>'s_'+createHmac('sha256',key)
    .update(JSON.stringify([scope,'alias',id])).digest('hex')))
  let closed=false, dispatch=Promise.resolve(), dirty=false, pumping=false
  const report = result => { try { onResult(result) } catch {} }
  const outbox = await openStationTerminalOutbox({enabled:true,directory,key,scope,
    allows:x=>x.phase==='capture'?ids.has(x.nativeId):aliases.has(x.alias)})
  if(subscriptionDirectory!==undefined&&typeof endpointBinding!=='string')
    throw new Error('station_subscription_scope_unavailable')
  const receipt=subscriptionDirectory===undefined?null:openStationSubscriptionStore({
    directory:subscriptionDirectory,key,binding:[scope,principal,callback,[...aliases].sort(),endpointBinding]
  })
  let events,detach
  try {
    events=createStationMcpEvents({enabled:true,identityKey:key,receipt,receiptPrincipal:principal,
      allows:p=>!closed&&p===principal,callback,transport:sender})
  }catch(error){receipt?.close();throw error}
  function schedule() {
    if(closed)return
    dirty=true
    if(pumping)return
    pumping=true
    dispatch=(async()=>{
      while(dirty&&!closed){
        dirty=false
        if(!events.hasSubscriber(principal))continue
        const result=await outbox.drain(row=>events.deliverDurable(principal,row),64)
        report({state:'drain',...result})
        // Advance beyond this batch only when every eligible attempt succeeded.
        if(result.eligible>64&&result.accepted===64)dirty=true
      }
    })().catch(()=>report({state:'delivery_unavailable'})).finally(()=>{pumping=false;if(dirty&&!closed)schedule()})
  }
  try { detach=attachStationTerminalOutbox({enabled:true,ctx,outbox,onResult:result=>{
    report(result)
    if(result.state==='queued')schedule()
  }})
  }catch(error){receipt?.close();throw error}
  if(events.hasSubscriber(principal))schedule()
  return Object.freeze({
    async rpc(authenticatedPrincipal,request){
      const response=await events.rpc(authenticatedPrincipal,request)
      if(request?.method==='events/subscribe'&&response.result)schedule()
      return response
    },
    async close(){closed=true;try{detach();await outbox.flush();await dispatch}finally{receipt?.close()}},
  })
}
