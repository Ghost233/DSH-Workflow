import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EventEmitter} from 'node:events'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setImmediate as tick,setTimeout as delay} from 'node:timers/promises'
import {createDshDotTunnelLifecycle,verifyDotMcpReady} from './dsh-dot-tunnel-lifecycle.mjs'
import {serveWebHost} from './web-host.mjs'

const endpoint='http://127.0.0.1:43123/mcp'
const authorization='Bearer '+'a'.repeat(43)
const exactTools=['read_synthetic_pilot','list_active_sessions'].map(name=>({name,annotations:{readOnlyHint:true}}))
const rpc=(id,value)=>new Response(JSON.stringify({jsonrpc:'2.0',id,result:{resultType:'complete',...value}}),
  {headers:{'content-type':'application/json'}})
const expectedDiscover={supportedVersions:['2026-07-28'],capabilities:{tools:{},events:{}}}
const config={endpoint,authorization}

test('discovery requires exact authenticated bound MCP and two readonly tool names', async()=>{
  const observed=[]
  const request=async(url,options)=>{
    const {id,method}=JSON.parse(options.body)
    observed.push({method,url:url.href,redirect:options.redirect})
    assert.equal(options.headers.authorization,authorization)
    assert.equal(options.headers['mcp-method'],method)
    assert.equal(options.headers['mcp-protocol-version'],'2026-07-28')
    return id===1?rpc(id,expectedDiscover):rpc(id,{tools:exactTools})
  }
  assert.equal(await verifyDotMcpReady({...config,request}),true)
  assert.deepEqual(observed.map(row=>row.method),['server/discover','tools/list'])
  assert.ok(observed.every(row=>row.url===endpoint&&row.redirect==='error'))
  const disallowed=['https://127.0.0.1:43123/mcp','http://localhost:43123/mcp',
    'http://127.0.0.1:43123/mcp?x=1','http://user@127.0.0.1:43123/mcp','http://127.0.0.1:43123/']
  for(const value of disallowed)
    assert.equal(await verifyDotMcpReady({endpoint:value,authorization,request:()=>{throw Error('unexpected')}}),false)
  assert.equal(await verifyDotMcpReady({...config,request:()=>new Response('{}',{status:401})}),false)
  assert.equal(await verifyDotMcpReady({...config,request:()=>rpc(1,{...expectedDiscover,supportedVersions:'2026-07-28'})}),false)
  assert.equal(await verifyDotMcpReady({...config,request:(_,o)=>JSON.parse(o.body).id===1
    ?rpc(1,expectedDiscover):rpc(2,{tools:[...exactTools,{name:'writer'}]})}),false)
})

test('single owned child persists across native reconnect; no supervisor relaunch after close',async()=>{
  const events=[]
  const gone=Promise.withResolvers()
  let count=0,stops=0
  const life=createDshDotTunnelLifecycle({enabled:true,resolveMcp:()=>config,verify:()=>true,
    launchOwned:arg=>{
      assert.deepEqual(arg,{endpoint}) // No bearer handed to process factory.
      count++
      return {closed:gone.promise,stop(){stops++;gone.resolve()}}
    },publish:r=>events.push(r)})
  await Promise.all([life.start(),life.start(),life.start()])
  assert.equal(count,1)
  // Only the injected client owns transient reconnection; host receives no
  // reconnect event and never allocates a second child.
  await life.start()
  assert.equal(count,1)
  gone.resolve()
  await tick()
  await life.start()
  assert.equal(count,1)
  await life.stop()
  assert.equal(stops,0)
  assert.deepEqual(events,['child_started','child_exited','stopped'])
})

test('disabled, failed proof, and shutdown before a stalled proof allocate no child',async()=>{
  assert.equal(createDshDotTunnelLifecycle({}),null)
  assert.equal(createDshDotTunnelLifecycle({enabled:false,launchOwned:()=>{throw Error('unexpected')}}),null)
  let spawns=0
  const launchOwned=()=>{spawns++}
  const failed=createDshDotTunnelLifecycle({enabled:true,resolveMcp:()=>config,verify:()=>false,launchOwned})
  await failed.start()
  await failed.stop()
  const stalled=Promise.withResolvers()
  const loading=createDshDotTunnelLifecycle({enabled:true,resolveMcp:()=>config,verify:()=>stalled.promise,launchOwned})
  const pending=loading.start()
  await tick()
  await loading.stop()
  stalled.resolve(true)
  await pending
  assert.equal(spawns,0)
})

