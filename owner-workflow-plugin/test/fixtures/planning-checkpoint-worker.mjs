import { readFile } from 'node:fs/promises'
import { runPlanningCheckpoint } from '../../src/planning-checkpoint.mjs'

const [inputPath, stage] = process.argv.slice(2)
if (typeof inputPath !== 'string' || process.argv.length < 3 || process.argv.length > 4) {
  process.stderr.write('usage: node planning-checkpoint-worker.mjs <input.json> [stage]\n')
  process.exitCode = 64
} else {
  const input = JSON.parse(await readFile(inputPath, 'utf8'))
  const result = await runPlanningCheckpoint({
    root: input.root,
    cwd: input.root,
    request: input.request,
    authorize: async ({ authorizationId }) => ({
      contract: 'DSH_TEST_CONTROLLED_PLANNING_GRANT_V1',
      id: authorizationId ?? 'test-grant-1',
      binding: 'controlled-test-authorizer',
    }),
    withLease: operation => operation({ assertLease: async () => {}, signal: new AbortController().signal }),
    fault: async current => {
      if (current !== stage) return
      process.stdout.write(`${JSON.stringify({ event: 'fault-stage', stage: current })}\n`)
      process.kill(process.pid, 'SIGKILL')
    },
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
