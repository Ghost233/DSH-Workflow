/** Verify that the npm-only Web runtime is the exact fixed upstream artifact. */
export function verifyNpmRuntimePin({ target, app, lock }) {
  const fail = () => { throw new Error('DSH npm runtime provenance does not match the locked registry artifact') }
  if (target?.source !== 'npm' || target.package !== '@deepseek-ai/dsh'
    || target.registry !== 'https://registry.npmjs.org/'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(target.version)
    || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(target.integrity)) fail()
  const entry = lock?.packages?.['node_modules/@deepseek-ai/dsh']
  const archive = `${target.registry}@deepseek-ai/dsh/-/dsh-${target.version}.tgz`
  if (lock?.lockfileVersion !== 3 || lock.name !== app?.name || lock.version !== app.version
    || lock?.packages?.['']?.name !== app.name || lock.packages[''].version !== app.version
    || app?.dependencies?.[target.package] !== target.version
    || lock?.packages?.['']?.dependencies?.[target.package] !== target.version
    || entry?.version !== target.version || entry.integrity !== target.integrity || entry.resolved !== archive) fail()
  return { version: target.version, integrity: target.integrity, archive }
}
