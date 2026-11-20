import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const packageName = /^[a-z0-9][a-z0-9._-]*$/
const repositoryName = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_-]+$/
const releasePageSize = 100
const maxReleasePages = 10

/** Optional GitHub bundles managed by the DSH profile and tracked by Station. */
export async function readGitHubPluginCatalog(resources) {
  let entries
  try { entries = JSON.parse(await readFile(join(resources, 'workflow/profile-github-plugins.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  if (!Array.isArray(entries) || entries.some(item => typeof item?.package !== 'string' || !packageName.test(item.package)
      || typeof item.repository !== 'string' || !repositoryName.test(item.repository)
      || (item.tagPrefix !== undefined && item.tagPrefix !== 'v')
      || (item.legacyUnversionedAsset !== undefined && typeof item.legacyUnversionedAsset !== 'boolean'))
    || new Set(entries.map(item => item.package)).size !== entries.length) {
    throw new Error('无效的 GitHub 插件列表')
  }
  return entries
}

const tagPrefix = item => item.tagPrefix ?? item.package + '-v'

function releaseAsset(item, version, unversioned = false) {
  const tag = tagPrefix(item) + version
  const name = item.package + (unversioned ? '' : '-' + version) + '.tgz'
  const url = ['https://github.com', item.repository, 'releases/download', tag, name].join('/')
  return { name, url }
}

/** Match installed versions against the canonical asset or a catalog-approved legacy URL. */
export function isGitHubReleaseDependency(item, spec, version) {
  return typeof version === 'string' && stableVersion.test(version) && (spec === releaseAsset(item, version).url
    || (item.legacyUnversionedAsset === true && spec === releaseAsset(item, version, true).url))
}

/** Select the highest published stable tag belonging to this package in a shared repository. */
export async function fetchGitHubPluginLatest(item, request = fetch) {
  const prefix = tagPrefix(item)
  const signal = AbortSignal.timeout(8000)
  let best
  for (let page = 1; page <= maxReleasePages; page++) {
    const api = 'https://api.github.com/repos/' + item.repository + '/releases?per_page=' + releasePageSize + '&page=' + page
    const response = await request(api, { signal, headers: { accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error('GitHub Releases HTTP ' + response.status)
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new Error('无效的 GitHub Releases 响应')
    for (const release of releases) {
      if (release?.draft !== false || release.prerelease !== false || !release.published_at
        || typeof release.tag_name !== 'string' || !release.tag_name.startsWith(prefix)) continue
      const version = release.tag_name.slice(prefix.length)
      if (!stableVersion.test(version)) continue
      if (!best || version.localeCompare(best.version, 'en', { numeric: true }) > 0) best = { release, version }
    }
    if (releases.length < releasePageSize) break
    if (page === maxReleasePages) throw new Error('GitHub Releases 超出查询页数上限')
  }
  if (!best) throw new Error('找不到该插件的稳定发布')
  const { name, url } = releaseAsset(item, best.version)
  const assets = Array.isArray(best.release.assets) ? best.release.assets.filter(asset => asset?.name === name) : []
  if (assets?.length !== 1 || assets[0].browser_download_url !== url || assets[0].state !== 'uploaded'
    || !Number.isSafeInteger(assets[0].size) || assets[0].size <= 0) {
    throw new Error('最新发布缺少有效的插件安装包')
  }
  return { version: best.version, url }
}
