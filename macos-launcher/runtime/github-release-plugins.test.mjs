import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchGitHubPluginLatest, isGitHubReleaseDependency } from './github-release-plugins.mjs'

const source = { package: 'dsh-ghost-home-repo', repository: 'Ghost233/ghost-agent-market' }
const base = 'https://github.com/' + source.repository + '/releases/download/'
const tagged = (version, overrides = {}) => {
  const name = source.package + '-' + version + '.tgz'
  const tag_name = source.package + '-v' + version
  return { tag_name, draft: false, prerelease: false, published_at: '2026-11-18T04:00:00Z',
    assets: [{ name, state: 'uploaded', size: 100, browser_download_url: base + tag_name + '/' + name }], ...overrides }
}
const reply = releases => ({ ok: true, json: async () => releases })

test('the newest stable release is scoped to this package across GitHub pages', async () => {
  const first = [tagged('0.2.9'), tagged('0.20.0', { draft: true }), tagged('0.30.0', { prerelease: true }),
    tagged('0.40.0', { tag_name: 'dsh-ghost-matt-skills-v0.40.0' }), tagged('0.50.0', { tag_name: 'latest' })]
  const urls = []
  const latest = await fetchGitHubPluginLatest(source, async url => {
    urls.push(url)
    return reply(url.endsWith('&page=1') ? [...first, ...Array.from({ length: 95 }, () => ({}))] : [tagged('0.2.10'), tagged('0.2.8')])
  })
  assert.equal(urls.length, 2)
  assert.ok(urls.every(url => url.startsWith('https://api.github.com/repos/Ghost233/ghost-agent-market/releases?')))
  assert.deepEqual(latest, { version: '0.2.10', url: tagged('0.2.10').assets[0].browser_download_url })
})

test('a broken newest release fails without falling back to an older asset', async () => {
  const forged = tagged('0.2.0')
  forged.assets[0].browser_download_url = 'https://example.test/wrong.tgz'
  await assert.rejects(fetchGitHubPluginLatest(source, async () => reply([tagged('0.1.1'), forged])), /最新发布缺少有效/)
  await assert.rejects(fetchGitHubPluginLatest(source, async () => reply([tagged('0.1.2', { assets: [] })])), /最新发布缺少有效/)
  await assert.rejects(fetchGitHubPluginLatest(source, async () => ({ ok: false, status: 403 })), /HTTP 403/)
})

test('the update source must match the installed version and canonical tagged asset', () => {
  const spec = tagged('0.1.1').assets[0].browser_download_url
  assert.equal(isGitHubReleaseDependency(source, spec, '0.1.1'), true)
  assert.equal(isGitHubReleaseDependency(source, spec, '0.1.0'), false)
  assert.equal(isGitHubReleaseDependency(source, 'file:../bundle.tgz', '0.1.1'), false)
  assert.equal(isGitHubReleaseDependency(source, spec.replace('Ghost233/', 'other/'), '0.1.1'), false)
})

test('Sentinel tracks the existing unversioned URL and selects the versioned release asset', async () => {
  const sentinel = { package: 'ghost-agent-sentinel', repository: 'Ghost233/GhostAgentSentinel',
    tagPrefix: 'v', legacyUnversionedAsset: true }
  const downloads = 'https://github.com/Ghost233/GhostAgentSentinel/releases/download/'
  const existing = downloads + 'v0.5.3/ghost-agent-sentinel.tgz'
  assert.equal(isGitHubReleaseDependency(sentinel, existing, '0.5.3'), true)
  assert.equal(isGitHubReleaseDependency(sentinel, existing, '0.5.4'), false)
  assert.equal(isGitHubReleaseDependency(sentinel, existing.replace('Ghost233/', 'other/'), '0.5.3'), false)
  const asset = name => ({ name, state: 'uploaded', size: 100, browser_download_url: downloads + 'v0.5.5/' + name })
  const versioned = asset('ghost-agent-sentinel-0.5.5.tgz')
  const stable = tagged('0.5.5', { tag_name: 'v0.5.5', assets: [asset('ghost-agent-sentinel.tgz'), versioned] })
  const latest = await fetchGitHubPluginLatest(sentinel, async () => reply([tagged('9.0.0'), stable]))
  assert.deepEqual(latest, { version: '0.5.5', url: versioned.browser_download_url })
  assert.equal(isGitHubReleaseDependency(sentinel, latest.url, latest.version), true)
})
