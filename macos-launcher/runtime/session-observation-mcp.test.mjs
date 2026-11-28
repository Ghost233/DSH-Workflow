import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { EventEmitter, once } from 'node:events'
import { mkdtemp, realpath, rm, chmod, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStationPullTools } from './station-dot-pull-tools.mjs'
import { loadObservationConfig, startSessionObservation } from './session-observation-mcp.mjs'
import { APPROVAL_PENDING, startStationApprovalEvents } from './station-dot-approval-events.mjs'
import { INTERACTION_PENDING, combineStationInteractionEvents, startStationQuestionEvents } from './station-dot-question-events.mjs'
import { serveWebHost } from './web-host.mjs'

async function config() {
  const net = createServer().listen(0, '127.0.0.1')
  await once(net,'listening')
  const { port } = net.address()
  await new Promise(resolve=>net.close(resolve))
  return {port,bearer:'a'.repeat(43),sessions:[{id:'private-session-1',label:'Configured test'}]}
}

async function fixture(t, state, observeTurnEnds) {
  const c=await config()
  const srv=await startSessionObservation({ config:c,sessionController:{state}, observeTurnEnds })
  t.after(()=>srv.close())
  const root='http://127.0.0.1:'+c.port
  const headers={authorization:'Bearer '+c.bearer,'content-type':'application/json',accept:'application/json, text/event-stream'}
  const send=(body, override={})=>fetch(root+'/mcp',{method:'POST',headers,body:JSON.stringify(body),...override})
  const rpc=(method,params)=>send({jsonrpc:'2.0',id:1,method,params}).then(x=>x.json())
  return {c,srv,root,headers,send,rpc}
}

test('only authenticated tools use configured scope; no raw status or payload disclosure',async t=>{
 const calls=[]
 const f=await fixture(t, (request)=>{
  calls.push(request)
  return {running:true,active:true,cursor:42,pendingInput:['approval','question','approval'],
   queue:[{content:['PRIVATE_TOKEN_OR_PATH']}], privateId:'never'}
 })
 assert.equal((await f.send({}, {headers:{...f.headers,authorization:'Bearer incorrect'}})).status,401)
 assert.equal((await f.send({}, {headers:{...f.headers,origin:'http://evil.example'}})).status,404)
 assert.equal((await fetch(f.root+'/mcp?unsafe=1',{headers:f.headers})).status,404)
 const init=(await f.rpc('initialize',{protocolVersion:'2025-06-18'})).result
 assert.equal(init.protocolVersion,'2025-06-18')
 assert.deepEqual(init.capabilities,{tools:{}})
 for(const method of ['events/list','events/subscribe','events/unsubscribe'])
  assert.equal((await f.rpc(method)).error.code,-32601)
 assert.equal((await f.send({jsonrpc:'2.0',method:'notifications/initialized'})).status,202)
 assert.deepEqual((await f.rpc('tools/list',{})).result.tools.map(x=>x.name),['session_status'])
 assert.equal((await f.rpc('tools/call',{name:'session_status',arguments:{id:'another'}})).error.code,-32602)
 assert.equal((await f.rpc('tools/call',{name:'approve',arguments:{}})).error.code,-32602)
 assert.equal(calls.length,0)
 const r=(await f.rpc('tools/call',{name:'session_status',arguments:{}})).result
 assert.deepEqual(r.structuredContent.sessions,[{label:'Configured test',status:'running',cursor:42,pending:['approval','question'],last_completion:null}])
 assert.equal(calls.length,1)
 assert.deepEqual(calls[0],{sessionId:'private-session-1'})
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_TOKEN|private-session|never/)
 await f.srv.close()
 await assert.rejects(()=>f.rpc('ping'))
})

test('missing or stalled Host is unavailable, never idle or zero', async t=>{
 const f=await fixture(t,()=>new Promise(()=>{}))
 const r=(await f.rpc('tools/call',{name:'session_status',arguments:{}})).result.structuredContent
 assert.deepEqual(r.sessions,[{label:'Configured test',status:'unavailable'}])
})

