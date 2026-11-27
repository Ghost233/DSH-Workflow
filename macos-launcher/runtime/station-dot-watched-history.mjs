// Native event data never crosses this read-only boundary.
const kinds=new Set(['turn/start','turn/end','user/message','assistant/message','assistant/attempt'])
const cursor=n=>Number.isSafeInteger(n)&&n>=-1
const failure=status=>({status,cursor:null,events:[],semantic_coverage:'not_enabled'})
export function createWatchedHistory({sessionController,sessionId,localProject}){
 if(typeof sessionController?.events!=='function'||typeof sessionId!=='string'||!sessionId.length||sessionId.length>256) throw TypeError('invalid_watch')
 let busy=false
 return async function read({selectedSession,after=null}={}){
  if(selectedSession!==sessionId)return failure('out_of_scope')
  if(after!==null&&!cursor(after))return failure('invalid_cursor')
  if(busy)return failure('busy')
  busy=true
  const signal=AbortSignal.timeout(2500)
  let timer
  const timeout=new Promise(r=>{timer=setTimeout(()=>r(failure('deadline')),2500)})
  async function collect(){
   let through,before,total=0
   const pages=[], projectionPages=[]
   for(let i=0;i<3;i++){
    if(signal.aborted)return failure('deadline')
    const request={address:{kind:'session',sessionId},maxMessages:12}
    if(through!==undefined)Object.assign(request,{throughSeq:through,beforeSeq:before})
    const p=await sessionController.events(request,signal)
    if(signal.aborted)return failure('deadline')
    if(!p||!cursor(p.cursor)||typeof p.hasMore!=='boolean'||!Array.isArray(p.records)||(through!==undefined&&through!==p.cursor))return failure('invalid_page')
    through=p.cursor
    if(after!==null&&through<after)return failure('cursor_regressed')
    const end=before??through+1, first=end-p.records.length
    if(first<0||p.hasMore!==(first>0)||(!p.records.length&&end!==0))return failure('invalid_page')
    total+=p.records.length
    if(total>384)return failure('history_budget')
    const markers=[]
    for(const [i,r] of p.records.entries()){
     const e=r?.event
     if(r?.type!=='event'||!e||e.seq!==first+i||!Number.isSafeInteger(e.time)||e.time<0||typeof e.type!=='string')return failure('invalid_page')
     if(after!==null&&e.seq>after&&kinds.has(e.type))markers.push({seq:e.seq,time:e.time,kind:e.type})
    }
    // Trusted local projection runs only after structural validation. Native
    // records never leave the process; no project hook is enabled by default.
    if(after===null)return {...failure('baseline_only'),cursor:through,
      ...(localProject?{projection:localProject({mode:'baseline',after:first-1,through,records:p.records})}:{})}
    pages.unshift(markers)
    if(localProject)projectionPages.unshift(p.records.filter(r=>r.event.seq>after))
    if(first<=after+1)return {...failure('complete'),cursor:through,covered:{after,through},events:pages.flat(),
      ...(localProject?{projection:localProject({mode:'delta',after,through,records:projectionPages.flat()})}:{})}
    before=first
   }
   return failure('history_budget')
  }
  // Uncooperative natives keep the lock until their call finally settles.
  const work=collect().catch(()=>failure(signal.aborted?'deadline':'source_unavailable'))
  void work.then(()=>{clearTimeout(timer);busy=false})
  return Promise.race([work,timeout])
 }
}
