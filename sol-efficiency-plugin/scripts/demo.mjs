import { runDemo } from '../test/demo.mjs'
const cleanup = []
try {
  console.log(JSON.stringify(await runDemo({ after: fn => cleanup.push(fn) }), null, 2))
} finally {
  for (const fn of cleanup.reverse()) await fn()
}
