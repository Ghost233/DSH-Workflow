import { readFile, mkdir, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const exec = promisify(execFile)
const work = resolve(process.argv[2] ?? '.build/tobs-upstream')
const projectPin = JSON.parse(await readFile('vendor/tobs.upstream.json', 'utf8'))
const pin = JSON.parse(await readFile(join(work, 'source/packages/core/src/devices/cloudflared.json'), 'utf8'))
const destination = join(work, 'artifacts', projectPin.version, 'cloudflared-assets')
await mkdir(destination, { recursive: true })
for (const asset of Object.values(pin.assets)) {
  if (!/^[A-Za-z0-9_.-]+$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid upstream asset pin')
  const path = join(destination, asset.name)
  let bytes = await readFile(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (bytes && createHash('sha256').update(bytes).digest('hex') === asset.sha256) continue
  await exec('curl', ['--fail', '--location', '--retry', '4', '--retry-all-errors', '--retry-delay', '2',
    '--connect-timeout', '20', '--max-time', '300', '--output', `${path}.partial`,
    `https://github.com/cloudflare/cloudflared/releases/download/${pin.version}/${asset.name}`], { maxBuffer: 1024 * 1024 })
  bytes = await readFile(`${path}.partial`)
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Upstream asset digest mismatch: ${asset.name}`)
  await rename(`${path}.partial`, path)
  console.log(`Verified upstream asset: ${asset.name}`)
}
