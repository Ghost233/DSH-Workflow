import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pauseSuperagentBeforeStartup } from './superagent-bootstrap.mjs'
import { protectedProjectPaths } from './superagent-sandbox.mjs'

test('startup pauses through the upstream interface before enabling old commands', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-bootstrap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project'), work = join(root, 'work')
  await mkdir(project); await mkdir(work)
  execFileSync('git', ['init', '-q', project])
  const probe = createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const webPort = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const cli = join(root, 'fixture.cjs'), unsafe = join(work, 'unsafe'), paused = join(work, 'paused')
  await writeFile(cli, `const fs = require('node:fs'), http = require('node:http'), { spawnSync } = require('node:child_process');
const result = spawnSync('/bin/sh', ['-c', 'printf unsafe > "$1"', 'test', process.env.UNSAFE]);
if (result.error?.code !== 'EPERM') process.exit(2);
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/orchestrator/api/tickets?')) return res.end(JSON.stringify({ items: req.url.includes('ended') ? [{ id: 'old' }] : [] }));
  if (req.url !== '/orchestrator/api/executor/pause' || req.method !== 'POST') return res.writeHead(404).end();
  let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
    if (JSON.parse(body).paused !== true) return res.writeHead(400).end();
    fs.writeFileSync(process.env.PAUSED, 'yes'); res.end(JSON.stringify({ paused: true }));
  });
});
server.listen(Number(process.env.WEB_PORT), '127.0.0.1', () => console.log('dsh web: http://127.0.0.1:' + process.env.WEB_PORT));
process.on('SIGINT', () => server.close(() => process.exit(0)));`)
  const protectedPaths = await protectedProjectPaths(project, work)
  const result = await pauseSuperagentBeforeStartup({ directory: work, node: await realpath(process.execPath), cli, webPort,
    environment: { ...process.env, WEB_PORT: String(webPort), UNSAFE: unsafe, PAUSED: paused },
    protectedPaths, writableRoots: [await realpath(work)], patches: [{ insert: [{ id: 'example' }] }] })
  assert.equal(await readFile(paused, 'utf8'), 'yes')
  assert.equal(result.hasTickets, true)
  await assert.rejects(readFile(unsafe), { code: 'ENOENT' })
  assert.deepEqual((await readdir(work)).filter(name => name.startsWith('station-bootstrap-')), [])
})
