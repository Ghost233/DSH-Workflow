import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash, randomUUID} from 'node:crypto'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as sleep} from 'node:timers/promises'
import {startSessionObservation} from './session-observation-mcp.mjs'
import {APPROVAL_PENDING,startPairedStationApprovalEvents,startStationApprovalEvents} from './station-dot-approval-events.mjs'
import {INTERACTION_PENDING} from './station-dot-question-events.mjs'
import {signStationWebhook} from './station-dot-mcp-events.mjs'
import {openStationSubscriptionStore} from './station-dot-subscription-store.mjs'

test('paired MCP advertises approvals in both protocol versions and delivers only live, redacted approvals',async t=>{
  const listener= createServer().listen(0,'127.0.0.1')
  await once(listener,'listening')
  const {port}=listener.address()
  await new Promise(resolve=>listener.close(resolve))
  const bearer='A'.repeat(43), secret=Buffer.alloc(32,12)
  const callback='https://callback.xyz/mcp-events/recipient'
  const versions=['2025-06-18','2026-07-28']
  let native, pending=[], detached=false
  const bodies=[], reports=[]
  const ctx={on(event,fn){assert.equal(event,'session/event');native=fn;return ()=>{detached=true}},
    typertGateway:{getPendingRemoteEvents:()=>pending}}
  const srv=await startSessionObservation({config:{bearer,port,globalActiveList:true,sessions:[]},
    sessionController:{state:()=>null},
    approvalEvents:()=>startStationApprovalEvents({ctx,key:Buffer.alloc(32,7),principal:'owner',callback,tickMs:5,
      report:(...args)=>reports.push(args),
      transport:async ({url,headers,body})=>{
        assert.equal(url,callback)
        assert.equal(headers['webhook-signature'],signStationWebhook(secret,headers['webhook-id'],headers['webhook-timestamp'],body))
        const value=JSON.parse(body)
        if(value.type==='verification')return {status:200,json:{challenge:value.challenge}}
        bodies.push(value)
        return {status:204}
      }})})
  t.after(()=>srv.close())
  function call(v,method,params={},auth=true){
    const modern=v===versions[1]
    const headers={Authorization:'Bearer '+(auth?bearer:'invalid'),'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':v,
      ...(modern?{'MCP-Method':method,...(params.name?{'MCP-Name':params.name}:{})}:{})}
    return fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers,
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json())
  }
  const [legacy,modern]=versions
  assert.deepEqual((await call(legacy,'initialize',{protocolVersion:legacy})).result.capabilities,{tools:{},events:{}})
  assert.deepEqual((await call(modern,'server/discover')).result.capabilities,{tools:{},events:{}})
  for (const version of versions) assert.equal((await call(version,'events/list')).result.events[0].name,APPROVAL_PENDING)
  assert.equal((await call(modern,'events/list',{},false)).error,'authentication_required')
  const subscribe={name:APPROVAL_PENDING,arguments:{},delivery:{mode:'webhook',url:callback,secret:'whsec_'+secret.toString('base64')}}
  assert.equal((await call(modern,'events/subscribe',{...subscribe,delivery:{...subscribe.delivery,url:'https://evil.xyz/'}})).error.code,-32602)
  assert.match((await call(modern,'events/subscribe',subscribe)).result.id,/^sub_/)
  function audit(type,session,id){native({id:session},{type,data:{id,reason:'PRIVATE_TEXT',toolName:'PRIVATE_TOOL'}})}
  const cancelled=randomUUID(), valid=randomUUID()
  audit('approval/asked','fast',cancelled)
  audit('approval/decided','fast',cancelled)
  audit('approval/asked','real-session',valid)
  pending=[{event:'user-questions/request',agentId:'real-session'},{event:'approval/request',agentId:'another-session'}]
  await sleep(25)
  assert.equal(bodies.length,0)
  assert.equal(reports.filter(([state])=>state==='awaiting_pending_match').length,1)
  pending=[{event:'approval/request',agentId:'real-session'}]
  for(let i=0;i<50&&!bodies.length;i++)await sleep(5)
  assert.equal(bodies.length,1)
  assert.equal(bodies[0].name,APPROVAL_PENDING)
  assert.equal(bodies[0].data.kind,'approval')
  assert.match(bodies[0].data.session,/^s_[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(bodies),/PRIVATE|real-session/)
  for(let i=0;i<50&&!reports.some(([state])=>state==='delivered');i++)await sleep(5)
  assert.deepEqual(reports.slice(-4),[
    ['pending_matched',undefined],['delivery_started',undefined],['delivery_http',204],['delivered',undefined],
  ])
  assert.equal(reports.filter(([state])=>state==='approval_captured').length,2)
  assert.doesNotMatch(JSON.stringify(reports),/PRIVATE|real-session|callback|evt_|s_[a-f0-9]{64}/)
  const {secret:unused,...noSecret}=subscribe.delivery
  assert.equal((await call(legacy,'events/unsubscribe',{...subscribe,delivery:noSecret})).result.constructor,Object)
  audit('approval/asked','real-session',randomUUID())
  await sleep(25)
  assert.equal(bodies.length,1)
  await srv.close()
  assert.equal(detached,true)
})

