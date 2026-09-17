import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runAcceptanceProcess } from './acceptance-process.mjs'
import { sourceIdentity, artifactHashes } from './harness-runtime.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const names = ['workflow-engine', 'workflow-diagnostics', 'workflow-store', 'workflow-host', 'workflow-runner', 'submission-pipeline', 'workflow-git-effects',
  'workflow-delivery', 'isolated-attempt-retirement', 'native-kernel-effects', 'native-owner-kernel', 'native-owner-planning-package', 'owner-dispatch-binding',
  'native-public-owner-kernel', 'native-registry-kernel', 'kernel-dashboard', 'client-bundle', 'kernel-root-scope', 'kernel-preset-inheritance', 'kernel-full-preset', 'kernel-process-range', 'kernel-public-migration', 'kernel-intent', 'kernel-pipeline-smoke', 'kernel-planning-smoke',
  'orchestrator-documents', 'planning-authority-native', 'planning-source-chain-native', 'planning-write-journal-native', 'planning-packages',
  'public-owner-change', 'public-owner-adapter', 'public-owner-plan', 'convergence', 'repair-prompt-context']
const files = [...names.map(name => `owner-workflow-plugin/test/${name}.test.mjs`),
  'owner-workflow-plugin/test/kernel-host-readiness.test.mjs', 'owner-workflow-plugin/test/kernel-plan-contract.test.mjs', 'owner-workflow-plugin/test/production-entry.test.mjs',
  'scripts/daily-workflow-launch.test.mjs', 'scripts/web-host-lifecycle.test.mjs', 'scripts/kernel-launch-composition.test.mjs', 'scripts/kernel-web-host.test.mjs', 'scripts/kernel-web-launch.test.mjs', 'scripts/run-workflow-tests.test.mjs', 'scripts/project-plugins.test.mjs', 'scripts/project-plugins-native.test.mjs',
  'sol-efficiency-plugin/test/integration.test.mjs',
  'approve-for-me-workflow-plugin/test/host.test.mjs']
const hash = value => createHash('sha256').update(value).digest('hex')
export async function kernelCandidate() {
  const entries = []
  const walk = async directory => {
    for (const item of (await readdir(join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'vendor', '.git', '.dsh-workflow', '.DS_Store'].includes(item.name)) continue
      const path = `${directory}/${item.name}`
      if (item.isDirectory()) await walk(path)
      else if (item.isFile()) entries.push([path, hash(await readFile(join(root, path)))])
      else throw new Error(`Candidate contains a non-regular source: ${path}`)
    }
  }
  for (const directory of ['owner-workflow-plugin', 'sol-efficiency-plugin', 'approve-for-me-workflow-plugin', 'scripts']) await walk(directory)
  for (const file of ['package.json', 'project-plugins.lock.json', 'dsh-runtime.json',
    'start-owner-workflow.sh',
    'docs/specs/main-thread-owner-workflow/unified-kernel-replacement-plan.md',
    'docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md']) entries.push([file, hash(await readFile(join(root, file)))])
  const harness = { source: await sourceIdentity(join(root, 'deepseek-harness')),
    artifacts: await artifactHashes(join(root, 'deepseek-harness')) }
  return { digest: hash(JSON.stringify({ entries, harness })), files: entries, harness }
}
export async function runKernelRegression() {
const before = await kernelCandidate()
const directory = join(tmpdir(), `ukr1-regression-${Date.now()}-${before.digest.slice(0, 12)}`)
await mkdir(directory, { mode: 0o700 })
const startedAt = new Date().toISOString()
const result = await runAcceptanceProcess({ argv: [process.execPath, join(root, 'scripts/run-workflow-tests.mjs'), ...files], cwd: root, timeoutMs: 180_000 })
const after = await kernelCandidate()
await writeFile(join(directory, 'tests.log'), result.stdout + result.stderr)
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
  const matches = [...result.stdout.matchAll(new RegExp(`(?:^|\\n)[#ℹ] ${key} (\\d+)(?:\\r?\\n|$)`, 'g'))]
  return [key, matches.length ? Number(matches.at(-1)[1]) : null]
}))
const status = result.timedOut ? 'timed_out' : result.aborted ? 'cancelled' : before.digest !== after.digest ? 'stale_candidate'
  : result.exitCode !== 0 ? 'failed' : !counts.tests ? 'not_collected' : counts.fail || counts.cancelled || counts.skipped || counts.todo ? 'incomplete' : 'passed'
const report = { contract: 'DSH_KERNEL_REGRESSION_REPORT_V1', startedAt, completedAt: new Date().toISOString(), status,
  candidate: before, afterDigest: after.digest, files, counts, exitCode: result.exitCode, timedOut: result.timedOut,
  log: join(directory, 'tests.log'), scope: 'kernel and native deterministic regression',
  completeUkrAcceptance: false,
  missingEvidence: ['full AC/KAC fault matrix', 'original configuration real-model browser run'] }
const path = join(directory, 'report.json'); await writeFile(path, JSON.stringify(report, null, 2) + '\n')
return { ...report, reportPath: path }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runKernelRegression()
  console.log(JSON.stringify({ status: report.status, counts: report.counts, candidateDigest: report.candidate.digest,
    report: report.reportPath, completeUkrAcceptance: false }))
  process.exitCode = report.status === 'passed' ? 0 : 1
}
