import { join } from 'node:path'
import { homedir } from 'node:os'
import { prepareDesktopProfile } from './desktop-profile.mjs'

const [resourcesRoot, globalRoot, desktopRuntimeRoot] = process.argv.slice(2)
if (!resourcesRoot || !globalRoot || !desktopRuntimeRoot) throw new Error('Missing Desktop integration paths')
const result = await prepareDesktopProfile({ resourcesRoot, globalRoot, desktopRuntimeRoot,
  home: process.env.DSH_HOME || join(homedir(), '.dsh'), permissionMode: process.env.DSH_PERMISSION_MODE })
process.stdout.write(JSON.stringify(result) + '\n')
