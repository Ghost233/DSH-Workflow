import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { sealSuperagentPayload } from './runtime/superagent-payload.mjs'
import { pruneKnownDevelopmentFiles } from './production-file-policy.mjs'

const exec = promisify(execFile)
const command = (name, args, cwd) => exec(name, args, { cwd, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })

/** Build the unchanged, pinned upstream once at packaging time, never at startup. */
export async function bundleSuperagent({ resourcesRoot, npmCache, pnpm = 'pnpm', run = command }) {
  const source = JSON.parse(await readFile(join(resourcesRoot, 'workflow/vendor/dsh-superagent.upstream.json'), 'utf8'))
  if (source.repository !== 'https://github.com/deepseek-ai/dsh-superagent-prototype'
    || !/^[a-f0-9]{40}$/.test(source.commit) || source.package !== 'dsh-superagent'
    || !/^\d+\.\d+\.\d+$/.test(source.version)) throw new Error('Invalid Superagent source pin')
  const scratch = await mkdtemp(join(tmpdir(), 'workflow-superagent-build-'))
  const checkout = join(scratch, 'upstream'), destination = join(resourcesRoot, 'superagent')
  let failure
  try {
    await run('git', ['init', '--quiet', checkout], scratch)
    await run('git', ['-C', checkout, 'remote', 'add', 'origin', `${source.repository}.git`], scratch)
    await run('git', ['-C', checkout, '-c', 'core.hooksPath=/dev/null', 'fetch', '--quiet', '--depth=1', 'origin', source.commit], scratch)
    await run('git', ['-C', checkout, '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], scratch)
    const revision = (await run('git', ['-C', checkout, 'rev-parse', 'HEAD'], scratch)).stdout.trim()
    const pkg = JSON.parse(await readFile(join(checkout, 'package.json'), 'utf8'))
    if (revision !== source.commit || pkg.name !== source.package || pkg.version !== source.version
      || pkg.private !== true || pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('Superagent source identity mismatch')
    await run(pnpm, ['install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', join(scratch, 'pnpm-store')], checkout)
    await run(pnpm, ['run', 'build'], checkout)
    const tree = JSON.parse((await run(pnpm, ['list', '--prod', '--depth', 'Infinity', '--json'], checkout)).stdout)
    if (!Array.isArray(tree) || tree.length !== 1 || tree[0].name !== source.package) throw new Error('Invalid Superagent production dependency tree')
    const fixed = {}
    const collect = rows => {
      for (const [name, item] of Object.entries(rows ?? {})) {
        if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(item.version)
          || fixed[name] && fixed[name] !== item.version) throw new Error(`Cannot flatten Superagent production dependency: ${name}`)
        fixed[name] = item.version
        collect(item.dependencies)
      }
    }
    collect(tree[0].dependencies)
    await mkdir(destination)
    const options = ['--ignore-scripts', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org/',
      '--cache', npmCache ?? join(scratch, 'npm-cache')]
    const packed = JSON.parse((await run('npm', ['pack', '--json', '--pack-destination', destination, ...options], checkout)).stdout)
    const archives = Array.isArray(packed) ? packed : Object.values(packed)
    const archive = archives[0]
    if (archives.length !== 1 || archive.name !== source.package || archive.version !== source.version
      || basename(archive.filename) !== archive.filename) throw new Error('Superagent archive identity mismatch')
    const dependencies = Object.fromEntries(Object.entries({ ...fixed, [source.package]: `file:${archive.filename}` }).sort(([a], [b]) => a.localeCompare(b)))
    await writeFile(join(destination, 'package.json'), JSON.stringify({ name: 'dsh-workflow-superagent-runtime', private: true, dependencies }, null, 2) + '\n')
    const installOptions = ['--legacy-peer-deps', '--no-bin-links', ...options]
    await run('npm', ['install', '--package-lock-only', ...installOptions], destination)
    await run('npm', ['ci', '--omit=dev', ...installOptions], destination)
    for (const [name, version] of Object.entries(fixed)) {
      const actual = JSON.parse(await readFile(join(destination, 'node_modules', name, 'package.json'), 'utf8'))
      if (actual.name !== name || actual.version !== version) throw new Error(`Superagent dependency differs from upstream lock: ${name}`)
    }
    await pruneKnownDevelopmentFiles(join(destination, 'node_modules'))
    return await sealSuperagentPayload(resourcesRoot)
  } catch (error) { failure = error; throw error }
  finally {
    try { await rm(scratch, { recursive: true, force: true }) }
    catch (error) { if (!failure) throw error; console.error(`Superagent build cleanup failed: ${scratch}: ${error.message}`) }
  }
}