test('credential file must be owner-only regular file and valid schema', async t=>{
 const dir=await mkdtemp(join(tmpdir(),'observation-mcp-'))
 t.after(()=>rm(dir,{recursive:true,force:true}))
 const p=join(dir,'config')
 assert.equal(await loadObservationConfig(p),null)
 const c=await config(); await writeFile(p,JSON.stringify(c),{mode:0o600})
 assert.deepEqual(await loadObservationConfig(p),c)
 await symlink(p,join(dir,'link'))
 await assert.rejects(()=>loadObservationConfig(join(dir,'link')))
 await chmod(p,0o644)
 await assert.rejects(()=>loadObservationConfig(p),/observation_config_invalid/)
})


test("only new terminal Host events for allowlisted sessions contribute completion status", async t=>{
 let hook, disposed=false
 const f=await fixture(t,()=>({running:false,active:true,cursor:20,pendingInput:[]}), receive=>{
   hook=receive; return ()=>{disposed=true}
 })
 const snapshot=async()=> (await f.rpc("tools/call",{name:"session_status"})).result.structuredContent.sessions[0]
 const id="private-session-1"
 const emit=(who,type,turn,kind,time=17)=>hook({id:who},{type,time,data:{turn,reason:{kind,detail:"PRIVATE_CAUSE"}}})
 assert.equal((await snapshot()).last_completion,null)
 emit(id,"agent/error",2,"error"); emit("other","turn/end",2,"error")
 assert.equal((await snapshot()).last_completion,null)
 emit(id,"turn/end",3,"error")
 assert.deepEqual((await snapshot()).last_completion,{turn:3,outcome:"error",ended_at:"1970-01-01T00:00:00.017Z"})
 emit(id,"turn/end",2,"completed")
 assert.equal((await snapshot()).last_completion.outcome,"error")
 emit(id,"turn/end",4,"aborted")
 assert.equal((await snapshot()).last_completion.outcome,"aborted")
 emit(id,"turn/end",5,"plugin/private-detail")
 assert.equal((await snapshot()).last_completion.outcome,"other")
 emit(id,"turn/end",6,"completed")
 const result=await snapshot()
 assert.equal(result.last_completion.outcome,"completed")
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|plugin|private-session/)
 await f.srv.close()
 assert.equal(disposed,true)
})

