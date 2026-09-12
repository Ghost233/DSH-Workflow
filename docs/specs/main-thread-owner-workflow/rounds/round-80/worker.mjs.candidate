import { readFile } from 'node:fs/promises'
import { runPlanningTransaction } from './transaction.mjs'

const arguments_ = process.argv.slice(2)
const [inputPath, stage] = arguments_
if (![1, 2].includes(arguments_.length) || typeof inputPath !== 'string') {
  process.stderr.write('usage: node worker.mjs <input.json> [stage]\n')
  process.exitCode = 64
} else {
  let input
  try {
    input = JSON.parse(await readFile(inputPath, 'utf8'))
  } catch (error) {
    process.stderr.write(`worker input error: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 65
  }
  if (input !== undefined) {
    const result = await runPlanningTransaction({
      ...input,
      fault: async current => {
        if (current !== stage) return
        await new Promise(resolve => process.stdout.write(`${JSON.stringify({ event: 'fault-stage', stage: current })}\n`, resolve))
        process.kill(process.pid, 'SIGKILL')
      },
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }
}
