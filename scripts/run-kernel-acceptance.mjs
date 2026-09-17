import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { kernelCandidate, runKernelRegression } from './run-kernel-regression.mjs'
import { runAcceptanceProcess } from './acceptance-process.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const before = await kernelCandidate()
const regression = await runKernelRegression()
const directory = dirname(regression.reportPath)
const checks = []
for (const [name, args] of [
  ['owner_client_build', ['owner-workflow-plugin/scripts/build-client.mjs', '--check']],
  ['approval_build', ['approve-for-me-workflow-plugin/scripts/build.mjs', '--check']],
]) {
  const result = await runAcceptanceProcess({ argv: [process.execPath, ...args], cwd: root, timeoutMs: 30_000 })
  const log = join(directory, `${name}.log`)
  await writeFile(log, result.stdout + result.stderr)
  checks.push({ name, status: result.timedOut ? 'timed_out' : result.aborted ? 'cancelled' : result.exitCode === 0 ? 'passed' : 'failed',
    exitCode: result.exitCode, log })
}
// Enumerate the actual contracts. A regression filename/tag alone cannot prove
// every clause of an AC, its real-model requirement or production cutover.
const contracts = [
  ['AC', 32, 'docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md'],
  ['KAC', 24, 'docs/specs/main-thread-owner-workflow/unified-kernel-replacement-plan.md'],
]
const criteria = []
for (const [prefix, count, path] of contracts) {
  const content = await readFile(join(root, path), 'utf8')
  const rows = content.split('\n').filter(line => new RegExp(`^\\| ${prefix}-\\d{2} \\|`).test(line))
  if (rows.length !== count) throw new Error(`Acceptance contract ${prefix} has missing or duplicate criteria`)
  for (let number = 1; number <= count; number++) {
    const id = `${prefix}-${String(number).padStart(2, '0')}`
    const row = rows.find(line => line.startsWith(`| ${id} |`))
    if (!row) throw new Error(`Missing acceptance criterion: ${id}`)
    criteria.push({ id, contract: path, requirement: row, status: 'not_run',
      reason: 'Full criterion evidence has not been collected for this production candidate; deterministic regression is recorded separately.' })
  }
}
const after = await kernelCandidate()
const stable = before.digest === regression.candidate.digest && before.digest === after.digest
const status = !stable ? 'stale_candidate' : regression.status !== 'passed' || checks.some(check => check.status !== 'passed') ? 'failed' : 'incomplete'
const report = { contract: 'DSH_KERNEL_ACCEPTANCE_REPORT_V1', status, candidateDigest: before.digest,
  candidateManifest: regression.reportPath, afterDigest: after.digest, regression: { status: regression.status, counts: regression.counts, report: regression.reportPath },
  checks, criteria, completeUkrAcceptance: false,
  remainingGates: ['Attach criterion-specific evidence against the same candidate',
    'Use original configured models and the existing browser for joint workflow acceptance'] }
const path = join(directory, 'acceptance.json')
await writeFile(path, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status, report: path, regression: regression.counts, criteria: criteria.length, completeUkrAcceptance: false }))
process.exitCode = status === 'incomplete' ? 2 : 1
