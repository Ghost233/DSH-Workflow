import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { assertPlanningCheckout } from '../src/native-planning-effects.mjs'

const digest = text => createHash('sha256').update(text).digest('hex')

test('reviewed revision tolerates supporting progress edits but still guards normative sources and code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-planning-checkout-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'Test')
    await mkdir(join(root, 'docs/specs/example'), { recursive: true })
    const specPath = 'docs/specs/example/spec.md'
    const progressPath = 'docs/specs/example/progress.md'
    const spec = '# Frozen specification\n'
    const progress = '# Progress at checkpoint\n'
    await writeFile(join(root, specPath), spec)
    await writeFile(join(root, progressPath), progress)
    git('add', '.')
    git('commit', '-qm', 'planning checkpoint')
    const snapshot = {
      codeBaseline: { branch: 'main', sourceHead: git('rev-parse', 'HEAD') },
      source: { references: {
        spec: { path: specPath, sha256: digest(spec) },
        tickets: [],
        supporting: [{ path: progressPath, sha256: digest(progress) }],
      } },
    }

    await assertPlanningCheckout(root, snapshot)
    await writeFile(join(root, progressPath), '# Progress after checkpoint\n')
    await assert.rejects(assertPlanningCheckout(root, snapshot), /Planning source changed: .*progress\.md/)
    await assertPlanningCheckout(root, snapshot, { allowSupportingDrift: true })

    await writeFile(join(root, specPath), '# Changed specification\n')
    await assert.rejects(assertPlanningCheckout(root, snapshot, { allowSupportingDrift: true }), /Planning source changed: .*spec\.md/)
    await writeFile(join(root, specPath), spec)
    await writeFile(join(root, 'uncheckpointed-code.js'), 'export default 1\n')
    await assert.rejects(assertPlanningCheckout(root, snapshot, { allowSupportingDrift: true }), /uncheckpointed user changes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
