import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '../../../node_modules/@deepseek-ai/dsh/lib/bin.js'

const resources = fileURLToPath(new URL('../../../', import.meta.url))
const bin = join(resources, 'bin')

await runCli({
  manageDesktopProfile: true,
  packageManager: {
    command: join(bin, 'pnpm'),
    args: [],
    env: { PATH: [bin, resources, process.env.PATH ?? ''].join(delimiter) },
  },
})
