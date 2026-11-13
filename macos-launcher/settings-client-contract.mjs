export function assertHostBackedSettings(source) {
  if (source.includes('isLoopback')
    || !/const\s*\{\s*writable\s*\}\s*=\s*mirrored\.view;/.test(source)
    || !/this\.scope\.set\((["'`])enabled\1,\s*enabled\)/.test(source)) {
    throw new Error('DSH settings client must use Host-backed ConfigForms')
  }
}
