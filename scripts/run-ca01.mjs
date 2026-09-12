#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ACCEPTANCE_CANDIDATE_CONTRACT,
  runAcceptanceSuite,
} from '../owner-workflow-plugin/src/acceptance-runner.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputDir = resolve(root, process.argv[2] ?? 'docs/specs/main-thread-owner-workflow/rounds/round-100')
const specPath = 'docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md'
const ticketDir = 'docs/specs/main-thread-owner-workflow/tickets'
const sourceRoots = [
  'package.json',
  'scripts',
  'owner-workflow-plugin',
  'deepseek-harness/package.json',
  'deepseek-harness/tsconfig.json',
  'deepseek-harness/packages',
  'deepseek-harness/vendor/cordis/lib',
]
const excludedSegments = new Set(['.git', '.dsh-workflow', '.zvec-grep', 'node_modules', 'coverage'])
const excludedSuffixes = ['.log', '.tmp', '.swp']

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function unixPath(path) {
  return path.split(sep).join('/')
}

function excluded(path) {
  const parts = unixPath(relative(root, path)).split('/')
  return parts.some(part => excludedSegments.has(part)) || excludedSuffixes.some(suffix => path.endsWith(suffix))
}

async function collectFiles(path, files) {
  if (excluded(path)) return
  const metadata = await stat(path)
  if (metadata.isFile()) {
    files.push(path)
    return
  }
  if (!metadata.isDirectory()) return
  const entries = await readdir(path, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    await collectFiles(join(path, entry.name), files)
  }
}

async function contentBinding() {
  const files = []
  for (const sourceRoot of sourceRoots) await collectFiles(resolve(root, sourceRoot), files)
  files.sort((left, right) => unixPath(relative(root, left)).localeCompare(unixPath(relative(root, right)), 'en'))
  const hash = createHash('sha256')
  for (const path of files) {
    const name = unixPath(relative(root, path))
    const content = await readFile(path)
    hash.update(`${Buffer.byteLength(name)}:${name}:${content.byteLength}:`)
    hash.update(content)
  }
  return { digest: hash.digest('hex'), fileCount: files.length, roots: sourceRoots }
}

async function gitHead() {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('close', code => code === 0
      ? resolvePromise(stdout.trim().toLowerCase())
      : reject(new Error(`git rev-parse HEAD失败(${code}): ${stderr.trim()}`)))
  })
}

async function documentReference(path, fallbackId, fallbackRevision) {
  const content = await readFile(resolve(root, path))
  const text = content.toString('utf8')
  return {
    id: text.match(/^id:\s*(.+)$/mu)?.[1]?.trim() ?? fallbackId,
    revision: text.match(/^spec_revision:\s*(.+)$/mu)?.[1]?.trim() ?? fallbackRevision,
    digest: sha256(content),
  }
}

async function ticketReference(path, fallbackId) {
  const reference = await documentReference(path, fallbackId, 'R4')
  const text = await readFile(resolve(root, path), 'utf8')
  const status = text.match(/^status:\s*(.+)$/mu)?.[1]?.trim()
  const acceptanceText = text.match(/^acceptance:\s*\[([^\]]*)\]$/mu)?.[1]
  if (status === undefined) throw new Error(`CA01 Ticket ${reference.id}缺少status`)
  if (acceptanceText === undefined) throw new Error(`CA01 Ticket ${reference.id}缺少acceptance映射`)
  const acceptance = acceptanceText.split(',').map(value => value.trim()).filter(Boolean)
  if (acceptance.length === 0) throw new Error(`CA01 Ticket ${reference.id}至少映射一个AC`)
  for (const ac of acceptance) {
    if (!/^AC-(?:0[1-9]|[12][0-9]|3[0-2])$/u.test(ac)) throw new Error(`CA01 Ticket ${reference.id}包含未知AC：${ac}`)
  }
  return { ...reference, status, acceptance }
}

function testItem(id, title, files, dependsOn = [], timeoutMs = 360_000) {
  return {
    id,
    title,
    dependsOn,
    argv: [
      process.execPath,
      '--import', './deepseek-harness/node_modules/tsx/dist/esm/index.mjs',
      '--test', '--test-force-exit', '--test-concurrency=1',
      ...files,
    ],
    cwd: '.',
    timeoutMs,
    adapter: 'node-test',
  }
}

