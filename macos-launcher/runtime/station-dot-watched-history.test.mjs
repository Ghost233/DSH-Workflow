import assert from 'node:assert/strict'
import test from 'node:test'
import {createWatchedHistory} from './station-dot-watched-history.mjs'
const watch=events=>createWatchedHistory({sessionId:'watched',sessionController:{events}})
const row=(seq,type='assistant/message')=>({type:'event',event:{seq,type,time:seq+1,data:{secret:'private'}}})
const page=(cursor,lo,end)=>({cursor,hasMore:lo>0,records:Array.from({length:end-lo},(_,i)=>row(lo+i))})
const read=(watch,after)=>watch({selectedSession:'watched',after})
test('wrong scope never reads and baseline emits no data',async()=>{
 let calls=0
 const w=watch(async({address})=>{calls++;assert.deepEqual(address,{kind:'session',sessionId:'watched'});return page(4,3,5)})
 assert.equal((await w({selectedSession:'other'})).status,'out_of_scope');assert.equal(calls,0)
 assert.deepEqual(await read(w,null),{status:'baseline_only',cursor:4,events:[],semantic_coverage:'not_enabled'})
})
test('cut pin plus exclusive cursor, monotonic sequence, no tool payload',async()=>{
 const w=watch(async req=>{
  if(req.throughSeq===undefined)return page(6,5,7)
  assert.equal(req.throughSeq,6);assert.equal(req.beforeSeq,5)
  return {...page(6,2,5),records:[row(2),row(3,'tool/result'),row(4,'turn/end')]}
 })
 const result=await read(w,2)
 assert.deepEqual(result.covered,{after:2,through:6});assert.deepEqual(result.events.map(x=>x.seq),[4,5,6])
 assert.doesNotMatch(JSON.stringify(result),/secret|tool\/result|watched/)
})
test('regressions, incoherent provider pages, caps and omitted events never advance',async()=>{
 for(const [fn,after,status] of [
  [async()=>page(4,0,5),5,'cursor_regressed'],
  [async({throughSeq})=>throughSeq===undefined?page(4,4,5):page(5,0,4),1,'invalid_page'],
  [async()=>({cursor:2,hasMore:false,records:[row(0),row(0),row(2)]}),-1,'invalid_page'],
  [async()=>page(400,0,401),-1,'history_budget'],
  [async({beforeSeq=9})=>page(8,beforeSeq-1,beforeSeq),1,'history_budget'],
 ]){
  const val=await read(watch(fn),after);assert.equal(val.status,status);assert.equal(val.cursor,null)
 }
})
test('coalescing guard and sanitized dependency failure',async()=>{
 let done
 const w=watch(()=>new Promise(r=>{done=r}))
 const first=read(w,-1);assert.equal((await read(w,-1)).status,'busy');done(page(-1,0,0))
 assert.equal((await first).status,'complete')
 const fail=await read(watch(async()=>{throw Error('private payload')}),-1)
 assert.deepEqual(fail,{status:'source_unavailable',cursor:null,events:[],semantic_coverage:'not_enabled'})
})
