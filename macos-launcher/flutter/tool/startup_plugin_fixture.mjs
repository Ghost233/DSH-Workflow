import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Two wholly owned acceptance packages; no upstream or third-party code is changed.
const [resources, root] = process.argv.slice(2).map(value => resolve(value))
const runtime = join(resources, 'desktop/DeepSeek Harness.app/Contents/Resources/app/dsh')
const boot = createRequire(join(runtime, 'package.json'))('@deepseek-ai/dsh-app-boot')
const profile = join(root, 'home/profiles/desktop')
const originalPatch = await readFile(join(profile, 'cordis.patch.yml'))
boot.initProfile(profile, boot.PROFILE_TEMPLATES.web.bundles)
await writeFile(join(profile, 'cordis.patch.yml'), originalPatch)
const path = join(profile, 'package.json')
const manifest = JSON.parse(await readFile(path, 'utf8'))
const projectPath = join(resources, 'workflow/project-plugins.json')
const project = JSON.parse(await readFile(projectPath, 'utf8'))
const lockPath = join(resources, 'workflow/project-plugins.lock.json')
const lock = JSON.parse(await readFile(lockPath, 'utf8'))
for (const suffix of ['fails', 'good']) {
  const name = `s08-owned-startup-${suffix}`, directory = join(profile, 'node_modules', name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.mjs' }))
  await writeFile(join(directory, 'index.mjs'), suffix === 'fails'
    ? `throw new Error('Owned optional top-level startup failure'); export const name='s08-owned-startup-fails'; export function apply(){}\n`
    : `import {writeFileSync} from 'node:fs'; import * as hostPeer from '@deepseek-ai/dsh-app-boot'; export const name='s08-owned-startup-good'; export function apply(){if(typeof hostPeer.initProfile!=='function')throw new Error('Actual public Host peer missing');writeFileSync(${JSON.stringify(join(root, 'startup-good-applied'))},'actual Host applied this owned package with public peer')}\n`)
  manifest.dependencies[name] = '1.0.0'
  project.plugins.push({ package: name, version: '1.0.0', entryId: name, startup: true })
  lock.plugins.push({ package: name, version: '1.0.0', metadata: { name, version: '1.0.0' } })
}
await writeFile(path, JSON.stringify(manifest))
const bytes = JSON.stringify(project)
await writeFile(projectPath, bytes)
lock.manifestSha256 = createHash('sha256').update(bytes).digest('hex')
await writeFile(lockPath, JSON.stringify(lock))
