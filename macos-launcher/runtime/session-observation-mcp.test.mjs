import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm, chmod, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStationPullTools } from './station-dot-pull-tools.mjs'
import { loadObservationConfig, startSessionObservation } from './session-observation-mcp.mjs'

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
