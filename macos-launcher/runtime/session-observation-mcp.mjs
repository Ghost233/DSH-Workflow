import { createHash, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { startStationTerminalEvents } from './station-dot-terminal-events.mjs'

const LOOPBACK = '127.0.0.1'
const PATH = '/mcp'
const CONFIG_LIMIT = 24 * 1024
const BODY_LIMIT = 8192
const ALLOWED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18', '2025-11-25'])
const DISCOVERY_PROTOCOL = '2026-07-28'
const SERVER_INFO = {name:'station-session-observation',version:'1.0.0'}
const VERSION_META = 'io.modelcontextprotocol/protocolVersion'
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo'
const EVENTS = new Set(['events/list','events/subscribe','events/unsubscribe'])
const PENDING = new Set(['approval', 'question', 'other'])
const ID = /^[A-Za-z0-9_-]{1,128}$/
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/
const tool = Object.freeze({
  name: 'session_status',
  description: 'Read the latest projected DSH status of configured sessions. Does not resume or modify them.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
})

const activeTool = Object.freeze({
  name: 'list_active_sessions',
  description: 'Explicit one-time snapshot of authorized active DSH sessions. Returns up to 100 opaque aliases; use the returned cursor to continue this same capture. Does not read history or modify sessions.',
  inputSchema: {type:'object',properties:{cursor:{type:'string',maxLength:165}},additionalProperties:false},
  annotations: {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
})
const watchTool = Object.freeze({
  name: 'watch_session',
  description: 'Read bounded activity markers for one explicitly configured DSH session; no content or mutation.',
  inputSchema: { type:'object',properties:{session_label:{type:'string',maxLength:64},after:{type:'integer',minimum:-1}},
    required:['session_label'],additionalProperties:false },
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
})
const globalWatchTool = Object.freeze({
  ...watchTool,
  description:'Poll bounded activity markers for exactly one DSH session by ID. Requires the paired Dot connection, not a per-session allowlist. Does not read conversation text or modify sessions.',
  inputSchema:{type:'object',properties:{session_id:{type:'string',pattern:ID.source,maxLength:128},after:{type:'integer',minimum:-1}},
    required:['session_id'],additionalProperties:false},
})
const approvedPromptTool = Object.freeze({
  name: 'send_approved_draft',
  description: 'Queue one exact owner-approved draft to a configured session. A matching local consent receipt must already exist.',
  inputSchema: {type:'object',properties:{session_label:{type:'string',maxLength:64},
    request_id:{type:'string',maxLength:36},draft:{type:'string',maxLength:4096}},
    required:['session_label','request_id','draft'],additionalProperties:false},
  annotations: {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
})
const promptId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function approvedPromptArgs(a) {
  return a && typeof a==='object' && !Array.isArray(a) &&
    Object.keys(a).sort().join(',')==='draft,request_id,session_label' &&
    typeof a.session_label==='string' && a.session_label.length>0 && a.session_label.length<=64 &&
    typeof a.request_id==='string' && promptId.test(a.request_id) &&
    typeof a.draft==='string' && a.draft.trim().length>0 && !a.draft.includes('\0') && Buffer.byteLength(a.draft)<=4096
}
const watchKinds=new Set(['turn/start','turn/end','user/message','assistant/message','assistant/attempt'])
const watchStates=new Set(['baseline_only','complete','busy','deadline','source_unavailable','invalid_page','cursor_regressed','history_budget'])
function watchArgs(args, global) {
  const field=global?'session_id':'session_label'
  return args && typeof args==='object' && !Array.isArray(args) &&
    typeof args[field]==='string' && (global?ID.test(args[field]):args[field].length<=64) &&
    Object.keys(args).every(k=>k===field||k==='after') &&
    (!Object.hasOwn(args,'after')||Number.isSafeInteger(args.after)&&args.after>=-1)
}
function watchResult(r) {
  if(!watchStates.has(r?.status)||!Array.isArray(r.events)||r.events.length>384||
    (r.cursor!==null&&(!Number.isSafeInteger(r.cursor)||r.cursor< -1))||
    r.events.some(x=>!Number.isSafeInteger(x?.seq)||x.seq<0||!Number.isSafeInteger(x.time)||x.time<0||!watchKinds.has(x.kind)))return null
  const projected = r.status === 'complete' ? r.projection : null
  const signal = projected?.signal
  const diagnostic = projected?.text_coverage === 'observed' && projected.semantic_coverage === 'not_enabled' &&
    signal?.kind === 'repeated_redacted_assistant_output' && Number.isSafeInteger(signal.turns) &&
    signal.turns >= 3 && signal.turns <= 128
    ? {kind:signal.kind, turns:signal.turns} : undefined
  return {status:r.status,cursor:r.cursor,content_coverage:'activity_markers_only',
    events:r.events.map(({seq,time,kind})=>({seq,time,kind})), ...(diagnostic ? {diagnostic} : {})}
}

function activeArgs(args) {
  return args && typeof args==='object' && !Array.isArray(args) &&
    Object.keys(args).every(k=>k==='cursor') &&
    (!Object.hasOwn(args,'cursor')||typeof args.cursor==='string'&&/^[0-9a-f.-]{1,165}$/.test(args.cursor))
}

export async function loadObservationConfig(path) {
  let fd
  try { fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  try {
    const st = await fd.stat()
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 ||
        st.size < 1 || st.size > CONFIG_LIMIT) throw new Error('observation_config_invalid')
    const bytes = Buffer.alloc(CONFIG_LIMIT + 1)
    const { bytesRead } = await fd.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== st.size || bytesRead > CONFIG_LIMIT) throw new Error('observation_config_invalid')
    return validateObservationConfig(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
  } finally { await fd.close() }
}

export function validateObservationConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      !['bearer,port,sessions','activeSessionIds,bearer,port,sessions','bearer,globalActiveList,port,sessions'].includes(Object.keys(config).sort().join(',')) ||
      typeof config.bearer !== 'string' || !TOKEN.test(config.bearer) ||
      !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !Array.isArray(config.sessions) || (config.sessions.length < 1 && config.globalActiveList !== true) || config.sessions.length > 8 ||
      (Object.hasOwn(config,'globalActiveList') && config.globalActiveList !== true)) {
    throw new Error('observation_config_invalid')
  }
  if (Object.hasOwn(config, 'activeSessionIds')) {
    const activeIds = config.activeSessionIds
    if (!Array.isArray(activeIds) || activeIds.length > 128 ||
        activeIds.some(id => typeof id !== 'string' || !ID.test(id)) ||
        new Set(activeIds).size !== activeIds.length) throw new Error('observation_config_invalid')
  }
  const labels = new Set(), ids = new Set()
  for (const row of config.sessions) {
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'id,label' ||
        typeof row.id !== 'string' || !ID.test(row.id) || typeof row.label !== 'string' ||
        !/^[\p{L}\p{N} ._()\-]{1,64}$/u.test(row.label) || ids.has(row.id) || labels.has(row.label)) {
      throw new Error('observation_config_invalid')
    }
    ids.add(row.id); labels.add(row.label)
  }
  return config
}

