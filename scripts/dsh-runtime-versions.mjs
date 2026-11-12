import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { compareVersions } from '../macos-launcher/runtime/plugin-versions.mjs'

const packageName = '@deepseek-ai/dsh'
const registry = 'https://registry.npmjs.org/'
const packageUrl = registry + encodeURIComponent(packageName)
const repository = 'https://github.com/deepseek-ai/deepseek-harness'
const releases = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases'
const tagPrefix = 'dsh-v'
const exactVersion = value => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value ?? '')
const exec = promisify(execFile)

async function json(url, options) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), ...options })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

export async function listVersions() {
  const channels = await Promise.allSettled([
    json(packageUrl, { headers: { Accept: 'application/vnd.npm.install-v1+json' } })
      .then(data => Object.keys(data.versions)),
    json(`${releases}?per_page=100`).then(data => data
      .filter(row => !row.draft && row.tag_name.startsWith(tagPrefix))
      .map(row => row.tag_name.slice(tagPrefix.length))),
  ])
  const versions = new Map(), errors = []
  for (const [index, channel] of ['npm', 'github'].entries()) {
    const result = channels[index]
    if (result.status === 'rejected') {
      errors.push(`${channel}: ${result.reason.message}`)
      continue
    }
    for (const version of result.value.filter(exactVersion)) {
      if (!versions.has(version)) versions.set(version, [])
      versions.get(version).push(channel)
    }
  }
  if (errors.length === channels.length) throw new Error(errors.join('\n'))
  return { versions: Array.from(versions, ([version, sources]) => ({ version, sources }))
    .sort((a, b) => compareVersions(b.version, a.version)), errors }
}

export async function resolveVersion(channel, version) {
  if (!exactVersion(version)) throw new Error('Pass an exact DSH version, for example 0.2.2-rc.2')
  if (channel === 'npm') {
    const pkg = await json(`${packageUrl}/${version}`)
    if (pkg.name !== packageName || pkg.version !== version || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.dist?.integrity)) {
      throw new Error('npm did not return the exact DSH package and integrity')
    }
    return { version, package: packageName, source: 'npm', registry, integrity: pkg.dist.integrity }
  }
  if (channel !== 'github') throw new Error('Select npm or github explicitly')
  const tag = tagPrefix + version
  const release = await json(`${releases}/tags/${tag}`)
  if (release.draft || release.tag_name !== tag) throw new Error('GitHub did not return the exact published DSH release')
  const ref = `refs/tags/${tag}`
  const { stdout } = await exec('git', ['ls-remote', `${repository}.git`, ref, `${ref}^{}`])
  const refs = new Map(stdout.trim().split('\n').map(line => line.split('\t').reverse()))
  const commit = refs.get(`${ref}^{}`) ?? refs.get(ref)
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`Cannot resolve the DSH source commit for ${tag}`)
  return { version, package: packageName, source: 'git', repository, tag, commit }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (!args.length) {
    const { versions, errors } = await listVersions()
    for (const error of errors) console.error(error)
    for (const { version, sources } of versions) console.log(`${version}\t${sources.join(', ')}`)
  } else if (args.length === 2) console.log(JSON.stringify(await resolveVersion(...args), null, 2))
  else throw new Error('Usage: node scripts/dsh-runtime-versions.mjs [npm|github VERSION]')
}
