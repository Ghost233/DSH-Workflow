// Isolated MCP Events contract prototype. No default listener or network client.
// Official contract: https://developers.openai.com/plugins/build/mcp-events
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {setTimeout as sleep} from 'node:timers/promises'

export const NAME='station.turn.ended'
// Packaged DSH TurnEndReasonMap: max-tokens is a genuine terminal token
// ceiling; interrupted closes a crash-orphan on recovery. A fork seed is
// historical scaffolding rather than a new turn finishing.
const reason=new Map([['completed','success'],['error','failure'],['aborted','abort'],
  ['max-tokens','partial'],['interrupted','failure']])
export const projectStationTurnOutcome = kind => kind==='forked'?null:reason.get(kind)??'unknown'
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
function keyOf(s){
  if(typeof s!=='string'||!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(s))return null
  const b=Buffer.from(s.slice(6),'base64')
  return b.length>=24&&b.length<=64&&b.toString('base64')===s.slice(6)?b:null
}
export function signStationWebhook(key,id,timestamp,body){
  return 'v1,'+createHmac('sha256',key).update(id+'.'+timestamp+'.').update(body).digest('base64')
}
function definition(){return {name:NAME,description:'A Station session turn ended.',delivery:['webhook'],
  inputSchema:{type:'object',properties:{},additionalProperties:false},
  payloadSchema:{type:'object',properties:{session:{type:'string'},outcome:{type:'string',enum:['success','partial','failure','abort','unknown']}},
  required:['session','outcome'],additionalProperties:false}}}

