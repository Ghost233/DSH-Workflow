import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installStationQuestionObserver} from './station-dot-question-observer.mjs'

const event = 'user-questions/request'
function harness() {
  let listener, detached=false
  const pending=[]
  const ctx={on(name,fn,options){assert.equal(name,event);assert.equal(options.prepend,true);listener=fn;return()=>{detached=true}},
    typertGateway:{getPendingRemoteEvents:()=>pending}}
  return {ctx,pending,detached:()=>detached,dispatch:(req,next)=>listener(req,next)}
}
function request(id='test-session', intent, signal) {
  return {agent:{session:{id}},questions:[{intent}],signal}
}

test('requires a passive live-event source before installing a listener',()=>{
  assert.throws(()=>installStationQuestionObserver({
    on(){assert.fail('must not attach without the gateway')},
  }),/question_source_unavailable/)
})

test('observes one live forwarded card, preserves exact downstream Promise and clears on decision', async()=>{
  const h=harness(), o=installStationQuestionObserver(h.ctx)
  const next=Promise.withResolvers()
  assert.equal(h.dispatch(request(undefined,{kind:'plan-review'}),()=>next.promise),next.promise)
  assert.equal(o.current('test-session'),null)
  h.pending.push({event,agentId:'test-session'})
  assert.equal(o.current('test-session'),'plan_review')
  next.resolve('original answer')
  assert.equal(await next.promise,'original answer')
  assert.equal(o.current('test-session'),null)
  o.close();assert.equal(h.detached(),true)
})
test('refuses ambiguous parallel requests and preserves cancellation and errors',async()=>{
  const h=harness(), o=installStationQuestionObserver(h.ctx)
  const a=Promise.withResolvers(), b=Promise.withResolvers()
  const ctl=new AbortController()
  h.pending.push({event,agentId:'test-session'})
  h.dispatch(request(undefined,undefined,ctl.signal),()=>a.promise)
  h.dispatch(request(undefined,{kind:'approval'}),()=>b.promise)
  assert.equal(o.current('test-session'),null)
  ctl.abort()
  assert.equal(o.current('test-session'),'access_approval')
  const err=new Error('original')
  b.reject(err)
  await assert.rejects(b.promise,e=>e===err)
  assert.equal(o.current('test-session'),null)
  assert.throws(()=>h.dispatch(request(),()=>{throw err}),e=>e===err)
  a.resolve()
  o.close()
})
