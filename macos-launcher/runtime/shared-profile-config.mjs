import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { isRetiredPluginModule } from '../../scripts/dsh-delivery-policy.mjs'

// This bundle is retired by the pinned DSH runtime. Its normal profile loader
// removes it by writing package.json, which a configuration reader must not do.
const retiredBundles = new Set(['@deepseek-ai/dsh-experimental-schedule-bundle'])
const mcpClient = '@deepseek-ai/dsh-mcp-client'
const expression = value => value !== null && typeof value === 'object'
  && (Object.hasOwn(value, '__jsExpr') || Object.values(value).some(expression))
const unsupportedMcpExpression = value => {
  if (value === null || typeof value !== 'object') return false
  if (Object.hasOwn(value, '__jsExpr')) return Object.keys(value).length !== 1
    || typeof value.__jsExpr !== 'string' || !/^process\.env\.[A-Za-z_][A-Za-z0-9_]*$/.test(value.__jsExpr)
  return Object.values(value).some(unsupportedMcpExpression)
}

/** Compose the daily desktop profile without modifying its manifest or patches. */
export async function readSharedProfileEntries({ resources, home, onSkipped = () => {} }) {
  const directory = join(home, 'profiles/desktop')
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const boot = createRequire(anchor)('@deepseek-ai/dsh-app-boot')
  const manifest = boot.readProfileManifest('dsh', directory)
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const exemptions = boot.readProfileVersionExemptions(directory)
  const layers = []
  for (const name of bundles) {
    if (retiredBundles.has(name) || isRetiredPluginModule(name)) continue
    try {
      const bundle = boot.resolveBundleDir('dsh', name, anchor, directory)
      const entry = boot.readProfileManifest('dsh', bundle)
      if (!entry.dsh?.bundle) throw new Error('Missing bundle configuration')
      const issue = boot.evaluatePluginCompatibility(entry, exemptions)
      if (issue && !issue.exempted) throw new Error(boot.pluginCompatibilityWarning(issue))
      layers.push(boot.bundlePatchPaths(bundle, entry.dsh.bundle).flatMap(path => boot.loadOverlayPatches('dsh', path)))
    } catch {
      // Match DSH's skipped-bundle behavior without including configuration or secrets in diagnostics.
      onSkipped({ name, reason: '插件未安装、配置不可读取或版本不兼容' })
    }
  }
  const profile = boot.loadOptionalPatches('dsh', join(directory, 'cordis.patch.yml')) ?? []
  const shared = boot.loadOptionalPatches('dsh', join(home, 'cordis.patch.yml')) ?? []
  return boot.composeEntries([...layers, profile, shared])
}

/** Select enabled MCP servers without weakening disabled groups or resolving code expressions. */
export function sharedMcpEntries(entries) {
  const found = [], names = new Set()
  const containsMcp = row => row.name === mcpClient
    || row.group && Array.isArray(row.config) && row.config.some(containsMcp)
  const visit = rows => {
    for (const row of rows) {
      if (!containsMcp(row)) continue
      if (row.disabled !== undefined && typeof row.disabled !== 'boolean') throw new Error('MCP 共享配置包含暂不支持的启用状态表达式。')
      if (row.disabled === true) continue
      if (row.name === mcpClient) {
        if (unsupportedMcpExpression(row.config)) throw new Error('MCP 共享配置包含暂不支持的表达式。')
        const name = row.config?.serverName
        if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error('MCP 共享配置缺少有效的服务名称。')
        if (names.has(name)) throw new Error(`MCP 共享配置重复：${name}`)
        names.add(name)
        found.push(structuredClone(row))
      }
      if (row.group && Array.isArray(row.config)) visit(row.config)
    }
  }
  visit(entries)
  return found
}

/** Share the daily DSH skill directory and its additional filesystem providers. */
export function sharedSkillEntries(entries, home) {
  const skill = '@deepseek-ai/dsh-skill-filesystem'
  // Web profiles disable the host filesystem row because each agent preset
  // loads its own defaults. Superagent has a different DSH_HOME, so project
  // the daily home directory separately even when that host row is disabled.
  const rows = [{ id: 'workflow-superagent-daily-skills', name: skill, config: {
    providerName: 'workflow-superagent-daily', includeDefaultRoots: false, customSkillDirs: [join(home, 'skills')],
  } }]
  const providers = new Set(['workflow-superagent-daily'])
  const containsSkill = row => row.name === skill || row.group && Array.isArray(row.config) && row.config.some(containsSkill)
  const visit = (list, parentDisabled = false) => {
    for (const row of list) {
      if (!containsSkill(row)) continue
      if (row.disabled !== undefined && typeof row.disabled !== 'boolean') throw new Error('Skill 共享配置包含暂不支持的启用状态表达式。')
      const disabled = parentDisabled || row.disabled === true
      if (row.name === skill) {
        if (typeof row.id !== 'string' || !row.id || !disabled && expression(row.config)) throw new Error('Skill 共享配置包含暂不支持的表达式或缺少标识。')
        const copy = structuredClone(row)
        copy.config ??= {}
        if (disabled) { copy.disabled = true; rows.push(copy); continue }
        copy.config.providerName ??= `workflow-superagent-${row.id}`
        if (typeof copy.config.providerName !== 'string' || providers.has(copy.config.providerName)) throw new Error('Skill 共享配置存在重复的提供方。')
        providers.add(copy.config.providerName)
        rows.push(copy)
      }
      if (row.group && Array.isArray(row.config)) visit(row.config, disabled)
    }
  }
  visit(entries)
  return rows
}

/** Preserve daily plugin settings while keeping the Desktop connection out of Superagent. */
export function sharedPluginEntries(entries, packageNames) {
  const names = packageNames.filter(name => !['dsh-superagent', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(name))
  const projectIds = new Set(['workflow-browser-harness', 'matt-skills-board', 'matt-panel-tools', 'workflow-delivery-inventory'])
  const select = rows => rows.flatMap(row => {
    if (row.id === 'workflow-desktop-bridge' || isRetiredPluginModule(row.name)) return []
    if (row.group && Array.isArray(row.config)) {
      const children = select(row.config)
      return children.length ? [{ ...structuredClone(row), config: children }] : []
    }
    const match = typeof row.name === 'string' && names.some(name => row.name === name || row.name.startsWith(name + '/'))
    const local = typeof row.name === 'string' && (isAbsolute(row.name) || row.name.startsWith('file://'))
    return match || local || projectIds.has(row.id) ? [structuredClone(row)] : []
  })
  return select(entries)
}
