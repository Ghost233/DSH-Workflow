import {createHash, createHmac} from 'node:crypto'
import {constants} from 'node:fs'
import {lstat, mkdir, open} from 'node:fs/promises'
import {join} from 'node:path'
import {createStationMcpEvents} from './station-dot-mcp-events.mjs'
import {createStationHttpsDelivery,createOfficialStationHttpsDelivery,isOfficialStationCallback} from './station-dot-https-delivery.mjs'
import {openStationSubscriptionStore} from './station-dot-subscription-store.mjs'

export const APPROVAL_PENDING = 'dsh.approval.pending'
const definition = {name:APPROVAL_PENDING, description:'A DSH session is waiting for an owner approval.',
  delivery:['webhook'], inputSchema:{type:'object',properties:{},additionalProperties:false},
  payloadSchema:{type:'object',properties:{session:{type:'string'},kind:{type:'string',const:'approval'}},
    required:['session','kind'],additionalProperties:false}}
const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sessionId = /^[A-Za-z0-9_-]{1,128}$/
const maxRows = 128, maxAge = 600000

// A local operator explicitly authorizes one receiver. Never dial a URL supplied
// by an RPC unless it exactly matches this pinned HTTPS receiver.
export async function loadStationApprovalReceiver(directory) {
  let fd
  try { fd=await open(join(directory,'station-dot-approval-receiver.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK) }
  catch(error) { if(error.code==='ENOENT')return null; throw error }
  try {
    const stat=await fd.stat()
    if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600||stat.size<2||stat.size>2048)
      throw Error('approval_receiver_invalid')
    const bytes=Buffer.alloc(2049)
    const {bytesRead}=await fd.read(bytes)
    if(bytesRead!==stat.size)throw Error('approval_receiver_invalid')
    const input=JSON.parse(bytes.subarray(0,bytesRead).toString())
    if(!input||Object.keys(input).sort().join(',')!=='address,url'||typeof input.url!=='string'||typeof input.address!=='string')
      throw Error('approval_receiver_invalid')
    return input
  } finally { await fd.close() }
}

export async function startPairedStationApprovalEvents({ctx,directory,bearer,report=()=>{}}) {
  const approval=await loadStationApprovalReceiver(directory)
  const transport=approval?createStationHttpsDelivery({enabled:true,approval,budget:10000}):createOfficialStationHttpsDelivery()
  const key=createHash('sha256').update('station-dot-approval\0').update(bearer).digest()
  const principal='paired-owner'
  const scope='station-dot-approval-'+key.toString('hex').slice(0,24)
  const privateDir=join(directory,scope)
  try { await mkdir(privateDir,{mode:0o700}) } catch(error) { if(error.code!=='EEXIST')throw error }
  const stat=await lstat(privateDir)
  if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)
    throw Error('approval_subscription_store_invalid')
  const receipt=openStationSubscriptionStore({directory:privateDir,key,binding:[scope,principal,approval?.url??"official-mcp-v1",approval?.address??null]})
  try { return startStationApprovalEvents({ctx,key,principal,callback:approval?.url,acceptCallback:approval?undefined:isOfficialStationCallback,transport,receipt,report}) }
  catch(error) { receipt.close(); throw error }
}

// Observe DSH's committed ask/decide audit pair, and require the *same* live
// session to have a forwarded approval in the real Client gateway. We never
// participate in the answer waterfall or read or store reason/tool arguments.
export function startStationApprovalEvents({ctx,key,principal,callback,acceptCallback,transport,receipt,report=()=>{},now=Date.now,tickMs=250}) {
  if(typeof ctx?.on!=='function'||typeof ctx.typertGateway?.getPendingRemoteEvents!=='function')
    throw Error('approval_source_unavailable')
  const rows=new Map()
  let closed=false,pumping=false,timer,detach
  const events=createStationMcpEvents({enabled:true,identityKey:key,receipt,receiptPrincipal:principal,
    allows:p=>!closed&&p===principal,callback,acceptCallback,transport,verifyTimeoutMs:10000,eventName:APPROVAL_PENDING,eventDefinition:definition})
  const digest=(domain,...parts)=>createHmac('sha256',key).update(JSON.stringify([domain,...parts])).digest('hex')
  const note=state=>{try{report(state)}catch{}}
  function pump(){
    if(closed||pumping||!rows.size)return
    pumping=true
    void (async()=>{
      const at=now()
      for(const [id,row] of rows)if(at-row.at>maxAge)rows.delete(id)
      if(!rows.size||!events.hasSubscriber(principal))return
      const pending=new Set(ctx.typertGateway.getPendingRemoteEvents()
        .filter(x=>x.event==='approval/request').map(x=>String(x.agentId)))
      for(const [id,row] of rows){
        if(closed||rows.get(id)!==row||row.finished||at<row.retryAt||!pending.has(row.session))continue
        // The exact occurrence can have resolved while a previous webhook was in flight.
        const samePending=ctx.typertGateway.getPendingRemoteEvents().some(x=>x.event==='approval/request'&&String(x.agentId)===row.session)
        if(!samePending)continue
        let status
        try {({status}=await events.deliverDurable(principal,{eventId:'evt_'+digest('approval',id),
          name:APPROVAL_PENDING,timestamp:new Date(row.at).toISOString(),
          data:{session:'s_'+digest('session',row.session),kind:'approval'}}))}catch{}
        if(rows.get(id)!==row)continue
        if(status>=200&&status<300){row.finished=true;note('delivered')}
        else if(status!==409&&status!==undefined&&![408,429,500,502,503,504].includes(status)){
          row.finished=true;note('rejected')
        }else{row.retryAt=now()+Math.min(30000,1000*2**row.retries);row.retries=Math.min(5,row.retries+1);note('retry')}
      }
    })().catch(()=>note('source_unavailable')).finally(()=>{pumping=false})
  }
  detach=ctx.on('session/event',(session,event)=>{
    if(closed||!['approval/asked','approval/decided'].includes(event?.type))return
    const id=event.data?.id, sid=session?.id
    if(typeof id!=='string'||!requestId.test(id)||typeof sid!=='string'||!sessionId.test(sid))return
    if(event.type==='approval/decided'){if(rows.get(id)?.session===sid)rows.delete(id);return}
    if(rows.has(id))return
    if(rows.size>=maxRows){note('capacity');return}
    rows.set(id,{session:sid,at:now(),retryAt:0,retries:0})
  })
  if(typeof detach!=='function')throw Error('approval_source_unavailable')
  timer=setInterval(pump,tickMs);timer.unref?.()
  return {
    name:APPROVAL_PENDING,
    async rpc(request){const response=await events.rpc(principal,request);if(response.result&&request.method==='events/subscribe')pump();return response},
    async close(){closed=true;clearInterval(timer);rows.clear();try{detach()}finally{receipt?.close()}},
  }
}
