import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const sourcePath = new URL('../packages/dsh-log/publish-wizard.sh', import.meta.url)
async function fixture(t, platform, arch) {
  const root = await mkdtemp(join(tmpdir(), 'owned-publish-wizard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'bin'), receipt = join(root, 'receipt.json'); await mkdir(bin)
  await writeFile(join(bin, 'uname'), `#!/bin/sh\ncase "$1" in -s) printf '%s\\n' '${platform}' ;; -m) printf '%s\\n' '${arch}' ;; *) exit 2 ;; esac\n`, { mode: 0o755 })
  const recorder = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({program:require('node:path').basename(process.argv[1]),args:process.argv.slice(2)}));\n`
  for (const name of ['npm', 'open', 'wslview', 'explorer.exe', 'xdg-open']) await writeFile(join(bin, name), recorder, { mode: 0o755 })
  const environment = { ...process.env, PATH: bin + ':' + process.env.PATH }
  return { root, bin, receipt, environment }
}

test('publishing wizard rejects unsupported hosts before any publishing or browser step', async t => {
  for (const [platform, arch] of [['Linux', 'aarch64'], ['Darwin', 'x86_64'], ['MINGW64_NT', 'x86_64']]) {
    const f = await fixture(t, platform, arch), script = join(f.root, 'publish-wizard.sh')
    await writeFile(script, await readFile(sourcePath, 'utf8'))
    const result = spawnSync('/bin/bash', [script], { cwd: f.root, env: f.environment, input: '', encoding: 'utf8', timeout: 3000 })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /macOS ARM64/)
    await assert.rejects(readFile(f.receipt), { code: 'ENOENT' })
  }
})

test('Mac browser command seam uses only absolute open and preserves manual fallback', async t => {
  const f = await fixture(t, 'Darwin', 'arm64')
  // Only load the existing library definitions; never run publishing stages.
  // Replace its one absolute browser executable with this private recorder.
  const library = (await readFile(sourcePath, 'utf8')).split('\n# STAGES —')[0]
  assert.equal(library.split('/usr/bin/open').length, 2)
  const script = join(f.root, 'browser-seam.sh')
  await writeFile(script, library.replace('/usr/bin/open', JSON.stringify(join(f.bin, 'open'))) + '\nopen_url "https://example.invalid"\n')
  let result = spawnSync('/bin/bash', [script], { cwd: f.root, env: f.environment, encoding: 'utf8', timeout: 3000 })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(f.receipt, 'utf8')), { program: 'open', args: ['https://example.invalid'] })
  await writeFile(join(f.bin, 'open'), '#!/bin/sh\nexit 41\n', { mode: 0o755 })
  result = spawnSync('/bin/bash', [script], { cwd: f.root, env: f.environment, encoding: 'utf8', timeout: 3000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /visit it manually/)
})
