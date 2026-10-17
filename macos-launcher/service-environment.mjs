import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Package only the fixed upstream's side-effect-free login-shell preparation. */
export async function bundleServiceEnvironment(projectRoot, resourcesRoot) {
  const harness = join(projectRoot, 'deepseek-harness')
  const entry = join(harness, 'apps/desktop/lib/types/login-shell-environment.js')
  const duration = join(harness, 'apps/desktop/lib/types/duration-env.js')
  // Read prepared engineering outputs; this helper never builds or installs dependencies.
  const inputs = await Promise.all([entry, duration].map(path => readFile(path)))
  const require = createRequire(join(harness, 'package.json'))
  const { build } = await import(pathToFileURL(require.resolve('tsdown')).href)
  const directory = join(resourcesRoot, 'service')
  await mkdir(directory, { recursive: true })
  await build({ config: false, tsconfig: false, cwd: projectRoot,
    entry: { 'login-shell': entry }, outDir: directory, format: 'esm', platform: 'node', target: 'node24',
    dts: false, sourcemap: false, clean: false, report: false, logLevel: 'silent',
    outExtensions: () => ({ js: '.mjs' }) })
  const output = join(directory, 'login-shell.mjs')
  const module = await import(pathToFileURL(output).href)
  if (typeof module.readDesktopLoginShellEnvironment !== 'function' || typeof module.resolveDesktopLoginShellConfig !== 'function') {
    throw new Error('Fixed upstream login-shell preparation exports are missing')
  }
  const sha = value => createHash('sha256').update(value).digest('hex')
  await writeFile(join(directory, 'login-shell-source.json'), JSON.stringify({
    source: 'deepseek-harness/apps/desktop/lib/types/login-shell-environment.js',
    sourceSha256: sha(inputs[0]), durationSha256: sha(inputs[1]), bundleSha256: sha(await readFile(output)),
  }, null, 2) + '\n')
  return output
}
