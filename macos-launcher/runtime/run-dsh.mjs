import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { hostPackageMap } from '../../scripts/project-plugins.mjs'
import { installProjectResolver } from '../../scripts/project-plugin-resolver.mjs'

const resources = resolve(process.argv[2] ?? '')
const anchor = join(resources, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const workflow = join(resources, 'workflow')
const packages = {
  'dsh-owner-workflow': workflow,
  'dsh-sol-efficiency': join(workflow, 'sol-efficiency-plugin'),
  'dsh-approve-for-me-workflow': join(workflow, 'approve-for-me-workflow-plugin'),
}
const manifest = JSON.parse(readFileSync(anchor, 'utf8'))
if (manifest.name !== '@deepseek-ai/dsh') throw new Error('Packaged DSH identity mismatch')
installProjectResolver({ anchor, packages, hostPackages: hostPackageMap(anchor), directory: workflow })
const entry = join(dirname(anchor), 'lib', 'bin.js')
process.argv = [process.execPath, entry, ...process.argv.slice(3)]
const { runCli } = await import(pathToFileURL(entry))
if (typeof runCli !== 'function') throw new Error('Packaged DSH CLI does not expose runCli')
await runCli()
