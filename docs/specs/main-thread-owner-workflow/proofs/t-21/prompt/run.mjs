import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../../..')
const out = resolve(process.argv[2] ?? join(here, 'development'))
await mkdir(out, { recursive: true })
const hook = join(repo, 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs')
const scenarios = []
async function child(root, mode, kill) {
  const p = fork(join(here, 'worker.mjs'), [repo, root, mode], {
    execArgv: ['--import', hook], cwd: join(repo, 'deepseek-harness'),
    env: { ...process.env, TSX_TSCONFIG_PATH: join(repo, 'deepseek-harness/tsconfig.json') },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let stdout = '', stderr = '', payload
  p.stdout.on('data', x => { stdout += x })
  p.stderr.on('data', x => { stderr += x })
  const timer = setTimeout(() => p.kill('SIGKILL'), 15000)
  return new Promise(resolveDone => {
    p.on('message', value => { payload = value; if (kill && value.phase === 'kill-ready') p.kill('SIGKILL') })
    p.on('error', error => { payload = { phase: 'error', error: String(error) } })
    p.on('exit', (code, signal) => { clearTimeout(timer); resolveDone({ mode, pid: p.pid, code, signal, payload, stdout, stderr }) })
  })
}
for (const mode of ['pending', 'followup-return', 'running', 'completed']) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-t21-prompt-'))
  const row = { mode, root, start: new Date().toISOString() }
  try {
    row.first = await child(root, mode, true)
    if (row.first.payload?.phase !== 'kill-ready' || row.first.signal !== 'SIGKILL') throw new Error('first process did not reach declared crash boundary')
    await cp(root, join(out, mode + '-disk-before-restart'), { recursive: true })
    row.restart = await child(root, `restart-${mode}`, false)
    await cp(root, join(out, mode + '-disk-after-restart'), { recursive: true })
    if (row.restart.payload?.phase !== 'result' || row.restart.code !== 0) throw new Error('restart probe failed; inspect raw payload')
    const first = row.first.payload
    const next = row.restart.payload
    if (mode === 'pending') {
      assert.match(first.duplicatePendingError, /already pending/)
      assert.deepEqual(next.resumed.pendingIds, ['t21-fixed-prompt'])
      assert.equal(next.callsAfterReplay, 0)
    }
    if (mode === 'running') {
      assert.equal(first.calls, 1)
      assert.equal(first.memory.turnEnds.length, 0)
      assert.equal(next.physicalBefore.turnEnds.length, 0)
      assert.equal(next.before.turnEnds[0]?.reason.kind, 'interrupted')
      assert.equal(next.callsAfterReplay, 0)
    }
    if (mode === 'completed') {
      assert.equal(first.memory.turnEnds[0]?.reason.kind, 'completed')
      assert.equal(next.before.userMessages, 1)
      assert.equal(next.after.userMessages, 2)
      assert.equal(next.callsBeforeReplay, 0)
      assert.equal(next.callsAfterReplay, 1)
      assert.equal(next.replayError, undefined)
    }
    row.observationChecked = true
  } catch (error) { row.error = String(error) }
  row.end = new Date().toISOString()
  scenarios.push(row)
  await writeFile(join(out, `${mode}.json`), JSON.stringify(row, null, 2))
  await rm(root, { recursive: true, force: true })
}
await writeFile(join(out, 'results.json'), JSON.stringify(scenarios, null, 2))
console.log(JSON.stringify(scenarios.map(({ mode, error, first, restart }) => ({ mode, error, first: first?.payload, restart: restart?.payload && { ...restart.payload, events: undefined } })), null, 2))
process.exitCode = scenarios.some(s => s.error) ? 1 : 0
