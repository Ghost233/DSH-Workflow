import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {setTimeout as sleep} from 'node:timers/promises'
import {startSessionObservation} from './session-observation-mcp.mjs'
import {APPROVAL_PENDING,startStationApprovalEvents} from './station-dot-approval-events.mjs'
import {signStationWebhook} from './station-dot-mcp-events.mjs'

test('paired MCP advertises approvals in both protocol versions and delivers only live, redacted approvals',async t=>{
  const listener= createServer().listen(0,'127.0.0.1')
  await once(listener,'listening')
  const {port}=listener.address()
  await new Promise(resolve=>listener.close(resolve))
  const bearer='A'.repeat(43), secret=Buffer.alloc(32,12)
  const callback='https://callback.xyz/mcp-events/recipient'
  const versions=['2025-06-18','2026-07-28']
  let native, pending=[], detached=false
  const bodies=[]
  const ctx={on(event,fn){assert.equal(event,'session/event');native=fn;return ()=>{detached=true}},
    typertGateway:{getPendingRemoteEvents:()=>pending}}
  const srv=await startSessionObservation({config:{bearer,port,globalActiveList:true,sessions:[]},
    sessionController:{state:()=>null},
    approvalEvents:()=>startStationApprovalEvents({ctx,key:Buffer.alloc(32,7),principal:'owner',callback,tickMs:5,
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
  pending=[{event:'approval/request',agentId:'real-session'}]
  for(let i=0;i<50&&!bodies.length;i++)await sleep(5)
  assert.equal(bodies.length,1)
  assert.equal(bodies[0].name,APPROVAL_PENDING)
  assert.equal(bodies[0].data.kind,'approval')
  assert.match(bodies[0].data.session,/^s_[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(bodies),/PRIVATE|real-session/)
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
