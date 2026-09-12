import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const SOURCE_RUNTIME = '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Produce a one-run complete runtime copy.  The copy differs only in direct
 * static relative imports (made absolute file URLs) and a trailing private
 * export used by this proof.  It never changes a runtime function body.
 */
export async function generateRuntimeAdapter() {
  const original = await readFile(SOURCE_RUNTIME, 'utf8')
  let rewrittenImports = 0
  const adaptedImports = original.replace(/from (['"])\.\/(.*?)\1/g, (whole, quote, specifier) => {
    rewrittenImports += 1
    return `from ${quote}file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/${specifier}${quote}`
  })
  const adapted = `${adaptedImports}\n// T-14 probe-only private access; copied function bodies above are unchanged.\nexport { saveState, readJson, writeJsonAtomic, statePath }\n`
  const directory = await mkdtemp(join(tmpdir(), 'dsh-t14-runtime-'))
  const path = join(directory, 'runtime-adapted.mjs')
  await writeFile(path, adapted, 'utf8')
  return {
    directory,
    path,
    sourceRuntime: SOURCE_RUNTIME,
    sourceSha256: sha256(original),
    adapterSha256: sha256(adapted),
    staticRelativeImportsRewritten: rewrittenImports,
    appendedExport: ['saveState', 'readJson', 'writeJsonAtomic', 'statePath'],
  }
}
