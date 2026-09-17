import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptanceEnvironment, runAcceptanceProcess } from './acceptance-process.mjs'

test('acceptance preserves ordinary configuration but excludes source aliases and parent test context', () => {
  const before = { PATH: '/bin', DSH_HOME: '/temporary/fixture', TSX_TSCONFIG_PATH: '/upstream/tsconfig.json', NODE_TEST_CONTEXT: 'child' }
  assert.deepEqual(acceptanceEnvironment(before), { PATH: '/bin', DSH_HOME: '/temporary/fixture' })
  assert.equal(before.TSX_TSCONFIG_PATH, '/upstream/tsconfig.json')
})

test('normal command captures stdout, stderr and exit status', async () => {
  const result = await runAcceptanceProcess({ argv: [process.execPath, '-e', 'console.log("out"); console.error("err"); process.exitCode=3'], cwd: process.cwd(), timeoutMs: 5_000 })
  assert.deepEqual(result, { exitCode: 3, timedOut: false, aborted: false, stdout: 'out\n', stderr: 'err\n' })
})

for (const kind of ['timeout', 'cancel']) test(`${kind} terminates a test worker that survives its parent and holds output pipes`, {
  skip: process.platform === 'win32' ? 'POSIX process-group contract' : false, timeout: 8_000,
}, async () => {
  const controller = new AbortController()
  const childScript = 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'
  const parentScript = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'inherit'}); console.log(child.pid); setInterval(()=>{},1000)`
  const start = Date.now()
  const result = runAcceptanceProcess({ argv: [process.execPath, '-e', parentScript], cwd: process.cwd(),
    timeoutMs: kind === 'timeout' ? 400 : 5_000, graceMs: 100, signal: controller.signal })
  const timer = kind === 'cancel' ? setTimeout(() => controller.abort(), 400) : undefined
  let done
  try { done = await result } finally { clearTimeout(timer) }
  assert.equal(done.timedOut, kind === 'timeout')
  assert.equal(done.aborted, kind === 'cancel')
  assert.ok(Date.now() - start < 4_000, 'An orphan worker must not hold the verifier open')
  const worker = Number(done.stdout.trim())
  assert.ok(Number.isSafeInteger(worker) && worker > 0)
  // Wait briefly for the OS to reap the known child after group termination.
  let alive = true
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(worker, 0) } catch (error) { if (error.code !== 'ESRCH') throw error; alive = false; break }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(alive, false, `Owned worker ${worker} survived termination`)
})

test('an already cancelled acceptance never starts a command', async () => {
  const result = await runAcceptanceProcess({ argv: [process.execPath, '-e', 'throw new Error("must not run")'],
    cwd: process.cwd(), timeoutMs: 500, signal: AbortSignal.abort() })
  assert.equal(result.aborted, true)
  assert.equal(result.stderr, '')
})
