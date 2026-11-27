// Owner-local Station setup only; never import from the process PATH or return credentials.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { readStationDotPairing } from './station-dot-pairing.mjs'
import { loadStationDotTunnelConfig } from './station-dot-host-config.mjs'
import { validateStationDotClientFiles } from './dsh-dot-tunnel-composition.mjs'

const tunnel = /^tunnel_[a-f0-9]{32}$/
const session = /^[A-Za-z0-9_-]{1,128}$/
const auth = /^sk-[A-Za-z0-9_-]{12,240}$/
const prefixes = ['/opt/homebrew', '/usr/local']
const scopeError = () => Error('dot_setup_session_scope_invalid')

async function trustedClient(prefix) {
  const launcher = await realpath(join(prefix, 'bin/tunnel-client'))
  const cellar = join(prefix, 'Cellar/tunnel-client')
  const parts = relative(cellar, launcher).split(sep)
  if (parts.length !== 3 || !/^[0-9][0-9A-Za-z.+_-]*$/.test(parts[0]) ||
      parts[1] !== 'bin' || parts[2] !== 'tunnel-client')
    throw Error('dot_setup_untrusted_client')
  const bytes = await readTrustedFile(launcher, 100_000_000, true)
  if (!bytes.subarray(0, 2).equals(Buffer.from('#!')) && bytes.length >= 1024) return {binary: launcher}
  const libexec = join(cellar, parts[0], 'libexec')
  const binary = join(libexec, 'tunnel-client')
  const cloudflared = join(libexec, 'cloudflared')
  const manifest = join(libexec, 'cloudflared-manifest.json')
  // Accept only Homebrew's exact exec trampoline; never interpret or execute it.
  if (/["\\\r\n$`!]/.test(binary) ||
      bytes.toString('utf8') !== '#!/bin/bash\nexec "' + binary + '" "$@"\n' ||
      await realpath(libexec) !== libexec)
    throw Error('dot_setup_untrusted_client')
  await readMachO(binary)
  await readMachO(cloudflared)
  await readTrustedFile(manifest, 16_384)
  return {binary, cloudflared, manifest}
}

async function localFile(path, maximum, owner=process.getuid()) {
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try {
    const m=await fd.stat()
    if(!m.isFile()||m.uid!==owner||m.nlink!==1||(m.mode & 0o777)!==0o600||m.size<1||m.size>maximum)
      throw Error('dot_setup_private_file_invalid')
    const b=Buffer.alloc(maximum+1)
    const {bytesRead}=await fd.read(b,0,b.length,0)
    if(bytesRead!==m.size)throw Error('dot_setup_private_file_invalid')
    return b.subarray(0,bytesRead).toString('utf8')
  } finally {await fd.close()}
}

export function singleTunnelId(text) {
  // Read only a strict scalar of the official local profile; no YAML directives or files are loaded.
  const ids=[...new Set([...text.matchAll(/^\s*tunnel_id:\s*['"]?(tunnel_[a-f0-9]{32})['"]?\s*(?:#[^\r\n]*)?$/gm)].map(m=>m[1]))]
  return ids.length===1?ids[0]:null
}

async function pickClient(paths) {
  for(const p of paths) {
    const binary=await trustedClient(p).catch(()=>null)
    if(binary)return binary
  }
  return null
}

async function legacy(directory) {
  const current=await readStationDotPairing(directory).catch(()=>null)
  const transport=current?.transport ?? await loadStationDotTunnelConfig(join(directory,'station-dot-tunnel.json')).catch(()=>null)
  if(!transport)return {transport:null,existing:[]}
  return {transport,existing:current?.observation.sessions.map(s=>s.id)??[]}
}

async function observedOptions(directory,{home=process.env.HOME,brewPrefixes=prefixes}={}) {
  const prev=await legacy(directory)
  let usable=null
  try { if(prev.transport) { validateStationDotClientFiles(prev.transport); usable=prev.transport } } catch {}
  const binary=usable?null:await pickClient(brewPrefixes)
  let inferred=prev.transport?.tunnelId??null
  if(!inferred) {
    for(const root of brewPrefixes) {
      const profile=await localFile(join(root,'etc/tunnel-client.yaml'),16384).catch(()=>null)
      if(profile && (inferred=singleTunnelId(profile))) break
    }
  }
  const keyPath=home?join(home,'.config/tunnel-client/runtime.key'):null
  const reusable=typeof keyPath==='string'&&auth.test((await localFile(keyPath,260).catch(()=>'' )).trim())
  return {usable,binary,inferred,reusable,keyPath,existing:prev.existing}
}

export async function localSessionOptions(controller) {
  if(typeof controller?.list !== 'function') return []
  const r=await controller.list({},AbortSignal.timeout(3500))
  if(!Array.isArray(r?.items))throw scopeError()
  const seen=new Set(), rows=[]
  for(const i of r.items) {
    if(typeof i?.sessionId!=='string'|| !session.test(i.sessionId)||seen.has(i.sessionId)||i.origin==='subagent')continue
    seen.add(i.sessionId)
    let title=[i.title,i.projections?.title?.summary,i.projections?.title].find(s=>typeof s==='string')
    title=title?.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,100)||'会话 '+i.sessionId.slice(0,8)
    rows.push({id:i.sessionId,title,running:i.running===true})
    if(rows.length===80)break
  }
  return rows
}

export async function dotSetupPreview(directory,controller,options) {
  const d=await observedOptions(directory,options)
  const rows=await localSessionOptions(controller)
  const approved=new Set(d.existing)
  return {clientAvailable:Boolean(d.binary||d.usable),keyAvailable:Boolean(d.usable||d.reusable),
    tunnelId:d.inferred, sessions:rows.map(row=>({...row,selected:approved.has(row.id)}))}
}

async function readTrustedFile(path, maximum, executable=false, prefixOnly=false) {
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try {
    const m=await fd.stat()
    if(!m.isFile()||![0,process.getuid()].includes(m.uid)||(m.mode&0o022)!==0||
       (executable&&(m.mode&0o111)===0)||m.size<(prefixOnly?1024:1)||m.size>maximum)
      throw Error('dot_setup_untrusted_client')
    const b=Buffer.alloc(prefixOnly?4:m.size+1)
    const {bytesRead}=await fd.read(b,0,b.length,0)
    if(bytesRead!==(prefixOnly?4:m.size))throw Error('dot_setup_untrusted_client')
    return b.subarray(0,bytesRead)
  } finally {await fd.close()}
}

async function readMachO(path, prefixOnly=true) {
  const bytes=await readTrustedFile(path,100_000_000,true,prefixOnly)
  if(bytes.length<4 || ![0xcffaedfe,0xfeedfacf,0xcafebabe,0xcafebabf].includes(bytes.readUInt32BE(0)))
    throw Error('dot_setup_untrusted_client')
  return bytes
}

export async function guidedPairing(directory,controller,input,options) {
  if(input?.mode!=='guided'||Object.keys(input).some(k=>!['mode','tunnelId','sessionIds','runtimeKey'].includes(k))||
      typeof input.tunnelId!=='string'||!tunnel.test(input.tunnelId)||
      !Array.isArray(input.sessionIds)||input.sessionIds.length>8||
      input.sessionIds.some(id=>typeof id!=='string'||!session.test(id))||
      new Set(input.sessionIds).size!==input.sessionIds.length)
    throw scopeError()
  if(input.sessionIds.length) {
    const selected=new Set((await localSessionOptions(controller)).map(s=>s.id))
    if(input.sessionIds.some(id=>!selected.has(id)))throw scopeError()
  }
  const sessions=input.sessionIds.map((id,i)=>({id,label:'会话 '+(i+1)}))
  const from=await observedOptions(directory,options)
  if(from.usable && from.usable.tunnelId===input.tunnelId && !input.runtimeKey) {
    const {directory,clientSha256,tunnelId}=from.usable
    return {directory,clientSha256,tunnelId,sessions,globalActiveList:true}
  }
  const binary=from.binary ?? await pickClient(options?.brewPrefixes??prefixes)
  if(!binary)throw Error('dot_setup_official_client_missing')
  const key=(typeof input.runtimeKey==='string'&&input.runtimeKey.trim())||
    (from.reusable && (!from.inferred||from.inferred===input.tunnelId)
      ? (await localFile(from.keyPath,260).catch(()=>'' )).trim(): '')
  if(!auth.test(key))throw Error('dot_setup_runtime_key_required')
  const bytes=binary.cloudflared?await readMachO(binary.binary,false):await readTrustedFile(binary.binary,100_000_000,true)
  if(bytes.length<1024 || bytes.subarray(0,2).equals(Buffer.from('#!')))throw Error('dot_setup_untrusted_client')
  // A new directory per authorized pairing avoids overwriting an already-used key.
  const parent=await realpath(directory)
  const out=await mkdtemp(join(parent,'station-dot-client-'))
  try {
    await writeFile(join(out,'tunnel-client'),bytes,{flag:'wx',mode:0o700})
    if(binary.cloudflared) {
      await writeFile(join(out,'cloudflared'),await readMachO(binary.cloudflared,false),{flag:'wx',mode:0o700})
      await writeFile(join(out,'cloudflared-manifest.json'),await readTrustedFile(binary.manifest,16_384),{flag:'wx',mode:0o600})
    }
    await writeFile(join(out,'runtime.key'),key+'\n',{flag:'wx',mode:0o600})
    return {directory:out,clientSha256:createHash('sha256').update(bytes).digest('hex'),tunnelId:input.tunnelId,sessions,globalActiveList:true}
  } catch(error) {
    await rm(out,{recursive:true,force:true})
    throw error
  }
}
