import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, realpathSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

// This external Platform double never prints or writes its random grant.
const root = process.argv[2]
const parent = `/private/tmp/dsh-launcher-local-${process.getuid()}`
if (!root || realpathSync(root) !== root || dirname(root) !== parent || !basename(root).startsWith('dsh-s02-')) throw new Error('Platform fixture requires its private owned root')
const owner = statSync(root)
if (owner.uid !== process.getuid() || (owner.mode & 0o777) !== 0o700) throw new Error('Platform fixture root ownership mismatch')
const grant = `s02_fixture_${randomBytes(32).toString('base64url')}`
let initialization, origin
const events = { initialized: false, pkceValidated: false, granted: false, profileAuthenticated: false,
  balanceAuthenticated: false, usageAuthenticated: false, topUpAuthenticated: false, invalidAuthentication: false }
const persist = () => writeFileSync(join(root, 'platform-safe-events.json'), JSON.stringify(events), { mode: 0o600 })
const envelope = (response, value) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: value } })) }
const authenticated = request => request.headers['x-dsh-auth-token'] === grant
const html = kind => `<!doctype html><meta charset="utf-8"><title>S02 controlled ${kind}</title><h1>S02 controlled ${kind}</h1><p id="state">Checking original embedded authentication…</p><script>
(async () => {
  try {
    const token = window.dsh.getAuthToken();
    const result = await fetch('/fixture-auth-check?kind=${kind}', { headers: { 'x-dsh-auth-token': token } }).then(response => response.json());
    document.querySelector('#state').textContent = result.authenticated ? 'S02 ${kind} authenticated' : 'S02 authentication rejected';
  } catch { document.querySelector('#state').textContent = 'S02 original Platform bridge unavailable'; }
})();
</script>`
async function body(request) {
  let data = ''
  for await (const chunk of request) {
    data += chunk
    if (data.length > 65536) throw new Error('Fixture request too large')
  }
  return JSON.parse(data)
}
async function handle(request, response) {
  const url = new URL(request.url, origin)
  if (request.method === 'POST' && url.pathname === '/auth-api/v0/dsh/auth_init') {
    initialization = await body(request)
    if (initialization.code_challenge_method !== 'S256' || !initialization.state || !initialization.redirect_uri) { response.writeHead(400).end(); return }
    const callback = new URL(initialization.redirect_uri)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(callback.hostname) || callback.protocol !== 'http:') { response.writeHead(400).end(); return }
    events.initialized = true
    writeFileSync(join(root, 'platform-login-callback.json'), JSON.stringify({ redirectUri: initialization.redirect_uri, state: initialization.state }), { mode: 0o600 })
    envelope(response, { authorize_url: `${origin}/dsh/authorize?authorize_id=s02`, authorize_id: 's02', expires_in: 60 })
  } else if (request.method === 'POST' && url.pathname === '/auth-api/v0/dsh/auth_exchange') {
    const exchange = await body(request)
    const valid = initialization && exchange.code === 's02-controlled-code' && exchange.redirect_uri === initialization.redirect_uri
      && createHash('sha256').update(exchange.code_verifier ?? '').digest('base64url') === initialization.code_challenge
    if (!valid) { response.writeHead(400).end(); return }
    events.pkceValidated = true; events.granted = true
    envelope(response, { token: grant, authorized_url: `${origin}/dsh/authorized`, user: {
      id: 's02-fixture-user', email: 's02@example.invalid', id_profile: { name: 'S02 isolated Platform', picture: null } } })
  } else if (url.pathname === '/auth-api/v0/users/current' || url.pathname === '/api/v0/users/get_user_summary' || url.pathname === '/api/v0/users/get_unnotified_bonuses') {
    const valid = authenticated(request)
    if (!valid) { events.invalidAuthentication = true; response.writeHead(401).end(); persist(); return }
    if (url.pathname.endsWith('/current')) {
      events.profileAuthenticated = true
      envelope(response, { id: 's02-fixture-user', email: 's02@example.invalid', id_profile: { name: 'S02 isolated Platform', picture: null } })
    } else if (url.pathname.endsWith('/get_user_summary')) {
      events.balanceAuthenticated = true
      envelope(response, { normal_wallets: [{ currency: 'CNY', balance: '123.45' }], bonus_wallets: [] })
    } else envelope(response, [])
  } else if (url.pathname === '/usage' || url.pathname === '/top_up') {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(html(url.pathname === '/usage' ? 'usage' : 'top-up'))
  } else if (url.pathname === '/fixture-auth-check') {
    const valid = authenticated(request)
    if (url.searchParams.get('kind') === 'usage') events.usageAuthenticated ||= valid
    if (url.searchParams.get('kind') === 'top-up') events.topUpAuthenticated ||= valid
    events.invalidAuthentication ||= !valid
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ authenticated: valid }))
  } else if (url.pathname === '/auth-api/v0/users/logout' || url.pathname === '/auth-api/v0/dsh/auth_cancel') envelope(response, null)
  else if (url.pathname === '/dsh/authorized') { response.setHeader('content-type', 'text/html'); response.end('<h1>S02 controlled sign-in completed</h1>') }
  else { response.writeHead(404).end() }
  persist()
}
const server = createServer((request, response) => { void handle(request, response).catch(() => { response.writeHead(500).end() }) })
server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`
  writeFileSync(join(root, 'platform-fixture.json'), JSON.stringify({ origin, pid: process.pid }), { mode: 0o600 })
  persist()
})
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)) })
