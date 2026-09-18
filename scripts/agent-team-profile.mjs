import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const bundles = [
  { name: '@deepseek-ai/dsh-experimental-agent-team-profile', directory: 'agent-team-profile' },
  { name: '@deepseek-ai/dsh-experimental-agent-team-web-profile', directory: 'agent-team-web-profile' },
]

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

async function addBundle({ harness, home, name, version, signal }) {
  const cli = join(harness, 'apps/cli/lib/bin.js')
  const args = [cli, 'plugin', '--profile', 'web', 'add', `${name}@${version}`, '--save-exact']
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: harness, env: { ...process.env, DSH_HOME: home }, stdio: 'inherit', signal })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`DSH Agent Teams plugin install failed: ${name} (${signal ?? code})`)))
  })
}

/** Use DSH's plugin manager once per missing bundle; preserve every other Web-profile setting. */
export async function ensureAgentTeamProfile({ harness, home, signal, add = addBundle }) {
  const profileDir = join(home, 'profiles/web')
  const manifestPath = join(profileDir, 'package.json')
  const version = (await readJson(join(harness, 'apps/cli/package.json'))).version
  for (const { name, directory } of bundles) {
    const packageVersion = (await readJson(join(harness, 'packages/experimental', directory, 'package.json'))).version
    if (packageVersion !== version) throw new Error(`DSH Agent Teams package version does not match the active Harness: ${name}`)
  }
  const manifest = await readJson(manifestPath)
  const current = manifest.dsh?.profile?.bundles
  if (!Array.isArray(current)) throw new Error(`Invalid DSH Web profile bundle list: ${manifestPath}`)
  if (current.includes(bundles[1].name) && !current.includes(bundles[0].name)) {
    throw new Error('DSH Web profile has the Agent Teams Web layer without its Host layer; repair the profile order before launch')
  }
  for (const { name } of bundles) {
    signal?.throwIfAborted()
    const configured = await readJson(manifestPath)
    const installed = await readJson(join(profileDir, 'node_modules', name, 'package.json')).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!configured.dsh?.profile?.bundles?.includes(name) || installed?.version !== version) {
      await add({ harness, home, name, version, signal })
      const updated = await readJson(manifestPath)
      const materialized = await readJson(join(profileDir, 'node_modules', name, 'package.json'))
      if (!updated.dsh?.profile?.bundles?.includes(name) || materialized.version !== version) {
        throw new Error(`DSH did not activate the requested Agent Teams bundle: ${name}`)
      }
    }
  }
  const ordered = (await readJson(manifestPath)).dsh.profile.bundles
  const required = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...bundles.map(bundle => bundle.name)]
  if (required.some((name, index) => ordered.indexOf(name) < 0 || index > 0 && ordered.indexOf(name) <= ordered.indexOf(required[index - 1]))) {
    throw new Error(`DSH Agent Teams bundles must follow the base and Web layers in this order: ${required.join(', ')}`)
  }
}