test('official enrollment accepts a verified subscriber-selected callback, preserves the bound receipt, and blocks private DNS', async()=>{
  const {isOfficialStationCallback,createOfficialStationHttpsDelivery}=await import('./station-dot-https-delivery.mjs')
  const {createStationMcpEvents}=await import('./station-dot-mcp-events.mjs')
  const target='https://connectors.api.openai.com/webhook/mcp-events/fixture'
  const other='https://connectors.api.openai.com/webhook/mcp-events/another'
  const wrong='https://connectors.api.openai.com.example.net/webhook/mcp-events/fixture'
  assert.equal(isOfficialStationCallback(target),true)
  assert.equal(isOfficialStationCallback(wrong),false)
  assert.equal(isOfficialStationCallback(target+'?unsafe=1'),false)
  assert.equal(isOfficialStationCallback(target.replace('/fixture','/../fixture')),false)
  const transport=createOfficialStationHttpsDelivery({resolve:async()=>[{address:'192.168.0.1',family:4}]})
  await assert.rejects(()=>transport({url:target,method:'POST',redirect:'error'}),/station_callback_address_rejected/)
  const receipt={data:null,read(){return this.data},write(v){this.data=v}}
  const secret='whsec_'+Buffer.alloc(32,11).toString('base64')
  let now=100000, posts=0
  const make=()=>createStationMcpEvents({enabled:true,identityKey:Buffer.alloc(32,3),
    receipt,receiptPrincipal:'owner',allows:x=>x==='owner',acceptCallback:isOfficialStationCallback,
    verifyTimeoutMs:10000,now:()=>now,transport:async input=>{
      assert.equal(input.url,target)
      posts++
      const value=JSON.parse(input.body)
      if(value.type!=='verification')return {status:204}
      now+=3800
      return {status:200,json:{challenge:value.challenge}}
    }})
  const invoke=(m,method,url,sign=true)=>m.rpc('owner',{jsonrpc:'2.0',id:1,method,
    params:{name:'station.turn.ended',arguments:{},delivery:{mode:'webhook',url,...(sign?{secret}:{})}}})
  const events=make()
  assert.equal((await invoke(events,'events/subscribe',wrong)).error.code,-32602)
  assert.match((await invoke(events,'events/subscribe',target)).result.id,/^sub_/)
  assert.equal((await invoke(events,'events/subscribe',other)).error.code,-32000)
  assert.deepEqual((await invoke(events,'events/unsubscribe',other,false)).result,{})
  assert.equal(posts,1)
  assert.equal(receipt.data.callback,target)
  const restored=make()
  assert.equal(restored.hasSubscriber('owner'),true)
  assert.equal((await restored.deliverDurable('owner',{eventId:'test'})).status,204)
  assert.equal(posts,2)
})

async function pairedFixture(t){
  const directory=await realpath(await mkdtemp(join(tmpdir(),'station-dot-events-')))
  const bearer='p'.repeat(43), reports=[]
  const ctx={on(){return ()=>{}},typertGateway:{getPendingRemoteEvents:()=>[]}}
  let events
  t.after(async()=>{try{await events?.close()}finally{await rm(directory,{recursive:true,force:true})}})
  return {directory,bearer,reports,async start(){
    events=await startPairedStationApprovalEvents({ctx,directory,bearer,report:state=>reports.push(state)})
    return events
  }}
}

test('legacy pinned approval receipt is restored when the interaction receipt has a different receiver binding',async t=>{
  const fixture=await pairedFixture(t)
  const receiver={url:'https://callback.xyz/mcp-events/recipient',address:'8.8.8.8'}
  const receiverFile=join(fixture.directory,'station-dot-approval-receiver.json')
  await writeFile(receiverFile,JSON.stringify(receiver),{mode:0o600})
  const now=Date.now()
  const lease={signingKey:'whsec_'+Buffer.alloc(32,7).toString('base64'),until:now+60000,verifiedAt:now}
  const principal='paired-owner'
  const stores={}
  for(const [name,address] of [['approval',receiver.address],['question','1.1.1.1']]){
    const key=createHash('sha256').update('station-dot-'+name+'\0').update(fixture.bearer).digest()
    const scope='station-dot-'+name+'-'+key.toString('hex').slice(0,24)
    const directory=join(fixture.directory,scope)
    await mkdir(directory,{mode:0o700})
    const options={directory,key,binding:[scope,principal,receiver.url,address]}
    const receipt=openStationSubscriptionStore(options)
    try{receipt.write(lease)}finally{receipt.close()}
    stores[name]=options
  }
  const events=await fixture.start()
  const call=(method,params)=>events.rpc({jsonrpc:'2.0',id:1,method,params})
  assert.deepEqual((await call('events/list')).result.events.map(event=>event.name),[APPROVAL_PENDING])
  assert.deepEqual(fixture.reports,['interaction_source_unavailable'])
  const unsubscribe={name:APPROVAL_PENDING,arguments:{},delivery:{mode:'webhook',url:receiver.url}}
  assert.equal((await call('events/unsubscribe',{...unsubscribe,delivery:{mode:'webhook',url:'https://other.example.com/'}})).error.code,-32602)
  assert.deepEqual((await call('events/unsubscribe',unsubscribe)).result,{})
  await events.close()
  const restored=openStationSubscriptionStore(stores.approval)
  try{assert.equal(restored.read(),null)}finally{restored.close()}
  assert.deepEqual(JSON.parse(await readFile(receiverFile,'utf8')),receiver)
})

test('an unavailable legacy subscription store does not disable the interaction event',async t=>{
  const fixture=await pairedFixture(t)
  const key=createHash('sha256').update('station-dot-approval\0').update(fixture.bearer).digest()
  await writeFile(join(fixture.directory,'station-dot-approval-'+key.toString('hex').slice(0,24)),'invalid')
  const events=await fixture.start()
  const response=await events.rpc({jsonrpc:'2.0',id:1,method:'events/list'})
  assert.deepEqual(response.result.events.map(event=>event.name),[INTERACTION_PENDING])
  assert.deepEqual(fixture.reports,['source_unavailable'])
})
