/** Mutable package channels are replaced by repository DMG delivery. */
export const packageMutationModules = Object.freeze([
  '@deepseek-ai/dsh-plugin-manager',
  '@deepseek-ai/dsh-plugin-manager/tools',
  '@deepseek-ai/dsh-client-ui-plugin-manager',
  '@deepseek-ai/dsh-plugin-market',
  '@deepseek-ai/dsh-plugin-market/tools',
  '@deepseek-ai/dsh-client-ui-plugin-market',
  // These launchers depend on the mutable manager that the project replaces.
  '@deepseek-ai/dsh-client-ui-entry-customization',
])

export const blocksPackageMutation = (name, profilePlugins = false) =>
  packageMutationModules.includes(name) && (!profilePlugins || name.endsWith('/tools'))

/** Legacy Billion Context entries require a verified Station delivery. */
export const isUnavailablePluginModule = (name, { billionContextDelivered = false } = {}) => typeof name === 'string'
  && (name === 'dsh-ops' || name.startsWith('dsh-ops/')
    || (!billionContextDelivered && (name === 'billion-context' || name.startsWith('billion-context/'))))
