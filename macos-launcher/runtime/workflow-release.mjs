export const workflowReleaseEndpoint = 'https://api.github.com/repos/Ghost233/DSH-Workflow/releases?per_page=100'

const version = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  ? value.split('.').map(Number) : null
const compare = (left, right) => {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
  return 0
}

/** Select metadata only; assets are never requested or installed here. */
export function newerWorkflowRelease(releases, installed) {
  let best = version(installed), selected = null
  if (!best) throw new Error('无法确认 Ghost DSH Station 的实际版本，请使用本仓库配套应用。')
  if (!Array.isArray(releases)) throw new Error('GitHub 发布列表格式无效。')
  for (const release of releases) {
    if (release?.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string'
      || !release.tag_name.startsWith('macos-v')) continue
    const text = release.tag_name.slice(7), candidate = version(text)
    if (!candidate || compare(candidate, best) <= 0) continue
    const name = `DSH-Workflow-macOS-${text}-arm64.dmg`
    const address = `https://github.com/Ghost233/DSH-Workflow/releases/download/${release.tag_name}/${name}`
    if (!Array.isArray(release.assets) || !release.assets.some(asset => asset?.name === name
      && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.browser_download_url === address)) continue
    best = candidate
    selected = { version: text, page: `https://github.com/Ghost233/DSH-Workflow/releases/tag/${release.tag_name}` }
  }
  return selected
}
