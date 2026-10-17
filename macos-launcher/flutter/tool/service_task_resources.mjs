import { readFile, copyFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const [resources, fixtureRoot] = process.argv.slice(2)
if (!resources || !fixtureRoot) throw new Error('Pass the already-staged resources and owned task fixture root')
const desktop = join(resolve(resources), 'desktop/DeepSeek Harness.app/Contents/Resources')
let runtime = join(desktop, 'app/dsh')
try { runtime = JSON.parse(await readFile(join(desktop, 'dsh-source-runtime.json'), 'utf8')).runtimeRoot }
catch (error) { if (error.code !== 'ENOENT') throw error }
const model = join(resolve(fixtureRoot), 'model-plugin.mjs')
await copyFile(new URL('./service_task_model_fixture.mjs', import.meta.url), model)
const patch = join(resolve(fixtureRoot), 'home/profiles/desktop/cordis.patch.yml')
const patches = JSON.parse(await readFile(patch, 'utf8'))
patches.push({ insert: [{ id: 'service-task-fixture', name: model,
  config: { anchor: join(runtime, 'package.json'), directory: resolve(fixtureRoot) } }] })
await writeFile(patch, JSON.stringify(patches))
