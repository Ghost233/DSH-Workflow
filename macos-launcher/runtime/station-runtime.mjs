import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDirectory, serviceDirectory, redact } from './service-control.mjs'
import { webDirectory } from './web-control.mjs'
import { shutdownStation } from './station-shutdown.mjs'

const [dataRoot, resources, home] = process.argv.slice(2)
const stationPid = process.ppid
const reader = createInterface({ input: process.stdin })
const managers = new Map()
let stopping = false

const report = error => console.error(redact(error.message))
const start = async role => {
  const daily = role === 'service'
  const directory = daily ? serviceDirectory(dataRoot) : webDirectory(dataRoot)
  await privateDirectory(directory)
  const log = await open(join(directory, 'manager.log'), 'a', 0o600)
  try {
    if (stopping) return
    const script = fileURLToPath(new URL(daily ? 'service-manager.mjs' : 'global-supervisor.mjs', import.meta.url))
    const args = daily ? [dataRoot, resources, home, '--station-owned'] : [dataRoot]
    const child = spawn(process.execPath, [script, ...args], {
      cwd: resources, stdio: ['ignore', log.fd, log.fd],
    })
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
  } finally { await log.close() }
}

reader.on('line', line => {
  if (stopping) return
  try {
    const { type } = JSON.parse(line)
    if ((type === 'service' || type === 'web') && !managers.has(type)) {
      const task = start(type).catch(report).finally(() => managers.delete(type))
      managers.set(type, task)
    }
  } catch (error) { report(error) }
})
// The write end belongs to Station. The kernel closes it even when Station is killed.
reader.once('close', () => {
  stopping = true
  void shutdownStation({ dataRoot, stationPid, report })
    .catch(error => { report(error); process.exitCode = 1 })
})
