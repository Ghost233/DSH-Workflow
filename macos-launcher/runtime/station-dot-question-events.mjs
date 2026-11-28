import {createHash,createHmac} from 'node:crypto'
import {lstat,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {createStationMcpEvents} from './station-dot-mcp-events.mjs'
import {openStationSubscriptionStore} from './station-dot-subscription-store.mjs'
import {installStationQuestionObserver} from './station-dot-question-observer.mjs'

export const INTERACTION_PENDING='dsh.interaction.pending'
const kinds=['question','plan_review','access_approval']
const def={name:INTERACTION_PENDING,description:'A DSH session is waiting for a question, plan decision, or application access decision.',
  delivery:['webhook'],inputSchema:{type:'object',properties:{},additionalProperties:false},
  payloadSchema:{type:'object',properties:{session:{type:'string'},kind:{type:'string',enum:kinds}},required:['session','kind'],additionalProperties:false}}

export async function startPairedQuestionEvents({ctx,directory,bearer,transport,callback,acceptCallback,address,report}){
  const key=createHash('sha256').update('station-dot-question\0').update(bearer).digest()
  const aliasKey=createHash('sha256').update('station-dot-approval\0').update(bearer).digest()
  const principal='paired-owner',scope='station-dot-question-'+key.toString('hex').slice(0,24)
  const dir=join(directory,scope)
  try{await mkdir(dir,{mode:0o700})}catch(error){if(error.code!=='EEXIST')throw error}
  const stat=await lstat(dir)
  if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)throw Error('question_subscription_store_invalid')
  const receipt=openStationSubscriptionStore({directory:dir,key,binding:[scope,principal,callback??'official-mcp-v1',address??null]})
  try{return startStationQuestionEvents({ctx,key,aliasKey,principal,transport,callback,acceptCallback,receipt,report})}
  catch(error){receipt.close();throw error}
}

export function startStationQuestionEvents({ctx,key,aliasKey=key,principal,transport,callback,acceptCallback,receipt,report=()=>{},now=Date.now,tickMs=250}){
  let closed=false,pumping=null
  const events=createStationMcpEvents({enabled:true,identityKey:key,
    allows:p=>!closed&&p===principal,callback,acceptCallback,transport,receipt,receiptPrincipal:principal,
    eventName:INTERACTION_PENDING,eventDefinition:def,verifyTimeoutMs:10000})
  const source=installStationQuestionObserver(ctx,{now})
  // The observer holds one row for the lifetime of each request. Retry state
  // survives transient gateway gaps and is released when that row goes away.
  const progress=new WeakMap()
  const id=(k,domain,value)=>createHmac('sha256',k).update(JSON.stringify([domain,value])).digest('hex')
  const emit=(s,code)=>{try{report(s,code)}catch{}}
  function pump(){
    if(closed||pumping)return
    pumping=(async()=>{
      if(!events.hasSubscriber(principal))return
      for(const row of source.pending()){
        if(closed||now()-row.at>600000||!source.pending().includes(row))continue
        const prev=progress.get(row)
        if(prev&&(prev.done||prev.after>now()))continue
        const event={eventId:'evt_'+id(key,'interaction',row.occurrence),name:INTERACTION_PENDING,
          timestamp:new Date(row.at).toISOString(),data:{session:'s_'+id(aliasKey,'session',row.session),kind:row.kind}}
        let status
        try{({status}=await events.deliverDurable(principal,event))}catch{}
        const retry=status===undefined||[408,409,429,500,502,503,504].includes(status)
        const attempt=(prev?.attempt??0)+1
        progress.set(row,{done:!retry||attempt>=5,after:now()+Math.min(30000,1000*2**attempt),attempt})
        emit(status>=200&&status<300?'delivered':retry?'retry':'rejected',Number.isInteger(status)?status:undefined)
      }
    })().catch(()=>emit('source_unavailable')).finally(()=>{pumping=null})
  }
  const timer=setInterval(pump,tickMs);timer.unref?.()
  queueMicrotask(pump)
  return Object.freeze({name:INTERACTION_PENDING,
    async rpc(request){const response=await events.rpc(principal,request);if(response.result&&request.method==='events/subscribe')pump();return response},
    async close(){if(closed)return;closed=true;clearInterval(timer);try{source.close();await pumping}finally{receipt?.close()}}})
}

export function combineStationInteractionEvents(approval,question){
  if(!approval||!question)return approval??question??null
  const handlers=new Map([[approval.name,approval],[question.name,question]])
  return {name:approval.name,hasName:name=>handlers.has(name),
    async rpc(request){
      if(request.method==='events/list'){
        const [a,q]=await Promise.all([approval.rpc(request),question.rpc(request)])
        if(a.error)return q.error?a:q
        return q.error?a:{...a,result:{events:[...a.result.events,...q.result.events]}}
      }
      const handler=handlers.get(request.params?.name)
      return handler?handler.rpc(request):{jsonrpc:'2.0',id:request.id??null,error:{code:-32602,message:'Unknown event'}}
    },
    async close(){try{await question.close()}finally{await approval.close()}}}
}
