import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, symlink, rm, cp, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Coordination } from '../src/coordination.mjs'
import { Workspaces } from '../src/workspaces.mjs'
import { TobsBridge } from '../src/tobs-bridge.mjs'
import { CoordinationRuntime } from '../src/runtime.mjs'
import { hostPackageMap } from '../../scripts/project-plugins.mjs'
import { nativeBundlePatches } from '../../scripts/native-bundle.mjs'
const root=resolve('.')
const resources=process.env.DSH_SERVICE_TEST_RESOURCES ?? join(root,'.build/Ghost DSH Station-0.6.5-dsh0.2.2-rc.1-arm64.app/Contents/Resources')
const packaged=Boolean(process.env.DSH_SERVICE_TEST_RESOURCES)
const native=packaged ? join(resources,'plugins') : join(root,'.build/tobs-runtime')
const projectPlugin=packaged ? join(resources,'workflow/project-coordination-plugin/index.mjs') : join(native,'project-coordination-plugin/index.mjs')
const anchor=join(resources,'node_modules/@deepseek-ai/dsh/package.json')
const req=createRequire(anchor),boot=req('@deepseek-ai/dsh-app-boot'),{provideCmdline}=req('@deepseek-ai/dsh-cmdline')
const temp=await mkdtemp(join(tmpdir(),'tobs-real-host-')),home=join(temp,'home'),profileDir=join(home,'profiles/web')
if (!packaged) {
for (const [name,path] of Object.entries(hostPackageMap(anchor))) {
 const target=join(native,'node_modules',name)
 try { await access(target) } catch(error) { if(error.code!=='ENOENT')throw error;await mkdir(resolve(target,'..'),{recursive:true});await symlink(path,target) }
}
await cp(join(root,'project-coordination-plugin'),join(native,'project-coordination-plugin'),{recursive:true})
}
const previous=process.env.DSH_HOME;process.env.DSH_HOME=home
let ctx,early,bridge,service
const deadline=setTimeout(()=>{ console.error('Native acceptance timed out');void early?.fiber.dispose() },60000)
const until=async predicate=>{const end=Date.now()+25000;while(!predicate()){if(Date.now()>end)throw Error('Native acceptance condition timed out');await new Promise(r=>setTimeout(r,20))}}
try{
 boot.initProfile(profileDir,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'])
 await writeFile(join(profileDir,'cordis.yml'),'[]\n')
 const names=['@botharness/tobs','@botharness/core','@botharness/ui','@botharness/browser','@botharness/computer','@botharness/im-provider','deepseekbot']
 const packages=Object.fromEntries(names.map(name=>[name,join(native,'node_modules',name)]))
 for(const[name,path]of Object.entries(packages)){const target=join(profileDir,'node_modules',name);await mkdir(resolve(target,'..'),{recursive:true});await symlink(path,target)}
 // Use the native Host resolution and explicit profile package links.
 let profile=boot.loadProfile('dsh','web',anchor,home)
 const existing=boot.composeEntries([...profile.layers.map(layer=>layer.patches),profile.patches])
 const meta=createRequire(join(packages['@botharness/tobs'],'package.json'))('./package.json')
 const nativePatches=nativeBundlePatches(boot,packages['@botharness/tobs'],meta,existing)
 const patches=[...nativePatches,{id:'webserver',config:{host:'127.0.0.1',port:0}},{id:'web-runtime',config:{openBrowser:false,printUrl:false}},
 {id:'hmr',disabled:true},{id:'session-telemetry-otel',disabled:true},{id:'session-title-llm',disabled:true},
 {id:'settings',config:{path:join(temp,'settings.yml'),watch:false}},{id:'session-persistence-jsonl',config:{root:join(temp,'sessions')}},
 {insert:[{id:'workflow-project-coordination',name:projectPlugin,config:{directory:join(temp,'coordination'),configurationFile:''}}]}]
 await writeFile(join(profileDir,'cordis.patch.yml'),JSON.stringify(patches))
 profile=boot.loadProfile('dsh','web',anchor,home)
 const resolution=await boot.createRuntimeResolution({installAnchor:anchor,profile})
 console.log('BOOT_BEGIN')
 ctx=await boot.boot('tobs-real-host',join(profileDir,'cordis.yml'),[...profile.layers.flatMap(layer=>layer.patches),...profile.patches],async c=>{
  early=c
  c.provide('profileContext',{name:'web',dir:profileDir,patchPath:profile.patchPath,installAnchor:anchor,cwd:temp,home,startedBundles:profile.layers.map(layer=>layer.packageName),overlays:[]})
  provideCmdline(c,{args:[],exit:()=>{},ready:{onReady:listener=>{listener();return()=>{}}}})
  await c.plugin(boot.PluginPackages,{resolution})
 })
 console.log('BOOT_READY')
 const core=ctx.get('botharness');if(!core)throw Error('Tobs service did not load')
 const created=core.creations.create({displayName:'Isolated integration probe',workspaces:[]},'workflow-host-probe-20261111')
 const expected=['botharness-core','botharness-client','xmanrui-dsh-im','botharness-browser','botharness-computer','preset-deepseekbot','workflow-project-coordination']
 const entries=[...ctx.loader.entries()].filter(entry=>expected.includes(entry.id.split(':').at(-1)))
 assert.equal(entries.length,expected.length)
 assert.ok(entries.every(entry=>entry.fiber?.state===2),'every product entry must have a real active fiber')
 const boss=core.creations.create({displayName:'Isolated project principal',workspaces:[]},'workflow-boss-probe-20261111').record.slug
 const bot=created.record.slug
 const execute=promisify(execFile), checkout=join(temp,'repo')
 await mkdir(checkout)
 await execute('git',['init','--quiet',checkout])
 await writeFile(join(checkout,'README.md'),'fixture repository\n')
 await execute('git',['-C',checkout,'add','README.md'])
 await execute('git',['-C',checkout,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgSign=false','commit','--quiet','-m','fixture'])
 service=new Coordination({path:join(temp,'own-state.sqlite'),configuration:{
  members:[{bot:boss,role:'principal'},{bot,role:'manager',parent:boss,repository:'fixture/repo'}],
  repositories:[{repository:'fixture/repo',manager:bot,allowedActors:['owner'],checkout,executionRoot:join(temp,'worktrees'),verificationCommands:[[process.execPath,'-e','process.exit(0)']]}],
 }})
 service.ingest({id:'fixture-issue',kind:'issue',actor:'owner',repository:'fixture/repo',number:1,url:'https://github.com/fixture/repo/issues/1',text:'Verify the existing implementation'})
 const {defineTool}=req('@deepseek-ai/dsh-tools')
 bridge=new TobsBridge({service,core,defineTool,workspaces:new Workspaces({store:service.store}),workspaceRegistry:ctx.get('workspaceRegistry'),github:{ensureIssue:async id=>service.store.get('task',id).issue}})
 const {LlmAdapter,ToolCallId,LlmError}=req('@deepseek-ai/dsh-llm')
 let orchestratorStep=-1,assignmentStep=0,call=0
 const trace=[], received=[]
 let warming=true
 let failModel=false,recoverModel=false,failureCode='SERVER'
 const tool=(name,args)=>{
  const id=ToolCallId(`coordination-${++call}`),argumentsJson=JSON.stringify(args)
  trace.push({name,args})
  return [{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsJson},
   {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsJson}},{type:'finish',reason:{kind:'tool-calls'}}]
 }
 class FixtureAdapter extends LlmAdapter {
  providerRetryPolicy(){return{mode:'normal',maxRetries:0,retryableCodes:[],initialDelayMs:1,maxDelayMs:1,jitterRatio:0}}
  async listModels(provider){return ['orchestrator','assignment'].map(id=>({provider,id,name:id}))}
  async resolveModel(provider,model){return{provider,id:model,name:model,context:{contextWindow:200000}}}
  async *stream(options){
   received.push(options.model)
   if(failModel && options.model==='orchestrator')throw new LlmError('Fixture provider temporarily unavailable',failureCode)
   let chunks
   if(warming)chunks=undefined
   else if(recoverModel && options.model==='orchestrator'){recoverModel=false;chunks=tool('project_work',{action:'team',input:{}})}
   else if(options.model==='orchestrator'){
    const step=orchestratorStep++
    if(step===-1)chunks=tool('project_work',{action:'team',input:{}})
    else if(step===0)chunks=tool('project_work',{action:'inbox',input:{}})
    else if(step===1){const event=service.store.get('event','fixture-issue');chunks=tool('project_work',{action:'accept',input:{event_id:event.id,receipt:event.token,title:'Verify implementation',criteria:['fixed checks pass']}})}
    else if(step===2)chunks=tool('project_work',{action:'prepare_execution',input:{task_id:service.store.list('task')[0].id}})
    else if(step===3){const attempt=service.store.list('attempt')[0];chunks=tool('create_assignment',{title:'Verify implementation',description:'Isolated project verification',grant_id:attempt.grantId,key:attempt.id,instructions:`Use project_work verify then report no-change for attempt ${attempt.id}. Finish with native report_to_orchestrator.`})}
   }else{
    const attempt=service.store.list('attempt')[0],step=assignmentStep++
    if(step===-1)chunks=tool('project_work',{action:'team',input:{}})
    else if(step===0)chunks=tool('project_work',{action:'verify',input:{attempt_id:attempt.id}})
    else if(step===1)chunks=tool('project_work',{action:'report',input:{attempt_id:attempt.id,state:'no-change',summary:'Existing implementation verified',evidence:{reason:'Configured repository check exited zero without changes'}}})
    else if(step===2)chunks=tool('report_to_orchestrator',{state:'completed',summary:'Existing implementation verified'})
   }
   yield*(chunks??[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'Recorded.'},{type:'block-end',index:0,block:{type:'text',text:'Recorded.'}},{type:'finish',reason:{kind:'stop'}}])
  }
 }
 ctx.llm.registerAdapter(['workflow-fixture'],new FixtureAdapter())
 const preset=core.modelPresets.create({name:'Isolated fixture',orchestrator:{provider:'workflow-fixture',model:'orchestrator'},assignmentDefault:{provider:'workflow-fixture',model:'assignment'}})
 assert.equal(core.registry.applyModelPreset(bot,preset).ok,true)
 assert.equal(core.registry.applyModelPreset(boss,preset).ok,true)
 const warmup=core.schedules.create(boss,{title:'Existing principal before plugin activation',prompt:'Acknowledge this fixture.',enabled:false,locked:true,trigger:{kind:'cron',expression:'0 0 1 1 *',timeZone:'UTC'}},'human')
 core.schedules.runNow(boss,warmup.id)
 try { await until(()=>received.length>0 && !core.runtime.turnRunning(boss)) }
 catch(error) { console.error(JSON.stringify({ received, state:core.states.snapshot(boss), attention:core.attention.list({botSlug:boss,limit:4}) })); throw error }
 const principalSession=core.runtime.currentOrchestratorSessionId(boss)
 const principalAgent=ctx.agents.get(principalSession)
 assert.ok(principalAgent)
 assert.equal(ctx.tools.get('project_work',principalAgent),undefined)
 bridge.start(ctx.agents)
 warming=false
 assert.ok(ctx.tools.get('project_work',principalAgent),'the existing principal must see project_work')
 const probe=await principalAgent.ctx.tools.execute({agent:principalAgent,signal:new AbortController().signal,
  calls:[{type:'tool-call',id:ToolCallId('existing-principal-team'),name:'project_work',arguments:JSON.stringify({action:'team',input:{}})}]})
 assert.equal(probe.results[0]?.result.isError,false,JSON.stringify(probe.results[0]?.result))
 assert.equal(core.runtime.currentOrchestratorSessionId(boss),principalSession)
 assert.equal(ctx.agents.get(principalSession),principalAgent)
 const schedule=core.schedules.create(bot,{title:'Native project acceptance',prompt:'Read project_work inbox and execute the fixture task.',enabled:false,locked:true,trigger:{kind:'cron',expression:'0 0 1 1 *',timeZone:'UTC'}},'human')
 console.log(JSON.stringify({models:await ctx.llm.listModels('workflow-fixture'),dm:created.channelId}))
 core.schedules.runNow(bot,schedule.id)
 try { await until(()=>service.store.list('task')[0]?.state==='delivered' && core.runtime.listAssignments(bot)[0]?.latestReport?.state==='completed' && core.runtime.listAssignments(bot)[0]?.activity==='idle') } catch(error) {console.error(JSON.stringify({trace, tasks:service.store.list('task'), attempts:service.store.list('attempt'), assignments:core.runtime.listAssignments(bot), state:core.states.snapshot(bot), received, attention:core.attention.list({botSlug:bot,limit:20}), events:ctx.sessions.get(core.runtime.currentOrchestratorSessionId(bot))?.snapshotEvents().slice(-6)}));throw error}
 const attempt=service.store.list('attempt')[0],assignment=core.runtime.getAssignment(bot,attempt.sessionId)
 const orchestrator=ctx.sessions.get(core.runtime.currentOrchestratorSessionId(bot))
 const toolResults=orchestrator.snapshotEvents().filter(event=>event.type==='tool/result')
 assert.ok(toolResults.length>=5 && toolResults.every(event=>event.data.message.isError!==true),'real Orchestrator tools must succeed')
 assert.equal(assignment.permission.grantId,attempt.grantId)
 assert.equal(assignment.permission.primaryCwd,attempt.path)
 assert.equal(core.grants.requireActive(bot,attempt.grantId).orchestratorWrite,true)
 assert.equal(service.store.get('verified-tree',attempt.id).commands[0].exitCode,0)
 service.stop(bot,attempt.taskId)
 await bridge.execution.stopPending(new AbortController().signal)
 assert.equal(core.runtime.getAssignment(bot,attempt.sessionId).activity,'stopped')
 await until(()=>!core.runtime.turnRunning(bot))
 const coordinator=new CoordinationRuntime({service,core,bridge,github:{}})
 await coordinator.ensureProjectGroup(service.configuration.repositories[0])
 await coordinator.ensureProjectGroup(service.configuration.repositories[0])
 const projectGroups=core.roster.snapshot().sections.filter(row=>row.name==='repo')
 assert.equal(projectGroups.length,1)
 assert.ok(projectGroups[0].channelIds.includes(created.channelId))
 assert.ok(!projectGroups[0].channelIds.includes(`dm-${boss}`))
 failModel=true
 for(let failure=1;failure<=5;failure++){
  await until(()=>!core.runtime.turnRunning(bot))
  assert.equal(coordinator.wake(bot),true)
  await until(()=>service.store.list('native-failure').length>=failure)
  assert.equal(core.runtime.heldCause(bot),undefined,'transient provider failure must remain recoverable')
 }
 assert.ok(service.store.list('event').some(row=>row.bot===boss && row.source.kind==='dependency-wait'))
 assert.ok(service.store.get('native-backoff',bot).failures>0)
 failModel=false;recoverModel=true
 await until(()=>!core.runtime.turnRunning(bot))
 assert.equal(coordinator.wake(bot),true)
 await until(()=>service.store.get('native-backoff',bot).failures===0)
 assert.ok(service.store.get('task',attempt.taskId).hold,'model recovery must preserve the task stop')
 assert.equal(service.store.list('attempt').length,1)
 assert.equal(core.runtime.getAssignment(bot,attempt.sessionId).activity,'stopped')
 await until(()=>!core.runtime.turnRunning(bot))
 const transientFailures=service.store.list('native-failure').length
 failModel=true;failureCode='MODEL_UNAVAILABLE'
 for(let failure=1;failure<=3;failure++){
  await until(()=>!core.runtime.turnRunning(bot))
  assert.equal(coordinator.wake(bot),true)
  await until(()=>service.store.list('native-failure').length>=transientFailures+failure)
 }
 await until(()=>!core.runtime.turnRunning(bot))
 assert.equal(core.runtime.heldCause(bot),'failures')
 assert.equal(coordinator.wake(bot),false,'do not bypass a native hold')
 assert.ok(service.store.list('event').some(row=>row.bot===boss && row.source.kind==='reconciliation-required'))
 assert.ok(service.store.get('task',attempt.taskId).hold)
 console.log(JSON.stringify({result:'passed',projectGrouping:true,modelFailureRecovery:true,recoverableFailures:transientFailures,nativeFailureHoldRespected:true,retiredWakeSchedules:service.store.list('retired-schedule').length,entries:entries.map(entry=>entry.id),nativeSession:attempt.sessionId,grant:attempt.grantId,verificationExitCode:0,stopped:true,toolCalls:trace.map(row=>row.name)}))
}catch(error){console.error(error.stack);process.exitCode=1}finally{clearTimeout(deadline);bridge?.close();await ctx?.fiber.dispose();service?.close();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;await rm(temp,{recursive:true,force:true})}