test('deadline cuts off an unavailable readiness adapter without spawning',async()=>{
  const ready=Promise.withResolvers(), statuses=[]
  let spawned=0
  const life=createDshDotTunnelLifecycle({enabled:true,resolveMcp:()=>ready.promise,
    launchOwned(){spawned++},probeDeadlineMs:5,publish:s=>statuses.push(s)})
  await Promise.all([life.start(),delay(15)])
  ready.resolve(config)
  await life.start()
  assert.equal(spawned,0)
  assert.deepEqual(statuses,['unavailable'])
  await life.stop()
})

test('actual backend serve entry owns teardown; window visibility/recycle does not',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-dot-life-test-'))
  const steps=[]
  const ipc=Object.assign(new EventEmitter(),{connected:true,
    send(value,done){steps.push(value.type);done()},
    disconnect(){ipc.connected=false;ipc.emit('disconnect')}})
  let exit,done=new Promise(r=>{exit=r})
  const verified=Promise.withResolvers()
  const child=Promise.withResolvers()
  const launched=Promise.withResolvers()
  try{
    const host=await serveWebHost({resources:'/fixture',profile:'/fixture',receiptDirectory:dir,
      launchHost:async()=>({ctx:{on(){}},shutdown:{async shutdown(){steps.push('backend-stop')}}}),
      readHost:async()=>({pid:process.pid,url:'http://127.0.0.1:43123/fixture'}),
      ipc,exit,
      dotTunnel:{enabled:true,resolveMcp:()=>config,
        verify:async()=>{steps.push('proof');return verified.promise},
        launchOwned(){
          steps.push('child');launched.resolve()
          return {closed:child.promise,async stop(){steps.push('child-stop');child.resolve()}}
        }}})
    assert.ok(steps.includes('ready'),'main DSH readiness is independent')
    assert.ok(!steps.includes('child'))
    verified.resolve(true)
    await launched.promise
    ipc.emit('message',{type:'window-hidden'})
    ipc.emit('message',{type:'recycle-web'})
    await tick()
    assert.ok(!steps.includes('child-stop'))
    ipc.emit('message',{type:'shutdown'})
    await Promise.all([done,host.stop(),host.stop()])
    assert.ok(steps.indexOf('proof')<steps.indexOf('child'))
    assert.ok(steps.indexOf('child-stop')<steps.indexOf('backend-stop'))
    assert.equal(steps.filter(x=>x==='child-stop').length,1)
    assert.equal(steps.filter(x=>x==='shutdown-complete').length,1)
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('only transient authenticated startup probe failure backs off on same receipt',async()=>{
  const steps=[]
  let probes=0,resolves=0,starts=0
  const stopped=Promise.withResolvers()
  const life=createDshDotTunnelLifecycle({enabled:true,resolveMcp(){resolves++;return config},
    verify({endpoint:seen,authorization:auth,reportTransient}){
      assert.equal(seen,endpoint)
      assert.equal(auth,authorization)
      assert.equal(reportTransient,true)
      return ++probes===1?'temporary':true
    },launchOwned(){starts++;return {closed:stopped.promise,stop(){stopped.resolve()}}},
    publish:kind=>steps.push(kind)})
  await Promise.all([life.start(),life.start()])
  assert.deepEqual([resolves,probes,starts],[1,2,1])
  assert.deepEqual(steps,['mcp_startup_retry','child_started'])
  await life.stop()
})
test('backend shutdown cancels backoff without reopening receipt or spawning',async()=>{
  const inBackoff=Promise.withResolvers()
  let probes=0
  const life=createDshDotTunnelLifecycle({enabled:true,resolveMcp:()=>config,
    verify(){probes++;return 'temporary'},launchOwned(){assert.fail('must not spawn')},
    publish:kind=>{if(kind==='mcp_startup_retry')inBackoff.resolve()}})
  const start=life.start()
  await inBackoff.promise
  await life.stop()
  await start
  assert.equal(probes,1)
})
test('readiness classifies transient transport, not rejected credentials or malformed metadata',async()=>{
  const request=status=>()=>new Response('{}',{status,headers:{'content-type':'text/plain'}})
  const verify=(status,reportTransient)=>verifyDotMcpReady({...config,request:request(status),reportTransient})
  assert.equal(await verify(503,true),'temporary')
  for(const status of [401,403,429,200])assert.equal(await verify(status,true),false)
  assert.equal(await verify(503,false),false)
})
