import { readFile, writeFile, realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, basename } from 'node:path'

// Test-copy instrumentation only. Neither frozen inputs nor product assembly invoke this script.
const [root, expectedSha] = process.argv.slice(2)
if (!root || !expectedSha || !root.startsWith(`/private/tmp/dsh-launcher-local-${process.getuid()}/dsh-s02-`)
  || basename(root).includes('/') || await realpath(root) !== root) throw new Error('Quit trace requires its physical owned fixture')
const owner = await stat(root)
if (owner.uid !== process.getuid() || (owner.mode & 0o777) !== 0o700) throw new Error('Quit trace fixture ownership mismatch')
const main = join(root, 'resources/desktop/DeepSeek Harness.app/Contents/Resources/app/lib/main.js')
const member = await stat(main)
if (await realpath(main) !== main || !member.isFile() || member.nlink !== 1 || member.uid !== process.getuid()) {
  throw new Error('Quit trace main is not a regular owned copy')
}
const original = await readFile(main, 'utf8')
const digest = value => createHash('sha256').update(value).digest('hex')
if (digest(original) !== expectedSha || original.includes('DEBUG_S02_QUIT')) throw new Error('Quit trace source hash mismatch')
const trace = join(root, 'desktop-quit-trace.log')
const prefix = `import { appendFileSync as s02AppendQuitTrace } from 'node:fs';
const s02QuitTrace = label => { try { s02AppendQuitTrace(${JSON.stringify(trace)}, 'DEBUG_S02_QUIT ' + label + '\\n', { mode: 0o600 }); } catch {} };
app.on('will-quit', () => s02QuitTrace('will-quit'));
app.on('quit', () => s02QuitTrace('quit'));
process.on('exit', code => s02QuitTrace(code === 0 ? 'process-exit-zero' : 'process-exit-nonzero'));
`
const patches = [
  ['finish-enter', 'const finishQuit = () => {', 'const finishQuit = () => {\n\t\ts02QuitTrace("finish-enter");'],
  ['before-quit', 'app.on("before-quit", (event) => {', 'app.on("before-quit", (event) => {\n\t\ts02QuitTrace(quitting ? "before-quit-already-quitting" : "before-quit-first");'],
  ['promise-boundaries', `		Promise.all([
			Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()),
			backend.close(),
			platformView.dispose().catch((error) => {
				console.error(error);
			})
		]).catch((error) => {
			console.error(error);
		}).finally(() => {
			app.quit();
		});`, `		Promise.all([
			(s02QuitTrace("policy-start"), Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()).finally(() => s02QuitTrace("policy-settled"))),
			(s02QuitTrace("backend-start"), backend.close().finally(() => s02QuitTrace("backend-settled"))),
			(s02QuitTrace("platform-start"), platformView.dispose().finally(() => s02QuitTrace("platform-settled"))).catch((error) => {
				console.error(error);
			})
		]).catch((error) => {
			console.error(error);
		}).finally(() => {
			s02QuitTrace("all-cleanup-settled");
			s02QuitTrace("app-quit-before");
			app.quit();
			s02QuitTrace("app-quit-returned");
		});`],
]
let content = original
for (const [label, before, after] of patches) {
  if (content.split(before).length !== 2) throw new Error(`Quit trace unique anchor mismatch: ${label}`)
  content = content.replace(before, after)
}
content = prefix + content
let reversed = content.slice(prefix.length)
for (const [, before, after] of [...patches].reverse()) reversed = reversed.replace(after, before)
if (reversed !== original) throw new Error('Quit trace is not exactly reversible')
await writeFile(main, content)
process.stdout.write(JSON.stringify({ schema: 1, originalMainSha256: expectedSha,
  instrumentedMainSha256: digest(content), trace, prefix: 'DEBUG_S02_QUIT',
  anchors: patches.map(([label]) => ({ label, count: 1 })),
  promiseBoundaries: ['policy', 'backend', 'platform'], controlFlowChanged: false }) + '\n')