const hash = value => createHash('sha256').update(value).digest()
const emptyArgs = args => args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0
const time = () => new Date().toISOString()

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function reply(response, id, result) { json(response, 200, {jsonrpc:'2.0', id, result}) }
function error(response, id, code, message) { json(response, 200, {jsonrpc:'2.0', id, error:{code,message}}) }
async function readRequest(request) {
  let size = 0; const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('request_too_large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function startSessionObservation({ config, sessionController, observeTurnEnds, activeList, terminalEvents, approvalEvents, watchedHistory, approvedPromptDelivery }) {
  config = validateObservationConfig(config)
  if (typeof sessionController?.state !== 'function') throw new Error('observation_source_unavailable')
  if(activeList!==undefined&&(typeof activeList?.begin!=='function'||typeof activeList?.page!=='function'))
    throw new Error('active_list_source_unavailable')
  if(watchedHistory!==undefined&&typeof watchedHistory!=='function')throw new Error('watch_source_unavailable')
  if(approvedPromptDelivery!==undefined&&typeof approvedPromptDelivery!=='function')
    throw new Error('isolated_prompt_source_unavailable')
  let activeInFlight=false, watchInFlight=false
  const credential = hash('Bearer ' + config.bearer)
  const selections = config.sessions.map(({ id, label }) => ({ id, label }))
  const selected = new Set(selections.map(row => row.id))
  // The authenticated endpoint fixes the principal; neither headers nor JSON may choose it.
  let terminal, approval, ready=false
  const eventOptions=terminalEvents?.options
  const eventPrincipal=eventOptions?.principal
  if(eventOptions?.enabled===true&&(!Array.isArray(eventOptions.sessionIds)||
     eventOptions.sessionIds.some(id=>!selected.has(id))))throw new Error('terminal_event_scope_unavailable')
  const completions = new Map()
  function onSessionEvent(session, event) {
    const id = session?.id
    if (closed || !selected.has(id) || event?.type !== "turn/end") return
    const turn = event.data?.turn, kind = event.data?.reason?.kind
    if (!Number.isSafeInteger(turn) || turn < 1 || !Number.isSafeInteger(event.time) ||
        event.time < 1 || event.time > 8640000000000000 || typeof kind !== "string" ||
        (completions.get(id)?.turn ?? 0) >= turn) return
    const outcome = ["completed", "error", "aborted"].includes(kind) ? kind : "other"
    completions.set(id, {turn, outcome, ended_at:new Date(event.time).toISOString()})
  }
  let inFlight = false, closed = false
  const lifecycle = new AbortController()
  const server = createServer({ requestTimeout: 5000, headersTimeout: 4000, keepAliveTimeout: 1000, maxHeaderSize: 8192 }, (q,r) => {
    void handle(q,r).catch(() => {
      if (!r.headersSent) json(r, 503, {error:'observation_unavailable'})
      else r.end()
    })
  })
  server.maxConnections = 16
  async function handle(q,r) {
    if (q.socket.remoteAddress !== LOOPBACK || q.headers.host !== LOOPBACK + ':' + config.port ||
        q.headers.origin !== undefined || q.url !== PATH) return json(r,404,{error:'not_found'})
    const supplied = q.headers.authorization
    if (typeof supplied !== 'string' || !timingSafeEqual(hash(supplied),credential))
      return json(r,401,{error:'authentication_required'})
    if (!ready || closed) return json(r,503,{error:'observation_unavailable'})
    if (q.method !== 'POST') { r.writeHead(405, {Allow:'POST'}); r.end(); return }
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(q.headers['content-type'] ?? ''))
      return json(r,415,{error:'unsupported_content_type'})
    const accept = q.headers.accept ?? ''
    if (!accept.split(',').some(x => x.trim().split(';')[0] === 'application/json') ||
        !accept.split(',').some(x => x.trim().split(';')[0] === 'text/event-stream'))
      return json(r,406,{error:'unsupported_accept'})
    const version = q.headers['mcp-protocol-version']
    if (version !== undefined && version !== DISCOVERY_PROTOCOL && !ALLOWED_PROTOCOLS.has(version))
      return json(r,400,{error:'unsupported_protocol'})
    let msg
    try { msg = await readRequest(q) } catch { return json(r,400,{error:'invalid_request'}) }
    const id = msg?.id
    const validId = typeof id === 'string' && id.length <= 128 || Number.isSafeInteger(id)
    if (!msg || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
      return error(r,null,-32600,'Invalid Request')
    if (id === undefined && msg.method === 'notifications/initialized') { r.writeHead(202); r.end(); return }
    if (!validId) return error(r,null,-32600,'Invalid Request')
    const params = msg.params
    const meta = params?._meta
    const metaVersion = meta?.[VERSION_META]
    const methodHeader = q.headers['mcp-method']
    const nameHeader = q.headers['mcp-name']
    const modern = version === DISCOVERY_PROTOCOL || msg.method === 'server/discover'
    const respond = value => reply(r,id,modern?{resultType:'complete',...value}:value)
    if (modern) {
      if ((params!==undefined && (!params || typeof params!=='object' || Array.isArray(params))) ||
          (meta!==undefined && (!meta || typeof meta!=='object' || Array.isArray(meta))))
        return error(r,id,-32602,'Invalid params')
      if ((version!==undefined && metaVersion!==undefined && version!==metaVersion) ||
          (methodHeader!==undefined && methodHeader!==msg.method) ||
          (version===DISCOVERY_PROTOCOL && methodHeader!==msg.method) ||
          (msg.method==='tools/call' ? typeof params?.name!=='string' || nameHeader!==params.name :
            approval&&['events/subscribe','events/unsubscribe'].includes(msg.method)
              ? nameHeader!==undefined&&nameHeader!==params?.name : nameHeader!==undefined))
        return json(r,400,{error:'invalid_protocol_headers'})
      if (msg.method === 'server/discover') {
        if (Object.keys(params??{}).some(k=>k!=='_meta')) return error(r,id,-32602,'Invalid params')
        return respond({supportedVersions:[DISCOVERY_PROTOCOL],capabilities:{tools:{},...(approval?{events:{}}:{})},
          _meta:{[SERVER_INFO_META]:SERVER_INFO}})
      }
      if (!['ping','tools/list','tools/call'].includes(msg.method) && !(approval&&EVENTS.has(msg.method)))
        return error(r,id,-32601,'Method not found')
    } else if (metaVersion === DISCOVERY_PROTOCOL) {
      return json(r,400,{error:'missing_protocol_header'})
    }
    if (msg.method === 'initialize') {
      if (typeof msg.params?.protocolVersion !== 'string') return error(r,id,-32602,'Invalid params')
      return respond({protocolVersion:ALLOWED_PROTOCOLS.has(msg.params.protocolVersion)?msg.params.protocolVersion:'2025-06-18',
        capabilities:{tools:{},...((terminal||approval)?{events:{}}:{})},serverInfo:SERVER_INFO})
    }
    if (EVENTS.has(msg.method) && (approval||(!modern&&terminal))) {
      if(closed)return error(r,id,-32000,'Station events unavailable')
      if(Object.keys(msg).some(key=>!['jsonrpc','id','method','params'].includes(key)))
        return error(r,id,-32600,'Invalid Request')
      const { _meta, ...eventParams } = params ?? {}
      const request=modern?{...msg,params:eventParams}:msg
      if(msg.method==='events/list'&&approval&&terminal&&!modern){
        const [a,b]=await Promise.all([approval.rpc(request),terminal.rpc(eventPrincipal,request)])
        if(a.error||b.error)return json(r,200,a.error?a:b)
        return respond({events:[...a.result.events,...b.result.events]})
      }
      const target=approval&&(msg.method==='events/list'||request.params?.name===approval.name)
      const response=target?await approval.rpc(request):(!modern&&terminal?await terminal.rpc(eventPrincipal,request):null)
      if(!response)return error(r,id,-32602,'Unknown event')
      return modern&&response.result?respond(response.result):json(r,200,response)
    }
    if (msg.method === 'ping') return respond({})
    if (msg.method === 'tools/list') return respond({tools:[tool,...(activeList?[activeTool]:[]),
      ...(watchedHistory?[config.globalActiveList?globalWatchTool:watchTool]:[]),...(modern&&approvedPromptDelivery?[approvedPromptTool]:[])]})
    if (msg.method !== 'tools/call') return error(r,id,-32601,'Method not found')
    if (modern && approvedPromptDelivery && msg.params?.name===approvedPromptTool.name) {
      const args=msg.params.arguments
      if(!approvedPromptArgs(args))return error(r,id,-32602,'Invalid params')
      const target=selections.find(row=>row.label===args.session_label)
      if(!target||closed)return error(r,id,-32000,'Approved delivery unavailable')
      try {
        const value=await approvedPromptDelivery({sessionId:target.id,requestId:args.request_id,
          draft:args.draft,signal:lifecycle.signal})
        if(closed||value?.requestId!==args.request_id ||
           !['inbox_accepted','delivery_unconfirmed','not_sent','in_progress'].includes(value?.state))
          return error(r,id,-32000,'Approved delivery unavailable')
        const result={request_id:value.requestId,state:value.state}
        return respond({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
      } catch {
        return error(r,id,-32000,'Approved delivery unavailable')
      }
    }
    if(watchedHistory&&msg.params?.name===watchTool.name){
      const args=msg.params.arguments
      if(!watchArgs(args,config.globalActiveList===true))return error(r,id,-32602,'Invalid params')
      const sessionId=config.globalActiveList?args.session_id:selections.find(row=>row.label===args.session_label)?.id
      if(!sessionId||closed||watchInFlight)return error(r,id,-32000,'Watched session unavailable')
      watchInFlight=true
      try {
        const value=await watchedHistory({selectedSession:sessionId,after:args.after??null})
        if(closed)return error(r,id,-32000,'Watched session unavailable')
        const result=watchResult(value)
        if(!result)return error(r,id,-32000,'Watched session unavailable')
        return respond({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
      } catch {
        return error(r,id,-32000,'Watched session unavailable')
      } finally { watchInFlight=false }
    }
    if(activeList&&msg.params?.name===activeTool.name){
      const args=msg.params.arguments??{}
      if(!activeArgs(args))return error(r,id,-32602,'Invalid params')
      if(closed||activeInFlight)return error(r,id,-32000,'Active session snapshot unavailable')
      activeInFlight=true
      try{
        const page=args.cursor===undefined?await activeList.begin():await activeList.page(args.cursor)
        if(closed)return
        if(page?.version!==2||page.kind!=='active_sessions'||!Array.isArray(page.rows)||page.rows.length>100||
           page.rows.some(x=>!/^s2_[0-9a-f]{64}$/.test(x?.alias))||
           (page.next_cursor!==null&&(typeof page.next_cursor!=='string'||!(/^[0-9a-f.-]{1,165}$/.test(page.next_cursor))))||
           (page.captured_at!==null&&(typeof page.captured_at!=='string'||!Number.isFinite(Date.parse(page.captured_at))))||
           !['partial','approved_live_capture'].includes(page.coverage)||
           ![null,'busy','no_snapshot','live_inventory_unavailable','scope_changed','snapshot_superseded','host_restarted'].includes(page.gap))
          return error(r,id,-32000,'Active session snapshot unavailable')
        const result={version:2,kind:'active_sessions',coverage:page.coverage,gap:page.gap,
          captured_at:page.captured_at,next_cursor:page.next_cursor,rows:page.rows.map(x=>({alias:x.alias}))}
        return respond({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
      }catch(e){
        return error(r,id,e instanceof TypeError&&e.message==='invalid_scoped_observation_v2'?-32602:-32000,'Active session snapshot unavailable')
      }finally{activeInFlight=false}
    }
    if (msg.params?.name !== tool.name || !emptyArgs(msg.params.arguments ?? {})) return error(r,id,-32602,'Invalid params')
    if (closed || inFlight) return error(r,id,-32000,'Session observation unavailable')
    inFlight = true
    try {
      const sessions = []
      for (const {id:sessionId,label} of selections) {
        const signal = AbortSignal.any([lifecycle.signal,AbortSignal.timeout(350)])
        const value = await readState(sessionController,sessionId,signal)
        if (!value || typeof value.active !== 'boolean' || typeof value.running !== 'boolean' ||
            !Number.isSafeInteger(value.cursor) || value.cursor < -1 ||
            !Array.isArray(value.pendingInput) || value.pendingInput.some(x=>!PENDING.has(x)))
          sessions.push({label,status:'unavailable'})
        else sessions.push({label,status:value.running?'running':value.active?'idle':'inactive',
          cursor:value.cursor,pending:[...new Set(value.pendingInput)],last_completion:completions.get(sessionId)??null})
      }
      const result = {schema_version:1,observed_at:time(),sessions}
      return respond({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
    } finally { inFlight = false }
  }
  server.listen(config.port, LOOPBACK)
  try { await once(server,'listening') } catch(error) { server.close(); throw error }
  let dispose
  try {
    dispose = observeTurnEnds?.(onSessionEvent)
    terminal = await startStationTerminalEvents(terminalEvents && {ctx:terminalEvents.ctx,
      options:{...eventOptions,endpointBinding:credential.toString('hex')}})
    approval = await approvalEvents?.()
    ready = true
  } catch (e) {
    try { dispose?.() } catch {}
    await terminal?.close().catch(()=>{})
    await approval?.close().catch(()=>{})
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
    throw e
  }
  return { async close() {
    if (closed) return
    closed = true; lifecycle.abort(); completions.clear()
    try { dispose?.() } catch { /* Listener lives only with the Host. */ }
    await new Promise(resolve=>{server.close(resolve); server.closeAllConnections()})
    try { await terminal?.close() } finally { await approval?.close() }
  } }
}

function readState(controller,sessionId,signal) {
  return new Promise(resolve => {
    const finish=value=>{signal.removeEventListener('abort',aborted);resolve(value)}
    const aborted=()=>finish(null)
    if (signal.aborted) return aborted()
    signal.addEventListener('abort',aborted,{once:true})
    Promise.resolve().then(()=>controller.state({sessionId},signal)).then(finish,aborted)
  })
}
