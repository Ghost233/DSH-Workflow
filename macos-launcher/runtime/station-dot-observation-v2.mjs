import { createHmac, randomUUID } from 'node:crypto'

const LIMIT=100,MAX=4096
const goodId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&!/[\x00-\x1f\x7f]/.test(x)
const states=new Set(['active','inactive','unavailable'])
const classes=new Set(['approval','question','other'])
const bad=()=>{throw new TypeError('invalid_scoped_observation_v2')}

// Pure, unpublished v2 API. A private host supplies a finite owner-approved ID
// set, scope-specific local HMAC key, and sanitized native observations.
export function createStationObservationV2({enabled,key,readApproved,maxScope=128,concurrency=12,readMs=350,pageMs=1500}={}) {
  if(enabled!==true)return null
  if(!Buffer.isBuffer(key)||key.length!==32||typeof readApproved!=='function'||!Number.isSafeInteger(maxScope)||maxScope<1||maxScope>MAX)bad()
  if(![concurrency,readMs,pageMs].every(Number.isSafeInteger)||concurrency<1||concurrency>16||
     readMs<1||readMs>350||pageMs<readMs||pageMs>3000)bad()
  key=Buffer.from(key)
  let active=0
  const epoch=randomUUID()
  let current=null
  const h=(label,value)=>createHmac('sha256',key).update(JSON.stringify([label,value])).digest('hex')
  const aliasFor=id=>'s2_'+h('alias',id)
  function scope(){
    const a=readApproved()
    if(!Array.isArray(a)||a.length>maxScope||a.some(x=>!goodId(x))||new Set(a).size!==a.length)bad()
    return a.slice().sort()
  }
  function begin(readState){
    if(typeof readState!=='function')bad()
    const ids=scope()
    current={id:randomUUID(),scope:h('scope',ids),ids,readState,pages:new Map()}
    return page(null)
  }
  async function project(id,readState,pageSignal) {
    let p
    if(active<concurrency&&!pageSignal.aborted) {
      active++
      const signal=AbortSignal.any([pageSignal,AbortSignal.timeout(readMs)])
      p=await new Promise(resolve=>{
        const abort=()=>resolve(null)
        signal.addEventListener('abort',abort,{once:true})
        const finish=item=>{
          active--
          signal.removeEventListener('abort',abort)
          resolve(signal.aborted?null:item)
        }
        Promise.resolve().then(()=>{signal.throwIfAborted();return readState(id,signal)}).then(finish,()=>finish(null))
      })
    }
    const valid=states.has(p?.state)&&Array.isArray(p.pending)&&p.pending.length<=3&&p.pending.every(x=>classes.has(x))
    return {alias:aliasFor(id),state:valid?p.state:'unavailable',
      pending:valid&&p.state!=='unavailable'?[...new Set(p.pending)].sort():[]}
  }
  const envelope=(gap=null,rows=[],next_cursor=null,checkpoint=null)=>({
    version:2,rows,next_cursor,gap,checkpoint,
    native_event_identity:'unavailable_across_restart',coverage:rows.some(x=>x.state==='unavailable')?'partial':'explicit_allowed_scope_only'
  })
  async function page(cursor=null){
    if(!current)return envelope('no_snapshot')
    if(h('scope',scope())!==current.scope){current=null;return envelope('scope_changed')}
    const snapshot=current
    let offset=0
    if(cursor!==null){
      if(typeof cursor!=='string'||cursor.length>165)bad()
      const m=cursor.match(/^([0-9a-f-]{36})\.([0-9a-f-]{36})\.(0|[1-9][0-9]{0,3})\.([0-9a-f]{64})$/)
      if(!m||h('cursor',m.slice(1,4))!==m[4])bad()
      if(m[1]!==epoch)return envelope('host_restarted')
      if(m[2]!==current.id)return envelope('snapshot_superseded')
      offset=Number(m[3])
      if(offset===0||offset%LIMIT!==0||offset>=snapshot.ids.length)bad()
    }
    async function scan(){
      const ids=snapshot.ids.slice(offset,offset+LIMIT), rows=new Array(ids.length)
    const budget=AbortSignal.timeout(pageMs)
    let i=0
    await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},async()=>{
      for(;;){
        const row=i++
        if(row>=ids.length)return
        rows[row]=await project(ids[row],snapshot.readState,budget)
      }
    }))
      return rows
    }
    if(!snapshot.pages.has(offset))snapshot.pages.set(offset,scan())
    const rows=(await snapshot.pages.get(offset)).map(r=>({...r,pending:[...r.pending]}))
    if(current!==snapshot)return envelope('snapshot_superseded')
    if(h('scope',scope())!==snapshot.scope){current=null;return envelope('scope_changed')}
    const end=offset+rows.length
    if(end<snapshot.ids.length){
      const parts=[epoch,snapshot.id,String(end)]
      return envelope(null,rows,parts.join('.')+'.'+h('cursor',parts))
    }
    // This is a completed snapshot checkpoint, never a native-event receipt.
    return envelope(null,rows,null,{epoch,snapshot:current.id,scope:current.scope})
  }
  return Object.freeze({begin,page,aliasFor,checkpointStatus(previous){
    if(!previous||typeof previous.scope!=='string'||typeof previous.epoch!=='string'||typeof previous.snapshot!=='string')bad()
    if(previous.epoch!==epoch)return 'host_restarted'
    if(previous.scope!==h('scope',scope()))return 'scope_changed'
    return 'snapshot_checkpoint_only'
  }})
}
