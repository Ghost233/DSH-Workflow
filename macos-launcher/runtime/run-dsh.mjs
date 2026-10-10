import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { manageProfilePluginOperation } from './plugin-configuration.mjs'

import { hostPackageMap } from '../../scripts/project-plugins.mjs'
import { installProjectResolver } from '../../scripts/project-plugin-resolver.mjs'

const resources = resolve(process.argv[2] ?? '')
const anchor = join(resources, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const workflow = join(resources, 'workflow')
const packages = {
  'dsh-workflow': workflow,
  'dsh-workflow-matt-panel': join(workflow, 'matt-skills-panel-plugin/package'),
}
const manifest = JSON.parse(readFileSync(anchor, 'utf8'))
if (manifest.name !== '@deepseek-ai/dsh') throw new Error('Packaged DSH identity mismatch')
installProjectResolver({ anchor, packages, hostPackages: hostPackageMap(anchor), directory: workflow })
const entry = join(dirname(anchor), 'lib', 'bin.js')
process.argv = [process.execPath, entry, ...process.argv.slice(3)]
const { runCli } = await import(pathToFileURL(entry))
if (typeof runCli !== 'function') throw new Error('Packaged DSH CLI does not expose runCli')
const synchronize = process.argv.includes('--workflow-sync')
process.argv = process.argv.filter(value => value !== '--workflow-sync')
const profileOperation = process.argv[2] === 'plugin' && process.argv[3] === '--profile'
const run = () => runCli({ manageDesktopProfile: profileOperation && process.argv[4] === 'desktop' })
if (profileOperation && ['add', 'remove'].includes(process.argv[5])) {
  await manageProfilePluginOperation({ resources, home: process.env.DSH_HOME || join(homedir(), '.dsh'),
    profileName: process.argv[4], synchronize, args: process.argv.slice(5), run })
} else await run()
