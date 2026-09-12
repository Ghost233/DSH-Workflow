import { readFile, writeFile, rm } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { executionFeedbackFixture, supervisorControlFixture, request, normalizePlanV2, createTaskState } from './fixtures.mjs'
import { expandCompositeTask } from '../../../../../owner-workflow-plugin/src/model.mjs'
import { migrateTaskStatesForRevision } from '../../../../../owner-workflow-plugin/src/plan-revision.mjs'

{
  const began = performance.now()
  const f = await executionFeedbackFixture()
  try {
    const previous = structuredClone(f.state.plan)
    previous.tasks[0].decomposition = { status: 'abstract', kind: 'composite', ownerCandidates: [previous.tasks[0].ownerId], unknowns: ['split required'] }
    const parent = previous.tasks[0]
    const children = ['T1A', 'T1B'].map((id,i) => ({ ...parent, id, title: `child ${i}`, dependsOn: i === 0 ? [] : ['T1A'], decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: [parent.ownerId], unknowns: [] } }))
    const next = expandCompositeTask(previous, 'T1', { children, entry: ['T1A'], exit: ['T1B'] })
    const current = createTaskState(previous)
    current[0].autonomousRecovery = { strategy: 'local_subgraph_rewrite', usedStrategies: ['local_subgraph_rewrite','diagnose'], evidenceDigest: 'fixed' }
    const migration = migrateTaskStatesForRevision({ previousPlan: previous, nextPlan: next, currentTaskStates: current, initialTaskStates: createTaskState(next), revision: 2 })
    console.log(JSON.stringify({ scenario: 'composite-migration-seam', elapsedMs: performance.now()-began,
      parent: migration.taskStates.find(t=>t.taskId==='T1'), children: next.tasks.filter(t=>t.parentTaskId==='T1').map(t=>({id:t.id,parentTaskId:t.parentTaskId,state:migration.taskStates.find(s=>s.taskId===t.id)})),
      limitation: 'actual expansion and migration functions only; not live version activation or inherited-problem production contract' }))
  } catch(e) { console.log(JSON.stringify({scenario:'composite-migration-seam',probeError:e.stack}));process.exitCode=1 }
  finally { await f.cleanup() }
}
for (const heartbeat of [false,true]) {
  const began=performance.now()
  let cancelCalls=0, resolveCancel
  const pendingCancel=new Promise(resolve=>{resolveCancel=resolve})
  const child={status:'running',cancel:()=>{cancelCalls++;return pendingCancel}}
  const f=await supervisorControlFixture({ctx:{agents:{get:id=>id==='t09-owner'?child:undefined}}})
  let lease
  try {
    f.runtime.queueSupervisorReservations=()=>undefined
    f.state.plan.tasks[0].onTimeout={action:'notify_main',afterMs:60000}
    await writeFile(f.statePath,JSON.stringify(f.state))
    await request(f.manifest,'supervisor-start',{parallel:1})
    const next=await request(f.manifest,'supervisor-next')
    const ack=await request(f.manifest,'supervisor-ack',{actionId:next.actionId})
    const state=JSON.parse(await readFile(f.statePath,'utf8'))
    const old=new Date(Date.now()-4*60*60*1000).toISOString()
    state.supervisorOutbox['T1:api']={...state.supervisorOutbox['T1:api'],status:'launching',launchedAt:old}
    state.ownerRuns={'T1:api':{status:'running',ownerId:'api',taskId:'T1',startedAt:old,sessionId:'t09-owner',...(heartbeat?{lastHeartbeatAt:new Date().toISOString()}:{})}}
    f.runtime.activeOwners.set('t09-owner',{workflowId:state.id,stageId:'T1',owner:{id:'api'}})
    lease=(await f.runtime.acquireOwnerLease(f.root,'api',state.id,'T1')).lease
    await writeFile(f.statePath,JSON.stringify(state))
    const result=await request(f.manifest,'supervisor-await-event',{cursor:ack.eventCursor,waitMs:1})
    let leaseStillValid=true
    try{await f.runtime.assertOwnerLease(lease)}catch{leaseStillValid=false}
    const saved=JSON.parse(await readFile(f.statePath,'utf8'))
    console.log(JSON.stringify({scenario:heartbeat?'heartbeat-vs-hard-deadline':'timeout-vs-cancel-settlement',elapsedMs:performance.now()-began,simulatedAgeMs:4*60*60*1000,configuredAfterMs:60000,event:result.event?.type,taskStatus:saved.tasks[0].status,cancelCalls,cancellationStillPending:cancelCalls>0,leaseStillValid}))
  }catch(e){console.log(JSON.stringify({scenario:heartbeat?'heartbeat-vs-hard-deadline':'timeout-vs-cancel-settlement',probeError:e.stack}));process.exitCode=1}
  finally{resolveCancel();f.runtime.activeOwners.delete('t09-owner');if(lease)await f.runtime.releaseOwnerLease(lease);await f.runtime.dispose();await rm(f.root,{recursive:true,force:true})}
}
