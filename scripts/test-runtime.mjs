import { createRequire } from 'node:module'
import { mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../deepseek-harness/', import.meta.url))
const runtime = process.env.DSH_TEST_RUNTIME_ROOT

/** Use the isolated, lockfile-installed runtime for tests; retain the source fallback for older fixtures. */
export const runtimeAnchor = runtime ? join(runtime, 'node_modules/@deepseek-ai/dsh/package.json') : join(source, 'apps/cli/package.json')
export const runtimeRequire = createRequire(runtimeAnchor)
export const browserRequire = createRequire(runtime ? join(runtime, 'package.json') : join(source, 'packages/test-support/client-runtime/package.json'))
export function clientAsset(name, relative, sourceRelative) {
  return runtime ? join(runtime, 'node_modules', name, relative) : join(source, sourceRelative)
}

/** Give an isolated fixture the same package resolution as the selected test runtime. */
export async function linkRuntimeModules(directory) {
  if (runtime) {
    await mkdir(directory, { recursive: true })
    await symlink(join(runtime, 'node_modules'), join(directory, 'node_modules'))
  } else {
    await mkdir(join(directory, 'node_modules/@deepseek-ai'), { recursive: true })
    await symlink(join(source, 'apps/cli'), join(directory, 'node_modules/@deepseek-ai/dsh'))
  }
}