// 'transport' is a trusted injected boundary. This prototype only accepts one
// explicitly declared HTTPS callback and has no arbitrary URL fetch. A real
// adapter must enforce public-IP connection pinning/TLS/no redirects per docs.
export function createStationMcpEvents({enabled,identityKey,allows,callback,transport,receipt,receiptPrincipal,now=Date.now,wait=sleep,eventName=NAME,eventDefinition,verifyTimeoutMs=1500}={}){
  if(enabled!==true)return null
  if(!Number.isSafeInteger(verifyTimeoutMs)||verifyTimeoutMs<1500||verifyTimeoutMs>10000)throw Error('invalid_verification_deadline')
  if(!Buffer.isBuffer(identityKey)||identityKey.length!==32||typeof allows!=='function'||typeof transport!=='function')
    throw new TypeError('invalid_events_fixture')
  if(![NAME,'dsh.approval.pending','dsh.turn.ended'].includes(eventName)||
     (eventName!==NAME&&(eventDefinition?.name!==eventName||eventDefinition?.payloadSchema?.type!=='object')))
    throw Error('invalid_event_definition')
  const advertised=eventDefinition?structuredClone(eventDefinition):definition()
  const u=new URL(callback)
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.hostname.endsWith('.local')||u.port||u.href!==callback)
    throw new TypeError('invalid_events_callback')
  const key=Buffer.from(identityKey),epoch=randomUUID(),subs=new Map(),seen=new Set(),verified=new Map()
  let queue=Promise.resolve(), pendingCount=0
  const provisional=new Map()
  const hash=(what,value)=>createHmac('sha256',key).update(JSON.stringify([what,value])).digest('hex')
  function valid(principal,id){
    try{return typeof principal==='string'&&principal.length<=128&&principal.length>0&&allows(principal,id)===true}
    catch{return false}
  }
  const subId=(principal,url)=>'sub_'+hash('sub',[principal,url,eventName,{}])
  let persistenceFailed=false
  if(receipt){
    if(!valid(receiptPrincipal))throw new Error('station_subscription_scope_unavailable')
    const row=receipt.read(), nowAt=now()
    if(row!==null){
      const restored=keyOf(row?.signingKey)
      if(!plain(row)||Object.keys(row).sort().join(',')!=='signingKey,until,verifiedAt'||
         !restored||!Number.isSafeInteger(row.until)||!Number.isSafeInteger(row.verifiedAt)||
         row.until<=row.verifiedAt||row.until-row.verifiedAt>3600000||row.verifiedAt>nowAt)
        throw new Error('station_subscription_receipt_invalid')
      if(row.until>nowAt){
        const id=subId(receiptPrincipal,callback)
        subs.set(id,{id,principal:receiptPrincipal,key:restored,until:row.until})
        verified.set(id,{key:restored.toString('base64'),until:Math.min(row.until,row.verifiedAt+300000)})
      }
    }
  }
  function save(row){
    try {receipt?.write(row);return true}
    catch{persistenceFailed=true;subs.clear();verified.clear();return false}
  }
  async function send(sub,id,body){
    const headers={'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(Math.floor(now()/1000)),
      'X-MCP-Subscription-Id':sub.id}
    headers['webhook-signature']=signStationWebhook(sub.key,id,headers['webhook-timestamp'],body)
    if(sub.previous&&sub.previousUntil>now())headers['webhook-signature']+=' '+signStationWebhook(sub.previous,id,headers['webhook-timestamp'],body)
    const signal=AbortSignal.timeout(1500)
    // Abort-aware sender required. The isolated transport is in-memory only.
    const result=await transport({url:callback,method:'POST',redirect:'error',headers,body,signal})
    signal.throwIfAborted()
    return result
  }
  function match(p,unsubscribe=false){
    if(!plain(p)||p.name!==eventName||!plain(p.arguments)||Object.keys(p.arguments).length||
       !plain(p.delivery)||p.delivery.mode!=='webhook'||p.delivery.url!==callback||
       Object.keys(p.delivery).some(k=>!['mode','url',...(unsubscribe?[]:['secret'])].includes(k))||
       Object.keys(p).some(k=>!(unsubscribe?['name','arguments','delivery']:['name','arguments','delivery','ttlMs','cursor']).includes(k)))return false
    return true
  }
  function sweep(){for(const [k,v] of subs)if(v.until<=now()||!valid(v.principal)){subs.delete(k);verified.delete(k)}}
  async function rpc(principal,req){
    const id=req?.id??null
    const out=result=>({jsonrpc:'2.0',id,result})
    const fail=(code,message,data)=>({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}})
    if(!valid(principal)||receipt&&principal!==receiptPrincipal)return fail(-32001,'Unauthorized')
    if(persistenceFailed)return fail(-32000,'Subscription storage unavailable')
    if(!plain(req)||req.jsonrpc!=='2.0'||typeof req.method!=='string'||(typeof id!=='string'&&typeof id!=='number'))return fail(-32600,'Invalid Request')
    const p=req.params??{}
    switch(req.method){
      case 'initialize': return out({protocolVersion:'2025-03-26',capabilities:{events:{}},serverInfo:{name:'station-isolated-events',version:'0.1.0'}})
      case 'events/list': return plain(p)&&!Object.keys(p).length?out({events:[structuredClone(advertised)]}):fail(-32602,'Invalid params')
      case 'events/unsubscribe':
        if(!match(p,true))return fail(-32602,'Invalid params')
        const sid=subId(principal,p.delivery.url)
        provisional.delete(sid);subs.delete(sid);verified.delete(sid)
        if(!save(null))return fail(-32000,'Subscription storage unavailable')
        return out({})
      case 'events/subscribe': {
        if(!match(p)||p.cursor!=null||
           (p.ttlMs!==undefined&&p.ttlMs!==null&&(!Number.isSafeInteger(p.ttlMs)||p.ttlMs<1)))return fail(-32602,'Invalid params')
        const nextKey=keyOf(p.delivery.secret)
        if(!nextKey)return fail(-32602,'Invalid params')
        const sid=subId(principal,p.delivery.url)
        sweep()
        if(provisional.has(sid)||provisional.size>=16)return fail(-32000,'Subscription verification busy')
        const attempt=Symbol()
        provisional.set(sid,attempt)
        try {
        const old=subs.get(sid)
        if(!old&&subs.size>=16)return fail(-32000,'Subscription capacity reached')
        const ttl=Math.min(p.ttlMs??3600000,3600000)
        const sub={id:sid,principal,key:nextKey,until:now()+ttl}
        const cached=verified.get(sid)
        const reused=!receipt&&cached&&cached.until>now()&&same(cached.key,nextKey.toString('base64'))
        if(!reused){
          const challenge=randomUUID(), expires=now()+verifyTimeoutMs
          try{
            const r=await send(sub,'msg_verification_'+randomUUID(),JSON.stringify({type:'verification',challenge}),verifyTimeoutMs)
            if(!Number.isSafeInteger(r?.status)||r.status<200||r.status>=300||now()>expires||!same(r?.json?.challenge,challenge))
              return fail(-32015,'CallbackEndpointError',{reason:'challenge_failed'})
          }catch{return fail(-32015,'CallbackEndpointError',{reason:'timeout'})}
        }
        if(provisional.get(sid)!==attempt||!valid(principal))return fail(-32001,'Unauthorized')
        if(old&&!same(old.key.toString('base64'),nextKey.toString('base64'))){
          sub.previous=old.key;sub.previousUntil=now()+60000
        }
        sub.until=now()+ttl
        // Only activate after successful challenge verification.
        if(!subs.has(sid)&&subs.size>=16)return fail(-32000,'Subscription capacity reached')
        if(!save({signingKey:'whsec_'+nextKey.toString('base64'),until:sub.until,verifiedAt:sub.until-ttl}))
          return fail(-32000,'Subscription storage unavailable')
        subs.set(sid,sub)
        if(verified.size>=16&&!verified.has(sid))verified.delete(verified.keys().next().value)
        verified.set(sid,{key:nextKey.toString('base64'),until:now()+300000})
        return out({id:sid,refreshBefore:new Date(sub.until).toISOString(),cursor:null,truncated:false})
        } finally { if(provisional.get(sid)===attempt)provisional.delete(sid) }
      }
      default: return fail(-32601,'Method not found')
    }
  }
  async function observe(session,event){
    if(eventName!==NAME)return {state:'disabled'}
    // Native caller only, not a JSON-RPC operation. Nonterminal pause is ignored.
    if(event?.type!=='turn/end')return {state:'not_terminal'}
    const id=session?.id,turn=event.data?.turn,time=event.time
    if(typeof id!=='string'||!id||id.length>128||!Number.isSafeInteger(turn)||turn<1||
       !Number.isSafeInteger(time)||time<1||time>8640000000000000)return {state:'malformed_terminal'}
    const outcome=projectStationTurnOutcome(event.data?.reason?.kind)
    if(outcome===null)return {state:'not_terminal'}
    const dedup=hash('dedup',[id,turn])
    if(seen.has(dedup))return {state:'duplicate'}
    if(pendingCount>=64)return {state:'queue_full'}
    if(seen.size>=1024)return {state:'retention_exhausted'}
    seen.add(dedup)
    // Copy only projected data at ingress; never retain the raw event/session.
    pendingCount++
    const result=queue.then(()=>dispatch(id,turn,time,outcome))
    queue=result.catch(()=>{})
    return result.finally(()=>{pendingCount--})
  }
  async function dispatch(id,turn,time,outcome){
      const eventId='evt_'+hash('event',[epoch,id,turn])
      const body=JSON.stringify({eventId,name:eventName,timestamp:new Date(time).toISOString(),
        data:{session:'s_'+hash('alias',id),outcome},cursor:null})
      sweep()
      let accepted=0,failed=0
      for(const sub of subs.values()){
        if(!valid(sub.principal,id))continue
        let ok=false
        for(let i=0;i<3;i++){
          if(i)await wait(i===1?10:20)
          if(subs.get(sub.id)!==sub||sub.until<=now()||!valid(sub.principal,id))break
          let code
          try{code=(await send(sub,eventId,body)).status}catch{code=503}
          if(code>=200&&code<300){ok=true;break}
          if(![408,429,500,502,503,504].includes(code))break
        }
        if(ok)accepted++;else failed++
      }
      return {state:'terminal',accepted,failed}
  }
  function subscriber(principal){
    sweep()
    if(persistenceFailed)return undefined
    return [...subs.values()].find(sub=>sub.principal===principal)
  }
  async function deliverDurable(principal,event){
    const sub=subscriber(principal)
    if(!sub||!valid(principal))return {status:409}
    // Private Station outbox projection only; no public RPC can send an event.
    return send(sub,event.eventId,JSON.stringify({...event,cursor:null}))
  }
  return Object.freeze({rpc,observe,hasSubscriber:p=>Boolean(subscriber(p)),deliverDurable,limits:Object.freeze({replay:false,restart:'not_durable',maxLogicalEvents:1024})})
}

// Native DSH source seam; opt in explicitly inside an authorized Host. Lifecycle
// callback never answers approvals, accesses the transcript, or sends a prompt.
export function attachStationTerminalTurnEvents({enabled,ctx,events,onResult}={}){
  if(enabled!==true)return null
  if(typeof ctx?.on!=='function'||typeof events?.observe!=='function'||typeof onResult!=='function')
    throw new TypeError('invalid_terminal_turn_source')
  let stopped=false
  const off=ctx.on('session/event',(session,event)=>{
    if(stopped||event?.type!=='turn/end')return
    Promise.resolve(events.observe(session,event)).then(result=>{
      if(!stopped)onResult(result)
    },()=>{
      if(!stopped)onResult({state:'delivery_unavailable'})
    }).catch(()=>{})
  })
  if(typeof off!=='function')throw new TypeError('invalid_terminal_turn_subscription')
  return ()=>{if(!stopped){stopped=true;off()}}
}
