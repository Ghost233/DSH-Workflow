import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { createStationPromptDelivery, openStationPromptReceipts, stationPromptDigest } from './station-dot-prompt-delivery.mjs'

async function privateJSON(path) {
  let f
  try { f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  try {
    const st = await f.stat()
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 ||
        st.nlink !== 1 || st.size < 2 || st.size > 8192) throw Error('station_dot_private_config_invalid')
    const bytes = Buffer.alloc(8193)
    const { bytesRead } = await f.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== st.size || bytesRead > 8192) throw Error('station_dot_private_config_invalid')
    const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('station_dot_private_config_invalid')
    return value
  } finally { await f.close() }
}

export async function loadStationDotTunnelConfig(path) {
  const v = await privateJSON(path)
  return v && validateStationDotTunnelConfig(v)
}

export function validateStationDotTunnelConfig(v) {
  if (!v || Object.keys(v).sort().join(',') !== 'clientSha256,directory,tunnelId' ||
      typeof v.directory !== 'string' || !isAbsolute(v.directory) || /[\r\n\0]/.test(v.directory) ||
      !/^tunnel_[a-f0-9]{32}$/.test(v.tunnelId ?? '') || !/^[a-f0-9]{64}$/.test(v.clientSha256 ?? ''))
    throw Error('station_dot_tunnel_config_invalid')
  return {enabled:true, directory:v.directory, tunnelId:v.tunnelId, clientSha256:v.clientSha256}
}

export async function openStationDotPromptHost({directory, sessions, bearer, controller, now=Date.now}) {
  let st
  try { st = await lstat(directory) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700 ||
      await realpath(directory) !== directory) throw Error('station_dot_prompt_directory_invalid')
  const targets = new Map(sessions.map(({id},index)=>[id,'approved_'+index]))
  const proof=Object.freeze({})
  const key=createHmac('sha256',bearer).update('station-dot/prompt-receipts/v1').digest()
  const receiptStore=openStationPromptReceipts({directory,key,scope:'configured-station-pull'})
  key.fill(0)
  const nativeByAlias=new Map([...targets].map(([id,alias])=>[alias,id]))
  const send=createStationPromptDelivery({controller,receiptStore,resolveApprovedSession:a=>nativeByAlias.get(a),
    consumeOwnerGrant: async (grant,{target,requestId,digest})=>{
      if(grant!==proof)return false
      const v=await privateJSON(join(directory,requestId+'.json'))
      const ms=now()
      return !!v && Object.keys(v).sort().join(',')==='digest,expiresAt,sessionId' &&
        v.sessionId===target && v.digest===digest && Number.isSafeInteger(v.expiresAt) &&
        v.expiresAt>ms && v.expiresAt-ms<=3_600_000
    },
  })
  return {
    async deliver({sessionId,requestId,draft,signal}){
      const session=targets.get(sessionId)
      if(!session)throw Error('station_dot_prompt_target_unapproved')
      return send({session,requestId,text:draft,grant:proof,signal})
    },
    close:()=>receiptStore.close(),
  }
}

// Trusted local approval writer can compute the same binding without seeing the session's history.
export function stationDotHostPromptDigest(sessions, sessionId, draft) {
  const i=sessions.findIndex(s=>s.id===sessionId)
  if(i<0)throw Error('station_dot_prompt_target_unapproved')
  return stationPromptDigest('approved_'+i,draft)
}
