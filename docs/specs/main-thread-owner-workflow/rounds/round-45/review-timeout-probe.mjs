import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'
test('R45 reserved recovery slot timeout observation', async t => {
 const f = await createRecoverySessionFixture(t, { executable: true })
 await f.runtime.ensureControlBridge(f.admissionAgent, await readRecoverySessionState(f))
 const control = (action,args={}) => f.runtime.dispatchControlRequest({ contract:'DSH_WORKFLOW_CONTROL_V1',workflowId:f.workflowId,token:f.runtime.controlBridges.get(f.workflowId).manifest.token,action,...args })
 const next=await control('supervisor-next');await control('supervisor-ack',{actionId:next.actionId})
 const before=await mutateRecoverySessionState(f,s=>{s.supervisorOutbox['T1:api'].status='launching';s.supervisorOutbox['T1:api'].launchedAt='2000-01-01T00:00:00.000Z'})
 assert.equal(before.tasks[0].status,'pending')
 let cursor=before.supervisorEventCursor;const events=[]
 for(let i=0;i<2;i++){const result=await f.runtime.awaitSupervisorEvent(f.admissionAgent,f.workflowId,cursor,1);events.push(result);cursor=result.cursor}
 const after=await readRecoverySessionState(f)
 console.log(JSON.stringify({events,task:after.tasks[0],timeouts:after.supervisorTimeouts,admission:after.recoveryAdmission}))
 assert.equal(events[0].event.type,'supervisor.task-timeout-recovery')
 assert.equal(events[1].event.type,'supervisor.task-timeout-recovery')
 assert.equal(after.tasks[0].status,'pending')
 assert.deepEqual(after.supervisorTimeouts,{})
})
