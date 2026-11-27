import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import {startStationDotFromHost} from './station-dot-loopback.mjs'

test('shared Host entry reads passive state and turn lifecycle on distinct opt-in HTTP listener', async t=>{
  let emit, disposed=false
  const bearer=randomBytes(32).toString('hex')
  const ctx={sessionController:{state:async({sessionId})=>({
    running:sessionId==='a',active:true,pendingInput:sessionId==='a'?['approval','approval']:['question']})},
    on(name,listener){assert.equal(name,'session/event'); emit=listener;return()=>{disposed=true}}}
  assert.equal(await startStationDotFromHost({ctx:{},receiptDirectory:'/unused',loadConfig:async()=>null}),null)
  const listener=await startStationDotFromHost({ctx,receiptDirectory:'/fixture',loadConfig:async p=>{
    assert.equal(p,'/fixture/station-dot-api.json')
    return {port:0,bearer,sessions:[{id:'a',label:'A'},{id:'b',label:'B'}]}
  }})
  t.after(()=>listener.close())
  const get=(path,auth=true)=>fetch('http://127.0.0.1:'+listener.port+path,{headers:auth?{authorization:'Bearer '+bearer}:{}})
  assert.equal((await get('/v1/station/events',false)).status,401)
  const s=await (await get('/v1/station/sessions/status?watched=session_2')).json()
  assert.equal(s.pending.length,2)
  assert.deepEqual(s.digests,[{session:'session_2',state:'idle',pending:['question']}])
  const idle=await (await get('/v1/station/events')).json()
  const note=(id,turn,kind)=>emit({id},{type:'turn/end',data:{turn,reason:{kind}},time:turn})
  note('outsider',1,'error');note('a',1,'error');note('a',1,'completed');note('b',1,'completed')
  const first=await (await get('/v1/station/events?after='+idle.cursor+'&limit=1')).json()
  assert.equal(first.events[0].outcome,'error')
  const second=await (await get('/v1/station/events?after='+first.cursor)).json()
  assert.equal(second.events[0].outcome,'completed')
  assert.equal(second.has_more,false)
  await listener.close();assert.equal(disposed,true)
  await assert.rejects(get('/v1/station/events'))
})
