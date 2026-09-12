import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const metadata = JSON.parse(readFileSync(new URL('../upstream.json', import.meta.url), 'utf8'))
const path = resolve(root, metadata.submodule)
const git = (...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim()
const head = git('rev-parse', 'HEAD')
if (head !== metadata.commit) throw new Error(`Submodule is ${head}; port baseline is ${metadata.commit}. Review upstream changes before updating upstream.json.`)
if (git('status', '--porcelain')) throw new Error('SoL-Pi submodule has local edits; keep upstream source pristine.')
const parent = resolve(root, '..')
const relative = 'vendor/SoL-Pi'
const entry = execFileSync('git', ['-C', parent, 'ls-files', '--stage', '--', relative], { encoding: 'utf8' }).trim()
if (!entry.startsWith(`160000 ${head} 0\t`)) throw new Error(`Git index does not pin ${relative} at ${head}`)
console.log(`SoL-Pi submodule and port baseline match: ${head}`)
