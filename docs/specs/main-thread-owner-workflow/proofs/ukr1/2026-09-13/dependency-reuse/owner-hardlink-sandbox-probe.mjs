import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { kernelNativeHost } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/fixtures/kernel-native-host.mjs'
import { NativeCommandEffects } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/native-command-effects.mjs'

const state = await mkdtemp(join(tmpdir(), 'dsh-hardlink-host-'))
const boundary = await mkdtemp('/Volumes/LargeStorage/code/DSH-Workflow/.native-hardlink-probe-')
const base = join(boundary, 'base')
const cwd = join(boundary, 'candidate')
const output = '/private/tmp/owner-hardlink-sandbox-probe-result.json'
await mkdir(base)
await mkdir(cwd)
const baseFile = join(base, 'payload')
await writeFile(baseFile, 'immutable', { mode: 0o444 })
const originalMode = (await stat(baseFile)).mode & 0o777
const host = await kernelNativeHost(state, { executable: true })
const commands = new NativeCommandEffects(host.ctx, { root: join(state, 'commands') })
try {
  const program = `const fs=require('node:fs');let linkCode='OK',chmodCode='SKIP',writeCode='SKIP';try{fs.linkSync(${JSON.stringify(baseFile)},'alias')}catch(e){linkCode=e.code||e.name}if(linkCode==='OK'){try{fs.chmodSync('alias',0o644);chmodCode='OK'}catch(e){chmodCode=e.code||e.name}try{fs.writeFileSync('alias','corrupt');writeCode='OK'}catch(e){writeCode=e.code||e.name}}console.log(JSON.stringify({linkCode,chmodCode,writeCode}))`
  const result = await commands.execute({ action: { id: 'hardlink-probe', input: {} }, verificationId: 'hardlink', cwd,
    immutableInputPaths: [base], immutableInputDigest: 'a'.repeat(64), argv: [process.execPath, '-e', program] })
  const report = { contract: 'DSH_NATIVE_IMMUTABLE_HARDLINK_PROBE_V1', ok: result.ok, exitCode: result.exitCode,
    child: JSON.parse(result.stdout.trim()), baseContent: await readFile(baseFile, 'utf8'),
    baseMode: (await stat(baseFile)).mode & 0o777, originalMode }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify(report))
} finally {
  await commands.close()
  await host.close()
  await rm(state, { recursive: true, force: true })
  await rm(boundary, { recursive: true, force: true })
}
