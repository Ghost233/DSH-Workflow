import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assembleDesktopClient } from './desktop-adaptation.mjs'

const main = process.env.DSH_DESKTOP_TEST_MAIN

test('assembled Desktop checks repository releases using the outer Workflow version', {
  skip: main ? false : 'Pass the fixed official Desktop main through DSH_DESKTOP_TEST_MAIN',
}, async t => {
  const root = await mkdtemp('/private/tmp/dsh-s07-desktop-assembly-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const app = join(root, 'Workflow Desktop.app'), resources = join(app, 'Contents/Resources')
  const lib = join(resources, 'app/lib')
  await mkdir(lib, { recursive: true })
  const target = JSON.parse(await readFile(new URL('../dsh-runtime.json', import.meta.url), 'utf8'))
  const workflow = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
  await writeFile(join(lib, 'main.js'), await readFile(main))
  await writeFile(join(resources, 'app/package.json'), JSON.stringify({ version: target.version }))
  const manifest = await assembleDesktopClient(app)
  await promisify(execFile)(process.execPath, ['--check', join(lib, 'main.js')])
  const { WorkflowDesktopUpdates } = await import(pathToFileURL(join(lib, 'workflow-desktop-client.mjs')).href)
  assert.equal(manifest.workflowVersion, workflow.version)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), method: options.method })
    return { ok: true, json: async () => [{ tag_name: 'macos-v2.0.0', draft: false, prerelease: false,
      assets: [{ name: 'DSH-Workflow-macOS-2.0.0-arm64.dmg', size: 1234,
        browser_download_url: 'https://github.com/Ghost233/DSH-Workflow/releases/download/macos-v2.0.0/DSH-Workflow-macOS-2.0.0-arm64.dmg' }] }] }
  })
  const forbidden = () => assert.fail('Assembled repository checking must not invoke the upstream updater')
  const updates = new WorkflowDesktopUpdates({ checkForUpdates: forbidden, downloadUpdate: forbidden, quitAndInstall: forbidden }, () => {})
  const state = await updates.check(true)
  assert.deepEqual({ phase: state.phase, workflowVersion: state.workflowVersion, release: state.release }, {
    phase: 'idle', workflowVersion: workflow.version,
    release: { version: '2.0.0', page: 'https://github.com/Ghost233/DSH-Workflow/releases/tag/macos-v2.0.0' },
  })
  assert.deepEqual(requests, [{ url: 'https://api.github.com/repos/Ghost233/DSH-Workflow/releases?per_page=100', method: 'GET' }])
  assert.deepEqual(await assembleDesktopClient(app), manifest, 'same guarded assembly remains idempotent')
  updates.dispose()
})
