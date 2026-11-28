import {test} from 'node:test'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {INTERACTION_PENDING,combineStationInteractionEvents,startStationQuestionEvents} from './station-dot-question-events.mjs'
import {signStationWebhook} from './station-dot-mcp-events.mjs'
const CALLBACK='https://example.com/hooks/dot'
const signingKey=Buffer.alloc(32,9)
const secret='whsec_'+signingKey.toString('base64')
const rpc=(id,method,params)=>({jsonrpc:'2.0',id,method,...(params?{params}:{})})
test('one interaction subscription delivers the three live card types with signed redacted payloads',async t=>{
  let listener, closed=false, approvalAvailable=true
  const pending=[],deliveries=[]
  const ctx={on(name,handler){assert.equal(name,'user-questions/request');listener=handler;return()=>{closed=true}},
    typertGateway:{getPendingRemoteEvents:()=>pending}}
  const question=startStationQuestionEvents({ctx,key:Buffer.alloc(32,6),principal:'owner',callback:CALLBACK,tickMs:5,
    transport:async({headers,body})=>{
      assert.equal(headers['webhook-signature'],signStationWebhook(signingKey,headers['webhook-id'],headers['webhook-timestamp'],body))
      const payload=JSON.parse(body)
      if(payload.type==='verification')return {status:200,json:{challenge:payload.challenge}}
      deliveries.push(payload);return {status:200}}})
  const old='dsh.approval.pending'
  const approval={name:old,async rpc(req){
    if(!approvalAvailable)return {jsonrpc:'2.0',id:req.id,error:{code:-32000}}
    return {jsonrpc:'2.0',id:req.id,result:{events:[{name:old}],legacy:true}}
  },async close(){}}
  const both=combineStationInteractionEvents(approval,question)
  t.after(()=>both.close())
  const list=await both.rpc(rpc(1,'events/list'))
  assert.deepEqual(list.result.events.map(x=>x.name),[old,INTERACTION_PENDING])
  assert.equal((await both.rpc(rpc(2,'events/subscribe',{name:old}))).result.legacy,true)
  assert.equal((await both.rpc(rpc(3,'events/subscribe',{name:'unknown'}))).error.code,-32602)
  const sub=await both.rpc(rpc(4,'events/subscribe',{name:INTERACTION_PENDING,arguments:{},
    delivery:{mode:'webhook',url:CALLBACK,secret}}))
  assert.match(sub.result.id,/^sub_/)
  const session='private-native-session'
  for(const [index,[kind,intent]] of [
    ['question',undefined], ['plan_review',{kind:'plan-review'}], ['access_approval',{kind:'approval'}],
  ].entries()){
    const next=Promise.withResolvers()
    const original=listener({agent:{session:{id:session}},
      questions:[{intent,detail:'PRIVATE_CARD_DETAIL'}]},()=>next.promise)
    assert.equal(original,next.promise)
    await delay(12)
    assert.equal(deliveries.length,index)
    pending.push({event:'user-questions/request',agentId:session})
    for(let i=0;i<100&&deliveries.length===index;i++)await delay(5)
    const delivery=deliveries[index]
    assert.equal(deliveries.length,index+1)
    assert.equal(delivery.name,INTERACTION_PENDING)
    assert.match(delivery.eventId,/^evt_[a-f0-9]{64}$/)
    assert.match(delivery.data.session,/^s_[a-f0-9]{64}$/)
    assert.deepEqual(delivery.data,{kind,session:deliveries[0].data.session})
    assert.doesNotMatch(JSON.stringify(delivery),/PRIVATE_CARD_DETAIL|private-native-session/)
    pending.length=0
    await delay(12)
    pending.push({event:'user-questions/request',agentId:session})
    await delay(12)
    assert.equal(deliveries.length,index+1)
    next.resolve('preserved')
    assert.equal(await original,'preserved')
    pending.length=0
  }
  assert.equal(new Set(deliveries.map(event=>event.eventId)).size,3)
  approvalAvailable=false
  assert.deepEqual((await both.rpc(rpc(5,'events/list'))).result.events.map(event=>event.name),[INTERACTION_PENDING])
  await both.close();assert.equal(closed,true)
})
