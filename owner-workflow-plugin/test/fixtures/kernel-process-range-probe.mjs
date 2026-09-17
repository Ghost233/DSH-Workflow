import { mkdtemp, writeFile, readFile, access, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './kernel-native-host.mjs'
import { NativeCommandEffects } from '../../src/native-command-effects.mjs'
import { isManagedRangeStopped } from '../../src/execution-evidence.mjs'

// Bounded diagnostic: its daemon can write only in this temporary sandbox and
// always exits within eight seconds. Never target a user process or directory.
const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-range-probe-')))
let host, commands
const exists = path => access(path).then(() => true, () => false)
try {
  const source = join(root, 'probe.py')
  await writeFile(source, `import os, time
from pathlib import Path
root = Path(${JSON.stringify(root)})
if os.fork() == 0:
    os.setsid()
    if os.fork() != 0:
        os._exit(0)
    null = os.open('/dev/null', os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(null, fd)
    (root / 'ready').write_text(str(os.getpid()))
    deadline = time.monotonic() + 8
    while not (root / 'release').exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    (root / 'finished').write_text(str(time.time_ns()))
    os._exit(0)
deadline = time.monotonic() + 4
while not (root / 'ready').exists() and time.monotonic() < deadline:
    time.sleep(0.01)
os._exit(0 if (root / 'ready').exists() else 2)
`)
  host = await kernelNativeHost(root, { executable: true })
  commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  const result = await commands.execute({ action: { id: 'range-probe', input: {} }, argv: ['/usr/bin/python3', '-S', source], cwd: root,
    verificationId: 'detached-child', timeoutMs: 12_000 })
  const receiptAt = Date.now()
  const finishedBeforeRelease = await exists(join(root, 'finished'))
  await writeFile(join(root, 'release'), 'fixture cleanup')
  const until = Date.now() + 9_000
  while (!await exists(join(root, 'finished')) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20))
  const finished = await readFile(join(root, 'finished'), 'utf8').catch(() => null)
  const escapedWriter = !finishedBeforeRelease && finished !== null
  const scopeHonest = isManagedRangeStopped(result) && !Object.hasOwn(result, 'writersStopped')
    && !Object.hasOwn(result, 'sourceWritesClosed') && result.exitCode === 0 && finished !== null
  console.log(JSON.stringify({ contract: 'DSH_NATIVE_RANGE_PROBE_V2', platform: process.platform,
    status: scopeHonest ? 'scoped_receipt_confirmed' : 'contract_violation', managedRangeStopped: result.managedRangeStopped,
    terminationScope: result.terminationScope, claimsAllWritersStopped: Object.hasOwn(result, 'writersStopped'),
    finishedBeforeRelease, escapedWriter, receiptAt, finishedAtNs: finished, exitCode: result.exitCode,
    sandbox: result.enforcement, helperFinished: finished !== null, stderr: result.stderr }))
  process.exitCode = scopeHonest ? 0 : 1
} finally {
  await writeFile(join(root, 'release'), 'fixture cleanup')
  if (await exists(join(root, 'ready'))) {
    const until = Date.now() + 9_000
    while (!await exists(join(root, 'finished')) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20))
  }
  await commands?.close(); await host?.close(); await rm(root, { recursive: true, force: true })
}
