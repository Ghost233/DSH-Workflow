import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readArtifactSet } from './upstream-artifacts.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const pin = JSON.parse(await readFile(join(project, 'vendor/tobs.upstream.json'), 'utf8'))
const work = resolve(process.argv[2] ?? join(project, '.build/tobs-upstream'))
const exists = async path => access(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
async function run(command, args, cwd) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}
async function checkout(source, directory) {
  if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error('Upstream must use a full commit')
  await mkdir(directory, { recursive: true })
  if (!await exists(join(directory, '.git'))) {
    await run('git', ['init', '--quiet'], directory)
    await run('git', ['fetch', '--depth=1', source.repository, source.commit], directory)
    await run('git', ['checkout', '--detach', source.commit], directory)
  }
  await run('git', ['diff', '--exit-code'], directory)
  await run('git', ['diff', '--cached', '--exit-code'], directory)
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const result = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' })
  if (result.stdout.trim() !== source.commit) throw new Error(`Unexpected upstream checkout: ${directory}`)
}

if (process.versions.node !== pin.node) throw new Error(`Tobs build requires Node ${pin.node}, got ${process.versions.node}`)
await mkdir(work, { recursive: true })
const source = join(work, 'source'), provider = join(work, 'provider'), output = join(work, 'artifacts', pin.version)
if (await exists(join(work, 'build-receipt.json')) && await exists(join(output, 'artifacts.json'))) {
  const receipt = JSON.parse(await readFile(join(work, 'build-receipt.json'), 'utf8'))
  if (receipt.commit !== pin.commit || receipt.version !== pin.version || receipt.provider?.commit !== pin.provider.commit
    || receipt.node !== pin.node || receipt.pnpm !== pin.pnpm || !receipt.upstreamSourcesUnmodified) throw new Error('Cached build inputs differ from the upstream pin')
  const set = await readArtifactSet(work, { ...pin, package: '@botharness/tobs', artifactSet: `artifacts/${pin.version}/artifacts.json` })
  if (receipt.artifactsSha256 !== set.manifestSha256) throw new Error('Cached build receipt differs from the artifact set')
  await checkout(pin, source)
  await checkout(pin.provider, provider)
  console.log(`Existing upstream artifacts retained: ${output}`)
} else {
  if (await exists(output)) {
    const { readdir } = await import('node:fs/promises')
    if ((await readdir(output)).some(name => name !== 'cloudflared-assets')) throw new Error('A partial package output exists; inspect it before retrying')
  }
  await checkout(pin, source)
  await checkout(pin.provider, provider)
  const declaredNode = (await readFile(join(source, '.node-version'), 'utf8')).trim().replace(/^v/, '')
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  if (declaredNode !== pin.node || manifest.packageManager !== `pnpm@${pin.pnpm}`) throw new Error('Upstream toolchain changed')
  const fingerprint = createHash('sha256').update(JSON.stringify(pin)).digest('hex')
  const stagePath = join(work, 'prepared-stages.json')
  const stages = await exists(stagePath) ? JSON.parse(await readFile(stagePath, 'utf8')) : {}
  if (stages.fingerprint !== fingerprint) {
    await run('pnpm', ['install', '--frozen-lockfile'], source)
    await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], provider)
    await writeFile(stagePath, JSON.stringify({ fingerprint, dependencies: true }) + '\n')
  }
  if (stages.fingerprint !== fingerprint || !stages.built) {
    await run('pnpm', ['build'], source)
    await writeFile(stagePath, JSON.stringify({ fingerprint, dependencies: true, built: true }) + '\n')
  }
  await run('node', ['scripts/npm-prerelease.mjs', 'prepare', '--version', pin.version,
    '--provider-source', provider, '--output', output], source)
  await run('git', ['diff', '--exit-code'], source)
  await run('git', ['diff', '--exit-code'], provider)
  const bytes = await readFile(join(output, 'artifacts.json'))
  await writeFile(join(work, 'build-receipt.json'), JSON.stringify({ ...pin, output,
    artifactsSha256: createHash('sha256').update(bytes).digest('hex'), builtAt: new Date().toISOString(),
    upstreamSourcesUnmodified: true }, null, 2) + '\n')
}
