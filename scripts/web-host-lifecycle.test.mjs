import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchWebHost } from './web-host-lifecycle.mjs'

async function freePort() {
  const server = http.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ukr-web-host-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const script = join(root, 'server.mjs')
  await writeFile(script, `import http from 'node:http';
const mode=process.argv[3];
const server=http.createServer((req,res)=>{
  if (req.url!=='/owner-workflow/api/health') {res.writeHead(404);res.end();return;}
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({contract:'DSH_WEB_HOST_READY_V1',instanceId:mode==='wrong-instance'?'different':process.env.DSH_OWNER_WORKFLOW_HOST_INSTANCE,
    components:{owner:'ready',sol:'ready',approval:mode==='missing-plugin'?'offline':'ready'}}));
});
server.listen(Number(process.argv[2]),'127.0.0.1',()=>console.log('fixture-listening'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
if(mode==='early-exit') server.close(()=>process.exit(0));
`)
  return { root, script, logRoot: join(root, 'logs') }
}

test('occupied user port refuses launch without changing its response or existing logs', async t => {
  const f = await fixture(t)
  const server = http.createServer((_req, res) => res.end('existing-user-service'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const port = server.address().port
  await assert.rejects(launchWebHost({ argv: [process.execPath, f.script, String(port), 'good'], cwd: f.root, logRoot: f.logRoot, port }), /existing listener was preserved/)
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'existing-user-service')
  await assert.rejects(readdir(f.logRoot), { code: 'ENOENT' })
})

for (const mode of ['wrong-instance', 'missing-plugin', 'early-exit']) test(`Web readiness rejects ${mode} and drains only its own test child`, async t => {
  const f = await fixture(t), port = await freePort()
  await assert.rejects(launchWebHost({ argv: [process.execPath, f.script, String(port), mode], cwd: f.root,
    logRoot: f.logRoot, port, startupTimeoutMs: 700, pollMs: 40, onReady: () => assert.fail('must not report readiness') }), /did not become ready/)
  assert.equal((await readdir(f.logRoot)).length, 1)
  await assert.rejects(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) }))
})

test('instance-bound success uses distinct logs and preserves caller environment across two lifetimes', async t => {
  const f = await fixture(t)
  const saved = JSON.stringify(process.env), records = []
  for (let i = 0; i < 2; i++) {
    const controller = new AbortController(), port = await freePort()
    const result = await launchWebHost({ argv: [process.execPath, f.script, String(port), 'good'], cwd: f.root,
      logRoot: f.logRoot, port, signal: controller.signal, startupTimeoutMs: 2_000, pollMs: 40,
      onReady: record => { records.push(record); controller.abort() } })
    assert.equal(result.ready, true); assert.equal(result.code, 0)
    assert.match(await readFile(result.logPath, 'utf8'), /fixture-listening/)
  }
  assert.notEqual(records[0].instanceId, records[1].instanceId)
  assert.notEqual(records[0].logPath, records[1].logPath)
  assert.equal((await readdir(f.logRoot)).length, 2)
  assert.equal(JSON.stringify(process.env), saved)
})

test('early host exit also stops its surviving process-group child', async t => {
  const f = await fixture(t), port = await freePort()
  const descendant = join(f.root, 'descendant.mjs')
  await writeFile(descendant, `import http from 'node:http';
const server=http.createServer((req,res)=>res.end('owned-descendant'));
process.on('SIGTERM',()=>{});
server.listen(Number(process.argv[2]),'127.0.0.1',()=>process.send('ready'));
`)
  await writeFile(f.script, `import { fork } from 'node:child_process';
const child=fork(${JSON.stringify(descendant)},[process.argv[2]],{stdio:['ignore','ignore','ignore','ipc']});
child.once('message',()=>process.exit(7));
`)
  await assert.rejects(launchWebHost({ argv: [process.execPath, f.script, String(port)], cwd: f.root,
    logRoot: f.logRoot, port, startupTimeoutMs: 2_000, pollMs: 30 }), error => error.exit?.code === 7)
  const until = Date.now() + 2_000
  let listening = true
  while (listening && Date.now() < until) {
    try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(100) }) }
    catch { listening = false }
    if (listening) await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(listening, false, 'owned descendant must not retain the listening port after host exit')
})
