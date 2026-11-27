import test from 'node:test'
import assert from 'node:assert/strict'
import {createStationActiveListV2} from './station-dot-active-list-v2.mjs'
const key=Buffer.alloc(32,17)
test('one explicit live inventory read, immutable 100+1, only aliases and no approvals',async ()=>{
  const approved=Array.from({length:101},(_,i)=>'fixture-private-'+i)
  const handles=[...approved,'excluded-private'].map(id=>({id,extra:'never-output'}))
  let calls=0
  const ctx={agents:{list(){calls++;return handles}},sessionController:{list(){assert.fail('persistent catalog')}}}
  assert.equal(createStationActiveListV2({ctx,key,readApproved:()=>approved}),null)
  assert.equal(calls,0)
  const service=createStationActiveListV2({enabled:true,ctx,key,readApproved:()=>approved})
  const a=await service.begin()
  assert.equal(a.rows.length,100);assert.equal(calls,1)
  handles.length=0
  const b=await service.page(a.next_cursor)
  assert.equal(b.rows.length,1);assert.equal(b.next_cursor,null);assert.equal(calls,1)
  assert.equal(new Set([...a.rows,...b.rows].map(r=>r.alias)).size,101)
  assert.equal(a.captured_at,b.captured_at)
  assert.deepEqual(await service.page(a.next_cursor),b)
  assert.equal(calls,1)
  assert.ok(!/fixture-private|excluded-private|never-output|pending/.test(JSON.stringify([a,b])))
  const c=await service.begin()
  assert.deepEqual(c.rows,[]);assert.equal(calls,2)
})
test('revocation invalidates unfinished cursor; unavailable inventory is not an empty proof',async()=>{
  let ids=Array.from({length:101},(_,i)=>'id'+i)
  let available=true
  const service=createStationActiveListV2({enabled:true,key,ctx:{agents:{list:()=>available?ids.map(id=>({id})):null}},readApproved:()=>ids})
  const a=await service.begin()
  ids=ids.slice(1)
  assert.equal((await service.page(a.next_cursor)).gap,'scope_changed')
  available=false
  const b=await service.begin()
  assert.equal(b.gap,'live_inventory_unavailable');assert.equal(b.coverage,'partial')
})
