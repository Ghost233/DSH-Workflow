// External npm protocol boundary for self-owned plugin acceptance.
// Standard Node/pnpm proxy and private CA settings reach production checkers.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer as httpServer } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { connect } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareDesktopProfile } from '../../runtime/desktop-profile.mjs'

const exec = promisify(execFile)
export const pluginNames = ['dsh-t08-owned-plugin', 'dsh-t08-other-plugin']

export async function startPluginRegistry(root, runtimeVersion) {
  assert.ok(root.startsWith('/private/tmp/dsh-'), 'only a private probe root is accepted')
  const directory = join(root, 'plugin-registry')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const ca = join(directory, 'ca.pem'), key = join(directory, 'registry.key'), certificate = join(directory, 'registry.pem')
  await writeFile(join(directory, 'ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=DSH T08 private test CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
  await writeFile(join(directory, 'leaf.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:registry.npmjs.org\n')
  await exec('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', join(directory, 'ca.key'), '-out', ca, '-config', join(directory, 'ca.cnf')])
  await exec('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', join(directory, 'registry.csr'), '-subj', '/CN=registry.npmjs.org'])
  await exec('/usr/bin/openssl', ['x509', '-req', '-in', join(directory, 'registry.csr'), '-CA', ca, '-CAkey', join(directory, 'ca.key'), '-CAcreateserial', '-out', certificate, '-days', '1', '-extfile', join(directory, 'leaf.cnf')])
  const archives = new Map(), latest = Object.fromEntries(pluginNames.map(name => [name, '1.1.0']))
  const manifest = (name, version) => ({ name, version, type: 'module', main: './index.mjs',
    dsh: { bundle: { patch: './cordis.patch.yml' }, compatibility: { dshReleases: { [runtimeVersion]: 'compatible' } } } })
  for (const name of pluginNames) for (const version of name === pluginNames[0] ? ['1.0.0', '1.1.0', '1.2.0', '1.3.0'] : ['1.0.0', '1.1.0']) {
    const stage = join(directory, `${name}-${version}`), pack = join(stage, 'package')
    await mkdir(pack, { recursive: true })
    await writeFile(join(pack, 'package.json'), JSON.stringify(manifest(name, version)))
    await writeFile(join(pack, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: name, name }] }]) + '\n')
    await writeFile(join(pack, 'index.mjs'), `export const name = ${JSON.stringify(name)};\nexport const inject = ['webServer'];\nexport function apply(ctx) { const dispose = ctx.webServer.register({ kind: 'prefix', path: '/t08-plugin/${name}', handler: (req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ name, version: ${JSON.stringify(version)}, hostPid: process.pid })); } }); ctx.effect(() => () => { dispose(); }); }\nexport default { name, inject, apply };\n`)
    const archive = join(stage, 'plugin.tgz')
    await exec('/usr/bin/tar', ['-czf', archive, '-C', stage, 'package'])
    const bytes = await readFile(archive)
    archives.set(`${name}@${version}`, { bytes, manifest: manifest(name, version),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      shasum: createHash('sha1').update(bytes).digest('hex') })
  }
  const facts = { runtimeVersion, registryPid: process.pid, requests: [], connects: [], latest, failCheck: [], unavailable: [], closed: false }
  const save = () => writeFile(join(directory, 'evidence.json'), JSON.stringify({ ...facts,
    archives: Object.fromEntries([...archives].map(([id, archive]) => [id, archive.integrity])) }, null, 2))
  const registry = httpsServer({ key: await readFile(key), cert: await readFile(certificate) }, (request, response) => {
    const url = new URL(request.url, 'https://registry.npmjs.org')
    const [name, part, file] = decodeURIComponent(url.pathname.slice(1)).split('/')
    facts.requests.push({ path: url.pathname, host: request.headers.host, observedAt: new Date().toISOString() })
    void save()
    if (!pluginNames.includes(name)) {
      response.writeHead(404); response.end('only self-owned fixture packages are served'); return
    }
    if (facts.failCheck.includes(name)) { response.writeHead(503); response.end('self-owned registry check unavailable'); return }
    if (part === '-') {
      const version = file?.replace(/\.tgz$/, '')
      const archive = archives.get(`${name}@${version}`)
      if (!archive || facts.unavailable.includes(`${name}@${version}`)) { response.writeHead(404); response.end('self-owned version unavailable'); return }
      response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(archive.bytes); return
    }
    const versions = Object.fromEntries([...archives].filter(([id]) => id.startsWith(`${name}@`) && !facts.unavailable.includes(id)).map(([id, archive]) => {
      const version = id.split('@').at(-1)
      return [version, { ...archive.manifest, dist: { integrity: archive.integrity, shasum: archive.shasum,
        tarball: `https://registry.npmjs.org/${name}/-/${version}.tgz` } }]
    }))
    if (part && !versions[part]) { response.writeHead(404); response.end('self-owned version unavailable'); return }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(part ? versions[part] : { name, 'dist-tags': { latest: latest[name] }, versions }))
  })
  await new Promise(done => registry.listen(0, '127.0.0.1', done))
  const sockets = new Set()
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) }
  registry.on('connection', track)
  const proxy = httpServer((_, response) => { response.writeHead(405); response.end() })
  proxy.on('connection', track)
  proxy.on('connect', (request, socket, head) => {
    facts.connects.push(request.url); void save()
    if (request.url !== 'registry.npmjs.org:443') { socket.end('HTTP/1.1 403 Registry-only probe\r\nContent-Length: 0\r\n\r\n'); return }
    const tunnel = connect(registry.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) tunnel.write(head)
      socket.pipe(tunnel).pipe(socket)
    })
    track(tunnel)
    tunnel.once('error', () => socket.destroy())
    socket.once('error', () => tunnel.destroy())
  })
  await new Promise(done => proxy.listen(0, '127.0.0.1', done))
  const userconfig = join(directory, 'npmrc')
  await writeFile(userconfig, `registry=https://registry.npmjs.org/\ncafile=${ca}\nstore-dir=${directory}/store\ncache=${directory}/cache\n`)
  const environment = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`,
    HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, NO_PROXY: 'localhost,127.0.0.1,::1',
    NODE_EXTRA_CA_CERTS: ca, npm_config_cafile: ca, npm_config_userconfig: userconfig,
    npm_config_registry: 'https://registry.npmjs.org/', npm_config_store_dir: join(directory, 'store'),
    npm_config_cache: join(directory, 'cache'), npm_config_fetch_retries: '0',
    XDG_CACHE_HOME: join(directory, 'cache'), XDG_DATA_HOME: join(directory, 'xdg-data'),
    XDG_STATE_HOME: join(directory, 'xdg-state'), PNPM_HOME: join(directory, 'pnpm-home') }
  facts.ports = { proxy: proxy.address().port, registryTls: registry.address().port }
  await save()
  return { environment, facts, directory, archives,
    control: async change => {
      if (change.latest) for (const [name, version] of Object.entries(change.latest)) { assert.ok(pluginNames.includes(name)); latest[name] = version }
      if (change.failCheck) { assert.ok(change.failCheck.every(name => pluginNames.includes(name))); facts.failCheck = change.failCheck }
      if (change.unavailable) facts.unavailable = change.unavailable
      await save()
    },
    close: async () => {
      facts.closed = true
      await save()
      for (const socket of sockets) socket.destroy()
      await Promise.all([new Promise(done => proxy.close(done)), new Promise(done => registry.close(done))])
    },
  }
}

export async function seedPluginProfile({ root, resources, fixture }) {
  const home = join(root, 'home'), globalRoot = join(root, 'data/global')
  const desktopRuntimeRoot = join(resources, 'desktop/DeepSeek Harness.app/Contents/Resources/app/dsh')
  const prepared = await prepareDesktopProfile({ resourcesRoot: resources, desktopRuntimeRoot, globalRoot, home, permissionMode: 'danger-full-access' })
  const result = await exec(join(resources, 'node'), [join(resources, 'workflow/macos-launcher/runtime/run-dsh.mjs'), resources,
    'plugin', '--profile', 'desktop', 'add', ...pluginNames.map(name => `${name}@1.0.0`), '--save-exact'],
    { env: { ...process.env, ...fixture.environment, DSH_HOME: home, PATH: `${resources}/bin:${process.env.PATH}` }, maxBuffer: 1024 * 1024 })
  await writeFile(join(fixture.directory, 'seed.log'), result.stdout + result.stderr)
  const path = join(prepared.profile, 'package.json'), manifest = JSON.parse(await readFile(path, 'utf8'))
  manifest.dsh.profile.bundles = [...new Set([...manifest.dsh.profile.bundles, ...pluginNames])]
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n')
  return prepared.profile
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, resources] = process.argv.slice(2)
  const runtime = JSON.parse(await readFile(join(resources, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
  const fixture = await startPluginRegistry(resolve(root), runtime.version)
  try {
    await seedPluginProfile({ root: resolve(root), resources: resolve(resources), fixture })
    console.log(JSON.stringify({ ready: true, pid: process.pid, ports: fixture.facts.ports, environment: fixture.environment, directory: fixture.directory }))
    for await (const line of createInterface({ input: process.stdin })) {
      const command = JSON.parse(line)
      if (command.close) break
      await fixture.control(command)
      console.log(JSON.stringify({ id: command.id, ok: true }))
    }
  } finally {
    process.stdin.destroy()
    await fixture.close()
    console.log(JSON.stringify({ closed: true, pid: process.pid }))
  }
}
