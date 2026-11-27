import { randomBytes } from 'node:crypto'
import { createStationActiveListV2 } from './station-dot-active-list-v2.mjs'
import { createWatchedHistory } from './station-dot-watched-history.mjs'

// The paired owner may pull one session by ID. Legacy profiles retain their configured labels.
export function createStationPullTools(ctx, {sessions, activeSessionIds, globalActiveList=false}, key = randomBytes(32)) {
  const ids = activeSessionIds ?? sessions.map(({ id }) => id)
  const activeList = typeof ctx.agents?.list === 'function'
    ? createStationActiveListV2({enabled:true,ctx,key,readApproved:()=>ids,globalActiveList}) : undefined
  const readers = sessions.length && typeof ctx.sessionController?.events === 'function'
    ? new Map(sessions.map(({id:sessionId})=>[sessionId,createWatchedHistory({
      sessionController:ctx.sessionController,sessionId,
    })])) : null
  // Keep the native call bounded even when the provider ignores AbortSignal.
  // A timed-out read must not permit another ID to queue native work behind it.
  let nativeInFlight=false
  const sessionController=ctx.sessionController
  const ownerController={async events(args,signal){
    if(nativeInFlight)throw Error('watch_busy')
    nativeInFlight=true
    try{return await sessionController.events(args,signal)}
    finally{nativeInFlight=false}
  }}
  const watchedHistory = globalActiveList && typeof sessionController?.events==='function'
    ? request=>createWatchedHistory({sessionId:request.selectedSession,sessionController:ownerController})(request)
    : readers ? request=>readers.get(request.selectedSession)?.(request) : undefined
  return {activeList,watchedHistory}
}
