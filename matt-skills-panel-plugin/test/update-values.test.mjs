import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

test('generated updater values share the panel closure without replacing its clipboard helper', async () => {
  const text = (await readFile(new URL('../scripts/generated/updateClient.derived.js', import.meta.url), 'utf8'))
    .replace(/^export\s+/gm, '')
  const result = vm.runInNewContext(`(() => {
    const copyText = () => 'panel clipboard'
    ${text}
    return { clipboard: copyText(), status: UPD_STATUS, check: UPD_CHECK,
      install: UPD_INSTALL, poll: UPD_POLL, min: UPD_POLL_MIN }
  })()`)
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { clipboard: 'panel clipboard',
    status: 'wf.updateStatus', check: 'wf.updateCheck', install: 'wf.updateInstall', poll: 1000, min: 250 })
})