async function acceptanceItems() {
  const paths = (await readdir(resolve(root, 'owner-workflow-plugin/test')))
    .filter(name => name.endsWith('.test.mjs'))
    .sort((left, right) => left.localeCompare(right, 'en'))
  const take = predicate => paths.filter(predicate).map(name => `owner-workflow-plugin/test/${name}`)
  const planningActivation = take(name => name === 'planning-compile-native.test.mjs')
  const representative = take(name => name === 'public-owner-plan-lifecycle.test.mjs')
  const acceptance = take(name => name === 'acceptance-runner.test.mjs')
  const planning = take(name => /^(orchestrator-documents|planning-|project-layout)/u.test(name) && !planningActivation.some(path => path.endsWith(name)))
  const publicOwner = take(name => /^public-owner-/u.test(name) && !representative.some(path => path.endsWith(name)))
  const scheduling = take(name => /^(agent-policy|harness-integration|launcher|owner-attempt-control|owner-boundary|owner-hard-deadline|owner-host-command|runner|supervisor|unified-owner-resource-admission)/u.test(name))
  const recovery = take(name => /^(candidate-|direct-handoff|handoff-|recovery-|replan-|runtime-recovery|subgraph-recovery)/u.test(name))
  const convergence = take(name => /^(control|convergence|operation|plan-revision|workflow-state)/u.test(name))
  const history = take(name => /^(git|memory|owner-submission|resilience|verification)/u.test(name))
  const claimed = new Set([
    ...planning, ...planningActivation, ...publicOwner, ...scheduling, ...representative,
    ...recovery, ...convergence, ...history, ...acceptance,
  ].map(path => basename(path)))
  const platform = paths.filter(name => !claimed.has(name)).map(name => `owner-workflow-plugin/test/${name}`)
  const groups = [planning, planningActivation, publicOwner, scheduling, representative, recovery, convergence, history, platform, acceptance]
  const flattened = groups.flat().map(path => basename(path))
  if (flattened.length !== paths.length || new Set(flattened).size !== paths.length) {
    throw new Error(`CA01测试分组必须完整且无重复：discovered=${paths.length}, grouped=${flattened.length}, unique=${new Set(flattened).size}`)
  }
  platform.push('scripts/project-plugins.test.mjs')
  return [
    testItem('planning-foundation', 'Spec/Ticket来源、文档权限、checkpoint与Owner执行包', planning),
    testItem('planning-activation', '固定候选审查、执行版本激活、竞争与重放', planningActivation, ['planning-foundation']),
    testItem('public-owner-protocol', '公共Owner请求、会话决定与消费者影响协议', publicOwner),
    testItem('scheduler-resource-lifecycle', '容量、Owner、资源、截止、Runner与Harness准入', scheduling, [], 480_000),
    testItem('representative-sab-k1-k2', 'S/A/B代表场景：K1到兼容K2及唯一公共实现', representative, [
      'planning-activation', 'public-owner-protocol', 'scheduler-resource-lifecycle',
    ]),
    testItem('bounded-recovery', '有界恢复、预算、会诊、重建、重启与handoff故障变体', recovery, [], 600_000),
    testItem('convergence-revision-control', '义务收敛、决定分类、PlanRevision与控制桥', convergence, [], 600_000),
    testItem('history-git-replay', 'Owner原始历史、摘要延后、Git结算与重复回执', history, [], 480_000),
    testItem('platform-security-ui', '模型、Registry、安全、插件、Dashboard与项目集成边界', platform, [], 480_000),
    testItem('acceptance-classification', '集中验收独立继续与完整失败分类自验', acceptance),
  ]
}

