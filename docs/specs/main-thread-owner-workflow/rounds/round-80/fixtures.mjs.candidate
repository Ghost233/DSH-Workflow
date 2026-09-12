import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
const exec = promisify(execFile)
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export async function git(root, ...args) {
  const { stdout } = await exec('git', args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' } })
  return stdout.trimEnd()
}
export function planningContent(document, kind) {
  const { path, sha256: digest, ...declaration } = document
  const meta = { planning_document: 'DSH_PLANNING_DOCUMENT_V1', document_kind: kind, document_id: document.id, document_revision: document.revision, ...(kind === 'ticket' ? { spec_id: document.spec.id, spec_revision: document.spec.revision } : {}), planning_declaration: JSON.stringify(declaration) }
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# ${document.id}\n\nT07 reference-bound behavior.\n`
}
export function planningManifest() {
  return { contract: 'DSH_PLANNING_REFERENCE_MANIFEST_V1', spec: { path: 'docs/specs/proof/spec.md', id: 'SPEC-07', revision: 'R1', acceptanceCriteria: ['AC-01'], contracts: [{ id: 'K1', revision: 'v1' }] }, tickets: [{ path: 'docs/specs/proof/tickets/T1.md', id: 'T1', revision: 'R1', spec: { id: 'SPEC-07', revision: 'R1' }, acceptanceCriteria: [{ id: 'AC-01', specId: 'SPEC-07', specRevision: 'R1' }], contracts: [{ id: 'K1', revision: 'v1' }], dependsOn: [], work: { ready: [{ id: 'implement' }], blocked: [] } }] }
}
export async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-t07-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await git(root, 'init', '-b', 'dev')
  await git(root, 'config', 'user.name', 'T07 Proof')
  await git(root, 'config', 'user.email', 'proof@example.invalid')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(root, 'code.txt'), 'code baseline\n')
  await git(root, 'add', 'code.txt'); await git(root, 'commit', '-m', 'baseline')
  return { root, baseHead: await git(root, 'rev-parse', 'HEAD'), branch: 'dev' }
}
export async function observe(root) {
  return { head: await git(root, 'rev-parse', 'HEAD'), branch: await git(root, 'symbolic-ref', '--short', 'HEAD'), index: sha256(await readFile(join(root, '.git/index'))), staged: await git(root, 'diff', '--cached', '--binary'), status: await git(root, 'status', '--porcelain=v1', '--untracked-files=all') }
}
