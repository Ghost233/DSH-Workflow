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

/** Packages explicitly removed from Station delivery stay disabled in older profiles. */
export const isRetiredPluginModule = name => typeof name === 'string'
  && (name === 'billion-context' || name.startsWith('billion-context/'))
