import test from 'node:test'
import assert from 'node:assert/strict'
import {chmod,mkdir,mkdtemp,realpath,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {loadStationDotTunnelConfig,openStationDotPromptHost,stationDotHostPromptDigest} from './station-dot-host-config.mjs'

test('tunnel is disabled by absence and accepts only the exact owner-private configuration',async t=>{
  const d=await mkdtemp(join(tmpdir(),'station-dot-host-config-'))
  t.after(()=>rm(d,{recursive:true,force:true}))
  const p=join(d,'station-dot-tunnel.json')
  assert.equal(await loadStationDotTunnelConfig(p),null)
  const cfg={directory:'/private/tmp/owned',tunnelId:'tunnel_'+'a'.repeat(32),clientSha256:'b'.repeat(64)}
  await writeFile(p,JSON.stringify(cfg),{mode:0o600})
  assert.deepEqual(await loadStationDotTunnelConfig(p),{enabled:true,...cfg})
  await chmod(p,0o644)
  await assert.rejects(loadStationDotTunnelConfig(p),/private_config_invalid/)
  await chmod(p,0o600)
  await writeFile(p,JSON.stringify({...cfg,endpoint:'https://example.invalid'}))
  await assert.rejects(loadStationDotTunnelConfig(p),/tunnel_config_invalid/)
})

test('exact owner grant is mandatory; changed draft denied; replay after restart never dispatches',async t=>{
  const d=await realpath(await mkdtemp(join(tmpdir(),'station-dot-prompt-host-')))
  t.after(()=>rm(d,{recursive:true,force:true}))
  const directory=join(d,'approval'),sessions=[{id:'allowed',label:'Fixture'}]
  const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', draft='synthetic local content'
  let calls=0
  const cfg={directory,sessions,bearer:'a'.repeat(43),now:()=>1000,
    controller:{async prompt(v){calls++;assert.equal(v.sessionId,'allowed');assert.equal(v.requestId,requestId);return {accepted:true}}}}
  assert.equal(await openStationDotPromptHost(cfg),null)
  await mkdir(directory,{mode:0o700})
  let host=await openStationDotPromptHost(cfg)
  t.after(()=>host?.close())
  const req={sessionId:'allowed',requestId,draft}
  await assert.rejects(host.deliver(req),/owner_authorization_required/)
  const grant=join(directory,requestId+'.json')
  await writeFile(grant,JSON.stringify({sessionId:'allowed',digest:stationDotHostPromptDigest(sessions,'allowed',draft),expiresAt:1200}),{mode:0o600})
  await assert.rejects(host.deliver({...req,draft:'different'}),/owner_authorization_required/)
  await assert.rejects(host.deliver({...req,sessionId:'not-allowed'}),/target_unapproved/)
  assert.equal((await host.deliver(req)).state,'inbox_accepted')
  host.close()
  host=await openStationDotPromptHost(cfg)
  assert.equal((await host.deliver(req)).state,'inbox_accepted')
  assert.equal(calls,1)
})
