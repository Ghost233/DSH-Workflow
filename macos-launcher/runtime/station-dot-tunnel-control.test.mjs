import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,chmod,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createStationDotTunnelControl,readTunnelPreference,writeTunnelPreference} from './station-dot-tunnel-control.mjs'

test('missing config is visible, toggle persists, and only the tunnel is stopped',async()=>{
  let saved, config, starts=0, stops=0, late
  const control=createStationDotTunnelControl({
    getConfig:()=>config,
    readEnabled:()=>saved,
    writeEnabled:value=>{saved=value},
    createTunnel:(_,publish)=>{
      late=publish
      return {start:async()=>{starts++;publish('child_started')},stop:async()=>{stops++;publish('stopped')}}
    },
  })
  assert.deepEqual(await control.start(),{enabled:false,state:'off',connected:null})
  assert.deepEqual(await control.setEnabled(true),{enabled:true,state:'missing_config',connected:null})
  assert.equal(saved,true)
  assert.equal(starts,0)
  config={configured:true}
  assert.deepEqual(await control.setEnabled(true),{enabled:true,state:'client_running',connected:null})
  assert.equal(starts,1)
  await control.setEnabled(true)
  assert.equal(starts,1)
  assert.deepEqual(await control.setEnabled(false),{enabled:false,state:'off',connected:null})
  late('child_started')
  assert.equal(control.status().state,'off')
  assert.equal(stops,1)
  assert.equal(saved,false)
})

test('pre-existing valid config autostarts once but remembers explicit opt-out', async()=>{
  let saved, starts=0, stops=0
  const create = () => createStationDotTunnelControl({
    getConfig:()=>({}),readEnabled:()=>saved,writeEnabled:value=>{saved=value},
    createTunnel:(_,publish)=>({start:async()=>{starts++;publish('child_started')},stop:async()=>{stops++}}),
  })
  const first=create()
  assert.equal((await first.start()).state,'client_running')
  await first.setEnabled(false)
  await first.dispose()
  assert.equal((await create().start()).state,'off')
  assert.equal(starts,1)
  assert.equal(stops,1)
})

test('preference uses private atomic file and rejects unsafe reads',async t=>{
  const root=await mkdtemp(join(tmpdir(),'station-dot-preference-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const path=join(root,'control.json')
  assert.equal(await readTunnelPreference(path),undefined)
  await writeTunnelPreference(path,true)
  assert.equal(await readTunnelPreference(path),true)
  await chmod(path,0o644)
  await assert.rejects(()=>readTunnelPreference(path),/tunnel_preference_invalid/)
  const link=join(root,'alias.json')
  await symlink(path,link)
  await assert.rejects(()=>readTunnelPreference(link),/tunnel_preference_unavailable/)
  await writeFile(path,'{"enabled":true,"untrusted":1}')
})
