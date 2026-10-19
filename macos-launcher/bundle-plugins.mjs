import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { readDeliveryManifest } from '../agent-observation-plugin/src/delivery-manifest.mjs'
import { sealPluginPayload, verifyPluginPayload } from './runtime/plugin-payload.mjs'

const execute = promisify(execFile)
const command = (name, args, cwd) => execute(name, args, { cwd, maxBuffer: 16 * 1024 * 1024,
  timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })

/** Build-time acquisition only. Startup consumes this sealed production graph without a package manager. */
export async function bundleProjectPlugins({ resourcesRoot, run = command }) {
  const config = await readDeliveryManifest(join(resourcesRoot, 'workflow'))
  if (!config) throw new Error('Missing packaged plugin manifest')
  const directory = join(resourcesRoot, 'plugins'), tarballs = join(directory, 'tarballs')
  await mkdir(directory) // A previous candidate must never be reused implicitly.
  await mkdir(tarballs)
  const scratch = await mkdtemp(join(tmpdir(), 'workflow-plugin-build-'))
  const dependencies = {}, provenance = []
  let failure
  const npmOptions = ['--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false', '--cache', join(scratch, 'npm-cache'), '--registry', config.registry]
  try {
    for (const [index, item] of config.plugins.filter(row => row.startup === true).entries()) {
      let source = tarballs, spec = `${item.package}@${item.version}`
      if (item.source === 'git') {
        source = join(scratch, `git-${index}`)
        await run('git', ['init', '--quiet', source], scratch)
        await run('git', ['-C', source, 'remote', 'add', 'origin', `${item.repository}.git`], scratch)
        await run('git', ['-C', source, 'config', 'remote.origin.promisor', 'true'], scratch)
        await run('git', ['-C', source, 'config', 'remote.origin.partialclonefilter', 'blob:none'], scratch)
        await run('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', 'fetch', '--depth=1', '--filter=blob:none', 'origin', item.commit], scratch)
        const metadata = JSON.parse((await run('git', ['-C', source, 'show', 'FETCH_HEAD:package.json'], scratch)).stdout)
        if (metadata.name !== item.package || metadata.version !== item.version) throw new Error(`Plugin Git package identity mismatch: ${item.package}`)
        const bin = typeof metadata.bin === 'string' ? [metadata.bin] : Object.values(metadata.bin ?? {})
        const files = [...(Array.isArray(metadata.files) ? metadata.files : []), metadata.main, ...bin].filter(path => typeof path === 'string')
        const literals = files.every(path => {
          const value = path.replace(/^\.\//, '').replace(/\/$/, '')
          return /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..')
        })
        if (Array.isArray(metadata.files) && metadata.files.length && literals) {
          await run('git', ['-C', source, 'sparse-checkout', 'set', '--no-cone', '/*', '!/*/', ...files.map(path => '/' + path.replace(/^\.\//, ''))], scratch)
        }
        await run('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], scratch)
        const { stdout } = await run('git', ['-C', source, 'rev-parse', 'HEAD'], scratch)
        if (stdout.trim() !== item.commit) throw new Error(`Plugin Git commit mismatch: ${item.package}`)
        spec = '.'
      }
      const { stdout } = await run('npm', ['pack', spec, '--json', '--pack-destination', tarballs, ...npmOptions], source)
      const output = JSON.parse(stdout)
      const packed = Array.isArray(output) ? output : Object.values(output)
      const archive = packed?.[0]
      if (packed.length !== 1 || archive.name !== item.package || archive.version !== item.version
        || typeof archive.filename !== 'string') throw new Error(`Plugin archive identity mismatch: ${item.package}; received ${JSON.stringify({ count: packed.length, name: archive?.name, version: archive?.version, filename: archive?.filename })}`)
      const filename = basename(archive.filename)
      if (archive.filename !== filename) throw new Error(`Plugin archive path escapes staging: ${item.package}`)
      dependencies[item.package] = `file:tarballs/${filename}`
      const archiveSha256 = createHash('sha256').update(await readFile(join(tarballs, filename))).digest('hex')
      provenance.push({ ...item, archiveSha256 })
    }
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'dsh-workflow-packaged-plugins', private: true, dependencies }, null, 2) + '\n')
    // Peers belong to DSH's public runtime mappings; third-party lifecycle hooks never run in the packager.
    const installOptions = ['--legacy-peer-deps', '--no-bin-links', ...npmOptions]
    await run('npm', ['install', '--package-lock-only', ...installOptions], directory)
    await run('npm', ['ci', '--omit=dev', ...installOptions], directory)
    await sealPluginPayload(resourcesRoot, provenance)
    return await verifyPluginPayload(resourcesRoot)
  } catch (error) { failure = error; throw error }
  finally {
    try { await rm(scratch, { recursive: true, force: true }) }
    catch (error) {
      if (!failure) throw error
      console.error(`Plugin build cleanup failed: ${scratch}: ${error.message}`)
    }
  }
}