function runProcess(argv, cwd, timeoutMs, signal) {
  return new Promise(resolvePromise => {
    const environment = { ...process.env, TSX_TSCONFIG_PATH: join(root, 'deepseek-harness/tsconfig.json') }
    delete environment.NODE_TEST_CONTEXT
    const child = spawn(argv[0], argv.slice(1), { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    let timedOut = false
    let aborted = false
    let settled = false
    const stop = reason => {
      if (settled) return
      if (reason === 'timeout') timedOut = true
      if (reason === 'abort') aborted = true
      child.kill('SIGTERM')
      setTimeout(() => { if (!settled) child.kill('SIGKILL') }, 2_000).unref()
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    timer.unref()
    const abort = () => stop('abort')
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.once('error', error => stderr.push(Buffer.from(error.stack ?? error.message)))
    child.once('close', exitCode => {
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolvePromise({
        exitCode: Number.isInteger(exitCode) ? exitCode : 1,
        timedOut,
        aborted,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

const startedAt = new Date().toISOString()
const initialBinding = await contentBinding()
const initialHead = await gitHead()
const tickets = []
for (const name of (await readdir(resolve(root, ticketDir))).filter(name => /^t-\d+-.+\.md$/u.test(name)).sort()) {
  tickets.push(await ticketReference(`${ticketDir}/${name}`, name.match(/^t-(\d+)/u)?.[1] ?? name))
}
if (tickets.length !== 31) throw new Error(`CA01必须绑定31张Ticket，实际${tickets.length}`)
const expectedAcceptanceCriteria = Array.from({ length: 32 }, (_, index) => `AC-${String(index + 1).padStart(2, '0')}`)
const mappedAcceptanceCriteria = new Set(tickets.flatMap(ticket => ticket.acceptance))
const unmappedAcceptanceCriteria = expectedAcceptanceCriteria.filter(ac => !mappedAcceptanceCriteria.has(ac))
if (unmappedAcceptanceCriteria.length > 0) {
  throw new Error(`CA01 Ticket没有承接全部验收条件：${unmappedAcceptanceCriteria.join(', ')}`)
}
const spec = await documentReference(specPath, 'MAIN-THREAD-SPEC-TICKET-OWNER-DAG', 'R4')
spec.revision = 'R4'
const items = await acceptanceItems()
const planningSnapshotDigest = sha256(canonical({ spec, tickets }))
const planDigest = sha256(canonical(items))
const candidateBindingDigest = sha256(canonical({
  codeCommitSha: initialHead,
  contentDigest: initialBinding.digest,
  planningSnapshotDigest,
  planDigest,
}))
const candidate = {
  contract: ACCEPTANCE_CANDIDATE_CONTRACT,
  candidateId: `CA01-R100-${candidateBindingDigest.slice(0, 12)}`,
  workflowId: 'main-thread-owner-workflow',
  planningSnapshotDigest,
  planDigest,
  codeCommitSha: initialHead,
  contentDigest: initialBinding.digest,
  spec,
  tickets,
}

await mkdir(outputDir, { recursive: true })
await writeFile(join(outputDir, 'candidate.json'), `${JSON.stringify({
  ...candidate,
  sourceBinding: initialBinding,
  dirtyWorkspaceBoundByContentDigest: true,
}, null, 2)}\n`)
await writeFile(join(outputDir, 'acceptance-plan.json'), `${JSON.stringify({
  contract: 'DSH_CA01_ACCEPTANCE_PLAN_V1',
  candidateId: candidate.candidateId,
  items,
}, null, 2)}\n`)

const executor = {
  async run(request) {
    const beforeBinding = await contentBinding()
    const beforeHead = await gitHead()
    if (beforeBinding.digest !== candidate.contentDigest || beforeHead !== candidate.codeCommitSha) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '候选在验证项启动前发生漂移',
        codeCommitSha: beforeHead,
        contentDigest: beforeBinding.digest,
      }
    }
    const result = await runProcess(request.argv, resolve(root, request.cwd), request.timeoutMs, request.signal)
    const afterBinding = await contentBinding()
    const afterHead = await gitHead()
    return {
      ...result,
      codeCommitSha: afterHead,
      contentDigest: afterBinding.digest,
    }
  },
}

const run = await runAcceptanceSuite({ candidate, items, executor })
const completedAt = new Date().toISOString()
const evidence = {
  ...run,
  startedAt,
  completedAt,
  durationMs: Date.parse(completedAt) - Date.parse(startedAt),
  sourceBinding: initialBinding,
}
await writeFile(join(outputDir, 'test-results.json'), `${JSON.stringify(evidence, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  candidateId: candidate.candidateId,
  status: run.status,
  counts: run.counts,
  tests: run.results.reduce((sum, result) => sum + Number(result.testSummary?.tests ?? 0), 0),
  passed: run.results.reduce((sum, result) => sum + Number(result.testSummary?.pass ?? 0), 0),
  skipped: run.results.reduce((sum, result) => sum + Number(result.testSummary?.skipped ?? 0), 0),
  durationMs: evidence.durationMs,
  outputDir: unixPath(relative(root, outputDir)),
}, null, 2)}\n`)
process.exitCode = run.status === 'passed' ? 0 : 1
