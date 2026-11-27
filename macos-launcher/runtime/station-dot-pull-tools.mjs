import { randomBytes } from 'node:crypto'
import { createStationActiveListV2 } from './station-dot-active-list-v2.mjs'
import { createWatchedHistory } from './station-dot-watched-history.mjs'

// A private observation config is the upper bound. No push or write routes.
export function createStationPullTools(ctx, {sessions, activeSessionIds}, key = randomBytes(32)) {
  const ids = activeSessionIds ?? sessions.map(({ id }) => id)
  const activeList = typeof ctx.agents?.list === 'function'
    ? createStationActiveListV2({enabled:true,ctx,key,readApproved:()=>ids}) : undefined
  const readers = typeof ctx.sessionController?.events === 'function'
    ? new Map(sessions.map(({id:sessionId})=>[sessionId,createWatchedHistory({
      sessionController:ctx.sessionController,sessionId,
    })])) : null
  const watchedHistory = readers
    ? request=>readers.get(request.selectedSession)?.(request) : undefined
  return {activeList,watchedHistory}
}
