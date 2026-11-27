import {lstatSync,realpathSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {createDshDotTunnelLifecycle} from './dsh-dot-tunnel-lifecycle.mjs'

function validate(path,mode,directory=false) {
  const s=lstatSync(path)
  if (s.uid!==process.getuid() || (s.mode&0o777)!==mode || realpathSync(path)!==path ||
      (directory ? !s.isDirectory() : !s.isFile() || s.nlink!==1))
    throw Error('invalid_dot_private_path')
  return path
}

// Opt-in internal composition, not user-supplied executable or upstream URLs.
export function composeBackendDotTunnel({enabled=false,directory,tunnelId,clientSha256,openDirectPlugin,spawnProcess=spawn,publish}={},application) {
  if(enabled!==true)return null
  if(typeof directory!=='string'||!directory.startsWith('/')||/[\r\n\0]/.test(directory)||
     !/^tunnel_[a-f0-9]{32}$/.test(tunnelId??'')||!/^([a-f0-9]{64})$/.test(clientSha256??'')||typeof openDirectPlugin!=='function')
    throw Error('invalid_direct_dsh_config')
  let receipt, opening, stopping
  const lifecycle=createDshDotTunnelLifecycle({enabled:true,publish,
    resolveMcp:signal=>opening??=(async()=>{
      const {ctx}=await application
      if(signal.aborted)return
      const entry=await openDirectPlugin({ctx,signal})
      if(typeof entry?.close!=='function')return
      if(signal.aborted||stopping||!['dsh.synthetic_active.read_only','station.observation.owner_scoped'].includes(entry.capability)){
        await entry.close();return
      }
      receipt=entry
      return {endpoint:entry.endpoint,authorization:entry.authorization}
    })(),
    launchOwned({endpoint}){
      validate(directory,0o700,true)
      const file=(name,mode)=>validate(resolve(directory,name),mode)
      const bin=file('tunnel-client',0o700)
      if(lstatSync(bin).size>100_000_000 || createHash('sha256').update(readFileSync(bin)).digest('hex')!==clientSha256)
        throw Error('dot_tunnel_client_not_pinned')
      const runtime=file('runtime.key',0o600)
      if(!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(receipt?.authorization??''))
        throw Error('invalid_local_authorization')
      const lease=mkdtempSync(resolve(directory,'synthetic-upstream-'))
      const upstream=resolve(lease,'authorization')
      const cleanup=()=>rmSync(lease,{recursive:true,force:true})
      let child
      try{
      validate(lease,0o700,true)
      writeFileSync(upstream,receipt.authorization,{flag:'wx',mode:0o600})
      validate(upstream,0o600)
      // Only file references cross the process boundary. Client-native reconnect.
      child=spawnProcess(bin,['run','--control-plane.base-url=https://api.openai.com',
        '--control-plane.tunnel-id='+tunnelId,'--control-plane.api-key=file:'+runtime,
        '--control-plane.poll-channel=main','--mcp.server-url='+endpoint,'--mcp.oauth-discovery=disabled',
        '--mcp.extra-headers','Authorization: file:'+upstream,'--health.listen-addr=127.0.0.1:0',
        '--log.level=warn','--log.format=json'],{stdio:'ignore',shell:false,cwd:directory,
        env:{PATH:'/usr/bin:/bin',HOME:directory}})
      }catch(error){cleanup();throw error}
      let exited=false
      const closed=new Promise((finish,reject)=>{
        const done=()=>{
          if(exited)return
          exited=true
          try{cleanup();finish()}catch{reject(Error('local_authorization_cleanup_unconfirmed'))}
        }
        child.once('close',done)
        child.once('error',()=>{if(child.pid===undefined)done()})
      })
      return {closed,async stop(){
        if(exited)return
        child.kill('SIGTERM')
        await Promise.race([closed,delay(1500,null,{ref:false})])
        if(!exited)child.kill('SIGKILL')
        await Promise.race([closed,delay(1000,null,{ref:false})])
        if(!exited)throw Error('dot_client_stop_unconfirmed')
      }}
    }})
  return Object.freeze({start:lifecycle.start,stop:()=>stopping??=(async()=>{
    try{await lifecycle.stop()}finally{await receipt?.close()}
  })()})
}
