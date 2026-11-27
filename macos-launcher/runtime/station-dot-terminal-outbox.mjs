// Isolated optional terminal outbox: no timer, transport, callback, commands, or Station registration.
import {constants} from 'node:fs'
import {open, lstat, readdir, realpath, link, unlink} from 'node:fs/promises'
import {join, isAbsolute} from 'node:path'
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {attachStationTerminalTurnEvents,NAME,projectStationTurnOutcome} from './station-dot-mcp-events.mjs'

const LIMIT=1024
const ID=/^evt_[0-9a-f]{64}$/
const ALIAS=/^s_[0-9a-f]{64}$/
const allowed=new Set(['success','partial','failure','abort','unknown'])
const fixed=(o,fields)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join(',')===fields
const fail=()=>{throw new Error('terminal_outbox_unavailable')}
// An interruption between linking the committed inode and dropping its private
// staging name can leave 2 links; the owner-only inode and HMAC still validate.
const statOk=(s,d)=>s.uid===process.getuid()&&(s.mode&0o077)===0&&(d?s.isDirectory():s.isFile()&&s.nlink<=2)

export async function openStationTerminalOutbox({enabled,directory,key,scope,allows,now=Date.now}={}){
  if(enabled!==true)return null
  if(!isAbsolute(directory)||typeof scope!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(scope)||
     !Buffer.isBuffer(key)||key.length!==32||typeof allows!=='function'||typeof now!=='function')fail()
  if(await realpath(directory)!==directory||!statOk(await lstat(directory),true))fail()
  const stableKey=Buffer.from(key)
  let chain=Promise.resolve(),queued=0
  const digest=(kind,v)=>createHmac('sha256',stableKey).update(JSON.stringify([scope,kind,v])).digest('hex')
  const eq=(a,b)=>typeof a==='string'&&/^[0-9a-f]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
  const run=task=>{const out=chain.then(task);chain=out.catch(()=>{});return out}
  const filename=(id,kind)=>id+'.'+kind+'.json'
  async function read(name,kind){
    let fd
    try{fd=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}
    catch(e){if(e.code==='ENOENT')return null;throw e}
    try{
      const s=await fd.stat()
      if(!statOk(s,false)||s.size<2||s.size>2048)fail()
      const obj=JSON.parse(await fd.readFile('utf8'))
      if(!fixed(obj,'data,signature')||!eq(obj.signature,digest(kind,obj.data)))fail()
      return obj.data
    }finally{await fd.close()}
  }
  async function syncDir(){
    const d=await open(directory,constants.O_RDONLY|constants.O_NOFOLLOW)
    try{await d.sync()}finally{await d.close()}
  }
  async function store(name,kind,data){
    const temp=join(directory,'.pending-'+randomUUID()),dest=join(directory,name)
    const fd=await open(temp,'wx',0o600)
    try{
      try{await fd.writeFile(JSON.stringify({data,signature:digest(kind,data)})+'\n');await fd.sync()}finally{await fd.close()}
      try{await link(temp,dest)}catch(e){if(e.code==='EEXIST')return false;throw e}
    }finally{await unlink(temp).catch(()=>{})}
    await syncDir()
    return true
  }
  async function list(){
    const names=await readdir(directory)
    if(names.length>LIMIT*2+8)fail()
    return names.filter(n=>/^evt_[0-9a-f]{64}\.event\.json$/.test(n))
  }
  const rowOk=x=>fixed(x,'data,eventId,name,timestamp')&&ID.test(x.eventId)&&x.name===NAME&&
    fixed(x.data,'outcome,session')&&ALIAS.test(x.data.session)&&allowed.has(x.data.outcome)&&
    typeof x.timestamp==='string'&&Number.isFinite(Date.parse(x.timestamp))
  async function collect(session,event){
    if(event?.type!=='turn/end')return {state:'not_terminal'}
    const id=session?.id,turn=event.data?.turn,t=event.time
    if(typeof id!=='string'||id.length<1||id.length>128||/[\x00-\x1f\x7f]/.test(id)||
       !Number.isSafeInteger(turn)||turn<1||!Number.isSafeInteger(t)||t<1||t>8640000000000000)
      return {state:'malformed_terminal'}
    const outcome=projectStationTurnOutcome(event.data?.reason?.kind)
    if(outcome===null)return {state:'not_terminal'}
    const alias='s_'+digest('alias',id)
    // Scope already attached to this outbox; allow by native ID at capture and by
    // existing scoped alias before replay, without writing the native ID anywhere.
    if(allows({nativeId:id,alias,phase:'capture'})!==true)return {state:'outside_scope'}
    const eventId='evt_'+digest('event',[id,turn])
    const data={eventId,name:NAME,timestamp:new Date(t).toISOString(),
      data:{session:alias,outcome}}
    if(queued>=64)return {state:'queue_full'}
    queued++
    return run(async()=>{
      if(await read(filename(eventId,'event'),'event'))return {state:'duplicate',eventId}
      if((await list()).length>=LIMIT)return {state:'retention_exhausted'}
      return {state:await store(filename(eventId,'event'),'event',data)?'queued':'duplicate',eventId}
    }).finally(()=>{queued--})
  }
  const acked=async id=>{
    const ack=await read(filename(id,'ack'),'ack')
    if(ack&&(!fixed(ack,'accepted_at,eventId')||ack.eventId!==id||!Number.isSafeInteger(ack.accepted_at)))fail()
    return ack!==null
  }
  return Object.freeze({observe:collect,flush:()=>chain,drain(send,limit=16){
    if(typeof send!=='function'||!Number.isInteger(limit)||limit<1||limit>64)fail()
    return run(async()=>{
      const work=[]
      for(const n of await list()){
        const x=await read(n,'event')
        if(!rowOk(x)||n!==filename(x.eventId,'event'))fail()
        if(!await acked(x.eventId)&&allows({alias:x.data.session,phase:'replay'})===true)work.push(x)
      }
      work.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.eventId.localeCompare(b.eventId))
      let accepted=0,unconfirmed=0
      for(const x of work.slice(0,limit)){
        if(allows({alias:x.data.session,phase:'replay'})!==true)continue
        let r
        try{r=await send(structuredClone(x))}catch{}
        if(!Number.isInteger(r?.status)||r.status<200||r.status>299){unconfirmed++;continue}
        const at=now()
        if(!Number.isSafeInteger(at)||at<0)fail()
        if(await store(filename(x.eventId,'ack'),'ack',{accepted_at:at,eventId:x.eventId}))accepted++
      }
      return {accepted,unconfirmed,eligible:work.length}
    })
  }})
}

export function attachStationTerminalOutbox({enabled,ctx,outbox,onResult}={}){
  return attachStationTerminalTurnEvents({enabled,ctx,events:outbox,onResult})
}
