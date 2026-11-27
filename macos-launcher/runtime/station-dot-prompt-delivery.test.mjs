import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtemp,realpath,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createStationPromptDelivery,stationPromptDigest,openStationPromptReceipts} from './station-dot-prompt-delivery.mjs'

const body='只核对测试状态，不运行任何工具。'
const approval=(session,text,requestId)=>({session,digest:stationPromptDigest(session,text),requestId})
function make(prompt){
  return createStationPromptDelivery({
    controller:{prompt},
    resolveApprovedSession:s=>s==='station_a'?'fixture-native-a':null,
    consumeOwnerGrant:(grant,requested)=>JSON.stringify(grant)===JSON.stringify(requested)
  })
}
test('only queues exact permitted target, preserves text, reports inbox admission not execution',async()=>{
  const accept=[]
  const send=make(async (...args)=>{accept.push(args);return {accepted:true}})
  const id=randomUUID(), grant=approval('station_a',body,id)
  const args={session:'station_a',text:body,requestId:id,grant}
  await assert.rejects(send({...args,text:body+'x'}),/owner_authorization_required/)
  await assert.rejects(send({...args,session:'station_missing'}),/owner_authorization_required/)
  const bad=approval('station_missing',body,id)
  await assert.rejects(send({...args,session:'station_missing',grant:bad}),/session_not_approved/)
  assert.deepEqual(await send(args),{requestId:id,state:'inbox_accepted'})
  assert.deepEqual(await send(args),{requestId:id,state:'inbox_accepted'})
  assert.equal(accept.length,1)
  assert.deepEqual(accept[0][0],{requestId:id,sessionId:'fixture-native-a',mode:'queue',content:[{type:'text',text:body}]})
  assert.ok(accept[0][1] instanceof AbortSignal)
  const altered=body+'x'
  await assert.rejects(send({...args,text:altered,grant:approval('station_a',altered,id)}),/request_id_reused/)
})
test('uncertain admission is retained, never silently sent again',async()=>{
  let calls=0
  const send=make(async()=>{calls++;throw Error('synthetic error after possible enqueue')})
  const id=randomUUID(), grant=approval('station_a',body,id)
  const args={session:'station_a',text:body,requestId:id,grant}
  assert.equal((await send(args)).state,'delivery_unconfirmed')
  assert.equal((await send(args)).state,'delivery_unconfirmed')
  assert.equal(calls,1)
  const early=randomUUID()
  assert.equal((await send({...args,requestId:early,grant:approval('station_a',body,early),signal:AbortSignal.abort()})).state,'not_sent')
  assert.equal(calls,1)
})

test('reservation-only restart, draft or target reuse, and capacity all fail closed',
  {skip:process.platform!=='darwin'},async()=>{
  const directory=await realpath(await mkdtemp(join(tmpdir(),'station-prompt-receipt-unit-')))
  const opts={directory,key:Buffer.alloc(32,47),scope:'fixture-owner',capacity:1}
  let receipts, attempted=0, target='native-original'
  const session='station_a', requestId=randomUUID()
  try{
    receipts=openStationPromptReceipts(opts)
    receipts.reserve(requestId,stationPromptDigest(session,body),target)
    // Represents a restart just after the durable pre-dispatch reservation.
    receipts.close()
    receipts=openStationPromptReceipts(opts)
    const send=createStationPromptDelivery({receiptStore:receipts,
      controller:{prompt:async()=>{attempted++;return {accepted:true}}},
      resolveApprovedSession:()=>target,
      consumeOwnerGrant:(grant,current)=>JSON.stringify(grant)===JSON.stringify(current)})
    const input=(message=body,id=requestId)=>({session,text:message,requestId:id,
      grant:{session,digest:stationPromptDigest(session,message),requestId:id,target}})
    assert.deepEqual(await send(input()),{requestId,state:'delivery_unconfirmed'})
    await assert.rejects(send(input(body+' change')),/request_id_reused/)
    target='native-remapped'
    await assert.rejects(send(input()),/request_id_reused/)
    await assert.rejects(send(input(body,randomUUID())),/receipt_capacity_reached/)
    assert.equal(attempted,0)
  }finally{receipts?.close();await rm(directory,{recursive:true,force:true})}
})
