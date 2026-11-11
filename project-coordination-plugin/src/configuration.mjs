import { isAbsolute } from 'node:path'

/** Loading this file is the owner's explicit repository/team authorization. */
export function validateConfiguration(config) {
  if (config?.schema !== 1 || !Array.isArray(config.members) || !Array.isArray(config.repositories)) throw new Error('Project coordination configuration requires schema 1, members and repositories')
  if (config.ghExecutable !== undefined && (typeof config.ghExecutable !== 'string' || !isAbsolute(config.ghExecutable))) throw new Error('The gh executable must be an absolute owner-configured path')
  const names = new Set()
  for (const member of config.members) {
    if (!/^[a-zA-Z0-9_-]+$/.test(member.bot ?? '') || names.has(member.bot)
      || !['principal', 'manager', 'lead', 'executor'].includes(member.role)) throw new Error('Invalid or duplicate project member')
    names.add(member.bot)
  }
  if (config.members.filter(row => row.role === 'principal').length !== 1) throw new Error('Configure exactly one principal')
  for (const member of config.members) {
    if (member.role === 'principal' && member.parent || member.role !== 'principal' && !names.has(member.parent)) throw new Error('Every member must have its configured superior')
    const seen = new Set([member.bot])
    let parent = member.parent
    while (parent) {
      if (seen.has(parent)) throw new Error('Project member hierarchy has a cycle')
      seen.add(parent); parent = config.members.find(row => row.bot === parent)?.parent
    }
  }
  const repositories = new Set()
  for (const repository of config.repositories) {
    const manager = config.members.find(row => row.bot === repository.manager)
    const credentials = repository.ghConfigDir !== undefined
      ? typeof repository.ghConfigDir === 'string' && isAbsolute(repository.ghConfigDir) && repository.tokenEnv === undefined
      : /^[A-Z_][A-Z0-9_]*$/.test(repository.tokenEnv ?? '')
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.repository ?? '') || repositories.has(repository.repository)
      || manager?.role !== 'manager' || manager.repository !== repository.repository
      || !Array.isArray(repository.allowedActors) || !repository.allowedActors.length || repository.allowedActors.some(value => typeof value !== 'string' || !value)
      || !isAbsolute(repository.checkout ?? '') || !isAbsolute(repository.executionRoot ?? '')
      || !credentials || !repository.githubActor
      || !repository.verificationCommands?.length || repository.verificationCommands.some(argv => !Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== 'string'))) throw new Error('Invalid repository authorization or verification commands')
    repositories.add(repository.repository)
  }
  for (const member of config.members) if (member.role !== 'principal' && !repositories.has(member.repository)) throw new Error('Member repository is not authorized')
  const templates = new Set()
  for (const template of config.templates ?? []) {
    if (!template.name || templates.has(template.name) || !['lead', 'executor'].includes(template.role) || !template.modelPreset || typeof template.persona !== 'string') throw new Error('Invalid specialist template')
    templates.add(template.name)
  }
  for (const [key, value] of Object.entries(config.limits ?? {})) if (!['maxMembers', 'maxDepth', 'maxRunning'].includes(key) || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid project limit')
  if (config.pollMs !== undefined && (!Number.isSafeInteger(config.pollMs) || config.pollMs < 60000)) throw new Error('GitHub polling must be at least 60 seconds')
  return structuredClone(config)
}
