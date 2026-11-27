import { createHash, createHmac } from 'node:crypto'
import { openStationSubscriptionStore } from './station-dot-subscription-store.mjs'

const isAlias = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
const isUUID = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

export function stationPromptDigest(session, text) {
  if (!isAlias(session) || typeof text !== 'string' || !text.trim() ||
      text.includes('\0') || Buffer.byteLength(text) > 4096) throw new Error('invalid_draft')
  return createHash('sha256').update(JSON.stringify([session,text])).digest('hex')
}

// No exposure or owner credential issuance here. The trusted chat-facing caller must consume
// an explicit owner authorization for this exact target, text digest and request identity.
export function createStationPromptDelivery({controller, resolveApprovedSession, consumeOwnerGrant, capacity=64, receiptStore}) {
  if (typeof controller?.prompt !== 'function'||typeof resolveApprovedSession !== 'function'||
      typeof consumeOwnerGrant !== 'function'||!Number.isInteger(capacity)||capacity<1||capacity>128)
    throw new Error('invalid_prompt_writer')
  if(receiptStore!==undefined&&(typeof receiptStore?.get!=='function'||typeof receiptStore?.reserve!=='function'||
     typeof receiptStore?.accept!=='function'))throw new Error('invalid_prompt_receipts')
  const receipts = new Map()
  return async ({session,text,requestId,grant,signal}={}) => {
    const digest = stationPromptDigest(session,text)
    if (!isUUID(requestId)) throw new Error('invalid_request_id')
    // Durable caller must confirm the current resolved native target as well
    // as the alias, digest, and request ID; alias remapping cannot revive a grant.
    let target
    if(receiptStore){
      target=await resolveApprovedSession(session)
      if(typeof target!=='string'||!target||
         await consumeOwnerGrant(grant,Object.freeze({session,digest,requestId,target}))!==true)
        throw new Error('owner_authorization_required')
    }else{
      if(await consumeOwnerGrant(grant,Object.freeze({session,digest,requestId}))!==true)
        throw new Error('owner_authorization_required')
      target=await resolveApprovedSession(session)
    }
    if (typeof target !== 'string' || !target) throw new Error('session_not_approved')
    if(receiptStore){
      const prior=receiptStore.get(requestId,digest,target)
      if(prior)return {requestId,state:prior}
      if(signal?.aborted)return {requestId,state:'not_sent'}
      // Commit ambiguity before dispatch. A crash at any later point cannot
      // authorize redispatch of this request, even with a fresh matching grant.
      receiptStore.reserve(requestId,digest,target)
      let accepted=false
      try{
        const timeout=AbortSignal.timeout(3000)
        const result=await controller.prompt({requestId,sessionId:target,mode:'queue',
          content:[{type:'text',text}]},signal?AbortSignal.any([signal,timeout]):timeout)
        accepted=result?.accepted===true
      }catch{}
      if(accepted){
        try{receiptStore.accept(requestId,digest,target);return {requestId,state:'inbox_accepted'}}
        catch{/* durable reservation still forbids another admission */}
      }
      return {requestId,state:'delivery_unconfirmed'}
    }
    const stored = receipts.get(requestId)
    if (stored) {
      if (stored.digest!==digest || stored.target!==target) throw new Error('request_id_reused')
      return {requestId,state:stored.state}
    }
    if (signal?.aborted) return {requestId,state:'not_sent'}
    if (receipts.size>=capacity) throw new Error('receipt_capacity_reached')
    const entry={digest,target,state:'in_progress'}
    receipts.set(requestId,entry)
    try {
      const timeout=AbortSignal.timeout(3000)
      const result=await controller.prompt({requestId,sessionId:target,mode:'queue',
        content:[{type:'text',text}]},signal?AbortSignal.any([signal,timeout]):timeout)
      entry.state = result?.accepted === true ? 'inbox_accepted' : 'delivery_unconfirmed'
    } catch {
      // Native may have admitted then lost the response. Never automatically resubmit.
      entry.state='delivery_unconfirmed'
    }
    return {requestId,state:entry.state}
  }
}

// Optional isolated writer state, never opened from ambient Station config.
// The trusted caller owns and closes this process lock after all sends settle.
export function openStationPromptReceipts({directory,key,scope,capacity=64}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||typeof scope!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(scope)||
     !Number.isInteger(capacity)||capacity<1||capacity>128)throw new Error('invalid_prompt_receipts')
  const store=openStationSubscriptionStore({directory,key,binding:[scope],purpose:'prompt-receipts'})
  const k=Buffer.from(key),rows=new Map()
  const derive=(...v)=>createHmac('sha256',k).update(JSON.stringify([scope,...v])).digest('hex')
  const states=new Set(['delivery_unconfirmed','inbox_accepted'])
  const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
  let closed=false,fault=false
  try{
    const raw=store.read()
    if(raw!==null){
      if(!Array.isArray(raw)||raw.length>capacity)throw new Error('invalid_prompt_receipts')
      for(const row of raw){
        if(!Array.isArray(row)||row.length!==3||!hex(row[0])||!hex(row[1])||!states.has(row[2])||rows.has(row[0]))
          throw new Error('invalid_prompt_receipts')
        rows.set(row[0],[row[1],row[2]])
      }
    }
  }catch(error){store.close();k.fill(0);throw error}
  const lookup=(requestId,digest,target)=>{
    if(closed||fault)throw new Error('prompt_receipts_unavailable')
    if(!isUUID(requestId)||!hex(digest)||typeof target!=='string'||!target||target.length>256)
      throw new Error('invalid_prompt_receipts')
    const id=derive('request',requestId),binding=derive('approved_target_draft',requestId,digest,target)
    const previous=rows.get(id)
    if(previous&&previous[0]!==binding)throw new Error('request_id_reused')
    return {id,binding,previous}
  }
  function persist(id,binding,state){
    rows.set(id,[binding,state])
    try{store.write([...rows].map(([x,v])=>[x,...v]))}
    catch{fault=true;throw new Error('prompt_receipts_unavailable')}
  }
  return Object.freeze({
    get(...args){return lookup(...args).previous?.[1]},
    reserve(...args){
      const {id,binding,previous}=lookup(...args)
      if(previous)throw new Error('request_id_reused')
      if(rows.size>=capacity)throw new Error('receipt_capacity_reached')
      persist(id,binding,'delivery_unconfirmed')
    },
    accept(...args){
      const {id,binding,previous}=lookup(...args)
      if(previous?.[1]!=='delivery_unconfirmed')throw new Error('invalid_prompt_receipts')
      persist(id,binding,'inbox_accepted')
    },
    close(){if(!closed){closed=true;k.fill(0);rows.clear();store.close()}}
  })
}
