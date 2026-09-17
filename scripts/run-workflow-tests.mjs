import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { readdir, lstat } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const requireHarness = createRequire(new URL('../deepseek-harness/package.json', import.meta.url))
let loader
try { loader = requireHarness.resolve('tsx') } catch {
  throw new Error('The fixed DSH development dependency graph must provide tsx for native integration tests; no test ran.')
}
const specified = process.argv.slice(2)
const files = specified.length ? specified.map(file => resolve(root, file))
  : (await readdir(join(root, 'owner-workflow-plugin/test'))).filter(file => file.endsWith('.test.mjs'))
    .sort().map(file => join(root, 'owner-workflow-plugin/test', file))
if (!files.length) throw new Error('No workflow test files were selected')
if (new Set(files).size !== files.length) throw new Error('Duplicate test files were selected')
for (const file of files) {
  if (!(await lstat(file)).isFile()) throw new Error(`Selected test is not a regular file: ${file}`)
}
// Each native file launches its own DSH host and nested subprocess tests.
// Bound suite-level fan-out independently of each workflow's tested capacity;
// retain the actual scenario deadlines instead of extending them under load.
const child = spawn(process.execPath, ['--import', loader, '--import', join(root, 'scripts/harness-test-loader.mjs'), '--test', '--test-concurrency=4', ...files], { cwd: root, stdio: 'inherit' })
const stop = () => child.kill('SIGTERM')
process.once('SIGINT', stop); process.once('SIGTERM', stop)
child.once('error', error => { console.error(error.message); process.exitCode = 1 })
child.once('close', (code, signal) => {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
  process.exitCode = code ?? (signal ? 1 : 0)
})
