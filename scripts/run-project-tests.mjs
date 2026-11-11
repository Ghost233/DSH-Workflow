import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { readdir, lstat } from 'node:fs/promises'
import { spawn } from 'node:child_process'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Project tests require macOS ARM64')

const root = fileURLToPath(new URL('../', import.meta.url))
const requireHarness = process.env.DSH_TEST_RUNTIME_ROOT
  ? createRequire(join(process.env.DSH_TEST_RUNTIME_ROOT, 'package.json'))
  : createRequire(new URL('../deepseek-harness/package.json', import.meta.url))
let loader
try { loader = requireHarness.resolve('tsx') } catch {
  throw new Error('The fixed DSH test dependencies must provide tsx; no test ran.')
}
const specified = process.argv.slice(2)
const files = specified.length ? specified.map(file => resolve(root, file))
  : (await Promise.all(['agent-observation-plugin/test', 'project-coordination-plugin/test', 'scripts', 'macos-launcher/runtime'].map(async directory =>
    (await readdir(join(root, directory))).filter(file => file.endsWith('.test.mjs') && file !== 'packaged-smoke.test.mjs')
      .sort().map(file => join(root, directory, file))))).flat()
console.log(JSON.stringify({ projectTestFiles: files.map(file => file.slice(root.length)) }))
if (!files.length) throw new Error('No project test files were selected')
if (new Set(files).size !== files.length) throw new Error('Duplicate test files were selected')
for (const file of files) {
  if (!(await lstat(file)).isFile()) throw new Error(`Selected test is not a regular file: ${file}`)
}
// Real Host fixtures hash large payloads and use independent processes; run them outside the shared worker pool.
const isolated = ['web-packaged-host.test.mjs', 'web-service-integration.test.mjs', 'model-authorization-integration.test.mjs', 'service-node-runtime.test.mjs', 'web-host.test.mjs']
  .map(name => join(root, 'macos-launcher/runtime', name))
const groups = [files.filter(file => !isolated.includes(file)), ...isolated.filter(file => files.includes(file)).map(file => [file])]
let child, interrupted = false, exitCode = 0
const stop = () => { interrupted = true; child?.kill('SIGTERM') }
process.once('SIGINT', stop); process.once('SIGTERM', stop)
try {
  for (const group of groups) {
    if (interrupted || !group.length) continue
    const code = await new Promise(accept => {
      child = spawn(process.execPath, ['--import', loader, '--import', join(root, 'scripts/harness-test-loader.mjs'),
        '--test', '--test-concurrency=4', ...group], { cwd: root, stdio: 'inherit' })
      child.once('error', error => { console.error(error.message); accept(1) })
      child.once('close', (code, signal) => accept(code ?? (signal ? 1 : 0)))
    })
    child = undefined
    if (code !== 0 && exitCode === 0) exitCode = code
  }
} finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
  process.exitCode = interrupted ? (exitCode || 1) : exitCode
}