test('paired global watch accepts one native ID without selections and forwards no content',async t=>{
 const c={...await config(),sessions:[],globalActiveList:true}
 const calls=[]
 const sessionController={state:()=>null,events:async ({address})=>{
  calls.push(address.sessionId)
  if(address.sessionId!=='unlisted-test-session')throw Error('unknown')
  return {cursor:0,hasMore:false,records:[{type:'event',event:{seq:0,time:1,type:'turn/end',data:{text:'PRIVATE_BODY'}}}]}
 }}
 const srv=await startSessionObservation({config:c,sessionController,...createStationPullTools({sessionController},c)})
 t.after(()=>srv.close())
 const rpc=(method,params,auth=true)=>fetch('http://127.0.0.1:'+c.port+'/mcp',{
  method:'POST',headers:{authorization:'Bearer '+(auth?c.bearer:'invalid'),'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
 }).then(r=>r.json())
 const call=(args,auth)=>rpc('tools/call',{name:'watch_session',arguments:args},auth)
 assert.deepEqual(await call({session_id:'unlisted-test-session'},false),{error:'authentication_required'})
 const tool=(await rpc('tools/list',{})).result.tools.find(x=>x.name==='watch_session')
 assert.deepEqual(tool.inputSchema.required,['session_id'])
 assert.equal((await call({session_id:['unlisted-test-session']})).error.code,-32602)
 assert.equal((await call({session_id:'unlisted-test-session',session_label:'legacy'})).error.code,-32602)
 assert.deepEqual(calls,[])
 assert.equal((await call({session_id:'unlisted-test-session'})).result.structuredContent.status,'baseline_only')
 const delta=(await call({session_id:'unlisted-test-session',after:-1})).result.structuredContent
 assert.deepEqual(delta.events,[{seq:0,time:1,kind:'turn/end'}])
 assert.doesNotMatch(JSON.stringify(delta),/PRIVATE_BODY|unlisted-test-session/)
 assert.equal((await call({session_id:'unknown-session'})).result.structuredContent.status,'source_unavailable')
 assert.deepEqual(calls,['unlisted-test-session','unlisted-test-session','unknown-session'])
})


test('both HTTP protocol versions discover and route approval and interaction subscriptions independently',async t=>{
 const c=await config(),callback='https://example.com/hooks/dot'
 const ctx={on(){return ()=>{}},typertGateway:{getPendingRemoteEvents:()=>[]}}
 const transport=async({body})=>({status:200,json:{challenge:JSON.parse(body).challenge}})
 const approval=startStationApprovalEvents({ctx,key:Buffer.alloc(32,5),principal:'owner',callback,transport})
 const question=startStationQuestionEvents({
  ctx,key:Buffer.alloc(32,6),principal:'owner',callback,transport,
 })
 const srv=await startSessionObservation({config:c,sessionController:{state:()=>null},
  approvalEvents:()=>combineStationInteractionEvents(approval,question)})
 t.after(()=>srv.close())
 const legacy='2025-06-18',modern='2026-07-28'
 const request=(version,method,params={},headerName)=>fetch('http://127.0.0.1:'+c.port+'/mcp',{
  method:'POST',headers:{authorization:'Bearer '+c.bearer,'content-type':'application/json',
   accept:'application/json, text/event-stream','mcp-protocol-version':version,
   ...(version===modern?{'mcp-method':method,...(headerName?{'mcp-name':headerName}:{})}:{})},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
 })
 const rpc=async(...args)=>(await request(...args)).json()
 assert.deepEqual((await rpc(modern,'server/discover')).result.capabilities,{tools:{},events:{}})
 assert.deepEqual((await rpc(legacy,'initialize',{protocolVersion:legacy})).result.capabilities,{tools:{},events:{}})
 for(const version of [legacy,modern]){
  const events=(await rpc(version,'events/list')).result.events
  assert.deepEqual(events.map(e=>e.name),[APPROVAL_PENDING,INTERACTION_PENDING])
  assert.equal(events[0].payloadSchema.properties.kind.const,'approval')
  assert.deepEqual(events[1].payloadSchema.properties.kind.enum,['question','plan_review','access_approval'])
 }
 assert.equal((await request(modern,'events/subscribe',{name:INTERACTION_PENDING},APPROVAL_PENDING)).status,400)
 assert.equal((await rpc(legacy,'events/list',{extra:true})).error.code,-32602)
 const secret='whsec_'+Buffer.alloc(32,9).toString('base64')
 const subscribe=name=>({name,arguments:{},delivery:{mode:'webhook',url:callback,secret}})
 const oldSub=(await rpc(legacy,'events/subscribe',subscribe(APPROVAL_PENDING))).result
 const newSub=(await rpc(modern,'events/subscribe',{
  ...subscribe(INTERACTION_PENDING),_meta:{'io.modelcontextprotocol/protocolVersion':modern},
 },INTERACTION_PENDING)).result
 assert.match(oldSub.id,/^sub_/)
 assert.match(newSub.id,/^sub_/)
 assert.notEqual(oldSub.id,newSub.id)
 const stop={name:INTERACTION_PENDING,arguments:{},delivery:{mode:'webhook',url:callback}}
 assert.deepEqual((await rpc(legacy,'events/unsubscribe',stop)).result,{})
 assert.equal((await rpc(modern,'events/subscribe',subscribe(APPROVAL_PENDING),APPROVAL_PENDING)).result.id,oldSub.id)
})

test('the Web Host reads an existing global pairing and exposes both events without a tunnel',async t=>{
 const c={...(await config()),globalActiveList:true,sessions:[]}
 const receiptDirectory=await realpath(await mkdtemp(join(tmpdir(),'station-paired-web-')))
 let host
 t.after(async()=>{try{await host?.stop()}finally{await rm(receiptDirectory,{recursive:true,force:true})}})
 await writeFile(join(receiptDirectory,'station-dot-pairing.json'),JSON.stringify({
  observation:c,
  transport:{directory:receiptDirectory,tunnelId:'tunnel_'+'a'.repeat(32),clientSha256:'a'.repeat(64)},
 }),{mode:0o600})
 await writeFile(join(receiptDirectory,'station-dot-tunnel-preference.json'),'{"enabled":false}',{mode:0o600})
 const listeners=new Set()
 const ctx={
  on(name){listeners.add(name);return ()=>listeners.delete(name)},
  sessionController:{state:()=>null},
  typertGateway:{getPendingRemoteEvents:()=>[]},
 }
 host=await serveWebHost({
  receiptDirectory,
  launchHost:async()=>({ctx,shutdown:{shutdown:async()=>{}}}),
  readHost:async()=>({pid:process.pid,url:'http://127.0.0.1'}),
  ipc:new EventEmitter(),
 })
 const response=await fetch('http://127.0.0.1:'+c.port+'/mcp',{
  method:'POST',headers:{authorization:'Bearer '+c.bearer,'content-type':'application/json',
   accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':'events/list'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'events/list'}),
 })
 assert.equal(response.status,200)
 assert.deepEqual((await response.json()).result.events.map(event=>event.name),[APPROVAL_PENDING,INTERACTION_PENDING])
 assert.equal(listeners.has('session/event'),true)
 assert.equal(listeners.has('user-questions/request'),true)
 await host.stop()
 assert.equal(listeners.has('user-questions/request'),false)
})

test('legacy scoped watch keeps its configured-label error and never reads an unknown session',async t=>{
 const c=await config(),calls=[]
 const sessionController={state:()=>null,events:async ({address})=>{
  calls.push(address.sessionId)
  return {cursor:-1,hasMore:false,records:[]}
 }}
 const srv=await startSessionObservation({config:c,sessionController,...createStationPullTools({sessionController},c)})
 t.after(()=>srv.close())
 const call=async session_label=>(await(await fetch('http://127.0.0.1:'+c.port+'/mcp',{
  method:'POST',headers:{authorization:'Bearer '+c.bearer,'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'watch_session',arguments:{session_label}}})
 })).json())
 assert.equal((await call('Missing')).error.code,-32000)
 assert.deepEqual(calls,[])
 assert.equal((await call('Configured test')).result.structuredContent.status,'baseline_only')
 assert.deepEqual(calls,['private-session-1'])
})

test('paired active-list aliases resolve for cursor history without exposing native IDs',async t=>{
 const c={...(await config()),sessions:[],globalActiveList:true}
 const id='hidden-native-session'
 let handles=[{id}]
 const calls=[]
 const sessionController={state:()=>null,events:async({address})=>{
  calls.push(address.sessionId)
  return {cursor:0,hasMore:false,records:[{type:'event',event:{seq:0,time:1,type:'turn/end',data:{text:'PRIVATE_BODY'}}}]}
 }}
 const srv=await startSessionObservation({config:c,sessionController,...createStationPullTools({agents:{list:()=>handles},sessionController},c)})
 t.after(()=>srv.close())
 const call=async(name,args={})=>(await(await fetch('http://127.0.0.1:'+c.port+'/mcp',{
  method:'POST',headers:{authorization:'Bearer '+c.bearer,'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})
 })).json()).result.structuredContent
 const page=await call('list_active_sessions')
 const alias=page.rows[0].alias
 assert.match(alias,/^s2_[a-f0-9]{64}$/)
 assert.doesNotMatch(JSON.stringify(page),/hidden-native-session/)
 assert.equal((await call('watch_session',{session_id:alias})).status,'baseline_only')
 handles=[]
 assert.deepEqual((await call('list_active_sessions')).rows,[])
 const delta=await call('watch_session',{session_id:alias,after:-1})
 assert.deepEqual(delta.events,[{seq:0,time:1,kind:'turn/end'}])
 assert.doesNotMatch(JSON.stringify(delta),/PRIVATE_BODY|hidden-native-session/)
 assert.equal((await call('watch_session',{session_id:'s2_'+'0'.repeat(64)})).status,'source_unavailable')
 assert.deepEqual(calls,[id,id])
})
