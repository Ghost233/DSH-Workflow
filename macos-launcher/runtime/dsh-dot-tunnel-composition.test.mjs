import {createHash} from 'node:crypto'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter,once} from 'node:events'
import {createServer} from 'node:http'
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises'
import {lstatSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {composeBackendDotTunnel} from './dsh-dot-tunnel-composition.mjs'

const application=Promise.resolve({ctx:{fixture:true}})
const authorization='Bearer '+'x'.repeat(43)
const clientSha256=createHash('sha256').update('fixture-never-emit').digest('hex')
const tunnelId='tunnel_'+'1'.repeat(32)
const row=name=>({name,annotations:{readOnlyHint:true}})
test('disabled configuration neither inspects a directory nor opens plugin',()=>{
  assert.equal(composeBackendDotTunnel({enabled:false,directory:'/not-accessed',openDirectPlugin(){assert.fail()}},application),null)
})
test('dedicated readiness freezes one client, passes only file references and closes before plugin',async()=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'dsh-dot-compose-')))
  const steps=[], methods=[]
  let server, composed, authPath
  try{
    for(const [name,mode] of [['tunnel-client',0o700],['runtime.key',0o600],['upstream.authorization',0o600]])
      await writeFile(join(dir,name),'fixture-never-emit',{mode})
    server=createServer(async(req,res)=>{
      let body=''
      for await(const chunk of req)body+=chunk
      const {method,id}=JSON.parse(body)
      methods.push(method)
      if(req.headers.authorization!==authorization){res.writeHead(401);res.end();return}
      const result=method==='server/discover'?{supportedVersions:['2026-07-28'],capabilities:{tools:{}}}:
        {tools:[row('list_active_sessions'),row('read_synthetic_pilot')]}
      res.writeHead(200,{'content-type':'application/json'})
      res.end(JSON.stringify({jsonrpc:'2.0',id,result:{resultType:'complete',...result}}))
    }).listen(0,'127.0.0.1')
    await once(server,'listening')
    composed=composeBackendDotTunnel({enabled:true,directory:dir,tunnelId,clientSha256,publish:s=>steps.push(s),
      openDirectPlugin({ctx}){
        assert.equal(ctx.fixture,true)
        return {capability:'dsh.synthetic_active.read_only',endpoint:'http://127.0.0.1:'+server.address().port+'/mcp',
          authorization,close(){steps.push('plugin-stop')}}
      },
      spawnProcess(executable,args,opts){
        steps.push('spawn')
        assert.equal(executable,join(dir,'tunnel-client'))
        assert.ok(args.includes('--control-plane.api-key=file:'+join(dir,'runtime.key')))
        authPath=args.find(a=>a.startsWith('Authorization: file:')).slice('Authorization: file:'.length)
        assert.match(authPath.slice(dir.length),/^\/synthetic-upstream-[^/]+\/authorization$/)
        assert.equal(lstatSync(authPath).mode&0o777,0o600)
        assert.equal(readFileSync(authPath,'utf8'),authorization)
        assert.doesNotMatch(JSON.stringify({args,opts}),/fixture-never-emit|Bearer /)
        assert.equal(opts.stdio,'ignore')
        assert.equal(opts.shell,false)
        const child=Object.assign(new EventEmitter(),{pid:1,kill(signal){
          assert.equal(signal,'SIGTERM')
          steps.push('child-stop')
          child.emit('close')
        }})
        return child
      }},application)
    await Promise.all([composed.start(),composed.start()])
    await composed.start() // Native reconnect cannot request a second Station child.
    assert.deepEqual(methods,['server/discover','tools/list'])
    assert.deepEqual(steps,['spawn','child_started'])
    await Promise.all([composed.stop(),composed.stop()])
    assert.deepEqual(steps,['spawn','child_started','child-stop','stopped','plugin-stop'])
    assert.throws(()=>lstatSync(authPath),{code:'ENOENT'})
    assert.equal(readFileSync(join(dir,'upstream.authorization'),'utf8'),'fixture-never-emit')
  }finally{
    await composed?.stop()
    if(server)await new Promise(r=>{server.close(r);server.closeAllConnections()})
    await rm(dir,{recursive:true,force:true})
  }
})
test('refuses foreign capability and releases a late direct plugin receipt',async()=>{
  let closes=0
  const open=Promise.withResolvers(), entered=Promise.withResolvers(), released=Promise.withResolvers()
  const config={enabled:true,directory:'/must-not-inspect',tunnelId,clientSha256,spawnProcess(){assert.fail()}}
  const foreign=composeBackendDotTunnel({...config,openDirectPlugin(){
    return {capability:'station.legacy',close(){closes++}}
  }},application)
  await foreign.start();await foreign.stop()
  assert.equal(closes,1)
  const late=composeBackendDotTunnel({...config,openDirectPlugin:()=>{entered.resolve();return open.promise}},application)
  const start=late.start()
  await entered.promise
  await late.stop()
  open.resolve({capability:'dsh.synthetic_active.read_only',close(){closes++;released.resolve()}})
  await Promise.all([start,released.promise])
  assert.equal(closes,2)
})
