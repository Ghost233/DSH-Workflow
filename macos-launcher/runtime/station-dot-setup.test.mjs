import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,realpath,rm,stat,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {dotSetupPreview,guidedPairing,singleTunnelId} from './station-dot-setup.mjs'
import {saveStationDotPairing} from './station-dot-pairing.mjs'

const tunnelId='tunnel_'+'a'.repeat(32)
const dummy='sk-fixture-local-only-credential'
const inventory={list:async()=>({items:[{sessionId:'owned-one',title:'一号',running:true},{sessionId:'owned-two',title:'二号'},
  {sessionId:'worker-hidden',origin:'subagent'},{sessionId:'wrong/path'}]})}

async function fixture(t) {
  const root=await mkdtemp(join(await realpath(tmpdir()),'station-dot-setup-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const dir=join(root,'receipt'), brew=join(root,'brew'), home=join(root,'home')
  for(const d of [dir,join(brew,'Cellar/tunnel-client/2.0.0/bin'),join(brew,'bin'),join(brew,'etc'),join(home,'.config/tunnel-client')])
    await mkdir(d,{recursive:true,mode:0o700})
  return {root,dir,brew,home,options:{home,brewPrefixes:[brew]}}
}

test('exact single existing tunnel, no broad matching',()=>{
  assert.equal(singleTunnelId("control_plane:\n  tunnel_id: '"+tunnelId+"' # owned\n"),tunnelId)
  assert.equal(singleTunnelId("other_tunnel_id: "+tunnelId),null)
  assert.equal(singleTunnelId("tunnel_id: "+tunnelId+"\ntunnel_id: tunnel_"+'b'.repeat(32)),null)
})

test('guided setup imports only a recognized installed executable and enrolled sessions',async t=>{
  const f=await fixture(t)
  const bytes=Buffer.alloc(1500,7)
  const bin=join(f.brew,'Cellar/tunnel-client/2.0.0/bin/tunnel-client')
  await writeFile(bin,bytes,{mode:0o755})
  await symlink(bin,join(f.brew,'bin/tunnel-client'))
  await writeFile(join(f.brew,'etc/tunnel-client.yaml'),'control_plane:\n  tunnel_id: '+tunnelId+'\n',{mode:0o600})
  await writeFile(join(f.home,'.config/tunnel-client/runtime.key'),dummy+'\n',{mode:0o600})
  const first=await dotSetupPreview(f.dir,inventory,f.options)
  assert.equal(first.clientAvailable,true)
  assert.equal(first.keyAvailable,true)
  assert.equal(first.tunnelId,tunnelId)
  assert.deepEqual(first.sessions.map(x=>[x.id,x.title,x.selected]),[['owned-one','一号',false],['owned-two','二号',false]])
  assert.ok(!JSON.stringify(first).includes(dummy))
  await assert.rejects(guidedPairing(f.dir,inventory,{mode:'guided',tunnelId,sessionIds:['other']},f.options),/session_scope_invalid/)
  const prepared=await guidedPairing(f.dir,inventory,{mode:'guided',tunnelId,sessionIds:['owned-two']},f.options)
  assert.equal(prepared.clientSha256,createHash('sha256').update(bytes).digest('hex'))
  assert.equal((await stat(prepared.directory)).mode&0o777,0o700)
  assert.equal((await stat(join(prepared.directory,'runtime.key'))).mode&0o777,0o600)
  assert.equal(await readFile(join(prepared.directory,'runtime.key'),'utf8'),dummy+'\n')
  await saveStationDotPairing(f.dir,prepared)
  const second=await dotSetupPreview(f.dir,inventory,f.options)
  assert.deepEqual(second.sessions.filter(x=>x.selected).map(x=>x.id),['owned-two'])
  assert.ok(!JSON.stringify(second).includes(dummy))
  const noDetails=await guidedPairing(f.dir,inventory,{mode:'guided',tunnelId,sessionIds:[]},f.options)
  assert.equal(noDetails.globalActiveList,true)
  await saveStationDotPairing(f.dir,noDetails)
  assert.equal((await dotSetupPreview(f.dir,inventory,f.options)).sessions.some(x=>x.selected),false)

})

test('a PATH impostor or an out-of-cellar symlink is not trusted',async t=>{
  const f=await fixture(t)
  const other=join(f.root,'tunnel-client')
  await writeFile(other,Buffer.alloc(2048,1),{mode:0o755})
  await symlink(other,join(f.brew,'bin/tunnel-client'))
  assert.equal((await dotSetupPreview(f.dir,inventory,f.options)).clientAvailable,false)
  await assert.rejects(guidedPairing(f.dir,inventory,{mode:'guided',tunnelId,sessionIds:['owned-one'],runtimeKey:dummy},f.options),
    /official_client_missing/)
})

test('guided setup pins the actual Homebrew client and helpers without running the wrapper',async t=>{
  const f=await fixture(t)
  const keg=join(f.brew,'Cellar/tunnel-client/2.0.0')
  const bin=join(keg,'bin/tunnel-client')
  const helperDir=join(keg,'libexec')
  const payload=Buffer.alloc(2048)
  payload.writeUInt32BE(0xcffaedfe)
  const helper=Buffer.from(payload)
  helper[2047]=1
  const lib=join(helperDir,'tunnel-client')
  await mkdir(helperDir)
  await writeFile(bin,'#!/bin/bash\nexec "'+lib+'" "$@"\n',{mode:0o755})
  await symlink(bin,join(f.brew,'bin/tunnel-client'))
  await writeFile(lib,payload,{mode:0o755})
  await writeFile(join(helperDir,'cloudflared'),helper,{mode:0o755})
  await writeFile(join(helperDir,'cloudflared-manifest.json'),'{}')
  assert.equal((await dotSetupPreview(f.dir,inventory,f.options)).clientAvailable,true)
  const prepared=await guidedPairing(f.dir,inventory,{mode:'guided',tunnelId,sessionIds:[],runtimeKey:dummy},f.options)
  assert.deepEqual(await readFile(join(prepared.directory,'tunnel-client')),payload)
  assert.deepEqual(await readFile(join(prepared.directory,'cloudflared')),helper)
  assert.equal(await readFile(join(prepared.directory,'cloudflared-manifest.json'),'utf8'),'{}')
  assert.equal(prepared.clientSha256,createHash('sha256').update(payload).digest('hex'))
  await writeFile(bin,'#!/bin/bash\ntrue\nexec "'+lib+'" "$@"\n')
  assert.equal((await dotSetupPreview(f.dir,inventory,f.options)).clientAvailable,false)
  await writeFile(bin,'#!/bin/bash\nexec "'+lib+'" "$@"\n')
  await rm(lib)
  await symlink(bin,lib)
  assert.equal((await dotSetupPreview(f.dir,inventory,f.options)).clientAvailable,false)
})
