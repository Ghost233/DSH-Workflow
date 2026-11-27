import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { loadObservationConfig } from './session-observation-mcp.mjs'
import { createStationDotProjection } from './station-dot-projection.mjs'
import { stationDigest } from './station-dot-workflow.mjs'

const hash = value => createHash('sha256').update(value).digest()

export async function startStationDotFromHost({ctx, receiptDirectory, loadConfig=loadObservationConfig}) {
  const config = await loadConfig(join(receiptDirectory,'station-dot-api.json'))
  if (!config) return null
  const controller = ctx.sessionController
  if (typeof controller?.state !== 'function' || typeof ctx.on !== 'function') throw new Error('station_dot_unavailable')
  const projection = createStationDotProjection(config.sessions.map((_, i)=>'session_'+(i+1)))
  const byId = new Map(config.sessions.map((r,i)=>[r.id,'session_'+(i+1)]))
  const auth = hash('Bearer '+config.bearer)
  const lifecycle = new AbortController()
  let reading = false, closed = false
  const server = createServer({requestTimeout:5000,headersTimeout:4000,keepAliveTimeout:1000,maxHeaderSize:8192},
    (req,res)=>void handle(req,res).catch(()=>{if(!res.headersSent)reply(res,503,{error:'unavailable'});else res.end()}))
  server.maxConnections = 16
  function reply(res, code, data) {
    res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'})
    res.end(JSON.stringify(data))
  }
  async function handle(req,res) {
    if (closed || req.socket.remoteAddress !== '127.0.0.1' ||
        req.headers.host !== '127.0.0.1:'+server.address()?.port || req.headers.origin !== undefined)
      return reply(res,404,{})
    const supplied = req.headers.authorization
    if (typeof supplied !== 'string' || !timingSafeEqual(auth,hash(supplied))) return reply(res,401,{})
    if (req.method !== 'GET' || !req.url?.startsWith('/') || req.url.startsWith('//') || req.url.length>512)
      return reply(res,404,{})
    const url = new URL(req.url, 'http://127.0.0.1')
    const params = url.searchParams
    if (url.pathname === '/v1/station/events') {
      if (Array.from(params.keys()).some(k=>!['after','limit'].includes(k)||params.getAll(k).length!==1))
        return reply(res,400,{})
      const limit = params.get('limit')??'32'
      if (!/^[1-9][0-9]?$/.test(limit)) return reply(res,400,{})
      try {return reply(res,200,projection.read(params.get('after'),Number(limit)))}
      catch{return reply(res,400,{})}
    }
    if (url.pathname !== '/v1/station/sessions/status') return reply(res,404,{})
    const watched = params.getAll('watched')
    if ([...params.keys()].some(k=>k!=='watched') || watched.length>8 ||
        new Set(watched).size!==watched.length || watched.some(x=>![...byId.values()].includes(x)))
      return reply(res,400,{})
    if (reading) return reply(res,503,{error:'busy'})
    reading = true
    try {
      const rows=[]
      for (const [id,session] of byId) {
        const state=await timedState(controller,id,AbortSignal.any([lifecycle.signal,AbortSignal.timeout(350)]))
        const known=state&&typeof state.running==='boolean'&&typeof state.active==='boolean'&&
          Array.isArray(state.pendingInput)&&state.pendingInput.length<=8&&
          state.pendingInput.every(x=>['approval','question','other'].includes(x))
        rows.push({session,state:known?(state.running?'running':state.active?'idle':'inactive'):'unavailable',
          kinds:known?state.pendingInput:[]})
      }
      return reply(res,200,stationDigest(rows,watched))
    } finally {reading=false}
  }
  server.listen(config.port,'127.0.0.1')
  await once(server,'listening')
  let dispose
  const close=async()=>{
    if (closed) return
    closed=true;lifecycle.abort()
    try {dispose?.()} catch {/* shutdown still closes listener */}
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
  }
  try {
    dispose=ctx.on('session/event',(session,event)=>{
      const alias=byId.get(session?.id)
      if (!alias||event?.type!=='turn/end') return
      const {turn,reason}=event.data??{}
      const outcome=reason?.kind
      if (typeof outcome!=='string') return
      projection.observe(alias,turn,['completed','error','aborted'].includes(outcome)?outcome:'other',event.time)
    })
  } catch (error) { await close();throw error }
  return {port:server.address().port,close}
}

async function timedState(controller,sessionId,signal) {
  if(signal.aborted)return null
  return new Promise(resolve=>{
    const settle=value=>{signal.removeEventListener('abort',abort);resolve(value)}
    const abort=()=>settle(null)
    signal.addEventListener('abort',abort,{once:true})
    Promise.resolve().then(()=>controller.state({sessionId},signal)).then(settle,abort)
  })
}
