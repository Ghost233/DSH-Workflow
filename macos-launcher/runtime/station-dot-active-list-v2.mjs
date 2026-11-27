// Unwired, on-demand list for a private host. Never consult persisted sessions.
import {createStationObservationV2} from './station-dot-observation-v2.mjs'
const idShape=id=>typeof id==='string'&&id.length>0&&id.length<=128&&!/[\x00-\x1f\x7f]/.test(id)
export function createStationActiveListV2({enabled,ctx,key,readApproved}={}) {
  if(enabled!==true)return null
  if(typeof ctx?.agents?.list!=='function'||typeof readApproved!=='function')throw new TypeError('invalid_live_scope')
  let snapshot=null, reading=false
  const approved=()=>{
    const ids=readApproved()
    if(!Array.isArray(ids)||ids.length>128||ids.some(id=>!idShape(id))||new Set(ids).size!==ids.length)
      throw new TypeError('invalid_live_membership')
    return new Set(ids)
  }
  const observer=createStationObservationV2({enabled:true,key,readApproved:()=>{
    const policy=approved()
    return snapshot?.ids.filter(id=>policy.has(id))??[]
  }})
  const project=page=>({version:2,kind:'active_sessions',coverage:page.gap?'partial':'approved_live_capture',
    captured_at:snapshot?.capturedAt??null,gap:page.gap,next_cursor:page.next_cursor,
    rows:page.rows.map(r=>({alias:r.alias}))})
  const gap=code=>({version:2,kind:'active_sessions',coverage:'partial',captured_at:null,gap:code,next_cursor:null,rows:[]})
  return Object.freeze({
    async begin(){
      if(reading)return gap('busy')
      reading=true
      snapshot=null
      try{
        const scope=approved()
        // One local snapshot of current in-memory Agent handles. No per-agent
        // payload, persisted controller, pending approvals, or activity history.
        let handles
        try{handles=ctx.agents.list()}catch{return gap('live_inventory_unavailable')}
        if(!Array.isArray(handles)||handles.length>4096)return gap('live_inventory_unavailable')
        const ids=new Set()
        for(const handle of handles){
          const id=handle?.id
          if(scope.has(id))ids.add(id)
        }
        snapshot={ids:[...ids],capturedAt:new Date().toISOString()}
        return project(await observer.begin(()=>({state:'active',pending:[]})))
      }finally{reading=false}
    },
    async page(cursor){
      if(reading)return gap('busy')
      if(!snapshot)return gap('no_snapshot')
      if(typeof cursor!=='string'||!cursor)throw new TypeError('invalid_live_cursor')
      return project(await observer.page(cursor))
    }
  })
}
